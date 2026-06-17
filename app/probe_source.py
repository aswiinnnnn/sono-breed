import cv2
import numpy as np

# Global status tracking for probe
# TODO / MIMIC: At application startup, this is hardcoded to return False.
_probe_connected = False
_cap = None

def check_probe_status() -> bool:
    """Determines if the ultrasound probe is active and connected."""
    return _probe_connected

def connect_probe() -> bool:
    """Attempts to scan for and connect to the physical probe."""
    # TODO / MIMIC: Handshake simulation sets the state
    global _probe_connected
    _probe_connected = True
    return True

def init_video_source(video_path: str) -> bool:
    """Initializes the video capture object for simulated frame ingestion."""
    global _cap
    if _cap is not None:
        _cap.release()
    _cap = cv2.VideoCapture(video_path)
    return _cap.isOpened()

def close_video_source():
    """Releases the video capture resources."""
    global _cap
    if _cap is not None:
        _cap.release()
        _cap = None

def get_next_frame() -> np.ndarray | None:
    """Fetches the next image frame. In this mock suite, this reads frame-by-frame from a preloaded video file."""
    global _cap
    if _cap is None or not _cap.isOpened():
        return None
    ret, frame = _cap.read()
    if not ret:
        return None
    return frame
