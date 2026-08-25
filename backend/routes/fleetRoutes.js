const express = require('express');
const router = express.Router();
const db = require('../database/db');

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
                speed: speed !== undefined ? speed : 60,
                heading: heading !== undefined ? heading : 0,
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

    return router;
};
