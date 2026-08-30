const express = require('express');
const router = express.Router();
const db = require('../database/db');
const axios = require('axios');

module.exports = (io) => {
    router.get('/health', async (req, res) => {
        const incidents = await db.getAllIncidents();
        const ambulances = await db.getAllAmbulances();
        const activeIncidents = incidents.filter(i => i.status !== 'RESOLVED').length;
        const availableAmbs = ambulances.filter(a => a.status === 'AVAILABLE').length;

        // Active probe to OSRM routing service
        let osrmStatus = 'UP';
        try {
            const osrmUrl = process.env.OSRM_BASE_URL || 'https://router.project-osrm.org';
            const osrmProbe = await axios.get(`${osrmUrl}/route/v1/driving/73.8567,18.5204;73.8780,18.5360?overview=false`, { timeout: 2000 });
            if (!osrmProbe.data || osrmProbe.data.code !== 'Ok') osrmStatus = 'DEGRADED';
        } catch (e) {
            osrmStatus = 'DEGRADED';
        }

        const cameras = await db.getAllCCTV();
        const onlineCameras = cameras.filter(c => c.status === 'ONLINE').length;

        const healthData = {
            status: 'ok',
            backend: 'UP',
            mongodb: db.isMongoConnected ? 'UP' : 'DEGRADED',
            database: db.isMongoConnected ? 'MONGODB' : 'IN_MEMORY_FALLBACK',
            databaseConnected: db.isMongoConnected,
            aiEngine: 'UP',
            ai: 'ONLINE',
            cctv: onlineCameras > 0 ? 'ONLINE' : 'DEGRADED',
            cctvCamerasOnline: onlineCameras,
            cctvCamerasTotal: cameras.length,
            osrm: osrmStatus,
            routing: osrmStatus === 'UP' ? 'ONLINE' : 'DEGRADED',
            socketIO: 'UP',
            socket: 'ONLINE',
            activeSockets: io && io.engine ? io.engine.clientsCount : 0,
            activeIncidents,
            availableAmbulances: availableAmbs,
            timestamp: new Date().toISOString()
        };

        return res.json(healthData);
    });

    return router;
};
