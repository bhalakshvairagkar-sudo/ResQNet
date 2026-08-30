const express = require('express');
const router = express.Router();
const db = require('../database/db');
const config = require('../config/config');
const AIEngine = require('../services/aiEngine');
const OSRMService = require('../services/osrmService');

module.exports = (io) => {
    // Security & Authentication Middleware for CCTV Service
    const authenticateCCTV = (req, res, next) => {
        const token = req.headers['x-cctv-auth-token'] || req.headers['authorization'] || req.query.token;
        const expectedToken = config.CCTV_AUTH_TOKEN || 'resqnet-cctv-secure-token-2026';

        // Allow public read GET endpoints, protect POST / PUT / mutation endpoints
        if (req.method === 'GET') {
            return next();
        }

        if (token && (token === expectedToken || token === `Bearer ${expectedToken}`)) {
            return next();
        }

        // Allow loopback / localhost during local development if configured
        const isLocalhost = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
        if (isLocalhost && !process.env.STRICT_AUTH) {
            return next();
        }

        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid or missing x-cctv-auth-token header for CCTV service ingestion'
        });
    };

    router.use(authenticateCCTV);

    // 1. Ingest Optical Accident Event (POST /api/cctv/events)
    router.post('/events', async (req, res) => {
        try {
            const body = req.body;
            const incId = body.id || body.incidentId || `RNQ-CCTV-${Date.now().toString().slice(-6)}`;
            const cameraId = body.cameraId || body.camera_id || 'CCTV-01';

            // Check if camera is registered
            const camera = await db.getCCTV(cameraId);
            const lat = Number(body.latitude ?? (camera ? camera.lat : 18.5204));
            const lng = Number(body.longitude ?? (camera ? camera.lng : 73.8567));

            // Validate confidence
            let rawConf = body.confidence !== undefined ? body.confidence : (body.confidenceScore || 85);
            if (rawConf > 1.0) rawConf = rawConf / 100.0;
            const normalizedConf = Math.max(0.1, Math.min(0.99, Number(rawConf)));
            const confidencePercentage = Math.round(normalizedConf * 100);

            console.log(`\n[CCTV INGESTION] 🚨 Received Optical Accident Event from ${cameraId} (${lat}, ${lng}) | Confidence: ${confidencePercentage}%`);

            // Check idempotency for exact same ID
            const existing = await db.getIncident(incId);
            if (existing) {
                console.log(`[CCTV] [IDEMPOTENCY] Incident ${incId} already exists. Returning confirmed record.`);
                return res.status(200).json({
                    success: true,
                    incidentId: existing.id || existing.incidentId,
                    incident: existing,
                    status: existing.status
                });
            }

            // Spatial-Temporal Multi-Source Fusion Check (250m & 60s window)
            const allIncidents = await db.getAllIncidents();
            let correlatedIncident = null;
            let minDistance = Infinity;

            for (const i of allIncidents) {
                if (i.status === 'RESOLVED' || i.id === incId || (i.incidentId && i.incidentId === incId)) continue;
                if (i.latitude === null || i.longitude === null) continue;
                const dist = OSRMService.calculateHaversineDistance(lat, lng, i.latitude, i.longitude);
                const timeDiffSec = Math.abs(Date.now() - new Date(i.createdAt).getTime()) / 1000;
                if (dist <= 0.25 && timeDiffSec <= 60) {
                    if (dist < minDistance) {
                        minDistance = dist;
                        correlatedIncident = i;
                    }
                }
            }

            if (correlatedIncident) {
                const corrId = correlatedIncident.incidentId || correlatedIncident.id;
                console.log(`[CCTV FUSION] Correlated CCTV event into existing incident ${corrId} (Distance: ~${(minDistance*1000).toFixed(0)}m)`);

                const cctvSourceEntry = {
                    source: 'cctv',
                    sourceType: 'FIXED_OPTICAL_AI',
                    cameraId: cameraId,
                    confidence: confidencePercentage,
                    evidence: body.evidence || {},
                    timestamp: new Date().toISOString()
                };

                const updatedSources = [...(correlatedIncident.sources || []), cctvSourceEntry];
                const updatedConfidence = AIEngine.fuseConfidence(updatedSources);

                const timeline = correlatedIncident.timeline || [];
                timeline.push({
                    status: 'VERIFIED',
                    timestamp: new Date(),
                    description: `Fused optical confirmation from ${cameraId} (Confidence: ${confidencePercentage}% -> Fused: ${updatedConfidence}%)`,
                    actor: 'YOLO_AI_CORE'
                });

                const updated = await db.updateIncident(corrId, {
                    sources: updatedSources,
                    confidence: updatedConfidence,
                    confidenceScore: updatedConfidence,
                    timeline: timeline,
                    statusDescription: `Fused multi-source confirmation from ${cameraId} (Confidence: ${updatedConfidence}%)`
                });

                io.emit('cctv:accident', {
                    cameraId,
                    incidentId: corrId,
                    confidence: confidencePercentage,
                    fused: true,
                    evidence: body.evidence,
                    timestamp: new Date().toISOString()
                });
                io.emit('incident:update', updated);
                io.emit('incidentUpdated', updated);

                return res.status(200).json({
                    success: true,
                    incidentId: corrId,
                    id: corrId,
                    incident: updated,
                    fused: true,
                    confidence: updatedConfidence
                });
            }

            // Independent CCTV Detection Event -> Build new incident through full pipeline
            const sources = [
                {
                    source: 'cctv',
                    sourceType: 'FIXED_OPTICAL_AI',
                    cameraId: cameraId,
                    confidence: confidencePercentage,
                    evidence: body.evidence || {},
                    timestamp: new Date().toISOString()
                }
            ];

            const fusedConfidence = AIEngine.fuseConfidence(sources);
            const severityScore = AIEngine.calculateSeverity({
                ...body,
                confidence: fusedConfidence,
                sourceType: 'cctv'
            });

            // Fleet & Hospital Optimizers
            const ambulances = await db.getAllAmbulances();
            const hospitals = await db.getAllHospitals();

            const incidentTemp = {
                id: incId,
                incidentId: incId,
                latitude: lat,
                longitude: lng,
                severity: severityScore
            };

            const ambOptimization = await AIEngine.optimizeAmbulance(incidentTemp, ambulances);
            const hospOptimization = await AIEngine.optimizeHospital(incidentTemp, hospitals);

            const selectedAmb = ambOptimization.selected;
            const selectedHosp = hospOptimization.selected;

            let combinedRoute = ambOptimization.route;
            if (selectedAmb && selectedHosp) {
                combinedRoute = await OSRMService.getTwoLegRoute(
                    selectedAmb.lng, selectedAmb.lat,
                    lng, lat,
                    selectedHosp.lng, selectedHosp.lat
                );
            }

            const preAlert = (selectedAmb && selectedHosp) ?
                AIEngine.buildHospitalPreAlert(incidentTemp, selectedAmb, selectedHosp) : null;

            const incidentRecord = {
                id: incId,
                incidentId: incId,
                source: 'cctv',
                sourceType: 'FIXED_OPTICAL_AI',
                cameraId: cameraId,
                type: 'CCTV Intersection Collision',
                title: body.title || `CCTV Intersection Collision Alert (${cameraId})`,
                latitude: lat,
                longitude: lng,
                locationQuality: 'FRESH_GPS',
                gpsAccuracy: 1.5,
                location: { type: 'Point', coordinates: [lng, lat] },
                confidence: fusedConfidence,
                confidenceScore: fusedConfidence,
                severity: severityScore,
                status: 'VERIFIED',
                ambulanceId: selectedAmb ? selectedAmb.id : null,
                ambulanceCode: selectedAmb ? selectedAmb.code : null,
                assignedAmbulance: selectedAmb ? selectedAmb.id : null,
                ambulanceReason: ambOptimization.reason,
                hospitalId: selectedHosp ? selectedHosp.id : null,
                assignedHospital: selectedHosp ? selectedHosp.name : null,
                hospitalReason: hospOptimization.reason,
                route: combinedRoute,
                hospitalRoute: hospOptimization.route,
                hospitalPreAlert: preAlert,
                patientCount: body.patients || 2,
                isDemo: body.isDemo !== undefined ? body.isDemo : (camera ? camera.isDemo : true),
                sources: sources,
                evidence: body.evidence || {},
                timeline: [
                    { status: 'DETECTED', timestamp: new Date(), description: `Optical collision anomaly detected by ${cameraId}`, actor: 'YOLO_AI_CORE' },
                    { status: 'VERIFIED', timestamp: new Date(), description: `Temporal confirmation window passed (Confidence: ${fusedConfidence}%)`, actor: 'AI_CORE' },
                    { status: 'SEVERITY_ASSESSED', timestamp: new Date(), description: `Severity assessed: ${severityScore}/100`, actor: 'AI_CORE' },
                    { status: 'AMBULANCE_ASSIGNED', timestamp: new Date(), description: `Allocated ${selectedAmb ? selectedAmb.code : 'None'}: ${ambOptimization.reason}`, actor: 'OPTIMIZER' },
                    { status: 'HOSPITAL_SELECTED', timestamp: new Date(), description: `Matched ${selectedHosp ? selectedHosp.name : 'None'}: ${hospOptimization.reason}`, actor: 'OPTIMIZER' },
                    { status: 'HOSPITAL_PRE_ALERTED', timestamp: new Date(), description: `Zero-Minute Trauma Pre-Alert prepared for ${selectedHosp ? selectedHosp.name : 'ER'}`, actor: 'DISPATCH' }
                ],
                createdAt: new Date().toISOString()
            };

            const saved = await db.saveIncident(incidentRecord);

            if (selectedAmb) {
                await db.updateAmbulance(selectedAmb.id, { currentIncidentId: incId });
            }

            // Real-time WebSocket emissions
            io.emit('cctv:accident', {
                cameraId,
                incidentId: incId,
                confidence: fusedConfidence,
                severity: severityScore,
                evidence: body.evidence,
                timestamp: new Date().toISOString()
            });
            io.emit('incident:new', saved);
            io.emit('newEmergency', saved);
            if (selectedAmb) io.emit('ambulance:assigned', { incidentId: incId, ambulance: selectedAmb, route: combinedRoute });
            if (selectedHosp) io.emit('hospital:selected', { incidentId: incId, hospital: selectedHosp });
            if (preAlert) io.emit('hospital:prealert', preAlert);

            return res.status(201).json({
                success: true,
                incidentId: incId,
                id: incId,
                incident: saved,
                status: saved.status,
                confidence: fusedConfidence,
                severity: severityScore,
                assignedAmbulance: selectedAmb ? selectedAmb.id : null,
                assignedHospital: selectedHosp ? selectedHosp.name : null,
                route: combinedRoute,
                hospitalPreAlert: preAlert
            });
        } catch (err) {
            console.error('[CCTV Routes] Event Ingestion Error:', err);
            return res.status(500).json({ error: 'Internal Server Error', message: err.message });
        }
    });

    // 2. Camera Registry
    router.get('/cameras', async (req, res) => {
        const cameras = await db.getAllCCTV();
        return res.json(cameras);
    });

    router.get('/cameras/:id', async (req, res) => {
        const camera = await db.getCCTV(req.params.id);
        if (!camera) return res.status(404).json({ error: 'Camera not found' });
        return res.json(camera);
    });

    // 3. Register Camera
    router.post('/register', async (req, res) => {
        try {
            const registered = await db.registerCCTV(req.body);
            io.emit('cctv:registered', registered);
            return res.status(201).json({ success: true, camera: registered });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    // 4. Ingest Camera Health & Heartbeat
    router.post('/health', async (req, res) => {
        try {
            const { camera_id, cameraId, id, fps, inference_latency_ms, inferenceLatency, status } = req.body;
            const targetId = camera_id || cameraId || id;
            if (!targetId) return res.status(400).json({ error: 'Missing camera_id' });

            const updated = await db.updateCCTVHealth(targetId, {
                status: status || 'ONLINE',
                fps: fps !== undefined ? Number(fps) : 0,
                inference_latency_ms: inference_latency_ms !== undefined ? Number(inference_latency_ms) : (inferenceLatency || 0),
                last_frame_at: new Date().toISOString()
            });

            io.emit('cctv:health', updated);
            return res.status(200).json({ success: true, camera: updated });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    // 5. Aggregate CCTV Network Health
    router.get('/health', async (req, res) => {
        const cameras = await db.getAllCCTV();
        const onlineCount = cameras.filter(c => c.status === 'ONLINE').length;
        const totalFps = cameras.reduce((sum, c) => sum + (Number(c.fps) || 0), 0);
        const avgFps = cameras.length > 0 ? (totalFps / cameras.length).toFixed(1) : 0;
        const totalLatency = cameras.reduce((sum, c) => sum + (Number(c.inferenceLatency) || 0), 0);
        const avgLatency = cameras.length > 0 ? (totalLatency / cameras.length).toFixed(1) : 0;

        return res.json({
            status: onlineCount > 0 ? 'ONLINE' : 'DEGRADED',
            totalCameras: cameras.length,
            onlineCameras: onlineCount,
            offlineCameras: cameras.length - onlineCount,
            averageFps: Number(avgFps),
            averageInferenceLatencyMs: Number(avgLatency),
            cameras: cameras
        });
    });

    return router;
};
