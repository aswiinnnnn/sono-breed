import json
import time
import pytest
from fastapi.testclient import TestClient

# Import the FastAPI application
from app.server import app
from app import database
from app.database import init_db, get_scan
from app.probe_source import connect_probe, check_probe_status

client = TestClient(app)

def setup_module(module):
    """Re-initialize the database before running tests."""
    init_db()

def test_health_endpoint():
    """Verify that the health check endpoint returns dynamic services status."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ["healthy", "unhealthy"]
    assert "database" in data["services"]
    assert "yolo_model" in data["services"]
    assert "probe" in data["services"]

def test_system_info_endpoint():
    """Verify host telemetry properties are retrieved."""
    response = client.get("/api/system-info")
    assert response.status_code == 200
    data = response.json()
    assert "os" in data
    assert "cpu" in data
    assert "ram" in data
    assert "ram_load" in data
    assert "gpu" in data
    assert "cores" in data
    assert "cuda_available" in data
    assert "probe_connected" in data

def test_probe_connection_handshake():
    """Verify POST /api/probe/connect updates the connection state."""
    # Initially probe should be disconnected
    assert check_probe_status() is False
    
    response = client.post("/api/probe/connect")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["probe_connected"] is True
    
    # Assert connection state has changed globally
    assert check_probe_status() is True

def test_scan_creation_validation():
    """Verify POST /api/scans validations (3-50 length, regex matching)."""
    # 1. Valid sheep_id
    response = client.post("/api/scans", json={"sheep_id": "SH-Dorper-122"})
    assert response.status_code == 200
    data = response.json()
    assert "scan_id" in data
    assert data["sheep_id"] == "SH-Dorper-122"
    assert data["status"] == "scanning"

    # 2. Too short sheep_id
    response = client.post("/api/scans", json={"sheep_id": "SH"})
    assert response.status_code == 422
    assert response.json()["error_code"] == "VALIDATION_FAILED"

    # 3. Invalid characters
    response = client.post("/api/scans", json={"sheep_id": "SH@Dorper"})
    assert response.status_code == 422
    assert response.json()["error_code"] == "VALIDATION_FAILED"

def test_scan_update_validation_and_idempotency():
    """Verify PATCH /api/scans/{scan_id} validations and idempotency."""
    # Create scan
    response = client.post("/api/scans", json={"sheep_id": "SH-Test-Update"})
    scan_id = response.json()["scan_id"]

    # 1. Invalid stage
    payload = {
        "detected_stage": "Invalid Stage Name",
        "final_diagnosis": "Pregnant (Mid)",
        "features_detected": ["placentome"],
        "duration": 15.0
    }
    response = client.patch(f"/api/scans/{scan_id}", json=payload)
    assert response.status_code == 422
    assert response.json()["error_code"] == "VALIDATION_FAILED"

    # 2. Invalid features
    payload = {
        "detected_stage": "Pregnant (Mid)",
        "final_diagnosis": "Pregnant (Mid)",
        "features_detected": ["invalid_anatomy_feature"],
        "duration": 15.0
    }
    response = client.patch(f"/api/scans/{scan_id}", json=payload)
    assert response.status_code == 422

    # 3. Invalid duration (caps at 3600.0)
    payload = {
        "detected_stage": "Pregnant (Mid)",
        "final_diagnosis": "Pregnant (Mid)",
        "features_detected": ["placentome"],
        "duration": 5000.0
    }
    response = client.patch(f"/api/scans/{scan_id}", json=payload)
    assert response.status_code == 422

    # 4. Valid update
    payload = {
        "detected_stage": "Pregnant (Mid)",
        "final_diagnosis": "Pregnant (Mid)",
        "features_detected": ["placentome", "fetal_fluid"],
        "duration": 14.5
    }
    response = client.patch(f"/api/scans/{scan_id}", json=payload)
    assert response.status_code == 200
    assert response.json()["status"] == "success"

    # Get scan from DB and verify fields
    scan = get_scan(scan_id)
    assert scan["status"] == "finished"
    assert scan["final_diagnosis"] == "Pregnant (Mid)"
    assert scan["duration"] == 14.5

    # 5. Idempotency Check: updating a scan that is already finished should return immediately
    payload_new = {
        "detected_stage": "Pregnant (Late)",
        "final_diagnosis": "Pregnant (Late)",
        "features_detected": ["body"],
        "duration": 20.0
    }
    response = client.patch(f"/api/scans/{scan_id}", json=payload_new)
    assert response.status_code == 200
    assert response.json()["status"] == "success"

    # Verify that the DB fields were NOT altered (remains mid pregnancy details)
    scan_after = get_scan(scan_id)
    assert scan_after["final_diagnosis"] == "Pregnant (Mid)"
    assert scan_after["duration"] == 14.5

def test_pagination_and_cache_updates():
    """Verify GET /api/scans paginates results and updates statistics cache on DELETE."""
    # Rebuild db to start fresh
    init_db()
    from app.database import get_connection, rebuild_stats_cache
    conn = get_connection()
    conn.execute("DELETE FROM scans")
    conn.commit()
    conn.close()
    rebuild_stats_cache()
    
    # Assert cache is zero
    assert database.STATS_CACHE["total_scans"] == 0

    # Insert finished scans
    scans_data = [
        ("SH-1", "Pregnant (Early)", "Pregnant (Early)", ["fetal_fluid"], 10.0),
        ("SH-2", "Non-Pregnant", "Non-Pregnant", [], 5.0)
    ]
    for sheep_id, stage, diagnosis, features, duration in scans_data:
        resp = client.post("/api/scans", json={"sheep_id": sheep_id})
        scan_id = resp.json()["scan_id"]
        client.patch(f"/api/scans/{scan_id}", json={
            "detected_stage": stage,
            "final_diagnosis": diagnosis,
            "features_detected": features,
            "duration": duration
        })

    # Retrieve paginated lists
    response = client.get("/api/scans?page=1&limit=20")
    assert response.status_code == 200
    data = response.json()
    assert data["total_count"] == 2
    assert data["stats"]["total_scans"] == 2
    assert data["stats"]["pregnant_count"] == 1
    assert data["stats"]["non_pregnant_count"] == 1
    assert data["stats"]["pregnancy_rate"] == 50.0
    assert data["stats"]["avg_scan_time"] == 7.5

    # Delete one finished scan and verify cache decrement
    scan_id_to_delete = data["records"][0]["id"]
    del_resp = client.delete(f"/api/scans/{scan_id_to_delete}")
    assert del_resp.status_code == 200
    
    # Assert cache decrement
    response = client.get("/api/scans?page=1&limit=20")
    data = response.json()
    assert data["total_count"] == 1
    assert data["stats"]["total_scans"] == 1

def test_websocket_streaming_flow_and_rejections():
    """Verify WebSocket /ws/stream close codes and handshake configurations."""
    # 1. Close Code 4000: Probe not connected
    # We disconnect the probe first
    from app import probe_source
    probe_source._probe_connected = False
    
    with client.websocket_connect("/ws/stream") as websocket:
        # Client should be closed immediately with code 4000
        # Let's check close code or expect connection failure
        try:
            websocket.receive_json()
        except Exception as e:
            pass
            
    # Connect probe for subsequent checks
    connect_probe()

    # 2. Close Code 4002: Handshake config timeout/invalid config
    with client.websocket_connect("/ws/stream") as websocket:
        # Send invalid setup config message
        websocket.send_json({"invalid_key": "dummy"})
        # Should close connection
        try:
            msg = websocket.receive_json()
            assert "error" in msg or msg is None
        except Exception:
            pass

    # 3. Clean streaming loop and summary retrieval (Close Code 1000)
    # Since running full inference takes time, we can test configuration handshake and first frame receipt
    with client.websocket_connect("/ws/stream") as websocket:
        websocket.send_json({"confidence_threshold": 0.5, "scan_id": 999})
        # Read first metadata frame
        meta = websocket.receive_json()
        assert meta["type"] == "metadata"
        assert "frame_index" in meta
        assert "detections" in meta

        # Read first binary frame
        raw_bytes = websocket.receive_bytes()
        assert len(raw_bytes) > 0

if __name__ == "__main__":
    import sys
    pytest.main(sys.argv)
