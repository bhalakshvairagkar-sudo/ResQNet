"""
ResQNet CCTV Service Configuration Module
Provides centralized, environment-configurable parameters for camera sources,
YOLO model inference, temporal tracking, accident reasoning, and backend connectivity.
"""

import os
from typing import List, Dict, Any

class CCTVConfig:
    # 1. Backend Connectivity & Security
    BACKEND_URL: str = os.getenv("RESQNET_BACKEND_URL", "http://localhost:5000")
    CCTV_AUTH_TOKEN: str = os.getenv("CCTV_AUTH_TOKEN", "resqnet-cctv-secure-token-2026")
    SUBMIT_INTERVAL_SEC: float = float(os.getenv("CCTV_SUBMIT_INTERVAL_SEC", "2.0")) # Cooldown between reports for same camera
    HEALTH_HEARTBEAT_SEC: float = float(os.getenv("CCTV_HEALTH_HEARTBEAT_SEC", "5.0"))

    # 2. YOLO Model & Inference Parameters
    YOLO_MODEL: str = os.getenv("YOLO_MODEL", "yolov8n.pt")
    YOLO_CONFIDENCE: float = float(os.getenv("YOLO_CONFIDENCE", "0.40"))
    YOLO_IOU: float = float(os.getenv("YOLO_IOU", "0.45"))
    YOLO_IMAGE_SIZE: int = int(os.getenv("YOLO_IMAGE_SIZE", "640"))
    YOLO_DEVICE: str = os.getenv("YOLO_DEVICE", "cpu") # 'cpu', 'cuda', 'mps'
    FRAME_SAMPLE_RATE: int = int(os.getenv("FRAME_SAMPLE_RATE", "1")) # 1 = process every frame, 2 = every 2nd frame

    # 3. Object Detection Classes (COCO Dataset Indices)
    # 0: person, 2: car, 3: motorcycle, 5: bus, 7: truck
    TARGET_CLASSES: Dict[int, str] = {
        0: "person",
        2: "car",
        3: "motorcycle",
        5: "bus",
        7: "truck"
    }
    VEHICLE_CLASS_IDS: List[int] = [2, 3, 5, 7]
    PEDESTRIAN_CLASS_IDS: List[int] = [0]

    # 4. Temporal Tracking & Accident Reasoning
    TRACK_MAX_AGE_FRAMES: int = int(os.getenv("TRACK_MAX_AGE_FRAMES", "30"))
    MIN_PERSISTENCE_FRAMES: int = int(os.getenv("MIN_PERSISTENCE_FRAMES", "6")) # Frames anomaly must persist to declare event
    COLLISION_IOU_THRESHOLD: float = float(os.getenv("COLLISION_IOU_THRESHOLD", "0.30")) # Bounding box overlap threshold
    PROXIMITY_CONVERGENCE_PX: float = float(os.getenv("PROXIMITY_CONVERGENCE_PX", "50.0")) # Pixel distance between approaching centroids
    RAPID_DECELERATION_RATIO: float = float(os.getenv("RAPID_DECELERATION_RATIO", "0.55")) # Speed drops by >55% in <= 0.5s
    MIN_ACCIDENT_CONFIDENCE: float = float(os.getenv("MIN_ACCIDENT_CONFIDENCE", "0.65")) # 65% minimum confidence to alert backend

    # 5. Default Camera Registry for Pune Smart City Network
    DEFAULT_CAMERAS: List[Dict[str, Any]] = [
        {
            "camera_id": "CCTV-01",
            "camera_name": "Pune University Smart Junction Cam",
            "latitude": 18.5308,
            "longitude": 73.8290,
            "road": "Ganeshkhind Road",
            "direction": "NORTHBOUND",
            "source_type": "file", # 'webcam', 'file', 'rtsp'
            "source_url": "./test_videos/sample_crash.mp4",
            "status": "ONLINE"
        },
        {
            "camera_id": "CCTV-02",
            "camera_name": "Swargate High-Density Transit Hub",
            "latitude": 18.5018,
            "longitude": 73.8576,
            "road": "Satara Road Interchange",
            "direction": "SOUTHBOUND",
            "source_type": "file",
            "source_url": "./test_videos/sample_crash.mp4",
            "status": "ONLINE"
        },
        {
            "camera_id": "CCTV-03",
            "camera_name": "Pune Railway Station Flyover Cam",
            "latitude": 18.5284,
            "longitude": 73.8744,
            "road": "Station Road Flyover",
            "direction": "EASTBOUND",
            "source_type": "file",
            "source_url": "./test_videos/sample_crash.mp4",
            "status": "ONLINE"
        },
        {
            "camera_id": "CCTV-04",
            "camera_name": "Katraj Tunnel Highway Cam",
            "latitude": 18.4480,
            "longitude": 73.8620,
            "road": "NH48 Expressway",
            "direction": "SOUTHBOUND",
            "source_type": "file",
            "source_url": "./test_videos/sample_crash.mp4",
            "status": "ONLINE"
        }
    ]
