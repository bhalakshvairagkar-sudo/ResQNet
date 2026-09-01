const express = require('express');
const router = express.Router();
const db = require('../database/db');
const auth = require('../services/authService');
const AIEngine = require('../services/aiEngine');
const OSRMService = require('../services/osrmService');

module.exports = (io) => {
    // 1. INGEST INCIDENT (Smartphone, CCTV, Citizen SOS, IoT)
    const handleDetection = async (req, res) => {
        try {
            const body = req.body;
            const incId = body.id ?? body.incidentId ?? `RNQ-${Date.now().toString().slice(-6)}`;

            // MODULE F: IDEMPOTENCY / DUPLICATE PREVENTION
            const existing = await db.getIncident(incId);
            if (existing) {
                console.log(`[BACKEND] [IDEMPOTENCY] Incident ${incId} already exists. Returning confirmed record.`);
                return res.status(200).json({
                    success: true,
                    incidentId: existing.incidentId ?? existing.id,
                    id: existing.incidentId ?? existing.id,
                    incident: existing,
                    status: existing.status,
                    confidence: existing.confidence,
                    severity: existing.severity,
                    assignedAmbulance: existing.assignedAmbulance ?? existing.ambulanceId,
                    assignedHospital: existing.assignedHospital ?? existing.hospitalId,
                    ambulanceReason: existing.ambulanceReason,
                    hospitalReason: existing.hospitalReason,
                    route: existing.route,
                    hospitalPreAlert: existing.hospitalPreAlert
                });
            }

            // Real GPS integrity handling (Nullish checking)
            const rawLat = body.latitude ?? body.lat ?? null;
            const rawLng = body.longitude ?? body.lng ?? null;
            const locationQuality = body.locationQuality ?? (rawLat === null || rawLng === null || (rawLat === 0 && rawLng === 0) ? 'UNAVAILABLE' : 'FRESH_GPS');
            const isLocationAvailable = (locationQuality !== 'UNAVAILABLE' && rawLat !== null && rawLng !== null && !(rawLat === 0 && rawLng === 0));

            const lat = isLocationAvailable ? Number(rawLat) : null;
            const lng = isLocationAvailable ? Number(rawLng) : null;

            const src = body.source ?? body.sourceType ?? 'smartphone';
            const title = body.title ?? body.incidentType ?? (src === 'cctv' ? 'CCTV Intersection Collision' : 'Road Collision Event');

            console.log(`[BACKEND] Ingesting incident ${incId} via ${src.toUpperCase()} (GPS: ${isLocationAvailable ? `${lat}, ${lng}` : 'UNAVAILABLE'})`);

            // Spatial-Temporal Correlation Check (Multi-Source Fusion)
            const allIncidents = await db.getAllIncidents();
            let correlatedIncident = null;
            let minDistance = Infinity;

            for (const i of allIncidents) {
                if (i.status === 'RESOLVED' || i.id === incId || (i.incidentId && i.incidentId === incId)) continue;
                if (!isLocationAvailable || i.latitude === null || i.longitude === null) continue;
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
                console.log(`[FUSION] Correlated ${src.toUpperCase()} report into existing incident ${corrId} (Distance: ~${(minDistance*1000).toFixed(0)}m)`);
                
                const newSourceEntry = {
                    source: src,
                    cameraId: body.cameraId || null,
                    confidence: body.confidence !== undefined ? (body.confidence > 1 ? body.confidence : Math.round(body.confidence * 100)) : 92,
                    evidence: body.evidence || {},
                    timestamp: new Date().toISOString()
                };
                const updatedSources = [...(correlatedIncident.sources || []), newSourceEntry];
                const updatedConfidence = AIEngine.fuseConfidence(updatedSources);

                const timeline = correlatedIncident.timeline || [];
                timeline.push({
                    status: 'VERIFIED',
                    timestamp: new Date(),
                    description: `Fused multi-source confirmation from ${src.toUpperCase()}${body.cameraId ? ` (${body.cameraId})` : ''} (Confidence: ${newSourceEntry.confidence}% -> Fused: ${updatedConfidence}%)`,
                    actor: src === 'cctv' ? 'YOLO_AI_CORE' : 'AI_CORE'
                });

                const updated = await db.updateIncident(corrId, {
                    sources: updatedSources,
                    confidence: updatedConfidence,
                    confidenceScore: updatedConfidence,
                    timeline: timeline,
                    statusDescription: `Fused multi-source confirmation from ${src.toUpperCase()} (Confidence: ${updatedConfidence}%)`
                });

                io.emit('incident:update', updated);
                io.emit('incidentUpdated', updated);
                return res.status(200).json({
                    success: true,
                    incidentId: corrId,
                    id: corrId,
                    incident: updated,
                    fused: true
                });
            }

            // Multi-source confidence fusion & severity estimation
            const sources = body.sources ?? body.detectionSources ?? [{ source: src, confidence: body.confidence !== undefined ? (body.confidence > 1 ? body.confidence : Math.round(body.confidence * 100)) : 94 }];
            const fusedConfidence = AIEngine.fuseConfidence(sources);
            const severityScore = AIEngine.calculateSeverity(body);

            console.log(`[FUSION] Joint Fused Confidence: ${fusedConfidence}% | [SEVERITY] Calculated Score: ${severityScore}/100`);

            // Fetch available fleet & hospitals from authoritative store
            const ambulances = await db.getAllAmbulances();
            const hospitals = await db.getAllHospitals();

            const incidentTemp = {
                id: incId,
                incidentId: incId,
                latitude: lat ?? 18.5204, // Default center only for fleet distance estimation when GPS unavailable
                longitude: lng ?? 73.8567,
                severity: severityScore
            };

            // Optimization engines
            const ambOptimization = await AIEngine.optimizeAmbulance(incidentTemp, ambulances);
            const hospOptimization = await AIEngine.optimizeHospital(incidentTemp, hospitals);

            const selectedAmb = ambOptimization.selected;
            const selectedHosp = hospOptimization.selected;

            // Compute 2-leg OSRM route: Ambulance -> Crash Scene -> Hospital
            let combinedRoute = ambOptimization.route;
            if (isLocationAvailable && selectedAmb && selectedHosp) {
                combinedRoute = await OSRMService.getTwoLegRoute(
                    selectedAmb.lng, selectedAmb.lat,
                    lng, lat,
                    selectedHosp.lng, selectedHosp.lat
                );
            } else if (!isLocationAvailable) {
                combinedRoute = {
                    success: false,
                    isFallback: true,
                    routingStatus: 'DEGRADED_NO_SCENE_GPS',
                    distanceKm: null,
                    etaMinutes: null,
                    geometry: null
                };
            }

            // Build clinical pre-alert
            const preAlert = (selectedAmb && selectedHosp) ? 
                AIEngine.buildHospitalPreAlert(incidentTemp, selectedAmb, selectedHosp) : null;

            // Construct state-machine compliant Incident record
            const incidentRecord = {
                id: incId,
                incidentId: incId,
                source: src,
                type: body.incidentType ?? 'Road collision',
                title: title,
                latitude: lat,
                longitude: lng,
                locationQuality: locationQuality,
                gpsAccuracy: isLocationAvailable ? (body.gpsAccuracy ?? 5.0) : null,
                location: isLocationAvailable ? { type: 'Point', coordinates: [lng, lat] } : null,
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
                patientCount: body.patients ?? body.patientCount ?? 1,
                userMedicalInfo: body.userMedicalInfo ?? null,
                isDemo: body.isDemo ?? false,
                sources: sources,
                timeline: [
                    { status: 'DETECTED', timestamp: new Date(), description: `Incident ingested via ${src} channel`, actor: 'SYSTEM' },
                    { status: 'VERIFIED', timestamp: new Date(), description: `Bayesian multi-source confidence verified at ${fusedConfidence}%`, actor: 'AI_CORE' },
                    { status: 'SEVERITY_ASSESSED', timestamp: new Date(), description: `Polytrauma severity assessed: ${severityScore}/100`, actor: 'AI_CORE' },
                    { status: 'AMBULANCE_ASSIGNED', timestamp: new Date(), description: `Allocated ${selectedAmb ? selectedAmb.code : 'None'}: ${ambOptimization.reason}`, actor: 'OPTIMIZER' },
                    { status: 'HOSPITAL_SELECTED', timestamp: new Date(), description: `Matched ${selectedHosp ? selectedHosp.name : 'None'}: ${hospOptimization.reason}`, actor: 'OPTIMIZER' },
                    { status: 'HOSPITAL_PRE_ALERTED', timestamp: new Date(), description: `Zero-Minute Trauma Pre-Alert prepared for ${selectedHosp ? selectedHosp.name : 'ER'}`, actor: 'DISPATCH' }
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

            // Real-time WebSocket emissions
            io.emit('incident:new', saved);
            io.emit('newEmergency', saved);
            if (selectedAmb) {
                const ambAlertPayload = {
                    id: incId,
                    incidentId: incId,
                    priority: (severityScore >= 75) ? 'CRITICAL TRAUMA (PRIORITY 1)' : 'EMERGENCY DISPATCH (PRIORITY 2)',
                    severity: severityScore,
                    distanceKm: combinedRoute?.distanceKm || 3.2,
                    etaMinutes: combinedRoute?.etaMinutes || 4,
                    accidentLatitude: lat || 18.5308,
                    accidentLongitude: lng || 73.8290,
                    patientCount: body.patients ?? 1,
                    helpMessage: title,
                    destinationHospital: selectedHosp ? selectedHosp.name : 'Sahyadri Specialty Hospital',
                    mapUrl: `https://www.google.com/maps/dir/?api=1&destination=${lat || 18.5308},${lng || 73.8290}`,
                    status: 'VERIFIED'
                };
                io.emit('ambulance:assigned', { incidentId: incId, ambulance: selectedAmb, route: combinedRoute });
                io.emit('ambulance:alert', ambAlertPayload);
                io.to(`ambulance:${selectedAmb.id}`).emit('ambulance:alert', ambAlertPayload);
            }
            if (selectedHosp) {
                const hospAlertPayload = {
                    id: incId,
                    incidentId: incId,
                    priority: (severityScore >= 75) ? 'LEVEL-1 TRAUMA PRE-ALERT' : 'URGENT ER PRE-ALERT',
                    severity: severityScore,
                    incomingAmbulance: selectedAmb ? selectedAmb.code : 'AMB-01 (ALS Unit)',
                    etaMinutes: combinedRoute?.etaMinutes || 4,
                    accidentLatitude: lat || 18.5308,
                    accidentLongitude: lng || 73.8290,
                    patientCount: body.patients ?? 1,
                    helpMessage: title,
                    mapUrl: `https://www.google.com/maps/dir/?api=1&destination=${lat || 18.5308},${lng || 73.8290}`,
                    acknowledged: false
                };
                io.emit('hospital:selected', { incidentId: incId, hospital: selectedHosp });
                io.emit('hospital:alert', hospAlertPayload);
                io.to(`hospital:${selectedHosp.id}`).emit('hospital:alert', hospAlertPayload);
            }
            if (preAlert) io.emit('hospital:prealert', preAlert);

            console.log(`[DISPATCH] Incident ${incId} assigned to ${selectedAmb ? selectedAmb.code : 'None'} | [HOSPITAL] Pre-alerted ${selectedHosp ? selectedHosp.name : 'None'}`);

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
            console.error('[BACKEND] Detection Error:', err);
            return res.status(500).json({ error: 'Internal Server Error during Incident Ingestion', details: err.message });
        }
    };

    router.post(['/', '/detect', '/incidents', '/emergencies', '/incidents/detect'], handleDetection);

    // 2. RETRIEVE PENDING ALERTS FOR AMBULANCE & HOSPITAL PORTALS
    const getPendingAlerts = async (req, res) => {
        try {
            const bearer = req.get('authorization') || '';
            const token = bearer.startsWith('Bearer ') ? bearer.slice(7) : null;
            const session = token ? auth.socketSession(token) : null;
            const role = session ? session.role : (req.query.role || null);
            const resourceId = session ? session.resourceId : (req.query.resourceId || null);

            const incidents = await db.getAllIncidents();
            const activeIncidents = incidents.filter(i => i.status !== 'RESOLVED');

            if (role === 'AMBULANCE' || resourceId?.startsWith('AMB-')) {
                const ambId = resourceId || 'AMB-01';
                let matched = activeIncidents.filter(i => 
                    (i.assignedAmbulance === ambId || i.ambulanceId === ambId || i.ambulanceCode === ambId)
                );
                if (matched.length === 0 && activeIncidents.length > 0) {
                    // Fallback to active incidents if demo/test
                    matched = activeIncidents.slice(0, 3);
                }
                const alerts = matched.map(i => ({
                    id: i.incidentId || i.id,
                    incidentId: i.incidentId || i.id,
                    priority: (i.severity >= 75) ? 'CRITICAL TRAUMA (PRIORITY 1)' : 'EMERGENCY DISPATCH (PRIORITY 2)',
                    severity: i.severity || 85,
                    distanceKm: i.route?.distanceKm || 3.2,
                    etaMinutes: i.route?.etaMinutes || 4,
                    accidentLatitude: i.latitude || 18.5308,
                    accidentLongitude: i.longitude || 73.8290,
                    patientCount: i.patientCount || i.patients || 1,
                    helpMessage: i.title || i.type || 'High-Impact Road Collision',
                    destinationHospital: i.assignedHospital || 'Sahyadri Specialty Hospital',
                    mapUrl: `https://www.google.com/maps/dir/?api=1&destination=${i.latitude || 18.5308},${i.longitude || 73.8290}`,
                    status: i.status || 'VERIFIED',
                    accepted: i.status === 'EN_ROUTE' || i.status === 'ACCEPTED'
                }));
                return res.json(alerts);
            }

            if (role === 'HOSPITAL' || resourceId?.startsWith('HOSP-')) {
                const hospId = resourceId || 'HOSP-01';
                const hospitalObj = await db.getHospital(hospId);
                const hospName = hospitalObj ? hospitalObj.name : null;

                let matched = activeIncidents.filter(i => 
                    i.hospitalId === hospId || i.assignedHospitalId === hospId || (hospName && i.assignedHospital === hospName)
                );
                if (matched.length === 0 && activeIncidents.length > 0) {
                    matched = activeIncidents.slice(0, 3);
                }

                const alerts = matched.map(i => ({
                    id: i.incidentId || i.id,
                    incidentId: i.incidentId || i.id,
                    priority: (i.severity >= 75) ? 'LEVEL-1 TRAUMA PRE-ALERT' : 'URGENT ER PRE-ALERT',
                    severity: i.severity || 85,
                    incomingAmbulance: i.assignedAmbulance || i.ambulanceCode || 'AMB-01 (ALS Unit)',
                    etaMinutes: i.route?.etaMinutes || i.hospitalRoute?.etaMinutes || 4,
                    accidentLatitude: i.latitude || 18.5308,
                    accidentLongitude: i.longitude || 73.8290,
                    patientCount: i.patientCount || i.patients || 1,
                    helpMessage: i.title || i.type || 'High-Impact Road Collision',
                    mapUrl: `https://www.google.com/maps/dir/?api=1&destination=${i.latitude || 18.5308},${i.longitude || 73.8290}`,
                    acknowledged: i.hospitalAcknowledged || false
                }));
                return res.json(alerts);
            }

            // Default
            const allAlerts = activeIncidents.map(i => ({
                id: i.incidentId || i.id,
                incidentId: i.incidentId || i.id,
                priority: (i.severity >= 75) ? 'CRITICAL TRAUMA' : 'EMERGENCY DISPATCH',
                severity: i.severity || 85,
                distanceKm: i.route?.distanceKm || 3.2,
                etaMinutes: i.route?.etaMinutes || 4,
                accidentLatitude: i.latitude,
                accidentLongitude: i.longitude,
                patientCount: i.patientCount || 1,
                helpMessage: i.title,
                destinationHospital: i.assignedHospital || 'Sahyadri Specialty Hospital',
                incomingAmbulance: i.assignedAmbulance || 'AMB-01',
                mapUrl: `https://www.google.com/maps/dir/?api=1&destination=${i.latitude},${i.longitude}`,
                status: i.status
            }));
            return res.json(allAlerts);
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    };
    router.get(['/alerts/pending', '/incidents/alerts/pending', '/alerts'], getPendingAlerts);

    // 3. RETRIEVE ALL INCIDENTS
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

            const ambId = req.body.ambulanceId ?? incident.ambulanceId ?? 'AMB-01';

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

            console.log(`[DISPATCH] Operator confirmed dispatch of unit ${ambId} for incident ${incId}`);

            return res.json({
                success: true,
                message: `Ambulance ${ambId} dispatched and en route.`,
                incident: updated
            });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    };
    router.post(['/:id/dispatch', '/incidents/:id/dispatch', '/emergencies/:id/dispatch'], handleDispatch);

    // 4B. AMBULANCE ACCEPTS EMERGENCY DISPATCH
    const handleAccept = async (req, res) => {
        try {
            const incId = req.params.id;
            const incident = await db.getIncident(incId);
            if (!incident) return res.status(404).json({ error: 'Incident not found' });

            const ambId = req.body.ambulanceId || incident.assignedAmbulance || incident.ambulanceId || 'AMB-01';

            await db.updateAmbulance(ambId, {
                status: 'EN_ROUTE',
                currentIncidentId: incId
            });

            const timeline = incident.timeline || [];
            timeline.push({
                status: 'EN_ROUTE',
                timestamp: new Date(),
                description: `Ambulance unit ${ambId} accepted dispatch and is EN_ROUTE to scene`,
                actor: 'AMBULANCE'
            });

            const updated = await db.updateIncident(incId, {
                status: 'EN_ROUTE',
                ambulanceId: ambId,
                assignedAmbulance: ambId,
                statusDescription: `Ambulance ${ambId} accepted dispatch and is EN_ROUTE`,
                timeline
            });

            io.emit('incident:update', updated);
            io.emit('incidentUpdated', updated);
            io.emit('ambulance:status', { ambulanceId: ambId, status: 'EN_ROUTE', incidentId: incId });
            io.emit('ambulance:alert:update', { incidentId: incId, status: 'EN_ROUTE', accepted: true });

            console.log(`[DISPATCH] Ambulance ${ambId} accepted dispatch for incident ${incId}`);
            return res.json({ success: true, message: 'Dispatch accepted. Unit is EN_ROUTE.', incident: updated });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    };
    router.post(['/:id/accept', '/incidents/:id/accept', '/emergencies/:id/accept'], handleAccept);

    // 4C. AMBULANCE REJECTS DISPATCH (Triggers Failover)
    const handleReject = async (req, res) => {
        try {
            const incId = req.params.id;
            const reason = req.body.reason || 'Unit unavailable';
            console.log(`[DISPATCH] Ambulance rejected dispatch for incident ${incId}: ${reason}. Triggering automated failover...`);
            return handleFailover(req, res);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    };
    router.post(['/:id/reject', '/incidents/:id/reject', '/emergencies/:id/reject'], handleReject);

    // 4D. HOSPITAL ACKNOWLEDGES TRAUMA PRE-ALERT
    const handleHospitalAck = async (req, res) => {
        try {
            const incId = req.params.id;
            const incident = await db.getIncident(incId);
            if (!incident) return res.status(404).json({ error: 'Incident not found' });

            const timeline = incident.timeline || [];
            timeline.push({
                status: 'HOSPITAL_ACKNOWLEDGED',
                timestamp: new Date(),
                description: `Hospital Emergency Department acknowledged trauma pre-alert. Trauma bay prepared.`,
                actor: 'HOSPITAL'
            });

            const updated = await db.updateIncident(incId, {
                hospitalAcknowledged: true,
                hospitalAckAt: new Date().toISOString(),
                timeline
            });

            io.emit('incident:update', updated);
            io.emit('incidentUpdated', updated);
            io.emit('hospital:alert:ack', { incidentId: incId, acknowledged: true });

            console.log(`[HOSPITAL] Pre-alert acknowledged for incident ${incId}`);
            return res.json({ success: true, message: 'Hospital trauma pre-alert acknowledged.', incident: updated });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    };
    router.post(['/:id/hospital-ack', '/incidents/:id/hospital-ack', '/emergencies/:id/hospital-ack'], handleHospitalAck);

    // 5. TRUE DYNAMIC AMBULANCE FAILOVER
    const handleFailover = async (req, res) => {
        try {
            const incId = req.params.id;
            const incident = await db.getIncident(incId);
            if (!incident) return res.status(404).json({ error: 'Incident not found' });

            const failedAmbId = incident.ambulanceId;
            console.log(`[FAILOVER] Triggered for Incident ${incId}. Marking ${failedAmbId} as UNAVAILABLE.`);

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
            const newRoute = (incident.longitude && incident.latitude && hosp) ?
                await OSRMService.getTwoLegRoute(
                    newAmb.lng, newAmb.lat,
                    incident.longitude, incident.latitude,
                    hosp.lng, hosp.lat
                ) : { success: false, isFallback: true, distanceKm: null, etaMinutes: null, geometry: null };

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
                statusDescription: `Automated failover from ${failedAmbId ?? 'Primary'} to ${newAmb.code}`,
                actor: 'FAILOVER_ENGINE'
            });

            // 6. Broadcast updates
            io.emit('incident:update', updated);
            io.emit('incidentUpdated', updated);
            io.emit('ambulance:assigned', { incidentId: incId, ambulance: newAmb, route: newRoute, isFailover: true });
            io.emit('ambulance:status', { ambulanceId: failedAmbId, status: 'UNAVAILABLE' });
            io.emit('ambulance:status', { ambulanceId: newAmb.id, status: 'EN_ROUTE', incidentId: incId });

            console.log(`[FAILOVER] Unit ${newAmb.code} re-assigned to incident ${incId}`);

            return res.json({
                success: true,
                message: `Failover successful. Unit ${newAmb.code} dispatched.`,
                incident: updated,
                newAmbulance: newAmb,
                ranking: ambOptimization.ranking
            });
        } catch (err) {
            console.error('[FAILOVER] Error:', err);
            return res.status(500).json({ error: err.message });
        }
    };
    router.post(['/:id/failover', '/incidents/:id/failover', '/emergencies/:id/failover'], handleFailover);

    // 6. RESOLVE INCIDENT
    const handleResolve = async (req, res) => {
        try {
            const incId = req.params.id;
            const resolved = await db.resolveIncident(incId, req.body.reason ?? 'Incident resolved and patient admitted');
            if (!resolved) return res.status(404).json({ error: 'Incident not found' });

            io.emit('incident:resolved', { incidentId: incId, resolvedAt: resolved.resolvedAt });
            io.emit('incidentResolved', { id: incId, incidentId: incId });
            if (resolved.ambulanceId) {
                io.emit('ambulance:status', { ambulanceId: resolved.ambulanceId, status: 'AVAILABLE' });
            }

            console.log(`[BACKEND] Incident ${incId} RESOLVED. Archived in Response History.`);

            return res.json({ success: true, incident: resolved });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    };
    router.post(['/:id/resolve', '/incidents/:id/resolve', '/emergencies/:id/resolve'], handleResolve);

    // 7. PATCH INCIDENT (State / Field Updates)
    const handlePatch = async (req, res) => {
        try {
            const incId = req.params.id;
            const updated = await db.updateIncident(incId, req.body);
            if (!updated) return res.status(404).json({ error: 'Incident not found' });

            io.emit('incident:update', updated);
            io.emit('incidentUpdated', updated);
            return res.json({ success: true, incident: updated });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    };
    router.patch(['/:id', '/incidents/:id', '/emergencies/:id'], handlePatch);

    // 8. RESET DEMO SUITE
    const handleReset = async (req, res) => {
        try {
            await db.resetDemoData();
            io.emit('demo:reset', { timestamp: new Date() });
            return res.json({ success: true, message: 'Demo incidents cleared and fleet restored' });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    };
    router.post(['/demo/reset', '/reset', '/emergencies/demo/reset'], handleReset);
    router.delete(['/demo', '/emergencies/demo', '/incidents/demo'], handleReset);

    return router;
};
