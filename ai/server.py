"""Small independently runnable HTTP facade for the real YOLO detector.
Run from the repository root: python -m ai.server
"""
import base64
import os
import time
from flask import Flask, jsonify, request
import numpy as np
from .yolo_detector import RealYOLOCrashDetector, YOLO_AVAILABLE

app = Flask(__name__)
detector = RealYOLOCrashDetector(
    model_name=os.getenv("YOLO_MODEL_PATH", os.path.join(os.path.dirname(__file__), "yolov8n.pt")),
    confidence_threshold=float(os.getenv("YOLO_CONFIDENCE_THRESHOLD", "0.5")),
    backend_url=os.getenv("RESQNET_BACKEND_URL", "http://localhost:5000"),
)

@app.get("/health")
def health():
    return jsonify({"status": "ONLINE" if detector.model else "DEGRADED", "modelLoaded": detector.model is not None, "yoloAvailable": YOLO_AVAILABLE, "timestamp": time.time()})

@app.post("/detect")
def detect():
    payload = request.get_json(silent=True) or {}
    # A real image is mandatory; the service never invents a detection from metadata.
    encoded = payload.get("imageBase64")
    if not encoded:
        return jsonify({"error": "imageBase64 is required"}), 400
    try:
        import cv2
        binary = base64.b64decode(encoded.split(",")[-1])
        frame = cv2.imdecode(np.frombuffer(binary, np.uint8), cv2.IMREAD_COLOR)
        if frame is None: raise ValueError("unreadable image")
        result = detector.process_frame(frame, payload.get("cameraId", "UNKNOWN"), payload.get("latitude"), payload.get("longitude"))
        return jsonify(result)
    except Exception as error:
        return jsonify({"error": "inference failed", "detail": str(error)}), 422

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("AI_PORT", "5001")))
