const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const config = require('./config/config');
const store = require('./database/db');
const OSRMService = require('./services/osrmService');
const auth = require('./services/authService');

const app = express();
const server = http.createServer(app);

// Permissive CORS for Command Center Dashboard, Android clients, and Optical AI
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-cctv-auth-token']
}));
app.use(express.json({ limit: '10mb' }));
app.disable('x-powered-by');

const requestBuckets = new Map();
app.use('/api', (req, res, next) => {
    const key = req.ip || 'unknown', now = Date.now(), bucket = requestBuckets.get(key) || { started: now, count: 0 };
    if (now - bucket.started > 60000) { bucket.started = now; bucket.count = 0; }
    if (++bucket.count > Number(process.env.RATE_LIMIT_PER_MINUTE || 300)) return res.status(429).json({ error: 'Too many requests' });
    requestBuckets.set(key, bucket);
    next();
});

// Socket.IO configuration with WebSocket and polling fallback for Render
const io = new Server(server, {
    cors: {
        origin: true,
        credentials: true,
        methods: ['GET', 'POST', 'OPTIONS']
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true
});

const socketStats = {
    clientCount: 0
};

io.on('connection', (socket) => {
    const session = auth.socketSession(socket.handshake.auth?.token);
    if (session) {
        socket.data.user = session;
        socket.join(`role:${session.role}`);
        if (session.resourceId) socket.join(`${session.role === 'AMBULANCE' ? 'ambulance' : session.role === 'HOSPITAL' ? 'hospital' : 'user'}:${session.resourceId}`);
    }
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
const cctvRoutes = require('./routes/cctvRoutes')(io);
const authRoutes = require('./routes/authRoutes')();
const analyticsRoutes = require('./routes/analyticsRoutes')();

// Emergency & Incident API routes
app.use('/api/auth', authRoutes);
app.use('/api/emergencies', incidentRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/cctv', cctvRoutes);
app.use('/api/fleet', fleetRoutes);
app.use('/api', fleetRoutes);
app.use('/api', healthRoutes);
app.use('/api', authRoutes);
app.use('/api', analyticsRoutes);

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
app.get(['/', '/index.html', '/citizen', '/register'], (req, res) => {
    res.sendFile(path.join(dashboardPath, 'index.html'));
});

app.get(['/dashboard', '/dashboard.html', '/command', '/operations'], (req, res) => {
    res.sendFile(path.join(dashboardPath, 'dashboard.html'));
});

app.get(['/medical-profile', '/medical-profile.html', '/medical', '/profile'], (req, res) => {
    res.sendFile(path.join(dashboardPath, 'medical-profile.html'));
});

app.get(['/hospital', '/hospital.html', '/trauma', '/er'], (req, res) => {
    res.sendFile(path.join(dashboardPath, 'hospital.html'));
});

app.get(['/ambulance', '/ambulance.html', '/ems', '/fleet'], (req, res) => {
    res.sendFile(path.join(dashboardPath, 'ambulance.html'));
});

app.get(['/login', '/login.html'], (req, res) => {
    res.sendFile(path.join(dashboardPath, 'login.html'));
});

app.get(['/sos', '/sos.html', '/beacon'], (req, res) => {
    res.sendFile(path.join(dashboardPath, 'sos.html'));
});

app.get(['/analytics', '/analytics.html', '/audit', '/reports'], (req, res) => {
    res.sendFile(path.join(dashboardPath, 'analytics.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('[Server Error]', err);
    res.status(500).json({ error: 'Internal Server Error', ...(process.env.NODE_ENV !== 'production' ? { message: err.message } : {}) });
});

process.on('uncaughtException', (err) => {
    console.error('[Process] Uncaught Exception:', err.message || err);
});
process.on('unhandledRejection', (reason) => {
    console.error('[Process] Unhandled Rejection:', reason);
});

// Start server
// Render forwards traffic to the port in PORT and requires a public bind.
const port = Number(process.env.PORT || config.PORT || 5000);
server.listen(port, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`🚀 ResQNet Central AI Backend Live on Port ${port}`);
    console.log(`📡 WebSocket / Socket.IO Live on port ${port}`);
    console.log(`🖥️  Live Dashboard Served at: http://localhost:${port}/dashboard.html`);
    console.log(`======================================================\n`);
});

module.exports = { app, server };
