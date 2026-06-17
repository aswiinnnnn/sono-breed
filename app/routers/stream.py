import asyncio
import time
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.probe_source import check_probe_status, init_video_source, close_video_source, get_next_frame
from app.model_processor import ModelProcessor
from app.config import VIDEOS_DIR
from app.database import finish_scan, get_scan

router = APIRouter()
logger = logging.getLogger("app.routers.stream")

# Global processor instance
processor = ModelProcessor()

# Late stage anatomy classes
LATE_CLASSES = {"body", "head", "abdomen", "ribs", "brain", "legs", "eyeorbit", "umbilicalcord"}
GESTATIONAL_CLASSES = {"fetal_fluid", "placentome", "body", "head", "legs", "eyeorbit", "abdomen", "brain", "ribs", "umbilicalcord"}

FEATURE_THRESHOLDS = {
    "urinary_bladder": 1.5,
    "fetal_fluid": 1.0,
    "placentome": 1.0,
    "body": 1.0,
    "head": 0.5,
    "legs": 0.5,
    "eyeorbit": 0.5,
    "abdomen": 0.5,
    "brain": 0.5,
    "ribs": 0.5,
    "umbilicalcord": 0.5
}

async def auto_finalize_scan(scan_id: int, detected_stage: str, features_detected: list, duration: float):
    """Background task to finalize scan if no PATCH is received within 30 seconds."""
    await asyncio.sleep(30.0)
    scan = get_scan(scan_id)
    if scan and scan.get("status") != "finished":
        # Finalize using detected stage as final diagnosis
        finish_scan(
            scan_id=scan_id,
            detected_stage=detected_stage,
            final_diagnosis=detected_stage,
            features_detected=features_detected,
            duration=round(duration, 2)
        )
        logger.warning(f"Scan {scan_id} auto-finalized due to client disconnect.")

@router.websocket("/ws/stream")
async def websocket_stream(websocket: WebSocket):
    # Verify probe connection status (Close Code 4000)
    if not check_probe_status():
        await websocket.accept()
        await websocket.close(code=4000)
        return

    await websocket.accept()
    logger.info("WebSocket connection established for stream.")

    # Setup configuration handshake with 5-second timeout (Close Code 4002)
    try:
        config_data = await asyncio.wait_for(websocket.receive_json(), timeout=5.0)
        confidence_threshold = config_data.get("confidence_threshold", 0.5)
        scan_id = config_data.get("scan_id")
    except (asyncio.TimeoutError, ValueError, KeyError, Exception):
        logger.error("WebSocket setup config handshake failed or timed out.")
        await websocket.close(code=4002)
        return

    # Load YOLO Model dynamically on the GPU when frames are about to be processed
    await asyncio.to_thread(processor.load_model)
    if processor.model is None:
        logger.error("YOLO Model is not loaded.")
        await websocket.close(code=4001)
        return

    # Initialize mock video source
    video_path = VIDEOS_DIR / "Media17.mp4"
    if not init_video_source(str(video_path)):
        logger.error("Failed to initialize video source.")
        await websocket.close(code=1000)
        return

    feature_durations = {}
    stream_start_time = time.time()
    frame_index = 0
    fps = 30.0
    frame_interval = 1.0 / fps

    detected_stage = "Non-Pregnant"
    confirmed_features = []

    try:
        while True:
            now = time.time()
            elapsed = now - stream_start_time

            frame = get_next_frame()
            if frame is None:
                break

            expected_frame_index = int(elapsed / frame_interval)

            # Frame-dropping for slow hardware
            if expected_frame_index > frame_index:
                frame_index += 1
                continue

            # Process frame and run YOLO model in thread pool
            jpeg_bytes, metadata = await asyncio.to_thread(
                processor.process_frame, frame, confidence_threshold
            )

            # Check if inference exceeded 35ms warning limit
            inference_ms = metadata.get("inference_ms", 0.0)
            if inference_ms > 35.0:
                logger.warning(f"Inference latency warning: {inference_ms}ms")

            detections = metadata.get("detections", [])

            # Update feature durations (Temporal Feature Confirmation Filter)
            for det in detections:
                if det.get("confidence", 0.0) >= 0.75:
                    class_name = det.get("class_name")
                    feature_durations[class_name] = feature_durations.get(class_name, 0.0) + frame_interval

            # Send metadata packet first
            await websocket.send_json({
                "type": "metadata",
                "frame_index": frame_index,
                "inference_ms": inference_ms,
                "detections": detections
            })

            # Send binary frame packet
            await websocket.send_bytes(jpeg_bytes)

            # Rate-limiting for fast hardware
            now = time.time()
            target_time = stream_start_time + (frame_index + 1) * frame_interval
            sleep_dur = target_time - now
            if sleep_dur > 0:
                await asyncio.sleep(sleep_dur)

            frame_index += 1

        # Stream reached the end (Close Code 1000)
        close_video_source()
        logger.info(f"Final feature durations for scan {scan_id}: {feature_durations}")

        # Calculate confirmed features and stage classification hierarchy
        confirmed_features = [feat for feat, dur in feature_durations.items() if dur >= FEATURE_THRESHOLDS.get(feat, 1.0)]
        
        # Gestational stage detection logic
        if not confirmed_features:
            detected_stage = "Inconclusive"
        else:
            has_gestational = any(feat in GESTATIONAL_CLASSES for feat in confirmed_features)
            if "urinary_bladder" in confirmed_features and not has_gestational:
                detected_stage = "Non-Pregnant"
            else:
                has_late = any(feat in LATE_CLASSES for feat in confirmed_features)
                has_mid = "placentome" in confirmed_features
                has_early = "fetal_fluid" in confirmed_features

                if has_late:
                    detected_stage = "Pregnant (Late)"
                elif has_mid:
                    detected_stage = "Pregnant (Mid)"
                elif has_early:
                    detected_stage = "Pregnant (Early)"
                else:
                    detected_stage = "Inconclusive"

        # Send summary packet
        await websocket.send_json({
            "type": "summary",
            "detected_stage": detected_stage,
            "features_detected": confirmed_features
        })
        await websocket.close(code=1000)

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected abruptly.")
        close_video_source()

        # Spawn non-blocking background task with a 30-second timeout guard
        if scan_id:
            duration = time.time() - stream_start_time
            # Re-evaluate features and stage classification on disconnect
            confirmed_features = [feat for feat, dur in feature_durations.items() if dur >= FEATURE_THRESHOLDS.get(feat, 1.0)]
            
            if not confirmed_features:
                detected_stage = "Inconclusive"
            else:
                has_gestational = any(feat in GESTATIONAL_CLASSES for feat in confirmed_features)
                if "urinary_bladder" in confirmed_features and not has_gestational:
                    detected_stage = "Non-Pregnant"
                else:
                    has_late = any(feat in LATE_CLASSES for feat in confirmed_features)
                    has_mid = "placentome" in confirmed_features
                    has_early = "fetal_fluid" in confirmed_features

                    if has_late:
                        detected_stage = "Pregnant (Late)"
                    elif has_mid:
                        detected_stage = "Pregnant (Mid)"
                    elif has_early:
                        detected_stage = "Pregnant (Early)"
                    else:
                        detected_stage = "Inconclusive"

            asyncio.create_task(auto_finalize_scan(
                scan_id=scan_id,
                detected_stage=detected_stage,
                features_detected=confirmed_features,
                duration=duration
            ))
    except Exception as e:
        logger.error(f"Error in WebSocket streaming loop: {e}", exc_info=True)
        close_video_source()
        try:
            await websocket.close(code=4001)
        except Exception:
            pass
