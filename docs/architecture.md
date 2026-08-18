# ResQNet System Architecture

ResQNet is architected as a high-velocity, real-time reactive emergency operations grid.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TIER 1: INGESTION LAYER                            │
│  • Android 3-Axis IMU (50Hz)   • CCTV Optical Feeds   • Citizen 1-Tap SOS   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTP REST / WSS WebSocket Telemetry
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TIER 2: REAL-TIME INTELLIGENCE BACKEND                   │
│  • Node.js & Express (Port 5000)      • Socket.IO Bi-Directional Event Bus  │
│  • Bayesian Confidence Fusion Model   • 0–100 Polytrauma Severity Index     │
│  • OSRM Road Graph Routing Engine     • Capability-Aware Fleet Optimizer    │
│  • Dynamic Ambulance Failover Core    • Zero-Minute ER Trauma Pre-Alert Hub │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    ▼                                     ▼
┌──────────────────────────────────────┐  ┌───────────────────────────────────┐
│     TIER 3: PERSISTENCE LAYER        │  │     TIER 4: COMMAND INTERFACES    │
│  • MongoDB (2dsphere GeoJSON)        │  │  • Leaflet Situational HUD        │
│  • In-Memory Map Fallback Store      │  │  • Live GPS Telemetry Stream      │
└──────────────────────────────────────┘  └───────────────────────────────────┘
```

## Component Roles & Responsibilities

1. **Android Sensor Layer**: Continuously evaluates kinematic vectors. Runs a 15-second false-alarm countdown before firing encrypted emergency payloads.
2. **AI Decision Core**: Eliminates manual triage latency by computing confidence and severity scores in < 3ms.
3. **OSRM Road Network Optimizer**: Uses real OpenStreetMap road topologies rather than Euclidean distances to compute driving durations.
4. **Operations Command Center**: Provides dispatch operators with single-click dispatch, automatic failover, and live moving vehicle telemetry.
5. **Hospital Terminal**: Transmits pre-arrival clinical data to trauma centers before ambulance arrival.
