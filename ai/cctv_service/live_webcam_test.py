"""
ResQNet Live Webcam & Mobile Camera Real-Time Accident Detection Runner
Captures video from your laptop webcam (device 0) or phone camera (IP Webcam / RTSP stream),
runs real-time YOLOv8 inference, kinematic tracking, multi-signal collision detection,
and automatically pushes detected accidents to the live ResQNet Command Center.
"""

import sys
import os
import time
import argparse
import cv2
import numpy as np

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import CCTVConfig
from detector import YOLODetector
from tracker import TemporalTracker
from accident_logic import AccidentReasoningEngine
from backend_client import BackendClient

def run_live_detection(source=0, camera_id="CCTV-LIVE-01", backend_url=None):
    if backend_url:
        CCTVConfig.BACKEND_URL = backend_url

    print("\n" + "=" * 65)
    print("🎥 RESQNET LIVE CAMERA REAL-TIME ACCIDENT DETECTION")
    print("=" * 65)
    print(f"• Video Source:      {source}")
    print(f"• Camera ID:         {camera_id}")
    print(f"• Target Backend:    {CCTVConfig.BACKEND_URL}")
    print(f"• YOLO Model:        {CCTVConfig.YOLO_MODEL} ({CCTVConfig.YOLO_DEVICE})")
    print("=" * 65)
    print("\n⌨️  KEYBOARD CONTROLS:")
    print("  [Q] or [ESC] - Quit live detection")
    print("  [C]          - Manually trigger a simulated collision from current frame")
    print("  [S]          - Save a screenshot of current detection\n")

    # Initialize components
    print("⏳ Loading YOLOv8 model and initializing tracker...")
    detector = YOLODetector()
    tracker = TemporalTracker()
    reasoner = AccidentReasoningEngine()
    client = BackendClient()

    # Open video capture (handles device integer 0 or HTTP/RTSP stream URL)
    try:
        cap_source = int(source) if str(source).isdigit() else source
    except Exception:
        cap_source = source

    cap = cv2.VideoCapture(cap_source)
    if not cap.isOpened():
        print(f"\n❌ ERROR: Could not open video source '{source}'.")
        print("💡 Tips:")
        print("  • If using Laptop Webcam: make sure device index is 0 or 1.")
        print("  • If using Phone Camera: ensure IP Webcam app is running and URL is reachable (e.g. http://192.168.X.X:8080/video).")
        return

    # Try setting resolution to 1280x720 or 640x480
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    # Register camera with backend
    client.register_camera({
        "camera_id": camera_id,
        "camera_name": "Live Camera Feed",
        "latitude": 18.5308,
        "longitude": 73.8290,
        "road": "Live Camera Corridor",
        "direction": "NORTHBOUND",
        "source_type": "webcam" if str(source).isdigit() else "rtsp",
        "status": "ONLINE",
        "fps": 30.0,
        "inference_latency_ms": 35.0,
        "is_demo": True
    })

    cv2.namedWindow("ResQNet — Live YOLO Accident Detection", cv2.WINDOW_NORMAL)
    cv2.resizeWindow("ResQNet — Live YOLO Accident Detection", 960, 540)

    fps_count = 0
    fps_start = time.time()
    current_fps = 0.0
    last_heartbeat = time.time()

    print("🟢 Live video stream started! Watching for vehicles and collisions...")

    while True:
        ret, frame = cap.read()
        if not ret or frame is None:
            print("⚠️ Frame drop / video ended. Reconnecting...")
            time.sleep(0.1)
            continue

        curr_time = time.time()
        fps_count += 1
        if curr_time - fps_start >= 1.0:
            current_fps = fps_count / (curr_time - fps_start)
            fps_count = 0
            fps_start = curr_time

        # 1. Run YOLO object detection
        det_result = detector.detect(frame)
        detections = det_result["detections"]
        inf_ms = det_result["inference_time_ms"]

        # 2. Update temporal kinematic tracker
        tracks = tracker.update_tracks(detections, curr_time)

        # 3. Evaluate multi-signal accident reasoning
        eval_result = reasoner.evaluate_frame(tracks, detections, {"fps": current_fps})

        # 4. If accident confirmed by temporal reasoning engine, send to backend!
        if eval_result["accident_detected"]:
            print(f"\n🚨 [ACCIDENT CONFIRMED] Confidence: {eval_result['confidence_percentage']}% | Submitting to ResQNet Backend...")
            res = client.submit_accident_event(
                camera_id=camera_id,
                confidence=eval_result["confidence"],
                evidence=eval_result["evidence"],
                latitude=18.5308,
                longitude=73.8290,
                road="Live Camera Zone",
                tracks=[t.to_dict() for t in tracks],
                is_demo=True
            )
            if res:
                print(f"✅ Backend Dispatched: Incident ID {res.get('incidentId', 'CREATED')} | Severity {res.get('severity', 'N/A')}/100")

        # 5. Periodic health heartbeat
        if curr_time - last_heartbeat >= 5.0:
            last_heartbeat = curr_time
            client.send_health_heartbeat({
                "camera_id": camera_id,
                "fps": round(current_fps, 1),
                "inference_latency_ms": round(inf_ms, 1),
                "status": "ONLINE"
            })

        # 6. Render tactical annotations
        display_frame = frame.copy()
        h, w = display_frame.shape[:2]

        # Top HUD Bar
        cv2.rectangle(display_frame, (0, 0), (w, 40), (15, 23, 42), -1)
        hud_txt = f"RESQNET LIVE | CAM: {camera_id} | FPS: {current_fps:.1f} | YOLO: {inf_ms:.1f}ms | TARGETS: {len(tracks)}"
        cv2.putText(display_frame, hud_txt, (12, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (56, 189, 248), 1, cv2.LINE_AA)

        # Draw detected objects
        for t in tracks:
            bx = [int(c) for c in t.bbox]
            is_collision_obj = (eval_result["evidence"]["is_confirmed"] or 
                                t.track_id in eval_result["evidence"].get("involved_track_ids", []))
            
            box_color = (0, 0, 255) if is_collision_obj else ((0, 255, 0) if t.is_vehicle else (255, 190, 0))
            cv2.rectangle(display_frame, (bx[0], bx[1]), (bx[2], bx[3]), box_color, 2)
            
            label = f"#{t.track_id} {t.class_name.upper()} ({t.velocity_px_s:.0f}px/s)"
            cv2.putText(display_frame, label, (bx[0], max(18, bx[1] - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, box_color, 1, cv2.LINE_AA)

        # Bottom Alert Banner
        if eval_result["evidence"]["is_confirmed"]:
            cv2.rectangle(display_frame, (0, h - 50), (w, h), (0, 0, 220), -1)
            alert_lbl = f"🚨 COLLISION DETECTED! CONFIDENCE: {eval_result['confidence_percentage']}% -> TRANSMITTING ALERT"
            cv2.putText(display_frame, alert_lbl, (16, h - 16), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2, cv2.LINE_AA)
        elif eval_result["evidence"]["active_anomaly_frames"] > 0:
            cv2.rectangle(display_frame, (0, h - 38), (w, h), (0, 140, 255), -1)
            verify_lbl = f"⚠️ EVALUATING ANOMALY ({eval_result['evidence']['active_anomaly_frames']}/{CCTVConfig.MIN_PERSISTENCE_FRAMES} FRAMES)..."
            cv2.putText(display_frame, verify_lbl, (16, h - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (255, 255, 255), 1, cv2.LINE_AA)

        cv2.imshow("ResQNet — Live YOLO Accident Detection", display_frame)

        key = cv2.waitKey(1) & 0xFF
        if key == ord('q') or key == 27: # Q or ESC
            print("\nExiting live detection...")
            break
        elif key == ord('c') or key == ord('C'):
            # Manual collision trigger key for quick testing
            print("\n⚡ [MANUAL TEST KEY PRESSED] Triggering simulated collision event from live camera...")
            client.submit_accident_event(
                camera_id=camera_id,
                confidence=0.95,
                evidence={"spatial_collision": True, "max_iou": 0.48, "rapid_deceleration": True, "is_confirmed": True},
                latitude=18.5308,
                longitude=73.8290,
                road="Live Camera Zone",
                tracks=[t.to_dict() for t in tracks],
                is_demo=True
            )
            print("✅ Event dispatched to ResQNet Backend! Check your Dashboard.")
        elif key == ord('s') or key == ord('S'):
            fn = f"screenshot_{int(time.time())}.jpg"
            cv2.imwrite(fn, display_frame)
            print(f"📸 Saved screenshot: {fn}")

    cap.release()
    cv2.destroyAllWindows()
    print("Done.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ResQNet Live Camera Accident Detector")
    parser.add_argument("--source", default="0", help="Camera index (e.g. 0 for laptop webcam) or Phone IP stream URL")
    parser.add_argument("--camera-id", default="CCTV-LIVE-01", help="Camera ID identifier")
    parser.add_argument("--backend", default=None, help="Backend URL (defaults to http://localhost:5000 or Render URL)")
    args = parser.parse_args()

    run_live_detection(source=args.source, camera_id=args.camera_id, backend_url=args.backend)
