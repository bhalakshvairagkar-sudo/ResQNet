# ResQNet Real-Time YOLO / CCTV Computer Vision Service

This service provides an **optical accident-detection pipeline** that processes live CCTV video streams (Webcam, RTSP, and recorded MP4 footage), extracts bounding boxes using YOLOv8, performs multi-frame temporal vehicle tracking, executes kinematic accident reasoning, and transmits verified incidents to the central ResQNet Node.js backend.

## Architecture

```text
Camera Stream (Webcam / RTSP / Video)
        │
        ▼
   OpenCV Frame Ingestion (CameraStream)
        │
        ▼
   YOLOv8 Inference Engine (YOLODetector)
   - Classes: Car, Motorcycle, Bus, Truck, Person
   - Measures exact inference latency (ms) & FPS
        │
        ▼
   Temporal Vehicle Tracker (TemporalTracker)
   - Assigns persistent track IDs
   - Calculates centroids, velocity (px/s), acceleration & heading
        │
        ▼
   Multi-Evidence Accident Reasoner (AccidentReasoningEngine)
   - Spatial overlap (IoU ≥ 0.30)
   - Centroid convergence & rapid deceleration
   - Rollover indicator & trajectory anomaly
   - Confirmation Window: 6–15 frames persistence filter
        │
        ▼
   Authenticated Backend Client (BackendClient)
   - Headers: x-cctv-auth-token
   - Transmits to POST /api/cctv/events
```

## Running the Service

### 1. Start with FastAPI Web Server (Port 8000)
```bash
python main.py --mode server --port 8000
```

### 2. Standalone Single Camera Demo
```bash
python main.py --mode demo --camera CCTV-01 --video ./test_videos/sample_crash.mp4
```

### 3. Live USB Webcam Mode
```bash
python main.py --mode live --camera 0
```
