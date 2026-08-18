const express = require('express');
const router = express.Router();
const store = require('../database/db');

module.exports = (io) => {
    // 1. Get all ambulances
    router.get('/ambulances', async (req, res) => {
        try {
            const ambulances = await store.getAmbulances();
            return res.json({ success: true, ambulances });
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    });

    // 2. Stream GPS Telemetry for an Ambulance (from Driver Android App)
    router.post('/ambulances/:id/telemetry', async (req, res) => {
        try {
            const { id } = req.params;
            const { lat, lng, speed, heading, status } = req.body;
            
            const updates = {};
            if (lat !== undefined) updates.lat = parseFloat(lat);
            if (lng !== undefined) updates.lng = parseFloat(lng);
            if (status !== undefined) updates.status = status;
            if (speed !== undefined) updates.speed = parseFloat(speed);
            if (heading !== undefined) updates.heading = parseFloat(heading);

            const updated = await store.updateAmbulance(id, updates);
            if (!updated) return res.status(404).json({ success: false, message: 'Ambulance not found' });

            if (io) {
                io.emit('ambulance:telemetry', updated);
            }

            return res.json({ success: true, ambulance: updated });
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    });

    // 3. Get all hospitals
    router.get('/hospitals', async (req, res) => {
        try {
            const hospitals = await store.getHospitals();
            return res.json({ success: true, hospitals });
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
};
