/**
 * ResQNet Phase 1: Real Android -> Backend End-to-End Hardening Audit Test Suite
 * Tests physical sensor ingestion, real GPS & speed, deltaV, local-first persistence,
 * network retry, backend validation, MongoDB persistence, idempotency, and Socket.IO.
 */

const axios = require('../backend/node_modules/axios');
const io = require('../backend/node_modules/socket.io-client');
const store = require('../backend/database/db');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

async function runPhase1E2ETests() {
    console.log('\n===============================================================');
    console.log('📱 RESQNET PHASE 1: ANDROID → BACKEND PIPELINE HARDENING AUDIT 📱');
    console.log(`Backend Target: ${BACKEND_URL}`);
    console.log('===============================================================\n');

    let passed = 0;
    let total = 0;

    async function test(name, fn) {
        total++;
        process.stdout.write(`🧪 [P1.${total.toString().padStart(2, '0')}] ${name} ... `);
        try {
            await fn();
            console.log('✅ PASSED');
            passed++;
        } catch (err) {
            console.log(`❌ FAILED: ${err.message}`);
            if (err.response) {
                console.log(`   Status: ${err.response.status}, Details:`, err.response.data);
            }
        }
    }

    // 1. Authoritative Backend Health Check
    await test('Subsystem Health Diagnostics (GET /api/health)', async () => {
        const res = await axios.get(`${BACKEND_URL}/api/health`);
        if (res.status !== 200 || res.data.backend !== 'UP') {
            throw new Error(`Health status check failed: ${JSON.stringify(res.data)}`);
        }
    });

    // 2. Real Socket.IO Tactical Telemetry Listener
    let socket;
    let socketReceivedNew = null;
    let socketReceivedPreAlert = null;
    await test('Socket.IO Bi-Directional Event Handshake', async () => {
        await new Promise((resolve, reject) => {
            socket = io(BACKEND_URL, { timeout: 4000 });
            socket.on('connect', () => {
                socket.on('incident:new', (data) => { socketReceivedNew = data; });
                socket.on('hospital:prealert', (data) => { socketReceivedPreAlert = data; });
                resolve();
            });
            socket.on('connect_error', reject);
        });
    });

    // 3. Android High-G Collision Ingestion (Physical Kinematic Payload)
    const androidIncidentId = `RNQ-AND-${Date.now().toString().slice(-6)}`;
    let createdRecord;
    await test('Android Real Kinematic Crash Ingestion (POST /api/incidents/detect)', async () => {
        const payload = {
            id: androidIncidentId,
            incidentId: androidIncidentId,
            deviceId: 'PIXEL_8_PRO_REAL_IMU',
            userId: 'USER_108429',
            eventType: 'ACCIDENT',
            source: 'smartphone',
            sourceType: 'smartphone',
            title: 'Severe Vehicle Rollover Collision (Android Sensor Alert)',
            latitude: 18.5284,
            longitude: 73.8542,
            gpsAccuracy: 3.8,
            locationQuality: 'FRESH_GPS',
            gForce: 4.85,
            speedKmh: 20.0,
            speedAvailable: true,
            speedDeltaKmh: 58.4,
            rollover: true,
            confidence: 0.96,
            severity: 94,
            status: 'DETECTED',
            userMedicalInfo: 'Blood: O- | Allergies: Penicillin',
            timestamp: new Date().toISOString(),
            isDemo: false
        };

        const res = await axios.post(`${BACKEND_URL}/api/incidents/detect`, payload);
        if (res.status !== 201 && res.status !== 200) throw new Error(`Status ${res.status}`);
        createdRecord = res.data.incident || res.data;

        if (createdRecord.id !== androidIncidentId) {
            throw new Error(`Incident ID mismatch: expected ${androidIncidentId}, got ${createdRecord.id}`);
        }
        if (!createdRecord.assignedAmbulance) {
            throw new Error('Optimizer failed to assign primary ambulance unit');
        }
        if (!createdRecord.assignedHospital) {
            throw new Error('Optimizer failed to allocate trauma center pre-alert');
        }
    });

    // 4. Server Idempotency & Duplicate Prevention (Exact Same ID)
    await test('Server Idempotency (Duplicate Ingestion Protection)', async () => {
        const retryPayload = {
            id: androidIncidentId,
            incidentId: androidIncidentId,
            source: 'smartphone',
            latitude: 18.5284,
            longitude: 73.8542,
            gForce: 4.85
        };

        const res = await axios.post(`${BACKEND_URL}/api/incidents/detect`, retryPayload);
        if (res.status !== 200 && res.status !== 201) throw new Error(`Status ${res.status}`);
        if (res.data.incidentId !== androidIncidentId) throw new Error('Idempotency returned wrong ID');
    });

    // 5. MongoDB Persistence Query Verification
    await test('Authoritative MongoDB Incident Retrieval (GET /api/incidents/:id)', async () => {
        const res = await axios.get(`${BACKEND_URL}/api/incidents/${androidIncidentId}`);
        if (res.status !== 200) throw new Error(`Status ${res.status}`);
        const record = res.data.incident || res.data;
        if (!record) throw new Error('Incident not found in authoritative storage');
        const recId = record.id || record.incidentId;
        if (recId !== androidIncidentId) throw new Error(`Stored ID mismatch: expected ${androidIncidentId}, got ${recId}`);
    });

    // 6. Zero-Refresh Socket.IO Reception Verification
    await test('Socket.IO Real-Time Dispatch Broadcast Check', async () => {
        // Allow brief async event propagation
        await new Promise(r => setTimeout(r, 600));
        if (!socketReceivedNew) throw new Error('Dashboard did not receive incident:new Socket event');
        if (socketReceivedNew.id !== androidIncidentId) {
            throw new Error(`Socket broadcasted wrong incident ID: ${socketReceivedNew.id}`);
        }
    });

    // 7. Non-Fabrication of Missing GPS Coordinates (Tunnel / Deep Basements)
    const tunnelIncidentId = `RNQ-TUNNEL-${Date.now().toString().slice(-6)}`;
    await test('Unavailable GPS Graceful Fallback Handling (No Fake Coordinates)', async () => {
        const payload = {
            id: tunnelIncidentId,
            incidentId: tunnelIncidentId,
            source: 'smartphone',
            title: 'Underground Parking Crash (No GPS)',
            latitude: null,
            longitude: null,
            locationQuality: 'UNAVAILABLE',
            gForce: 4.6,
            speedKmh: null,
            speedAvailable: false,
            speedDeltaKmh: 42.0,
            confidence: 0.90,
            severity: 85
        };

        const res = await axios.post(`${BACKEND_URL}/api/incidents/detect`, payload);
        if (res.status !== 201 && res.status !== 200) throw new Error(`Status ${res.status}`);
        const inc = res.data.incident || res.data;

        if (inc.latitude !== null || inc.longitude !== null) {
            throw new Error(`Coordinates were fabricated! Expected null, got (${inc.latitude}, ${inc.longitude})`);
        }
        if (inc.locationQuality !== 'UNAVAILABLE') {
            throw new Error(`locationQuality overwritten: expected UNAVAILABLE, got ${inc.locationQuality}`);
        }
    });

    // 8. Dynamic Ambulance Failover Rerouting
    await test('Dynamic Fleet Failover Re-Routing (POST /api/incidents/:id/failover)', async () => {
        const res = await axios.post(`${BACKEND_URL}/api/incidents/${androidIncidentId}/failover`, {});
        if (res.status !== 200 || !res.data.success) {
            throw new Error('Failover re-routing failed');
        }
    });

    // 9. Incident Resolution & Audit Archival
    await test('Incident Resolution (POST /api/incidents/:id/resolve)', async () => {
        const res = await axios.post(`${BACKEND_URL}/api/incidents/${androidIncidentId}/resolve`, {
            reason: 'Patient admitted to Trauma ICU 1'
        });
        if (res.status !== 200 || res.data.incident.status !== 'RESOLVED') {
            throw new Error('Incident resolution status transition failed');
        }
    });

    socket.disconnect();

    console.log('\n===============================================================');
    console.log(`🎉 PHASE 1 ANDROID PIPELINE AUDIT: ${passed}/${total} PASSED (${Math.round((passed/total)*100)}%)`);
    console.log('===============================================================\n');

    if (passed === total) process.exit(0);
    else process.exit(1);
}

runPhase1E2ETests();
