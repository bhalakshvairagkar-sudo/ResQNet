# ResQNet Competition & Judging Guide

---

## 1. The 3-Minute Live Presentation Script

* **0:00 – 0:30 (Hook & Problem)**:
  * "Every 4 minutes, someone dies on an Indian road. Over 65% of fatalities happen on unmonitored highways with zero CCTV cameras. ResQNet is the first camera-independent emergency response network."
* **0:30 – 1:30 (Core Innovation Live Demo)**:
  * Trigger 4.8G crash spike on Android app → 15s countdown screen → WebSocket broadcast → Red pulsing marker appears on Pune map → OSRM driving route renders → AMB-01 (ALS equipped) allocated → Pre-alert sent to Pune Trauma Center.
* **1:30 – 2:15 (Failover & Resilience)**:
  * Trigger ambulance failover → Engine re-evaluates fleet candidates and re-assigns AMB-02 in < 1 second.
* **2:15 – 3:00 (Impact & Close)**:
  * Show hospital trauma terminal → Zero-minute triage readiness → Saves 30 to 45 minutes inside the Golden Hour.

---

## 2. Competitive Advantage Matrix

| Feature | Legacy 108 Call Centers | Apple Crash Detection | Smart City CCTVs | **ResQNet** |
|---|:---:|:---:|:---:|:---:|
| **No-CCTV Highway Coverage** | ⚠️ Relies on callers | ✅ Consumer Device | ❌ Camera blindspots | **✅ Ubiquitous (Phone IMU)** |
| **Autonomous Crash Ingestion** | ❌ Manual phone call | ⚠️ SMS to contacts | ⚠️ Optical only | **✅ Multi-Modal Autonomous** |
| **Bayesian Multi-Source Fusion**| ❌ None | ❌ None | ❌ None | **✅ Mathematical Fusion** |
| **True Road Graph Routing** | ❌ Straight line | ❌ None | ⚠️ Static paths | **✅ Dynamic OSRM 3ms** |
| **Ambulance ALS/BLS Matching** | ❌ "Next Available" | ❌ None | ❌ None | **✅ Capability-Weighted** |
| **Dynamic Ambulance Failover** | ❌ Manual re-dialing | ❌ None | ❌ None | **✅ Sub-second Auto-failover**|
| **Hospital ER Trauma Pre-Alert**| ❌ Cold Arrival | ❌ None | ❌ None | **✅ Clinical Pre-Alert** |
| **Deployment Capex** | High Call-Center Staff | Zero (Consumer App) | Extreme ($10k/km Cameras)| **Near-Zero (Software-Defined)**|
