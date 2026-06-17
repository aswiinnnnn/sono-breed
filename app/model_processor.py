import cv2
import time
import logging
import numpy as np
import torch
from ultralytics import YOLO
from app.config import MODEL_PATH

logger = logging.getLogger("app.model_processor")

class ModelProcessor:
    def __init__(self, model_path: str = str(MODEL_PATH)):
        self.model_path = model_path
        self.model = None
        self.device = "cpu"

    def load_model(self):
        if self.model is None:
            logger.info(f"Loading YOLO model from: {self.model_path}")
            try:
                self.model = YOLO(self.model_path, task="segment")
                self.device = "cuda" if torch.cuda.is_available() else "cpu"
                logger.info(f"YOLO model loaded. Using device: {self.device}")
                
                # Warmup inference to prevent first-run lag
                logger.info("Running model warmup...")
                warmup_frame = np.zeros((512, 512, 3), dtype=np.uint8)
                self.model(warmup_frame, device=self.device, verbose=False)
                logger.info("Model warmup complete.")
            except Exception as e:
                logger.error(f"Error loading YOLO model: {e}")
                self.model = None
                self.device = "cpu"

    def process_frame(self, frame: np.ndarray, conf: float = 0.5) -> tuple[bytes, dict]:
        """
        Resizes frame for performance, runs YOLO inference, and returns the annotated
        frame as JPEG bytes along with detection metadata.
        """
        start_time = time.time()

        # Dynamic Frame Rescaling (Inference Optimization)
        h, w = frame.shape[:2]
        if w > 512:
            scale = 512.0 / w
            frame = cv2.resize(frame, (512, int(h * scale)), interpolation=cv2.INTER_LINEAR)

        self.load_model()

        if self.model is None:
            _, buffer = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 35])
            return buffer.tobytes(), {"detections": [], "inference_ms": 0.0}

        # Run inference
        results = self.model(
            frame,
            device=self.device,
            verbose=False,
            conf=conf,
            iou=0.5
        )

        detections = []
        annotated_frame = frame

        if results and len(results) > 0:
            result = results[0]
            annotated_frame = result.plot()  # Draw bounding boxes and labels

            if result.boxes is not None:
                for box in result.boxes:
                    cls_id = int(box.cls[0].item())
                    name = self.model.names.get(cls_id, f"class_{cls_id}")
                    confidence = float(box.conf[0].item())
                    bbox = box.xyxy[0].tolist()  # [x1, y1, x2, y2]
                    detections.append({
                        "class_id": cls_id,
                        "class_name": name,
                        "confidence": confidence,
                        "bbox": bbox
                    })

        # JPEG Bandwidth Compression (Stream Optimization)
        _, buffer = cv2.imencode('.jpg', annotated_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 35])
        jpeg_bytes = buffer.tobytes()

        inference_ms = (time.time() - start_time) * 1000.0

        metadata = {
            "detections": detections,
            "inference_ms": round(inference_ms, 2)
        }

        return jpeg_bytes, metadata
