const express = require('express');
const router = express.Router();
const store = require('../database/db');

module.exports = (socketStats) => {
    router.get('/', async (req, res) => {
        return res.json({
            status: 'ONLINE',
            service: 'ResQNet Central AI Emergency Operations Engine',
            version: '3.4.0',
            timestamp: new Date().toISOString(),
            telemetry: {
                backend: 'CONNECTED',
                mongodb: store.isMongoConnected ? 'CONNECTED' : 'IN_MEMORY_FALLBACK',
                connectedClients: socketStats.clientCount,
                yoloEngine: 'ONLINE',
                osrmRouting: 'ONLINE'
            }
        });
    });

    return router;
};
