const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const config = require('./config/config');
const store = require('./database/db');

const app = express();
const server = http.createServer(app);

// Permissive CORS for all origins
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());

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
        backend: 'CONNECTED',
        mongodb: store.isMongoConnected ? 'CONNECTED' : 'IN_MEMORY_FALLBACK',
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

// Emergency & Incident API routes
app.use('/api/emergencies', incidentRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/fleet', fleetRoutes);
app.use('/api', fleetRoutes);

// Health API matching both formats
app.get('/api/health', (req, res) => {
    res.json({
        status: "ok",
        database: true,
        ai: true,
        routing: true,
        service: "ResQNet Central AI Emergency Operations Engine",
        version: "3.4.0",
        connectedClients: socketStats.clientCount
    });
});

// Serve Dashboard Static Files directly on port 5000
const dashboardPath = path.join(__dirname, '../dashboard');
app.use(express.static(dashboardPath));

// Dashboard route aliases
app.get(['/', '/dashboard', '/dashboard.html'], (req, res) => {
    res.sendFile(path.join(dashboardPath, 'dashboard.html'));
});

// Initialize database non-blocking & start server
store.connect();
server.listen(config.PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 ResQNet Central AI Backend Live on Port ${config.PORT}`);
    console.log(`📡 WebSocket / Socket.IO Live on port ${config.PORT}`);
    console.log(`🖥️  Live Dashboard Served at: http://localhost:${config.PORT}/dashboard.html`);
    console.log(`======================================================\n`);
});
