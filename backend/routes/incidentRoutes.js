const express = require('express');
const router = express.Router();
const store = require('../database/db');
const AIEngine = require('../services/aiEngine');
const { v4: uuidv4 } = require('uuid');

module.exports = (io) => {
    // 1. Ingest Emergency / Crash Event (from Android App, CCTV, or Citizen SOS)
    router.post(['/detect', '/emergencies'], async (req, res) => {
        try {
            const raw = req.body;
            const incidentId = raw.id || raw._id || `RNQ-${Math.floor(1000 + Math.random() * 9000)}`;
            
            const latitude = parseFloat(raw.latitude) || (18.5204 + (Math.random() - 0.5) * 0.04);
            const longitude = parseFloat(raw.longitude) || (73.8567 + (Math.random() - 0.5) * 0.04);

            const sources = raw.sources && raw.sources.length > 0 
                ? raw.sources 
                : (raw.detectionSources && raw.detectionSources.length > 0 
                    ? raw.detectionSources.map(s => ({ type: s.source || s.type, confidence: (s.confidence > 1 ? s.confidence / 100 : s.confidence) || 0.88 }))
                    : [{ type: raw.sourceType || raw.source || 'smartphone', confidence: (parseFloat(raw.confidenceScore) > 1 ? parseFloat(raw.confidenceScore) / 100 : parseFloat(raw.confidence)) || 0.88 }]);

            const confidence = AIEngine.computeConfidence(sources);
            const severity = raw.severity !== null && raw.severity !== undefined ? raw.severity : AIEngine.estimateSeverity(raw);

            const ambulances = await store.getAmbulances();
            const hospitals = await store.getHospitals();

            const newIncident = {
                _id: incidentId,
                id: incidentId,
                displayId: incidentId,
                title: raw.title || raw.incidentType || (raw.source === 'smartphone' || raw.sourceType === 'smartphone' ? 'Road collision (no CCTV coverage)' : 'Vehicle Collision Detected'),
                incidentType: raw.incidentType || raw.title || 'Road collision (no CCTV coverage)',
                severity: severity,
                confidence: confidence,
                confidenceScore: Math.round(confidence * 100),
                latitude: latitude,
                longitude: longitude,
                sources: sources,
                detectionSources: sources.map(s => ({ source: s.type || s.source, confidence: Math.round((s.confidence <= 1 ? s.confidence * 100 : s.confidence)) })),
                source: sources[0]?.type || 'smartphone',
                state: raw.status || 'VERIFIED',
                status: raw.status || 'verified',
                patients: raw.patients || 1,
                isDemo: raw.isDemo !== undefined ? !!raw.isDemo : true,
                timeline: [
                    { state: 'DETECTED', time: new Date().toLocaleTimeString(), text: 'Multi-Sensor Impact Telemetry Ingested' },
                    { state: 'VERIFIED', time: new Date().toLocaleTimeString(), text: `AI Verification Confirmed (${Math.round(confidence * 100)}% confidence, ${severity}/100 severity)` }
                ],
                ambulanceId: null,
                assignedAmbulance: null,
                ambulanceReason: '',
                hospitalId: null,
                assignedHospital: null,
                hospitalAlerted: false,
                hospitalReason: '',
                timestamp: new Date().toISOString(),
                sensorData: {
                    gForce: raw.gForce || null,
                    speedKmh: raw.speedKmh || null,
                    speedDeltaKmh: raw.speedDeltaKmh || null,
                    rollover: !!raw.rollover,
                    deviceModel: raw.deviceModel || 'Android Device',
                    userMedicalInfo: raw.userMedicalInfo || null
                }
            };

            // Dynamic Resource Optimization
            const ambResult = AIEngine.selectBestAmbulance(newIncident, ambulances);
            if (ambResult.ambulance) {
                newIncident.ambulanceId = ambResult.ambulance.id;
                newIncident.assignedAmbulance = ambResult.ambulance.id;
                newIncident.ambulanceReason = ambResult.reason;
                newIncident.timeline.push({
                    state: 'AMBULANCE_ASSIGNED',
                    time: new Date().toLocaleTimeString(),
                    text: ambResult.reason
                });
            }

            const hospResult = AIEngine.selectBestHospital(newIncident, hospitals);
            if (hospResult.hospital) {
                newIncident.hospitalId = hospResult.hospital.id;
                newIncident.assignedHospital = hospResult.hospital.name;
                newIncident.hospitalAlerted = true;
                newIncident.hospitalReason = hospResult.reason;
                newIncident.timeline.push({
                    state: 'HOSPITAL_SELECTED',
                    time: new Date().toLocaleTimeString(),
                    text: hospResult.reason
                });
                newIncident.timeline.push({
                    state: 'HOSPITAL_PRE_ALERTED',
                    time: new Date().toLocaleTimeString(),
                    text: `Trauma Pre-Alert Transmitted to ${hospResult.hospital.name}`
                });
            }

            await store.saveIncident(newIncident);

            // Broadcast dual real-time events to all connected dashboards and mobile apps
            if (io) {
                io.emit('incident:new', newIncident);
                io.emit('newEmergency', newIncident);
                if (newIncident.assignedAmbulance) {
                    io.emit('ambulanceAssigned', { incidentId: newIncident.id, ambulanceId: newIncident.assignedAmbulance, eta: 4 });
                }
                if (newIncident.assignedHospital) {
                    io.emit('hospitalSelected', { incidentId: newIncident.id, hospitalId: newIncident.hospitalId, hospitalName: newIncident.assignedHospital });
                    io.emit('hospitalAlerted', { incidentId: newIncident.id });
                }
            }

            return res.status(201).json(newIncident);

        } catch (error) {
            console.error('[Incident Detect Error]:', error);
            return res.status(500).json({ success: false, error: error.message });
        }
    });

    // 2. Get All Incidents (supports direct JSON array for /api/emergencies)
    router.get(['/', '/emergencies'], async (req, res) => {
        try {
            const incidents = await store.getAllIncidents();
            // If requested via /emergencies, return direct array
            if (req.baseUrl.includes('emergencies') || req.path.includes('emergencies')) {
                return res.json(incidents);
            }
            return res.json({ success: true, count: incidents.length, incidents });
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    });

    // 3. Patch Emergency (/api/emergencies/:id)
    router.patch(['/:id', '/emergencies/:id'], async (req, res) => {
        try {
            const { id } = req.params;
            const inc = await store.getIncident(id);
            if (!inc) return res.status(404).json({ success: false, message: 'Incident not found' });

            const updated = Object.assign(inc, req.body);
            await store.updateIncident(id, updated);

            if (io) {
                io.emit('incident:update', updated);
                io.emit('incidentUpdated', updated);
                if (req.body.status) {
                    io.emit('incidentStatusChanged', { incidentId: id, status: req.body.status });
                }
            }

            return res.json(updated);
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    });

    // 4. Delete Demo Emergencies
    router.delete('/emergencies/demo', async (req, res) => {
        try {
            const all = await store.getAllIncidents();
            for (const inc of all) {
                if (inc.isDemo) {
                    await store.deleteIncident(inc.id || inc._id);
                    if (io) io.emit('incidentResolved', { incidentId: inc.id || inc._id });
                }
            }
            return res.json({ success: true, message: 'Demo incidents cleared' });
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    });

    // 5. Get Single Incident
    router.get('/:id', async (req, res) => {
        try {
            const inc = await store.getIncident(req.params.id);
            if (!inc) return res.status(404).json({ success: false, message: 'Incident not found' });
            return res.json(inc);
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    });

    // 6. Dispatch Ambulance
    router.post('/:id/dispatch', async (req, res) => {
        try {
            const { id } = req.params;
            const inc = await store.getIncident(id);
            if (!inc) return res.status(404).json({ success: false, message: 'Incident not found' });

            const ambulanceId = req.body.ambulanceId || inc.ambulanceId || inc.assignedAmbulance;
            if (!ambulanceId) {
                return res.status(400).json({ success: false, message: 'No ambulance assigned for dispatch' });
            }

            const amb = await store.getAmbulance(ambulanceId);
            if (amb) {
                await store.updateAmbulance(ambulanceId, { status: 'EN_ROUTE' });
            }

            inc.state = 'EN_ROUTE';
            inc.status = 'ambulance_en_route';
            inc.timeline.push({
                state: 'DISPATCHING',
                time: new Date().toLocaleTimeString(),
                text: 'Operator Dispatch Confirmation Issued'
            });
            inc.timeline.push({
                state: 'EN_ROUTE',
                time: new Date().toLocaleTimeString(),
                text: `Unit ${amb ? amb.code : ambulanceId} En Route with Priority Siren`
            });

            const updated = await store.updateIncident(id, inc);

            if (io) {
                io.emit('incident:update', updated);
                io.emit('incidentUpdated', updated);
                io.emit('incidentStatusChanged', { incidentId: id, status: 'ambulance_en_route' });
                io.emit('fleet:update', { ambulanceId, status: 'EN_ROUTE' });
            }

            return res.json({ success: true, message: 'Ambulance dispatched', incident: updated });
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    });

    // 7. Failover Ambulance
    router.post('/:id/failover', async (req, res) => {
        try {
            const { id } = req.params;
            const inc = await store.getIncident(id);
            if (!inc) return res.status(404).json({ success: false, message: 'Incident not found' });

            const oldAmbId = inc.ambulanceId || inc.assignedAmbulance;
            if (oldAmbId) {
                await store.updateAmbulance(oldAmbId, { status: 'UNAVAILABLE' });
            }

            const ambulances = await store.getAmbulances();
            const ambResult = AIEngine.selectBestAmbulance(inc, ambulances);

            if (ambResult.ambulance) {
                inc.ambulanceId = ambResult.ambulance.id;
                inc.assignedAmbulance = ambResult.ambulance.id;
                inc.ambulanceReason = `FAILOVER: ${ambResult.reason}`;
                inc.timeline.push({
                    state: 'AMBULANCE_ASSIGNED',
                    time: new Date().toLocaleTimeString(),
                    text: `Failover re-assigned to ${ambResult.ambulance.code}`
                });
            } else {
                inc.ambulanceId = null;
                inc.assignedAmbulance = null;
                inc.ambulanceReason = 'FAILOVER FAILED: No available units';
            }

            const updated = await store.updateIncident(id, inc);

            if (io) {
                io.emit('incident:update', updated);
                io.emit('incidentUpdated', updated);
                if (inc.assignedAmbulance) {
                    io.emit('ambulanceAssigned', { incidentId: id, ambulanceId: inc.assignedAmbulance, eta: 5 });
                }
                io.emit('fleet:reload', { ambulances: await store.getAmbulances() });
            }

            return res.json({ success: true, message: 'Failover processed', incident: updated });
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    });

    // 8. Resolve Incident
    router.post('/:id/resolve', async (req, res) => {
        try {
            const { id } = req.params;
            const inc = await store.getIncident(id);
            if (!inc) return res.status(404).json({ success: false, message: 'Incident not found' });

            const ambId = inc.ambulanceId || inc.assignedAmbulance;
            if (ambId) {
                await store.updateAmbulance(ambId, { status: 'AVAILABLE' });
            }

            inc.state = 'RESOLVED';
            inc.status = 'resolved';
            inc.timeline.push({
                state: 'RESOLVED',
                time: new Date().toLocaleTimeString(),
                text: 'Incident successfully resolved and closed'
            });

            await store.deleteIncident(id);

            if (io) {
                io.emit('incident:resolved', { id, incidentId: id });
                io.emit('incidentResolved', { id, incidentId: id });
                io.emit('fleet:reload', { ambulances: await store.getAmbulances() });
            }

            return res.json({ success: true, message: 'Incident resolved', id });
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
};
