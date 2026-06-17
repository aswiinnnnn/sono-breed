import os
from pathlib import Path

# Base Directory of the project (sono-new/)
BASE_DIR = Path(__file__).resolve().parent.parent

# Folder where video files will be stored
VIDEOS_DIR = BASE_DIR / "videos"

# Path to the pretrained YOLO model (TensorRT engine)
MODEL_PATH = BASE_DIR / "best.engine"

# Static files directory for serving the frontend
STATIC_DIR = BASE_DIR / "static"

# Create directories if they do not exist
os.makedirs(VIDEOS_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)
