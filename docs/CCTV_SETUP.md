# ResQNet CCTV / Computer Vision Service Setup Guide

## 1. Prerequisites

- Python 3.10+ (tested on Python 3.14.4)
- OpenCV (`cv2`)
- Ultralytics YOLO (`ultralytics >= 8.0`)
- PyTorch (`torch`)
- FastAPI & Uvicorn (optional for HTTP streaming API)
- Node.js 18+ (tested on Node v24.15) for backend server

---

## 2. Installation

1. Navigate to the CV service directory:
   ```bash
   cd ai/cctv_service
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

---

## 3. Configuration

Environment variables can be specified in a `.env` file or exported into the environment:

| Variable | Default | Description |
|---|---|---|
| `RESQNET_BACKEND_URL` | `http://localhost:5000` | URL of the central Node.js backend |
| `CCTV_AUTH_TOKEN` | `resqnet-cctv-secure-token-2026` | Service auth token for `x-cctv-auth-token` header |
| `YOLO_MODEL` | `yolov8n.pt` | YOLO model weights (`yolov8n.pt`, `yolo11n.pt`) |
| `YOLO_DEVICE` | `cpu` | Device target: `cpu`, `cuda`, `mps` |
| `MIN_PERSISTENCE_FRAMES`| `6` | Minimum frames anomaly must persist to declare accident |
| `MIN_ACCIDENT_CONFIDENCE`| `0.65` | Minimum confidence score ($65\%$) to trigger backend alert |

---

## 4. Execution Modes

### Mode A: FastAPI HTTP Server (Port 8000)
Runs the background multi-camera processing loop and serves MJPEG snapshot previews:
```bash
python main.py --mode server --port 8000
```

### Mode B: Standalone Demo Mode (Pre-recorded MP4 file)
Processes a sample collision video and posts verified events to the backend:
```bash
python main.py --mode demo --camera CCTV-01 --video ./test_videos/sample_crash.mp4
```

### Mode C: Live Physical USB Webcam Mode
Attaches to physical camera device index `0` for live optical evaluation:
```bash
python main.py --mode live --camera 0
```

---

## 5. Running Automated Tests

1. **False-Positive & Anomaly Test Suite (10 Scenarios)**:
   ```bash
   python tests/test_cctv_false_positives.py
   ```

2. **Backend End-to-End Integration Suite**:
   ```bash
   node tests/test_cctv_backend_e2e.js
   ```

3. **Complete Full-System Integration Audit**:
   ```bash
   node simulator/test_full_system.js
   ```
