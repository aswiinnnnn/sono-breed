from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field, constr
from typing import List
from datetime import datetime
from app.database import (
    create_scan,
    finish_scan,
    get_paginated_scans,
    get_scan,
    delete_scan,
    STATS_CACHE
)

router = APIRouter()

# Validations classes
STAGES = ["Pregnant (Early)", "Pregnant (Mid)", "Pregnant (Late)", "Non-Pregnant"]
FEATURES = ["fetal_fluid", "placentome", "body", "head", "heart", "abdomen", "ribs", "brain", "legs", "eyeorbit"]

class ScanCreateRequest(BaseModel):
    sheep_id: str = Field(
        ...,
        min_length=3,
        max_length=50,
        pattern=r"^[a-zA-Z0-9\-_ ]+$"
    )

class ScanUpdateRequest(BaseModel):
    detected_stage: str
    final_diagnosis: str
    features_detected: List[str]
    duration: float = Field(..., ge=0.0, le=3600.0)

    # Validate that elements belong to defined stages/features
    def validate_payload(self):
        if self.detected_stage not in STAGES:
            raise ValueError(f"detected_stage must be one of {STAGES}")
        if self.final_diagnosis not in STAGES:
            raise ValueError(f"final_diagnosis must be one of {STAGES}")
        for feat in self.features_detected:
            if feat not in FEATURES:
                raise ValueError(f"Feature '{feat}' must be one of {FEATURES}")

@router.post("/api/scans")
async def start_scan(payload: ScanCreateRequest):
    try:
        scan_id = create_scan(payload.sheep_id)
        # Pre-load and warm up YOLO model on the GPU during the transition page in background
        import asyncio
        from app.routers.stream import processor
        asyncio.create_task(asyncio.to_thread(processor.load_model))
        return {
            "scan_id": scan_id,
            "sheep_id": payload.sheep_id,
            "status": "scanning"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DATABASE_ERROR: {str(e)}")

@router.patch("/api/scans/{scan_id}")
async def update_scan(scan_id: int, payload: ScanUpdateRequest):
    # Run Pydantic manual checks for list membership
    try:
        payload.validate_payload()
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=f"VALIDATION_FAILED: {str(ve)}")

    # Check if scan exists
    scan = get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="RESOURCE_NOT_FOUND: Scan not found")

    # If already finished, return success immediately (Idempotency)
    if scan["status"] == "finished":
        return {"status": "success"}

    success = finish_scan(
        scan_id=scan_id,
        detected_stage=payload.detected_stage,
        final_diagnosis=payload.final_diagnosis,
        features_detected=payload.features_detected,
        duration=payload.duration
    )
    if not success:
        raise HTTPException(status_code=500, detail="DATABASE_ERROR: Failed to update scan")
    
    return {"status": "success"}

@router.get("/api/scans")
async def get_scans(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1),
    start_date: str = Query(None),
    end_date: str = Query(None)
):
    records, total_count, total_pages = get_paginated_scans(page, limit, start_date, end_date)
    return {
        "records": records,
        "page": page,
        "limit": limit,
        "total_count": total_count,
        "total_pages": total_pages,
        "stats": STATS_CACHE
    }

@router.delete("/api/scans/{scan_id}")
async def delete_scan_route(scan_id: int):
    # Check if scan exists
    scan = get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="RESOURCE_NOT_FOUND: Scan not found")
        
    success = delete_scan(scan_id)
    if not success:
        raise HTTPException(status_code=500, detail="DATABASE_ERROR: Failed to delete scan")
    return {"status": "success"}
