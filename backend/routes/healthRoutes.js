const express = require('express');
const router = express.Router();
const db = require('../database/db');
const axios = require('axios');
const OSRMService = require('../services/osrmService');

let probeCache = { expires: 0, osrm: 'DEGRADED', ai: 'OFFLINE' };

module.exports = (io) => {
    router.get('/health', async (req, res) => {
        const incidents = await db.getAllIncidents();
        const ambulances = await db.getAllAmbulances();
        const activeIncidents = incidents.filter(i => i.status !== 'RESOLVED').length;
        const availableAmbs = ambulances.filter(a => a.status === 'AVAILABLE').length;

        if (Date.now() > probeCache.expires) {
            const aiUrl = process.env.AI_SERVICE_URL || 'http://localhost:5001';
            const [osrm, ai] = await Promise.allSettled([OSRMService.probe(), axios.get(`${aiUrl}/health`, { timeout: 800 })]);
            probeCache = { expires: Date.now() + 10000, osrm: osrm.status === 'fulfilled' ? osrm.value : 'DEGRADED', ai: ai.status === 'fulfilled' && ai.value.data?.status === 'ONLINE' ? 'ONLINE' : 'OFFLINE' };
        }

        const cameras = await db.getAllCCTV();
        const onlineCameras = cameras.filter(c => c.status === 'ONLINE').length;

        const healthData = {
            status: 'ok',
            backend: 'UP', // canonical legacy field; backendStatus is the ONLINE/DEGRADED/OFFLINE field
            backendStatus: 'ONLINE',
            mongodb: db.isMongoConnected ? 'ONLINE' : 'DEGRADED',
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
