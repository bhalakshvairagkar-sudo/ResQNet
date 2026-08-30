const express = require('express');
const router = express.Router();
const db = require('../database/db');
const auth = require('../services/authService');

module.exports = (io) => {
    // 1. Ambulances Registry
    router.get('/ambulances', async (req, res) => {
        const ambulances = await db.getAllAmbulances();
        return res.json(ambulances);
    });

    router.get('/ambulances/:id', async (req, res) => {
        const amb = await db.getAmbulance(req.params.id);
        if (!amb) return res.status(404).json({ error: 'Ambulance not found' });
        return res.json(amb);
    });

    // 2. High-Frequency GPS Telemetry Ingestion
    const handleTelemetry = async (req, res) => {
        try {
            const ambId = req.params.id;
            const { lat, lng, latitude, longitude, speed, heading, status } = req.body;

            const finalLat = Number(lat || latitude);
            const finalLng = Number(lng || longitude);

            const updates = {
                lat: finalLat,
                lng: finalLng,
                speed: speed !== undefined ? Number(speed) : undefined,
                heading: heading !== undefined ? Number(heading) : undefined,
                status: status || 'EN_ROUTE'
            };

            const updated = await db.updateAmbulance(ambId, updates);
            if (!updated) return res.status(404).json({ error: 'Ambulance not found' });

            // Broadcast real-time location to all connected Command Centers
            io.emit('ambulance:location', updated);
            io.emit('ambulance:telemetry', updated);
            io.emit('ambulanceLocationUpdated', updated);

            return res.json({ success: true, ambulance: updated });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    };

    router.post('/ambulances/:id/telemetry', handleTelemetry);
    router.post('/ambulances/:id/location', handleTelemetry);
    router.patch('/ambulances/:id/location', auth.authenticate, auth.allow('COMMAND_CENTER'), async (req, res) => {
        const lat = Number(req.body.latitude ?? req.body.lat), lng = Number(req.body.longitude ?? req.body.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return res.status(400).json({ error: 'Valid latitude and longitude are required' });
        const ambulance = await db.updateAmbulance(req.params.id, { lat, lng, status: req.body.status || 'AVAILABLE', locationUpdatedAt: new Date().toISOString(), isDemoLocation: true });
        if (!ambulance) return res.status(404).json({ error: 'Ambulance not found' }); io.to('role:COMMAND_CENTER').emit('ambulance:location:update', ambulance); io.to(`ambulance:${ambulance.id}`).emit('ambulance:location:update', ambulance); res.json({ success: true, ambulance });
    });

    // 3. Update Ambulance Status
    router.post('/ambulances/:id/status', async (req, res) => {
        try {
            const ambId = req.params.id;
            const { status } = req.body;
            const updated = await db.updateAmbulance(ambId, { status });
            if (!updated) return res.status(404).json({ error: 'Ambulance not found' });

            io.emit('ambulance:status', { ambulanceId: ambId, status });
            return res.json({ success: true, ambulance: updated });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    // 4. Hospitals Registry
    router.get('/hospitals', async (req, res) => {
        const hospitals = await db.getAllHospitals();
        return res.json(hospitals);
    });

    router.get('/hospitals/:id', async (req, res) => {
        const hosp = await db.getHospital(req.params.id);
        if (!hosp) return res.status(404).json({ error: 'Hospital not found' });
        return res.json(hosp);
    });

    // 5. Clinical Pre-Alert Delivery
    router.post('/hospitals/:id/alert', async (req, res) => {
        try {
            const hospId = req.params.id;
            const hosp = await db.getHospital(hospId);
            if (!hosp) return res.status(404).json({ error: 'Hospital not found' });

            const preAlertPayload = {
                hospitalId: hospId,
                hospitalName: hosp.name,
                alertSentAt: new Date().toISOString(),
                ...req.body,
                status: 'ALERT_SENT'
            };

            io.emit('hospital:prealert', preAlertPayload);
            return res.status(200).json({
                success: true,
                message: `Pre-alert transmitted to ${hosp.name}`,
                preAlert: preAlertPayload
            });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });
    router.patch('/hospitals/:id/location', auth.authenticate, auth.allow('COMMAND_CENTER'), async (req, res) => {
        const lat = Number(req.body.latitude ?? req.body.lat), lng = Number(req.body.longitude ?? req.body.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return res.status(400).json({ error: 'Valid latitude and longitude are required' });
        const hospital = await db.updateHospital(req.params.id, { lat, lng, status: req.body.status || 'AVAILABLE', locationUpdatedAt: new Date().toISOString(), isDemoLocation: true });
        if (!hospital) return res.status(404).json({ error: 'Hospital not found' }); io.to('role:COMMAND_CENTER').emit('hospital:location:update', hospital); io.to(`hospital:${hospital.id}`).emit('hospital:location:update', hospital); res.json({ success: true, hospital });
    });

    // Persistent acknowledgement from the destination hospital.
    router.post('/hospitals/:hospitalId/incidents/:incidentId/ack', async (req, res) => {
        try {
            const hospital = await db.getHospital(req.params.hospitalId);
            const incident = await db.getIncident(req.params.incidentId);
            if (!hospital) return res.status(404).json({ error: 'Hospital not found' });
            if (!incident) return res.status(404).json({ error: 'Incident not found' });
            if (incident.hospitalId && incident.hospitalId !== hospital.id) return res.status(409).json({ error: 'Hospital is not assigned to this incident' });
            const acknowledgement = { hospitalId: hospital.id, incidentId: incident.id, acknowledgedAt: new Date().toISOString(), acknowledgedBy: req.body.acknowledgedBy || 'HOSPITAL_OPERATOR', readinessStatus: req.body.readinessStatus || 'ACKNOWLEDGED' };
            const updated = await db.updateIncident(incident.id, {
                hospitalPreAlert: { ...(incident.hospitalPreAlert || {}), ...acknowledgement, alertStatus: acknowledgement.readinessStatus },
                statusDescription: `Hospital acknowledgement: ${acknowledgement.readinessStatus}`,
                actor: acknowledgement.acknowledgedBy
            });
            updated.timeline = updated.timeline || [];
            updated.timeline.push({ status: 'HOSPITAL_ACKNOWLEDGED', timestamp: new Date(), description: `Hospital ${hospital.name} acknowledged pre-alert`, actor: acknowledgement.acknowledgedBy });
            await db.saveIncident(updated);
            io.emit('hospital:prealert:ack', acknowledgement);
            io.emit('incident:update', updated);
            return res.json({ success: true, acknowledgement, incident: updated });
        } catch (err) { return res.status(500).json({ error: 'Unable to save acknowledgement' }); }
    });

    // 6. CCTV Junction Cameras Registry
    router.get('/cctv', async (req, res) => {
        const cctv = await db.getAllCCTV();
        return res.json(cctv);
    });

    router.get('/cctv/:id', async (req, res) => {
        const cam = await db.getCCTV(req.params.id);
        if (!cam) return res.status(404).json({ error: 'CCTV Camera not found' });
        return res.json(cam);
    });

    // 7. Crash Blackspot Hotspots Registry
    router.get('/hotspots', async (req, res) => {
        const hotspots = await db.getAllHotspots();
        return res.json(hotspots);
    });

    // 8. Configured Traffic Context (Honest Labeling)
    router.get('/traffic', async (req, res) => {
        const traffic = await db.getTrafficContext();
        return res.json(traffic);
    });

    return router;
};
