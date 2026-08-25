const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const config = require('./config/config');
const store = require('./database/db');
const OSRMService = require('./services/osrmService');

const app = express();
const server = http.createServer(app);

// Permissive CORS for local & production deployment
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json({ limit: '10mb' }));

// Setup Socket.IO with permissive CORS
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const socketStats = {
    clientCount: 0
};

io.on('connection', (socket) => {
    socketStats.clientCount++;
    console.log(`[Socket.IO] 🟢 Connected: ${socket.id} (Active clients: ${socketStats.clientCount})`);

    // Broadcast live health status
    io.emit('health:status', {
        backend: 'ONLINE',
        database: store.isMongoConnected ? 'MONGODB' : 'IN_MEMORY_FALLBACK',
        connectedClients: socketStats.clientCount
    });

    socket.on('disconnect', () => {
        socketStats.clientCount = Math.max(0, socketStats.clientCount - 1);
        console.log(`[Socket.IO] 🔴 Disconnected: ${socket.id} (Active clients: ${socketStats.clientCount})`);
    });
});

// Attach Routes
const incidentRoutes = require('./routes/incidentRoutes')(io);
const fleetRoutes = require('./routes/fleetRoutes')(io);
const healthRoutes = require('./routes/healthRoutes')(io);

// Emergency & Incident API routes
app.use('/api/emergencies', incidentRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/fleet', fleetRoutes);
app.use('/api', fleetRoutes);
app.use('/api', healthRoutes);

// Generic Route Calculation Proxy
app.get(['/api/route', '/api/routes'], async (req, res) => {
    try {
        const { startLng, startLat, endLng, endLat } = req.query;
        if (!startLng || !startLat || !endLng || !endLat) {
            return res.status(400).json({ error: 'Missing start or end coordinates' });
        }
        const route = await OSRMService.getRouteBetween(
            Number(startLng), Number(startLat),
            Number(endLng), Number(endLat)
        );
        return res.json(route);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// Serve Dashboard Static Files directly on port 5000
const dashboardPath = path.join(__dirname, '../dashboard');
app.use(express.static(dashboardPath));

// Dashboard route aliases
app.get(['/', '/dashboard', '/dashboard.html', '/index.html'], (req, res) => {
    res.sendFile(path.join(dashboardPath, 'dashboard.html'));
});

app.get(['/hospital', '/hospital.html', '/trauma', '/er'], (req, res) => {
    res.sendFile(path.join(dashboardPath, 'hospital.html'));
});

app.get(['/sos', '/sos.html', '/beacon', '/citizen'], (req, res) => {
    res.sendFile(path.join(dashboardPath, 'sos.html'));
});

app.get(['/analytics', '/analytics.html', '/audit', '/reports'], (req, res) => {
    res.sendFile(path.join(dashboardPath, 'analytics.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('[Server Error]', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// Start server
server.listen(config.PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 ResQNet Central AI Backend Live on Port ${config.PORT}`);
    console.log(`📡 WebSocket / Socket.IO Live on port ${config.PORT}`);
    console.log(`🖥️  Live Dashboard Served at: http://localhost:${config.PORT}/dashboard.html`);
    console.log(`======================================================\n`);
});

module.exports = { app, server };
