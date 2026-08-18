# ResQNet REST API & WebSocket Event Specification

---

## 1. REST Endpoints

### `POST /api/incidents/detect` or `POST /api/emergencies`
Ingests crash/emergency telemetry from mobile app, CCTV node, or citizen SOS.

**Request Payload:**
```json
{
  "title": "Highway 48 Collision",
  "latitude": 18.5255,
  "longitude": 73.8580,
  "sourceType": "smartphone",
  "gForce": 5.2,
  "speedDeltaKmh": 60,
  "rollover": true,
  "confidence": 0.96,
  "userMedicalInfo": "Blood: A+ | No Allergies"
}
```

**Response (201 Created):**
```json
{
  "id": "RNQ-7964",
  "title": "Highway 48 Collision",
  "severity": 100,
  "confidenceScore": 96,
  "assignedAmbulance": "AMB-01",
  "assignedHospital": "Pune City Trauma Centre",
  "state": "VERIFIED"
}
```

---

### `POST /api/incidents/:id/dispatch`
Issues operator dispatch authorization. Transitions status to `EN_ROUTE`.

---

### `POST /api/incidents/:id/failover`
Marks the current ambulance delayed/unavailable and automatically reallocates the next best ALS unit.

---

### `POST /api/incidents/:id/resolve`
Resolves the emergency and returns the assigned ambulance to the available fleet pool.

---

### `POST /api/fleet/ambulances/:id/telemetry`
Streams high-frequency GPS coordinates from moving ambulances to connected command hubs.

---

### `GET /api/health`
Heartbeat check returning operational status of Backend, Database, AI, and Routing.

---

## 2. Real-Time WebSocket Events (Socket.IO)

| Event Name | Direction | Description |
|---|---|---|
| `incident:new` / `newEmergency` | Server → Hub | Broadcasts newly ingested emergency |
| `incident:update` / `incidentUpdated` | Server → Hub | Broadcasts state transitions (`EN_ROUTE`, `AMBULANCE_ASSIGNED`) |
| `ambulance:telemetry` / `ambulanceLocationUpdated` | Server → Hub | Streams live GPS coords and speed |
| `incident:resolved` / `incidentResolved` | Server → Hub | Clears incident from active tracking |
| `health:status` | Server → Hub | Live database and client count telemetry |
