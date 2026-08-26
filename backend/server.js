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

// Local development permits any browser origin.  Render production deployments
// use an explicit comma-separated CORS_ORIGINS allow-list for both REST and
// Socket.IO, while native Android clients continue to work without an Origin.
const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').filter(Boolean);
const corsOrigin = process.env.NODE_ENV === 'production'
    ? (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin))
    : '*';
app.use(cors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json({ limit: '10mb' }));
app.disable('x-powered-by');
// Dependency-free protective baseline.  Local DEMO_MODE deliberately remains usable.
const requestBuckets = new Map();
app.use('/api', (req, res, next) => {
    const key = req.ip || 'unknown', now = Date.now(), bucket = requestBuckets.get(key) || { started: now, count: 0 };
    if (now - bucket.started > 60000) { bucket.started = now; bucket.count = 0; }
    if (++bucket.count > Number(process.env.RATE_LIMIT_PER_MINUTE || 120)) return res.status(429).json({ error: 'Too many requests' });
    requestBuckets.set(key, bucket);
    const requiredKey = process.env.RESQNET_API_KEY;
    // A client must be able to reach login before it has a session token. Health is
    // likewise needed by the mobile connectivity UI. Role/session authorization is
    // enforced by individual protected routes after login.
    const publicApi = req.path.startsWith('/auth/') || req.path === '/health';
    const bearer = req.get('authorization') || '';
    const sessionToken = bearer.startsWith('Bearer ') ? bearer.slice(7) : null;
    const hasSession = !!auth.socketSession(sessionToken);
    if (requiredKey && process.env.DEMO_MODE !== 'true' && !publicApi && bearer !== `Bearer ${requiredKey}` && !hasSession) return res.status(401).json({ error: 'Authentication required' });
    next();
});

// Socket.IO shares this same HTTP service and origin policy on Render.
const io = new Server(server, {
    cors: {
        origin: corsOrigin,
        methods: ['GET', 'POST']
    }
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
const analyticsRoutes = require('./routes/analyticsRoutes')();
const authRoutes = require('./routes/authRoutes')();

// Emergency & Incident API routes
app.use('/api/emergencies', incidentRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/fleet', fleetRoutes);
app.use('/api', fleetRoutes);
app.use('/api', healthRoutes);
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
app.get(['/', '/dashboard', '/dashboard.html', '/index.html'], (req, res) => {
    res.sendFile(path.join(dashboardPath, 'dashboard.html'));
});

app.get(['/hospital', '/hospital.html', '/trauma', '/er'], (req, res) => {
    res.sendFile(path.join(dashboardPath, 'hospital.html'));
});
app.get(['/ambulance', '/ambulance.html'], (req, res) => res.sendFile(path.join(dashboardPath, 'ambulance.html')));
app.get(['/login', '/login.html'], (req, res) => res.sendFile(path.join(dashboardPath, 'login.html')));

app.get(['/sos', '/sos.html', '/beacon', '/citizen'], (req, res) => {
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

// Start server
// Render forwards traffic to the port in PORT and requires a public bind.
server.listen(config.PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`🚀 ResQNet Central AI Backend Live on Port ${config.PORT}`);
    console.log(`📡 WebSocket / Socket.IO Live on port ${config.PORT}`);
    console.log(`🖥️  Live Dashboard Served at: http://localhost:${config.PORT}/dashboard.html`);
    console.log(`======================================================\n`);
});

module.exports = { app, server };
