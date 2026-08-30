# ResQNet Real-Time YOLO / CCTV Computer-Vision Architecture

## 1. System Overview

ResQNet integrates an optical accident-detection pipeline alongside physical Android smartphone IMU/GPS crash detection and Citizen SOS reports. The computer vision subsystem runs as a dedicated Python service (`ai/cctv_service/`) using Ultralytics YOLOv8/YOLO11, temporal kinematic tracking, and a multi-signal accident reasoning engine with temporal confirmation windows.

```text
 ┌─────────────────────────────────────────────────────────────────────────┐
 │                           CAMERA SOURCES                                │
 │   • USB Webcams (cv2.VideoCapture(0))                                   │
 │   • RTSP Streams (rtsp://camera-ip:port/stream)                         │
 │   • Pre-recorded / Recorded MP4 Test Videos (DEMO MODE)                 │
 └────────────────────────────────────┬────────────────────────────────────┘
                                      │ Raw video frames (25 FPS)
                                      ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │               DEDICATED PYTHON YOLO CV SERVICE (/ai/cctv_service/)      │
 │  1. CameraStream: Frame acquisition, FPS & stream health tracking       │
 │  2. YOLODetector: Ultralytics YOLOv8 inference (car, moto, bus, truck)  │
 │  3. TemporalTracker: Track IDs, velocity (px/s), acceleration & heading │
 │  4. AccidentReasoningEngine: Spatial IoU, deceleration, rollover        │
 │  5. ConfirmationWindow: 6-15 frame persistence filter                   │
 │  6. BackendClient: Authenticated HTTP transmission with retry queue     │
 └────────────────────────────────────┬────────────────────────────────────┘
                                      │ POST /api/cctv/events (x-cctv-auth-token)
                                      ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │               CENTRAL RESQNET BACKEND (Node.js / Express :5000)         │
 │  • CCTV Ingestion & Security Auth (/api/cctv/*, Token Validation)       │
 │  • Spatial-Temporal Incident Correlation (250m & 60s window)            │
 │  • Bayesian Multi-Source Confidence Fusion (Android + CCTV + SOS)       │
 │  • Polytrauma Optical & Kinematic Severity Scoring (0-100)              │
 │  • Capability-Aware Ambulance Optimization & OSRM 2-Leg Routing         │
 │  • Zero-Minute Trauma Center Pre-Alert Vault                            │
 └───────────────────┬─────────────────────────────────┬───────────────────┘
                     │ MongoDB / In-Memory             │ Socket.IO ('cctv:accident',
                     ▼                                 │            'incident:new')
 ┌──────────────────────────────────────┐              ▼
 │        DATABASE PERSISTENCE          │   ┌──────────────────────────────┐
 │   • Incidents (with sources array)   │   │   COMMAND CENTER DASHBOARD   │
 │   • Cameras (metadata, health, fps)  │   │  • Tactical Multi-Map Overlay│
 │   • CCTV Event Detections            │   │  • CCTV Network Health HUD   │
 └──────────────────────────────────────┘   │  • Live Source Fusion Drawer │
                                            └──────────────────────────────┘
```

---

## 2. Computer-Vision Pipeline Components

### 2.1 YOLOv8 Object Detection (`detector.py`)
- **Target Classes**: Vehicle classes (`car`, `motorcycle`, `bus`, `truck`) and `person` (COCO classes 0, 2, 3, 5, 7).
- **Latency Tracking**: Measures exact per-frame inference duration in milliseconds ($t_{\text{inference}}$) and calculated inference FPS ($1000 / t_{\text{inference}}$).
- **Output**: Bounding boxes $[x_1, y_1, x_2, y_2]$, centroids $[c_x, c_y]$, dimensions $[w, h]$, aspect ratios ($w/h$).

### 2.2 Temporal Kinematic Tracking (`tracker.py`)
- **Track Association**: Maintains persistent track IDs across frames by minimizing Euclidean centroid distance ($d \le 75\text{ px}$).
- **Kinematic Estimation**:
  - Velocity: $v = \frac{\Delta d}{\Delta t}$ (exponentially smoothed with $\alpha = 0.7$)
  - Acceleration / Deceleration: $a = \frac{v_t - v_{t-1}}{\Delta t}$
  - Heading angle: $\theta = \operatorname{atan2}(\Delta y, \Delta x) \pmod{360^\circ}$
  - Trajectory history: sliding window of up to 30 frames.

### 2.3 Multi-Signal Accident Reasoning (`accident_logic.py`)
Accident evaluation combines multiple physical indicators:
1. **Spatial Overlap / Collision**: Pairwise Intersection over Union ($\text{IoU} \ge 0.30$) or centroid convergence ($d < 50\text{ px}$ with opposing headings).
2. **Kinematic Deceleration**: Sudden velocity drop ($> 55\%$ speed decrease within $\le 0.5\text{ s}$).
3. **Trajectory Jerk / Rotation**: Direction shift ($> 60^\circ$ heading deflection with severe deceleration).
4. **Rollover Signal**: Aspect ratio inversion (e.g. initial $w/h \ge 1.3$ flipping to $\le 0.65$ on impact).
5. **Pedestrian Vulnerability**: Pedestrian presence within $80\text{ px}$ of the impact zone.

### 2.4 Temporal Confirmation Window
To eliminate single-frame false positives (such as hard braking, lane changes, potholes, camera shake, or shadows), an anomaly must persistently satisfy candidate thresholds across **$N$ consecutive frames** (default $N = 6$ frames) before the service issues an alert to the backend.

---

## 3. Bayesian Multi-Source Fusion Formulation

When reports from different detection channels (e.g., CCTV optical AI, Android smartphone IMU, Citizen SOS) occur within the **$250\text{ m}$ spatial radius** and **$60\text{ s}$ temporal window**, the backend merges them into a single authoritative incident record.

The fused confidence $C_{\text{fused}}$ is computed using the Bayesian independent unconfidence formula:

$$C_{\text{fused}} = 1 - \prod_{i=1}^{k} \left(1 - \frac{C_i}{100}\right)$$

where $C_i$ represents the individual confidence percentage of each participating detection source.

### Example Multi-Source Fusion Calculation
- **CCTV Optical Confidence**: $C_{\text{CCTV}} = 94\%$ ($0.94$)
- **Android Smartphone IMU**: $C_{\text{Android}} = 95\%$ ($0.95$)
- **Unconfidence Product**: $(1 - 0.94) \times (1 - 0.95) = 0.06 \times 0.05 = 0.003$
- **Fused Confidence**: $1 - 0.003 = 0.997 \implies \mathbf{100\%}$

---

## 4. Optical Severity Scoring Formula

Visual severity for optical accident events is evaluated on a scale of $0\text{--}100$:

$$\text{Severity}_{\text{optical}} = \text{Base} + S_{\text{overlap}} + S_{\text{decel}} + S_{\text{rollover}} + S_{\text{pedestrian}} + S_{\text{occupants}}$$

- $\text{Base} = 35\text{ pts}$
- $S_{\text{overlap}} = 25 + \min(15, \lfloor\text{IoU} \times 30\rfloor)\text{ pts}$
- $S_{\text{decel}} = 15\text{ pts}$
- $S_{\text{rollover}} = 20\text{ pts}$
- $S_{\text{pedestrian}} = 15\text{ pts}$
- $S_{\text{occupants}} = \min(10, \text{patientCount} \times 5)\text{ pts}$

---

## 5. Security & Authentication

All mutations and telemetry transmissions from the CV service to the backend require the `x-cctv-auth-token` HTTP header matching `CCTV_AUTH_TOKEN` in `backend/config/config.js`.
