const express = require('express');
const db = require('../database/db');
const AI = require('../services/aiEngine');
const OSRM = require('../services/osrmService');
const auth = require('../services/authService');
const crypto = require('crypto');
const inFlight = new Map();
const ACTIVE = new Set(['HOSPITAL_PRE_ALERTED', 'DISPATCHING', 'EN_ROUTE', 'ARRIVED']);
const response = incident => ({ success: true, id: incident.id, incidentId: incident.incidentId, status: incident.status, severity: incident.severity, confidence: incident.confidence, ambulance: incident.ambulanceId || null, hospital: incident.hospitalId || null, route: incident.route || null, preAlert: incident.hospitalPreAlert || null, timeline: incident.timeline || [], incident });
const transition = async (id, current, next, description, actor = 'SYSTEM', extra = {}) => {
    if (!current || (next === 'RESOLVED' ? !['ARRIVED', 'EN_ROUTE'].includes(current.status) : false)) throw Object.assign(new Error(`Invalid transition ${current?.status || 'NONE'} -> ${next}`), { status: 409 });
    return db.updateIncident(id, { ...extra, status: next, statusDescription: description, actor });
};

module.exports = io => {
    const router = express.Router();
    const mapUrl = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
    const emitCommand = (event, payload) => io.to('role:COMMAND_CENTER').emit(event, payload);
    const emitUserIncident = (incident, event = 'incident:updated') => { if (incident.userId) io.to(`user:${incident.userId}`).emit(event, incident); };
    // A field dispatch becomes active only after both operational parties have
    // confirmed: the assigned ambulance accepts and the assigned hospital is ready.
    const startDispatchWhenConfirmed = async incident => {
        if (!incident?.ambulanceAcceptedAt || !incident?.hospitalAcknowledgedAt || incident.status === 'EN_ROUTE') return null;
        await db.updateAmbulance(incident.ambulanceId, { status: 'EN_ROUTE', currentIncidentId: incident.id });
        const updated = await transition(incident.id, incident, 'EN_ROUTE', 'Automatic dispatch started after ambulance acceptance and hospital acknowledgment', 'DISPATCH_AUTOMATION', { dispatchedAt: new Date().toISOString() });
        emitCommand('incident:update', updated);
        emitCommand('incident:updated', updated);
        emitCommand('ambulance:status', { ambulanceId: incident.ambulanceId, status: 'EN_ROUTE', incidentId: incident.id });
        io.to(`ambulance:${incident.ambulanceId}`).emit('incident:updated', updated);
        io.to(`hospital:${incident.hospitalId}`).emit('incident:updated', updated);
        emitUserIncident(updated);
        return updated;
    };
    const dispatchTargetedEmergencyAlert = async (incident, ambulance, hospital) => {
        const priority = incident.severity >= 75 ? 'CRITICAL' : incident.severity >= 50 ? 'HIGH' : 'MEDIUM';
        // Persist a self-contained clinical/scene snapshot.  Field portals may
        // come online after the Socket.IO event, so they must not depend on a
        // second incident lookup to see the complete emergency details.
        const common = {
            incidentId: incident.id,
            priority,
            severity: incident.severity,
            confidence: incident.confidence,
            accidentType: incident.type,
            accidentTime: incident.createdAt,
            accidentLatitude: incident.latitude,
            accidentLongitude: incident.longitude,
            locationQuality: incident.locationQuality,
            gpsAccuracy: incident.gpsAccuracy,
            gForce: incident.peakGForce ?? incident.gForce,
            speedDeltaKmh: incident.speedDeltaKmh,
            rollover: incident.rollover,
            patientMedicalInfo: incident.userMedicalInfo || 'NOT PROVIDED',
            patientCount: incident.patientCount ?? 'NOT PROVIDED',
            assignedHospital: incident.assignedHospital || 'UNAVAILABLE',
            mapUrl: mapUrl(incident.latitude, incident.longitude),
            createdAt: new Date().toISOString()
        };
        const instruction = incident.helpMessage || (priority === 'CRITICAL' ? 'CRITICAL ROAD ACCIDENT. Immediate trauma response required. Proceed to the accident location.' : 'Road accident detected. Immediate medical assistance required. Proceed to the accident location and assess the victim.');
        const help = `${instruction}\n\nLIVE INCIDENT DETAILS\nTime: ${incident.createdAt}\nLocation: ${incident.latitude}, ${incident.longitude} (${incident.locationQuality || 'UNAVAILABLE'})\nSeverity: ${incident.severity}/100 | Confidence: ${incident.confidence}%\nImpact: ${incident.peakGForce ?? incident.gForce ?? 'UNAVAILABLE'}G | Delta-V: ${incident.speedDeltaKmh ?? 'UNAVAILABLE'} km/h | Rollover: ${incident.rollover ?? false}\nPatients: ${incident.patientCount ?? 'NOT PROVIDED'}\nMedical: ${incident.userMedicalInfo || 'NOT PROVIDED'}`;
        const records = [];
        if (ambulance) records.push(await db.saveAlert({ id: crypto.randomUUID(), ...common, recipientType: 'AMBULANCE', recipientId: ambulance.id, alertType: 'EMERGENCY_DISPATCH', helpMessage: help, distanceKm: incident.ambulanceRanking?.[0]?.distance ?? null, etaMinutes: incident.route?.etaMinutes ?? null, status: 'DELIVERED', deliveredAt: new Date().toISOString() }));
        if (hospital) records.push(await db.saveAlert({ id: crypto.randomUUID(), ...common, recipientType: 'HOSPITAL', recipientId: hospital.id, alertType: 'INCOMING_TRAUMA', helpMessage: `Prepare emergency trauma response for incoming patient(s). Ambulance dispatch is in progress.\n\n${help}`, incomingAmbulance: ambulance?.code || ambulance?.id || 'UNAVAILABLE', etaMinutes: incident.route?.etaMinutes ?? null, patientCount: incident.patientCount ?? 'NOT PROVIDED', status: 'DELIVERED', deliveredAt: new Date().toISOString() }));
        for (const alert of records) io.to(`${alert.recipientType === 'AMBULANCE' ? 'ambulance' : 'hospital'}:${alert.recipientId}`).emit(`${alert.recipientType.toLowerCase()}:alert`, alert);
        const updated = await db.updateIncident(incident.id, { mapUrl: common.mapUrl, helpMessage: incident.helpMessage || help, ambulanceAlertId: records.find(a => a.recipientType === 'AMBULANCE')?.id || null, hospitalAlertId: records.find(a => a.recipientType === 'HOSPITAL')?.id || null, alertDeliveryStatus: records.map(a => `${a.recipientType}:DELIVERED`) });
        emitCommand('incident:new', updated); emitCommand('incident:updated', updated); emitUserIncident(updated, 'incident:new');
        return updated;
    };
    const ingest = async body => {
        const incidentId = String(body.id ?? body.incidentId ?? `RNQ-${Date.now()}`);
        const existing = await db.getIncident(incidentId); if (existing) return { incident: existing, created: false };
        const rawLat = body.latitude ?? body.lat, rawLng = body.longitude ?? body.lng;
        const locationAvailable = Number.isFinite(Number(rawLat)) && Number.isFinite(Number(rawLng)) && !(Number(rawLat) === 0 && Number(rawLng) === 0) && body.locationQuality !== 'UNAVAILABLE';
        const latitude = locationAvailable ? Number(rawLat) : null, longitude = locationAvailable ? Number(rawLng) : null;
        const source = body.source ?? body.sourceType ?? 'smartphone';
        const incidents = await db.getAllIncidents();
        const correlated = locationAvailable && incidents.find(i => i.status !== 'RESOLVED' && i.latitude != null && OSRM.calculateHaversineDistance(latitude, longitude, i.latitude, i.longitude) <= .25 && Date.now() - new Date(i.createdAt).getTime() <= 60000);
        if (correlated) {
            const sources = [...(correlated.sources || []), { source, deviceId: body.deviceId || body.cameraId, confidence: body.confidence ?? .85, timestamp: new Date().toISOString() }];
            const incident = await db.updateIncident(correlated.id, { sources, confidence: AI.fuseConfidence(sources), correlationReason: `Temporal/spatial correlation with ${source} within 250m and 60s` });
            io.emit('incident:update', incident); return { incident, created: false, fused: true };
        }
        const sources = body.sources ?? [{ source, deviceId: body.deviceId || body.cameraId, confidence: body.confidence ?? .85, timestamp: new Date().toISOString() }];
        const severity = AI.calculateSeverity(body), confidence = AI.fuseConfidence(sources);
        const base = { id: incidentId, incidentId, userId: body.userId || null, source, type: body.incidentType ?? 'Road collision', title: body.title ?? 'Emergency Incident', latitude, longitude, location: locationAvailable ? { type: 'Point', coordinates: [longitude, latitude] } : null, locationQuality: locationAvailable ? (body.locationQuality || 'FRESH_GPS') : 'UNAVAILABLE', gpsAccuracy: locationAvailable ? (body.gpsAccuracy ?? null) : null, confidence, confidenceScore: confidence, severity, patientCount: body.patients ?? body.patientCount ?? 1, userMedicalInfo: body.userMedicalInfo ?? null, gForce: body.gForce ?? null, peakGForce: body.peakGForce ?? body.gForce ?? null, speedDeltaKmh: body.speedDeltaKmh ?? null, rollover: body.rollover ?? null, sources, isDemo: body.isDemo === true, helpMessage: body.helpMessage || null, createdAt: new Date().toISOString(), status: 'SEVERITY_ASSESSED', timeline: [{ status: 'DETECTED', timestamp: new Date(), description: `Detection received from ${source}`, actor: 'SYSTEM' }, { status: 'VERIFIED', timestamp: new Date(), description: `Bayesian-style evidence fusion: ${confidence}%`, actor: 'FUSION_ENGINE' }, { status: 'SEVERITY_ASSESSED', timestamp: new Date(), description: `Severity assessed: ${severity}/100`, actor: 'AI_CORE' }] };
        const [ambulances, hospitals] = await Promise.all([db.getAllAmbulances(), db.getAllHospitals()]);
        const [ambResult, hospResult] = await Promise.all([AI.optimizeAmbulance(base, ambulances), AI.optimizeHospital(base, hospitals)]);
        const ambulance = ambResult.selected, hospital = hospResult.selected;
        const route = locationAvailable && ambulance && hospital ? await OSRM.getTwoLegRoute(ambulance.lng, ambulance.lat, longitude, latitude, hospital.lng, hospital.lat) : { success: false, isFallback: true, routingStatus: 'DEGRADED_NO_SCENE_GPS', distanceKm: null, etaMinutes: null, geometry: null };
        const complete = { ...base, ambulanceId: ambulance?.id || null, ambulanceCode: ambulance?.code || null, assignedAmbulance: ambulance?.id || null, ambulanceReason: ambResult.reason, ambulanceRanking: ambResult.ranking, hospitalId: hospital?.id || null, assignedHospital: hospital?.name || null, hospitalReason: hospResult.reason, hospitalRanking: hospResult.ranking, route, hospitalRoute: hospResult.route || null };
        if (ambulance) complete.timeline.push({ status: 'AMBULANCE_ASSIGNED', timestamp: new Date(), description: ambResult.reason, actor: 'OPTIMIZER' });
        if (route.success) complete.timeline.push({ status: 'ROUTE_CALCULATED', timestamp: new Date(), description: `Route ${route.routingStatus}`, actor: 'ROUTING' });
        if (hospital) complete.timeline.push({ status: 'HOSPITAL_SELECTED', timestamp: new Date(), description: hospResult.reason, actor: 'OPTIMIZER' });
        complete.hospitalPreAlert = ambulance && hospital ? AI.buildHospitalPreAlert({ ...complete, route }, ambulance, hospital) : null;
        complete.status = complete.hospitalPreAlert ? 'HOSPITAL_PRE_ALERTED' : 'SEVERITY_ASSESSED';
        if (complete.hospitalPreAlert) complete.timeline.push({ status: 'HOSPITAL_PRE_ALERTED', timestamp: new Date(), description: `Pre-alert sent to ${hospital.name}`, actor: 'DISPATCH' });
        const incident = await db.saveIncident(complete);
        if (ambulance) await db.updateAmbulance(ambulance.id, { status: 'BUSY', currentIncidentId: incidentId });
        const dispatched = await dispatchTargetedEmergencyAlert(incident, ambulance, hospital);
        return { incident: dispatched, created: true };
    };
    const handleDetection = async (req, res) => {
        const id = String(req.body.id ?? req.body.incidentId ?? `RNQ-${Date.now()}`);
        const existing = await db.getIncident(id); if (existing) return res.status(200).json(response(existing));
        let task = inFlight.get(id);
        if (!task) { task = ingest({ ...req.body, id, incidentId: id }); inFlight.set(id, task); task.finally(() => inFlight.delete(id)); }
        try { const result = await task; return res.status(result.created ? 201 : 200).json({ ...response(result.incident), fused: result.fused || false }); } catch (error) { return res.status(error.status || 500).json({ error: 'Incident ingestion failed' }); }
    };
    router.post(['/', '/detect', '/incidents', '/emergencies', '/incidents/detect'], handleDetection);
    router.post('/test/incidents', auth.authenticate, auth.allow('COMMAND_CENTER'), async (req, res) => {
        const lat = Number(req.body.latitude), lng = Number(req.body.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return res.status(400).json({ error: 'Valid latitude and longitude are required' });
        try { const result = await ingest({ ...req.body, latitude: lat, longitude: lng, isDemo: true, source: 'test' }); res.status(201).json(response(result.incident)); } catch (e) { res.status(500).json({ error: e.message }); }
    });
    router.get('/alerts/pending', auth.authenticate, async (req, res) => res.json(await db.getAlertsFor(req.user.role, req.user.resourceId)));
    router.get('/mine', auth.authenticate, auth.allow('USER'), async (req, res) => res.json((await db.getAllIncidents()).filter(i => i.userId === req.user.resourceId)));
    router.post('/:id/accept', auth.authenticate, auth.allow('AMBULANCE'), async (req, res) => {
      const incident = await db.getIncident(req.params.id); if (!incident || incident.ambulanceId !== req.user.resourceId) return res.status(403).json({ error: 'Not assigned to this incident' });
      await db.updateAmbulance(req.user.resourceId, { status: 'BUSY', currentIncidentId: incident.id });
      const accepted = await transition(incident.id, incident, 'AMBULANCE_ACCEPTED', 'Ambulance accepted; awaiting hospital acknowledgment before dispatch', req.user.username, { ambulanceAcceptedAt: new Date().toISOString() });
      await db.updateAlert(incident.ambulanceAlertId, { status: 'ACKNOWLEDGED', acknowledgedAt: new Date().toISOString() });
      const updated = await startDispatchWhenConfirmed(accepted) || accepted;
      emitCommand('incident:updated', updated); emitCommand('ambulance:status', { ambulanceId: req.user.resourceId, status: updated.status === 'EN_ROUTE' ? 'EN_ROUTE' : 'BUSY', incidentId: incident.id }); emitUserIncident(updated); io.to(`hospital:${incident.hospitalId}`).emit('incident:updated', updated); res.json(response(updated));
    });
    router.post('/:id/reject', auth.authenticate, auth.allow('AMBULANCE'), async (req, res) => {
      if (!req.body.reason) return res.status(400).json({ error: 'Rejection reason is required' }); const incident = await db.getIncident(req.params.id); if (!incident || incident.ambulanceId !== req.user.resourceId) return res.status(403).json({ error: 'Not assigned to this incident' }); await db.updateAmbulance(req.user.resourceId, { status: 'AVAILABLE', currentIncidentId: null }); await db.updateAlert(incident.ambulanceAlertId, { status: 'REJECTED', acknowledgedAt: new Date().toISOString() }); const optimized = await AI.optimizeAmbulance(incident, await db.getAllAmbulances()); const updated = await db.updateIncident(incident.id, { ambulanceId: optimized.selected?.id || null, ambulanceCode: optimized.selected?.code || null, status: optimized.selected ? 'DISPATCHING' : 'WAITING_FOR_AMBULANCE', statusDescription: `Ambulance rejected: ${req.body.reason}`, actor: req.user.username }); if (optimized.selected) await dispatchTargetedEmergencyAlert(updated, optimized.selected, null); emitCommand('incident:updated', updated); res.json(response(updated));
    });
    router.post('/:id/hospital-ack', auth.authenticate, auth.allow('HOSPITAL'), async (req, res) => { const incident = await db.getIncident(req.params.id); if (!incident || incident.hospitalId !== req.user.resourceId) return res.status(403).json({ error: 'Not assigned to this incident' }); await db.updateAlert(incident.hospitalAlertId, { status: 'ACKNOWLEDGED', acknowledgedAt: new Date().toISOString() }); const acknowledged = await db.updateIncident(incident.id, { hospitalAcknowledgedAt: new Date().toISOString(), statusDescription: 'Hospital acknowledged alert', actor: req.user.username }); const updated = await startDispatchWhenConfirmed(acknowledged) || acknowledged; emitCommand('hospital:acknowledged', { incidentId: incident.id, hospitalId: req.user.resourceId }); emitCommand('incident:updated', updated); emitUserIncident(updated); io.to(`ambulance:${incident.ambulanceId}`).emit('incident:updated', updated); res.json(response(updated)); });
    router.get(['/', '/incidents', '/emergencies'], async (_, res) => res.json(await db.getAllIncidents()));
    router.get(['/:id', '/incidents/:id', '/emergencies/:id'], async (req, res) => { const i = await db.getIncident(req.params.id); return i ? res.json(i) : res.status(404).json({ error: 'Incident not found' }); });
    const dispatch = async (req, res) => { try { const i = await db.getIncident(req.params.id); if (!i) return res.status(404).json({ error: 'Incident not found' }); if (!['HOSPITAL_PRE_ALERTED', 'SEVERITY_ASSESSED'].includes(i.status)) return res.status(409).json({ error: 'Incident is not dispatchable' }); const id = req.body.ambulanceId || i.ambulanceId; const a = await db.getAmbulance(id); const override = req.body.override === true; if (!a) return res.status(404).json({ error: 'Ambulance not found' }); if (!override && (a.currentIncidentId && a.currentIncidentId !== i.id || !['AVAILABLE', 'BUSY'].includes(a.status) || (i.severity >= 75 && (a.type !== 'ALS' || !a.traumaReady)))) return res.status(409).json({ error: 'Ambulance cannot safely be dispatched', reason: 'Availability or critical-trauma capability mismatch' }); await db.updateAmbulance(id, { status: 'EN_ROUTE', currentIncidentId: i.id }); const updated = await transition(i.id, i, 'EN_ROUTE', override ? `Operator override dispatch: ${req.body.reason || 'No reason recorded'}` : `Operator dispatched ${a.code}`, req.body.operator || 'OPERATOR', { ambulanceId: id, assignedAmbulance: id, dispatchedAt: new Date().toISOString() }); io.emit('incident:update', updated); io.emit('ambulance:status', { ambulanceId: id, status: 'EN_ROUTE', incidentId: i.id }); return res.json(response(updated)); } catch (e) { return res.status(e.status || 500).json({ error: e.message }); } };
    router.post(['/:id/dispatch', '/incidents/:id/dispatch', '/emergencies/:id/dispatch'], dispatch);
    const arrive = async (req, res) => { try { const i = await db.getIncident(req.params.id); if (!i) return res.status(404).json({ error: 'Incident not found' }); if (i.status !== 'EN_ROUTE') return res.status(409).json({ error: 'Arrival requires EN_ROUTE state' }); if (i.ambulanceId) await db.updateAmbulance(i.ambulanceId, { status: 'ARRIVED' }); const updated = await transition(i.id, i, 'ARRIVED', 'Ambulance arrived at destination', req.body.operator || 'SYSTEM', { arrivedAt: new Date().toISOString() }); io.emit('incident:update', updated); io.emit('ambulance:status', { ambulanceId: i.ambulanceId, status: 'ARRIVED', incidentId: i.id }); return res.json(response(updated)); } catch (e) { return res.status(e.status || 500).json({ error: e.message }); } };
    router.post(['/:id/arrive', '/incidents/:id/arrive'], arrive);
    router.post(['/:id/failover', '/incidents/:id/failover'], async (req, res) => { const i = await db.getIncident(req.params.id); if (!i) return res.status(404).json({ error: 'Incident not found' }); if (i.ambulanceId) await db.updateAmbulance(i.ambulanceId, { status: 'UNAVAILABLE', currentIncidentId: null }); const optimized = await AI.optimizeAmbulance(i, await db.getAllAmbulances()); if (!optimized.selected) return res.status(503).json({ error: 'No secondary ambulance available', details: optimized.rejections }); const a = optimized.selected; await db.updateAmbulance(a.id, { status: 'EN_ROUTE', currentIncidentId: i.id }); const updated = await db.updateIncident(i.id, { ambulanceId: a.id, ambulanceCode: a.code, assignedAmbulance: a.id, ambulanceReason: `FAILOVER: ${optimized.reason}`, route: i.latitude != null && i.hospitalId ? await OSRM.getTwoLegRoute(a.lng, a.lat, i.longitude, i.latitude, (await db.getHospital(i.hospitalId)).lng, (await db.getHospital(i.hospitalId)).lat) : i.route, status: 'EN_ROUTE', statusDescription: `Failover reassigned to ${a.code}`, actor: 'FAILOVER_ENGINE', failoverAt: new Date().toISOString() }); io.emit('incident:update', updated); io.emit('ambulance:assigned', { incidentId: i.id, ambulance: a, route: updated.route, isFailover: true }); return res.json({ ...response(updated), ranking: optimized.ranking }); });
    router.post(['/:id/resolve', '/incidents/:id/resolve'], async (req, res) => { try { const i = await db.getIncident(req.params.id); if (!i) return res.status(404).json({ error: 'Incident not found' }); if (!['ARRIVED', 'EN_ROUTE'].includes(i.status)) return res.status(409).json({ error: 'Resolution requires arrival or active en-route exception' }); const updated = await db.resolveIncident(i.id, req.body.reason || 'Incident resolved'); io.emit('incident:resolved', { incidentId: i.id, resolvedAt: updated.resolvedAt }); io.emit('incident:update', updated); return res.json(response(updated)); } catch (e) { return res.status(500).json({ error: e.message }); } });
    router.post(['/demo/reset', '/reset'], async (_, res) => { await db.resetDemoData(); io.emit('demo:reset', { timestamp: new Date() }); res.json({ success: true }); });
    return router;
};
