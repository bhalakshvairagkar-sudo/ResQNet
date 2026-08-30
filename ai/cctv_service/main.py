"""
ResQNet Real-Time YOLO / CCTV Computer Vision Service
Main entrypoint providing multi-camera inference loop, FastAPI HTTP endpoints,
real-time optical accident reasoning, and backend synchronisation.
"""

import sys
import os
import time
import argparse
import threading
import cv2
import numpy as np
from typing import Dict, Any, List, Optional

from config import CCTVConfig
from detector import YOLODetector
from tracker import TemporalTracker
from accident_logic import AccidentReasoningEngine
from camera_manager import CameraStream
from backend_client import BackendClient

# FastAPI imports
try:
    from fastapi import FastAPI, Response, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    import uvicorn
    FASTAPI_AVAILABLE = True
except ImportError:
    FASTAPI_AVAILABLE = False

class CCTVService:
    def __init__(self):
        self.detector = YOLODetector()
        self.backend_client = BackendClient()
        self.cameras: Dict[str, CameraStream] = {}
        self.trackers: Dict[str, TemporalTracker] = {}
        self.reasoners: Dict[str, AccidentReasoningEngine] = {}
        self.is_running = False
        self.worker_thread: Optional[threading.Thread] = None

        self._initialize_cameras()

    def _initialize_cameras(self):
        for cam_data in CCTVConfig.DEFAULT_CAMERAS:
            c_id = cam_data["camera_id"]
            self.cameras[c_id] = CameraStream(cam_data)
            self.trackers[c_id] = TemporalTracker()
            self.reasoners[c_id] = AccidentReasoningEngine()

    def start(self):
        """Starts all camera streams and the background processing worker"""
        if self.is_running:
            return

        print("\n=======================================================")
        print("📹 Starting ResQNet YOLO/CCTV Vision Intelligence Service")
        print(f"Target Backend: {CCTVConfig.BACKEND_URL}")
        print(f"YOLO Model: {CCTVConfig.YOLO_MODEL} | Device: {CCTVConfig.YOLO_DEVICE}")
        print("=======================================================\n")

        for c_id, stream in self.cameras.items():
            stream.open()
            self.backend_client.register_camera(stream.get_health_status())

        self.is_running = True
        self.worker_thread = threading.Thread(target=self._processing_loop, daemon=True)
        self.worker_thread.start()

    def stop(self):
        self.is_running = False
        if self.worker_thread is not None:
            self.worker_thread.join(timeout=2.0)
        for stream in self.cameras.values():
            stream.close()
        print("[CCTV Service] Stopped.")

    def _processing_loop(self):
        last_heartbeat_time = 0.0

        while self.is_running:
            curr_time = time.time()
            frame_sample_rate = CCTVConfig.FRAME_SAMPLE_RATE

            for c_id, stream in self.cameras.items():
                if not stream.is_running:
                    continue

                success, frame = stream.read_frame()
                if not success or frame is None:
                    continue

                # Run YOLO object detection
                det_result = self.detector.detect(frame)
                detections = det_result["detections"]
                inference_time_ms = det_result["inference_time_ms"]

                # Update temporal tracker
                tracker = self.trackers[c_id]
                tracks = tracker.update_tracks(detections, curr_time)

                # Evaluate multi-signal accident reasoning
                reasoner = self.reasoners[c_id]
                eval_result = reasoner.evaluate_frame(tracks, detections, stream.get_health_status())

                # Generate annotated visualization frame
                annotated = self._draw_annotations(frame.copy(), tracks, eval_result, c_id, inference_time_ms)
                stream.set_annotated_frame(annotated)

                # If accident confirmed, submit to backend
                if eval_result["accident_detected"]:
                    self.backend_client.submit_accident_event(
                        camera_id=c_id,
                        confidence=eval_result["confidence"],
                        evidence=eval_result["evidence"],
                        latitude=stream.latitude,
                        longitude=stream.longitude,
                        road=stream.road,
                        tracks=[t.to_dict() for t in tracks],
                        is_demo=stream.is_demo
                    )

            # Transmit periodic health heartbeats
            if curr_time - last_heartbeat_time >= CCTVConfig.HEALTH_HEARTBEAT_SEC:
                last_heartbeat_time = curr_time
                for c_id, stream in self.cameras.items():
                    health_status = stream.get_health_status(self.detector.last_inference_time_ms)
                    self.backend_client.send_health_heartbeat(health_status)
                self.backend_client.flush_retry_queue()

            time.sleep(0.01) # Yield CPU

    def _draw_annotations(
        self,
        frame: np.ndarray,
        tracks: List[Any],
        eval_result: Dict[str, Any],
        camera_id: str,
        inference_time_ms: float
    ) -> np.ndarray:
        """Draws tactical bounding boxes, tracking velocity, and accident alerts on the frame"""
        # Draw camera HUD header
        cv2.rectangle(frame, (0, 0), (frame.shape[1], 36), (20, 24, 34), -1)
        hud_text = f"CAM: {camera_id} | YOLO INFERENCE: {inference_time_ms:.1f}ms ({self.detector.inference_fps:.0f} FPS)"
        cv2.putText(frame, hud_text, (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (56, 189, 248), 1)

        # Draw detected objects & trajectories
        for t in tracks:
            bbox = [int(c) for c in t.bbox]
            color = (0, 255, 0) if t.is_vehicle else (255, 180, 0)
            
            # If object is involved in collision anomaly, highlight in RED
            if eval_result["evidence"]["is_confirmed"] or t.track_id in eval_result["evidence"].get("involved_track_ids", []):
                color = (0, 0, 255) # Red

            cv2.rectangle(frame, (bbox[0], bbox[1]), (bbox[2], bbox[3]), color, 2)
            lbl = f"#{t.track_id} {t.class_name.upper()} ({t.velocity_px_s:.0f}px/s)"
            cv2.putText(frame, lbl, (bbox[0], max(16, bbox[1] - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)

        # If collision anomaly detected, show alert banner
        if eval_result["evidence"]["is_confirmed"]:
            cv2.rectangle(frame, (0, frame.shape[0] - 44), (frame.shape[1], frame.shape[0]), (0, 0, 200), -1)
            alert_text = f"🚨 COLLISION DETECTED — CONFIDENCE: {eval_result['confidence_percentage']}% (FRAMES: {eval_result['evidence']['active_anomaly_frames']})"
            cv2.putText(frame, alert_text, (15, frame.shape[0] - 14), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2)
        elif eval_result["evidence"]["active_anomaly_frames"] > 1:
            # Candidate anomaly in verification window
            cv2.rectangle(frame, (0, frame.shape[0] - 34), (frame.shape[1], frame.shape[0]), (0, 140, 255), -1)
            verifying_text = f"⚠️ VERIFYING ANOMALY ({eval_result['evidence']['active_anomaly_frames']}/{CCTVConfig.MIN_PERSISTENCE_FRAMES} FRAMES)..."
            cv2.putText(frame, verifying_text, (15, frame.shape[0] - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.50, (255, 255, 255), 1)

        return frame

    def get_latest_jpeg(self, camera_id: str) -> Optional[bytes]:
        """Returns JPEG encoded bytes of latest annotated frame for MJPEG stream"""
        stream = self.cameras.get(camera_id)
        if not stream:
            return None
        frame = stream.last_annotated_frame if stream.last_annotated_frame is not None else stream.last_frame
        if frame is None:
            return None
        ret, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
        return buf.tobytes() if ret else None


# FastAPI Application Setup
if FASTAPI_AVAILABLE:
    app = FastAPI(title="ResQNet YOLO CCTV Service", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    cctv_service = CCTVService()

    @app.on_event("startup")
    def on_startup():
        cctv_service.start()

    @app.on_event("shutdown")
    def on_shutdown():
        cctv_service.stop()

    @app.get("/health")
    def health():
        return {
            "status": "ONLINE",
            "service": "ResQNet-YOLO-CCTV",
            "yolo_ready": cctv_service.detector.is_ready,
            "inference_latency_ms": cctv_service.detector.last_inference_time_ms,
            "inference_fps": cctv_service.detector.inference_fps,
            "active_cameras": len([c for c in cctv_service.cameras.values() if c.is_running])
        }

    @app.get("/cameras")
    def list_cameras():
        return [
            stream.get_health_status(cctv_service.detector.last_inference_time_ms)
            for stream in cctv_service.cameras.values()
        ]

    @app.get("/preview/{camera_id}")
    def get_preview_snapshot(camera_id: str):
        jpeg_bytes = cctv_service.get_latest_jpeg(camera_id)
        if not jpeg_bytes:
            raise HTTPException(status_code=404, detail="Camera frame unavailable")
        return Response(content=jpeg_bytes, media_type="image/jpeg")

def run_cli():
    parser = argparse.ArgumentParser(description="ResQNet YOLO CCTV Service CLI Runner")
    parser.add_argument("--mode", choices=["demo", "live", "server"], default="server", help="Execution mode")
    parser.add_argument("--camera", default="CCTV-01", help="Camera ID to execute")
    parser.add_argument("--video", default="./test_videos/sample_crash.mp4", help="Video file path for demo")
    parser.add_argument("--port", type=int, default=8000, help="FastAPI port")
    args = parser.parse_args()

    if args.mode == "server":
        if FASTAPI_AVAILABLE:
            print(f"🚀 Starting FastAPI CCTV Web Service on port {args.port}...")
            uvicorn.run("main:app", host="0.0.0.0", port=args.port, reload=False)
        else:
            print("FastAPI not available, running CLI processing loop directly...")
            service = CCTVService()
            service.start()
            try:
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                service.stop()
    else:
        # Standalone Single-Camera Processor
        print(f"▶️ Running in {args.mode.upper()} mode for camera '{args.camera}'...")
        service = CCTVService()
        service.start()
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            service.stop()

if __name__ == "__main__":
    run_cli()
