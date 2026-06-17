import json
import logging
import sys
# Trigger watchfiles reload
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import STATIC_DIR
from app.database import init_db, get_connection
from app.probe_source import check_probe_status
from app.routers import system, scans, stream

# Structured JSON Logging Formatter
class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_data = {
            "timestamp": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
            "level": record.levelname,
            "module": record.name,
            "message": record.getMessage()
        }
        for attr in ["scan_id", "inference_ms", "elapsed_ms"]:
            if hasattr(record, attr):
                log_data[attr] = getattr(record, attr)
        return json.dumps(log_data)

# Configure Root Logger to output standard plain text format
handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(logging.Formatter(
    fmt="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
))
logging.basicConfig(level=logging.INFO, handlers=[handler], force=True)

logger = logging.getLogger("app.server")

# Initialize DB on startup
init_db()

app = FastAPI(title="SonoBreed 360 AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Custom Error Handlers to return standardized JSON payloads
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    errors = exc.errors()
    msg = "Validation failed."
    if errors:
        err = errors[0]
        loc = " -> ".join(str(l) for l in err.get("loc", []))
        msg = f"Field '{loc}' {err.get('msg')}."
    return JSONResponse(
        status_code=422,
        content={
            "error_code": "VALIDATION_FAILED",
            "message": msg,
            "timestamp": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
        }
    )

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request, exc):
    detail = exc.detail
    code = "RESOURCE_NOT_FOUND"
    message = detail
    if ":" in detail:
        parts = detail.split(":", 1)
        code = parts[0].strip()
        message = parts[1].strip()
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error_code": code,
            "message": message,
            "timestamp": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
        }
    )

@app.get("/health")
async def health_check():
    db_status = "disconnected"
    yolo_status = "not_loaded"
    probe_status = "disconnected"
    healthy = True

    # Check Database
    try:
        conn = get_connection()
        conn.execute("SELECT 1")
        conn.close()
        db_status = "connected"
    except Exception:
        healthy = False

    # Check YOLO model state (lazy loaded in router/streamer context or server import)
    try:
        from app.routers.stream import processor
        from app.config import MODEL_PATH
        if processor.model is not None:
            yolo_status = "loaded"
        elif MODEL_PATH.exists():
            yolo_status = "lazy_ready"
        else:
            yolo_status = "missing"
            healthy = False
    except Exception:
        healthy = False

    # Check Probe status
    if check_probe_status():
        probe_status = "connected"

    status_code = 200 if healthy else 503
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "healthy" if healthy else "unhealthy",
            "timestamp": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "services": {
                "database": db_status,
                "yolo_model": yolo_status,
                "probe": probe_status
            }
        }
    )

# Include Routers
app.include_router(system.router)
app.include_router(scans.router)
app.include_router(stream.router)

# Serve Frontend static files
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
