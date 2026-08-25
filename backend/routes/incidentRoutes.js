const express = require('express');
const router = express.Router();
const db = require('../database/db');
const AIEngine = require('../services/aiEngine');
const OSRMService = require('../services/osrmService');

module.exports = (io) => {
    // 1. INGEST INCIDENT (Smartphone, CCTV, Citizen SOS, IoT)
    const handleDetection = async (req, res) => {
        try {
            const body = req.body;
            const incId = body.id || body.incidentId || `RNQ-${Math.floor(1000 + Math.random() * 9000)}`;

            // MODULE F: IDEMPOTENCY / DUPLICATE PREVENTION
            const existing = await db.getIncident(incId);
            if (existing) {
                console.log(`[Idempotency] Incident ${incId} already exists. Returning confirmed record.`);
                return res.status(200).json({
                    success: true,
                    incidentId: existing.incidentId || existing.id,
                    id: existing.incidentId || existing.id,
                    incident: existing,
                    status: existing.status,
                    confidence: existing.confidence,
                    severity: existing.severity,
                    assignedAmbulance: existing.assignedAmbulance || existing.ambulanceId,
                    assignedHospital: existing.assignedHospital || existing.hospitalId,
                    ambulanceReason: existing.ambulanceReason,
                    hospitalReason: existing.hospitalReason,
                    route: existing.route,
                    hospitalPreAlert: existing.hospitalPreAlert
                });
            }

            const lat = Number(body.latitude || body.lat || 18.5204);
            const lng = Number(body.longitude || body.lng || 73.8567);
            const src = body.source || body.sourceType || 'smartphone';
            const title = body.title || body.incidentType || 'Highway 48 Multi-Vehicle Collision';

            // Multi-source confidence fusion & severity estimation
            const sources = body.sources || body.detectionSources || [{ source: src, confidence: body.confidence !== undefined ? body.confidence : (body.confidenceScore || 0.95) }];
            const fusedConfidence = AIEngine.fuseConfidence(sources);
            const severityScore = AIEngine.calculateSeverity(body);

            // Fetch available fleet & hospitals from authoritative store
            const ambulances = await db.getAllAmbulances();
            const hospitals = await db.getAllHospitals();

            const incidentTemp = {
                id: incId,
                incidentId: incId,
                latitude: lat,
                longitude: lng,
                severity: severityScore
            };

            // Optimization engines
            const ambOptimization = await AIEngine.optimizeAmbulance(incidentTemp, ambulances);
            const hospOptimization = await AIEngine.optimizeHospital(incidentTemp, hospitals);

            const selectedAmb = ambOptimization.selected;
            const selectedHosp = hospOptimization.selected;

            // Compute 2-leg OSRM route: Ambulance -> Crash Scene -> Hospital
            let combinedRoute = ambOptimization.route;
            if (selectedAmb && selectedHosp) {
                combinedRoute = await OSRMService.getTwoLegRoute(
                    selectedAmb.lng, selectedAmb.lat,
                    lng, lat,
                    selectedHosp.lng, selectedHosp.lat
                );
            }

            // Build clinical pre-alert
            const preAlert = (selectedAmb && selectedHosp) ? 
                AIEngine.buildHospitalPreAlert(incidentTemp, selectedAmb, selectedHosp) : null;

            // Construct state-machine compliant Incident record
            const incidentRecord = {
                id: incId,
                incidentId: incId,
                source: src,
                type: body.incidentType || 'Road collision',
                title: title,
                latitude: lat,
                longitude: lng,
                gpsAccuracy: body.gpsAccuracy || 5.0,
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
                patientCount: body.patients || body.patientCount || 1,
                userMedicalInfo: body.userMedicalInfo || null,
                isDemo: body.isDemo || false,
                sources: sources,
                timeline: [
                    { status: 'DETECTED', timestamp: new Date(), description: `Incident ingested via ${src} channel`, actor: 'SYSTEM' },
                    { status: 'VERIFIED', timestamp: new Date(), description: `Bayesian multi-source confidence verified at ${fusedConfidence}%`, actor: 'AI_CORE' },
                    { status: 'SEVERITY_ASSESSED', timestamp: new Date(), description: `Polytrauma severity assessed: ${severityScore}/100`, actor: 'AI_CORE' },
                    { status: 'AMBULANCE_ASSIGNED', timestamp: new Date(), description: `Allocated ${selectedAmb ? selectedAmb.code : 'None'}: ${ambOptimization.reason}`, actor: 'OPTIMIZER' },
                    { status: 'HOSPITAL_SELECTED', timestamp: new Date(), description: `Matched ${selectedHosp ? selectedHosp.name : 'None'}: ${hospOptimization.reason}`, actor: 'OPTIMIZER' },
                    { status: 'HOSPITAL_PRE_ALERTED', timestamp: new Date(), description: `Zero-Minute Trauma Pre-Alert sent to ${selectedHosp ? selectedHosp.name : 'ER'}`, actor: 'DISPATCH' }
                ],
                createdAt: new Date().toISOString()
            };

            const saved = await db.saveIncident(incidentRecord);

            // Temporarily assign the ambulance in fleet
            if (selectedAmb) {
                await db.updateAmbulance(selectedAmb.id, {
                    currentIncidentId: incId
                });
            }

            // Real-time WebSocket emissions across canonical & legacy event channels
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
                ambulanceReason: ambOptimization.reason,
                hospitalReason: hospOptimization.reason,
                route: combinedRoute,
                hospitalPreAlert: preAlert
            });
        } catch (err) {
            console.error('Detection Error:', err);
            return res.status(500).json({ error: 'Internal Server Error during Incident Ingestion', details: err.message });
        }
    };

    router.post(['/', '/detect', '/incidents', '/emergencies', '/incidents/detect'], handleDetection);

    // 2. RETRIEVE ALL INCIDENTS
    const getIncidents = async (req, res) => {
        const incidents = await db.getAllIncidents();
        return res.json(incidents);
    };
    router.get(['/', '/incidents', '/emergencies'], getIncidents);

    // 3. RETRIEVE SINGLE INCIDENT
    const getSingleIncident = async (req, res) => {
        const incident = await db.getIncident(req.params.id);
        if (!incident) return res.status(404).json({ error: 'Incident not found' });
        return res.json(incident);
    };
    router.get(['/:id', '/incidents/:id', '/emergencies/:id'], getSingleIncident);

    // 4. DISPATCH OPERATOR CONFIRMATION
    const handleDispatch = async (req, res) => {
        try {
            const incId = req.params.id;
            const incident = await db.getIncident(incId);
            if (!incident) return res.status(404).json({ error: 'Incident not found' });

            const ambId = req.body.ambulanceId || incident.ambulanceId || 'AMB-01';

            await db.updateAmbulance(ambId, {
                status: 'EN_ROUTE',
                currentIncidentId: incId
            });

            const updated = await db.updateIncident(incId, {
                status: 'EN_ROUTE',
                ambulanceId: ambId,
                statusDescription: `Operator authorized dispatch for Unit ${ambId}`,
                actor: 'OPERATOR'
            });

            io.emit('incident:update', updated);
            io.emit('incidentUpdated', updated);
            io.emit('ambulance:status', { ambulanceId: ambId, status: 'EN_ROUTE', incidentId: incId });

            return res.json({ success: true, incident: updated });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    };
    router.post(['/:id/dispatch', '/incidents/:id/dispatch', '/emergencies/:id/dispatch'], handleDispatch);

    // 5. TRUE DYNAMIC AMBULANCE FAILOVER
    const handleFailover = async (req, res) => {
        try {
            const incId = req.params.id;
            const incident = await db.getIncident(incId);
            if (!incident) return res.status(404).json({ error: 'Incident not found' });

            const failedAmbId = incident.ambulanceId;
            console.log(`[Failover Engine] Triggered for Incident ${incId}. Marking ${failedAmbId} as UNAVAILABLE.`);

            // 1. Mark failed unit unavailable
            if (failedAmbId) {
                await db.updateAmbulance(failedAmbId, {
                    status: 'UNAVAILABLE',
                    currentIncidentId: null
                });
            }

            // 2. Re-evaluate remaining candidates
            const ambulances = await db.getAllAmbulances();
            const hospitals = await db.getAllHospitals();
            const ambOptimization = await AIEngine.optimizeAmbulance(incident, ambulances);

            if (!ambOptimization.selected) {
                return res.status(503).json({
                    error: 'No secondary ambulance available for failover',
                    details: ambOptimization.rejections
                });
            }

            const newAmb = ambOptimization.selected;
            const hosp = incident.hospitalId ? await db.getHospital(incident.hospitalId) : hospitals[0];

            // 3. Re-calculate 2-leg OSRM route for new ambulance
            const newRoute = await OSRMService.getTwoLegRoute(
                newAmb.lng, newAmb.lat,
                incident.longitude, incident.latitude,
                hosp.lng, hosp.lat
            );

            // 4. Update new ambulance to EN_ROUTE
            await db.updateAmbulance(newAmb.id, {
                status: 'EN_ROUTE',
                currentIncidentId: incId
            });

            // 5. Update incident state
            const updated = await db.updateIncident(incId, {
                ambulanceId: newAmb.id,
                ambulanceCode: newAmb.code,
                assignedAmbulance: newAmb.id,
                ambulanceReason: `[FAILOVER REASSIGNED] ${ambOptimization.reason}`,
                route: newRoute,
                status: 'EN_ROUTE',
                statusDescription: `Automated failover from ${failedAmbId || 'Primary'} to ${newAmb.code}`,
                actor: 'FAILOVER_ENGINE'
            });

            // 6. Broadcast updates
            io.emit('incident:update', updated);
            io.emit('incidentUpdated', updated);
            io.emit('ambulance:assigned', { incidentId: incId, ambulance: newAmb, route: newRoute, isFailover: true });
            io.emit('ambulance:status', { ambulanceId: failedAmbId, status: 'UNAVAILABLE' });
            io.emit('ambulance:status', { ambulanceId: newAmb.id, status: 'EN_ROUTE', incidentId: incId });

            return res.json({
                success: true,
                message: `Failover successful. Unit ${newAmb.code} dispatched.`,
                incident: updated,
                newAmbulance: newAmb,
                ranking: ambOptimization.ranking
            });
        } catch (err) {
            console.error('Failover Error:', err);
            return res.status(500).json({ error: err.message });
        }
    };
    router.post(['/:id/failover', '/incidents/:id/failover', '/emergencies/:id/failover'], handleFailover);

    // 6. RESOLVE INCIDENT
    const handleResolve = async (req, res) => {
        try {
            const incId = req.params.id;
            const resolved = await db.resolveIncident(incId, req.body.reason || 'Incident resolved and patient admitted');
            if (!resolved) return res.status(404).json({ error: 'Incident not found' });

            io.emit('incident:resolved', { incidentId: incId, resolvedAt: resolved.resolvedAt });
            io.emit('incidentResolved', { id: incId, incidentId: incId });
            if (resolved.ambulanceId) {
                io.emit('ambulance:status', { ambulanceId: resolved.ambulanceId, status: 'AVAILABLE' });
            }

            return res.json({ success: true, incident: resolved });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    };
    router.post(['/:id/resolve', '/incidents/:id/resolve', '/emergencies/:id/resolve'], handleResolve);

    // 7. RESET DEMO SUITE
    router.post(['/demo/reset', '/reset'], async (req, res) => {
        try {
            await db.resetDemoData();
            io.emit('demo:reset', { timestamp: new Date() });
            return res.json({ success: true, message: 'Demo incidents cleared and fleet restored' });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    return router;
};
