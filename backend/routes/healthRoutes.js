const express = require('express');
const router = express.Router();
const db = require('../database/db');

module.exports = (io) => {
    router.get('/health', async (req, res) => {
        const incidents = await db.getAllIncidents();
        const ambulances = await db.getAllAmbulances();
        const activeIncidents = incidents.filter(i => i.status !== 'RESOLVED').length;
        const availableAmbs = ambulances.filter(a => a.status === 'AVAILABLE').length;

        const healthData = {
            status: 'ok',
            backend: 'ONLINE',
            database: db.isMongoConnected ? 'MONGODB' : 'IN_MEMORY_FALLBACK',
            databaseConnected: db.isMongoConnected,
            ai: 'ONLINE',
            routing: 'ONLINE',
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
