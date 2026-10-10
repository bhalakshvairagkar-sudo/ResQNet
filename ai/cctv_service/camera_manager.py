"""
ResQNet Camera Stream Manager & Ingestion Module
Handles video frame acquisition from Webcams, RTSP streams, and Video Files.
Measures camera stream FPS, health states, and produces annotated visualization frames.
"""

import time
import os
import math
import cv2
import numpy as np
from typing import Optional, Dict, Any, Tuple
from config import CCTVConfig

class CameraStream:
    def __init__(self, camera_metadata: Dict[str, Any]):
        self.camera_id = camera_metadata.get("camera_id", "CCTV-01")
        self.camera_name = camera_metadata.get("camera_name", "Junction Cam")
        self.latitude = camera_metadata.get("latitude", 18.5204)
        self.longitude = camera_metadata.get("longitude", 73.8567)
        self.road = camera_metadata.get("road", "Main Corridor")
        self.direction = camera_metadata.get("direction", "NORTHBOUND")
        self.source_type = camera_metadata.get("source_type", "file") # 'webcam', 'file', 'rtsp'
        self.source_url = camera_metadata.get("source_url", "")
        self.is_demo = camera_metadata.get("is_demo", self.source_type == "file")

        # Stream capture & telemetry
        self.cap: Optional[cv2.VideoCapture] = None
        self.is_running = False
        self.status = "ONLINE" # ONLINE, OFFLINE, DEGRADED, NO_FRAMES, HIGH_LATENCY
        self.last_frame: Optional[np.ndarray] = None
        self.last_annotated_frame: Optional[np.ndarray] = None
        self.last_frame_time: float = 0.0
        self.frame_count: int = 0
        self.fps: float = 0.0
        self._fps_window_start: float = time.time()
        self._fps_window_frames: int = 0

    def open(self) -> bool:
        """Initializes the OpenCV video capture object based on source_type"""
        try:
            if self.source_type == "webcam":
                device_idx = int(self.source_url) if self.source_url.isdigit() else 0
                self.cap = cv2.VideoCapture(device_idx)
            elif self.source_type in ["file", "rtsp"]:
                # If file does not exist, check fallback paths
                if self.source_type == "file" and not os.path.exists(self.source_url):
                    alt_path = os.path.join(os.path.dirname(__file__), self.source_url)
                    if os.path.exists(alt_path):
                        self.source_url = alt_path
                    else:
                        print(f"[Camera {self.camera_id}] ⚠️ Source file '{self.source_url}' not found. Generating synthetic feed.")
                        self.cap = None
                        self.is_running = True
                        self.status = "ONLINE"
                        return True
                self.cap = cv2.VideoCapture(self.source_url)
            else:
                self.cap = None

            if self.cap is not None and not self.cap.isOpened():
                print(f"[Camera {self.camera_id}] ❌ Failed to open video stream ({self.source_type}: {self.source_url})")
                self.status = "OFFLINE"
                self.is_running = False
                return False

            self.is_running = True
            self.status = "ONLINE"
            self._fps_window_start = time.time()
            self._fps_window_frames = 0
            print(f"[Camera {self.camera_id}] ✅ Opened stream ({self.source_type.upper()}: {self.camera_name})")
            return True
        except Exception as e:
            print(f"[Camera {self.camera_id}] Error opening stream: {e}")
            self.status = "OFFLINE"
            self.is_running = False
            return False

    def read_frame(self) -> Tuple[bool, Optional[np.ndarray]]:
        """Reads a single frame from the camera stream, handling loop for files & synthetic fallback"""
        if not self.is_running:
            return False, None

        curr_time = time.time()

        # Synthetic test frame generator if no physical capture is available
        if self.cap is None or not self.cap.isOpened():
            frame = self._generate_synthetic_test_frame()
            self.last_frame = frame
            self.last_frame_time = curr_time
            self._update_fps(curr_time)
            return True, frame

        ret, frame = self.cap.read()

        # Auto-loop video files for continuous testing
        if not ret and self.source_type == "file":
            self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, frame = self.cap.read()

        if ret and frame is not None:
            self.last_frame = frame
            self.last_frame_time = curr_time
            self.status = "ONLINE"
            self._update_fps(curr_time)
            return True, frame
        else:
            self.status = "NO_FRAMES"
            return False, None

    def _update_fps(self, curr_time: float):
        self.frame_count += 1
        self._fps_window_frames += 1
        elapsed = curr_time - self._fps_window_start
        if elapsed >= 1.0:
            self.fps = round(self._fps_window_frames / elapsed, 1)
            self._fps_window_start = curr_time
            self._fps_window_frames = 0

    def _generate_synthetic_test_frame(self) -> np.ndarray:
        """Generates a dynamic 640x480 test frame for development & testing"""
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        # Draw road asphalt background
        cv2.rectangle(frame, (0, 0), (640, 480), (35, 38, 45), -1)
        # Lane divider markings
        for y in range(20, 480, 50):
            cv2.line(frame, (320, y), (320, y + 25), (220, 220, 220), 3)

        # Dynamic vehicle movement simulation
        t = time.time()
        v1_x = int(180 + 80 * math.sin(t * 1.5))
        v1_y = int(220 + 40 * math.cos(t * 1.5))
        v2_x = int(280 - 60 * math.sin(t * 1.5))
        v2_y = int(240 + 30 * math.sin(t * 1.5))

        # Vehicle 1 (Car)
        cv2.rectangle(frame, (v1_x, v1_y), (v1_x + 90, v1_y + 55), (0, 180, 255), -1)
        cv2.putText(frame, "CAR #1", (v1_x, v1_y - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)

        # Vehicle 2 (Truck)
        cv2.rectangle(frame, (v2_x, v2_y), (v2_x + 110, v2_y + 65), (50, 205, 50), -1)
        cv2.putText(frame, "TRUCK #2", (v2_x, v2_y - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)

        return frame

    def set_annotated_frame(self, frame: np.ndarray):
        self.last_annotated_frame = frame

    def close(self):
        self.is_running = False
        if self.cap is not None:
            self.cap.release()
            self.cap = None
        self.status = "OFFLINE"
        print(f"[Camera {self.camera_id}] Stream closed.")

    def get_health_status(self, inference_latency_ms: float = 0.0) -> Dict[str, Any]:
        return {
            "camera_id": self.camera_id,
            "camera_name": self.camera_name,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "road": self.road,
            "direction": self.direction,
            "source_type": self.source_type,
            "is_demo": self.is_demo,
            "status": self.status,
            "fps": self.fps,
            "inference_latency_ms": round(inference_latency_ms, 1),
            "last_frame_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(self.last_frame_time)) if self.last_frame_time > 0 else None,
            "frame_count": self.frame_count
        }
