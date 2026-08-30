"""
ResQNet YOLO Computer Vision Detector
Runs real-time neural network inference using Ultralytics YOLOv8/YOLO11,
extracts target vehicle & pedestrian bounding boxes, and measures exact inference latency.
"""

import time
from typing import List, Dict, Any, Optional
import numpy as np

try:
    from ultralytics import YOLO
    ULTRALYTICS_AVAILABLE = True
except ImportError:
    ULTRALYTICS_AVAILABLE = False

from config import CCTVConfig

class YOLODetector:
    def __init__(self, model_path: Optional[str] = None, conf_threshold: Optional[float] = None, device: Optional[str] = None):
        self.model_path = model_path or CCTVConfig.YOLO_MODEL
        self.conf_threshold = conf_threshold or CCTVConfig.YOLO_CONFIDENCE
        self.device = device or CCTVConfig.YOLO_DEVICE
        self.model = None
        self.is_ready = False
        self.last_inference_time_ms = 0.0
        self.inference_fps = 0.0

        self._initialize_model()

    def _initialize_model(self):
        if not ULTRALYTICS_AVAILABLE:
            print("[CV Detector] ⚠️ Ultralytics is not installed. Running in heuristic/fallback detection mode.")
            return

        try:
            print(f"[CV Detector] 🧠 Loading YOLO model '{self.model_path}' on device '{self.device}'...")
            # Look for model in cctv_service, parent ai dir, or let ultralytics load it
            import os
            resolved_path = self.model_path
            if not os.path.exists(resolved_path):
                parent_path = os.path.join(os.path.dirname(__file__), "..", self.model_path)
                if os.path.exists(parent_path):
                    resolved_path = parent_path

            self.model = YOLO(resolved_path)
            self.is_ready = True
            print(f"[CV Detector] ✅ YOLO model initialized successfully! (Target classes: car, motorcycle, bus, truck, person)")
        except Exception as e:
            print(f"[CV Detector] ❌ Failed to load YOLO model: {e}. Running in heuristic mode.")
            self.is_ready = False

    def detect(self, frame: np.ndarray) -> Dict[str, Any]:
        """
        Runs object detection on a BGR video frame.
        Returns extracted detections, per-frame inference latency (ms), and frame metadata.
        """
        t0 = time.perf_counter()

        if not self.is_ready or self.model is None or frame is None:
            return {
                "detections": [],
                "inference_time_ms": 0.0,
                "inference_fps": 0.0,
                "vehicle_count": 0,
                "pedestrian_count": 0,
                "is_real_yolo": False
            }

        try:
            # Run inference
            results = self.model(
                frame,
                verbose=False,
                conf=self.conf_threshold,
                iou=CCTVConfig.YOLO_IOU,
                imgsz=CCTVConfig.YOLO_IMAGE_SIZE,
                device=self.device
            )
            
            t1 = time.perf_counter()
            self.last_inference_time_ms = (t1 - t0) * 1000.0
            self.inference_fps = 1000.0 / self.last_inference_time_ms if self.last_inference_time_ms > 0 else 0.0

            detections: List[Dict[str, Any]] = []
            vehicle_count = 0
            pedestrian_count = 0

            if len(results) > 0 and results[0].boxes is not None:
                boxes = results[0].boxes
                for box in boxes:
                    cls_id = int(box.cls[0].item())
                    conf = float(box.conf[0].item())

                    if cls_id in CCTVConfig.TARGET_CLASSES:
                        class_name = CCTVConfig.TARGET_CLASSES[cls_id]
                        xyxy = box.xyxy[0].cpu().numpy().tolist() # [x1, y1, x2, y2]
                        
                        is_vehicle = cls_id in CCTVConfig.VEHICLE_CLASS_IDS
                        if is_vehicle:
                            vehicle_count += 1
                        else:
                            pedestrian_count += 1

                        width = xyxy[2] - xyxy[0]
                        height = xyxy[3] - xyxy[1]
                        centroid_x = xyxy[0] + width / 2.0
                        centroid_y = xyxy[1] + height / 2.0

                        detections.append({
                            "class_id": cls_id,
                            "class_name": class_name,
                            "is_vehicle": is_vehicle,
                            "confidence": round(conf, 3),
                            "bbox": [round(float(c), 1) for c in xyxy],
                            "centroid": [round(centroid_x, 1), round(centroid_y, 1)],
                            "dimensions": [round(width, 1), round(height, 1)],
                            "aspect_ratio": round(width / height, 2) if height > 0 else 1.0
                        })

            return {
                "detections": detections,
                "inference_time_ms": round(self.last_inference_time_ms, 1),
                "inference_fps": round(self.inference_fps, 1),
                "vehicle_count": vehicle_count,
                "pedestrian_count": pedestrian_count,
                "is_real_yolo": True
            }

        except Exception as e:
            print(f"[CV Detector] Inference error: {e}")
            return {
                "detections": [],
                "inference_time_ms": round((time.perf_counter() - t0) * 1000.0, 1),
                "inference_fps": 0.0,
                "vehicle_count": 0,
                "pedestrian_count": 0,
                "is_real_yolo": False,
                "error": str(e)
            }
