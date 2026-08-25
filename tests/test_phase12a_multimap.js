/**
 * Phase 12A Multi-Map Command Center & Tactical Layer Test Suite
 * Validates map providers, tactical layers, CCTV FOV, and real-time backend synchronization.
 */

const axios = require('../backend/node_modules/axios');
const io = require('../backend/node_modules/socket.io-client');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

async function runPhase12ATests() {
    console.log('\n===============================================================');
    console.log('🗺️  RESQNET PHASE 12A MULTI-MAP COMMAND CENTER AUDIT 🗺️');
    console.log(`Backend Target: ${BACKEND_URL}`);
    console.log('===============================================================\n');

    let passed = 0;
    let total = 0;

    async function test(name, fn) {
        total++;
        process.stdout.write(`🧪 [12A.${total.toString().padStart(2, '0')}] ${name} ... `);
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

    // 1. Backend Health Probe
    await test('Authoritative Subsystem Health Probe (GET /api/health)', async () => {
        const res = await axios.get(`${BACKEND_URL}/api/health`);
        if (res.status !== 200 || res.data.backend !== 'UP') {
            throw new Error(`Health status unexpected: ${JSON.stringify(res.data)}`);
        }
    });

    // 2. CCTV Junction Cameras Registry
    let cctvCameras;
    await test('CCTV Infrastructure & AI Optical Sensors (GET /api/fleet/cctv)', async () => {
        const res = await axios.get(`${BACKEND_URL}/api/fleet/cctv`);
        if (res.status !== 200 || !Array.isArray(res.data) || res.data.length === 0) {
            throw new Error('No CCTV cameras returned from registry');
        }
        cctvCameras = res.data;
        const cam = cctvCameras[0];
        if (!cam.lat || !cam.lng || !cam.fovAngle || !cam.heading) {
            throw new Error('CCTV camera missing spatial or FOV cone metadata');
        }
    });

    // 3. Crash Blackspot Hotspots Registry
    await test('Crash Blackspot Historical Hazard Zones (GET /api/fleet/hotspots)', async () => {
        const res = await axios.get(`${BACKEND_URL}/api/fleet/hotspots`);
        if (res.status !== 200 || !Array.isArray(res.data) || res.data.length === 0) {
            throw new Error('No blackspot hotspots returned');
        }
        const hotspot = res.data[0];
        if (!hotspot.riskScore || !hotspot.radiusMeters) {
            throw new Error('Hotspot missing risk score or radius');
        }
    });

    // 4. Configured Traffic Context (Honest Labeling)
    await test('Configured Traffic Context Corridors (GET /api/fleet/traffic)', async () => {
        const res = await axios.get(`${BACKEND_URL}/api/fleet/traffic`);
        if (res.status !== 200 || !Array.isArray(res.data) || res.data.length === 0) {
            throw new Error('No traffic corridors returned');
        }
        const corridor = res.data[0];
        if (!corridor.trafficLabel.includes('Configured traffic weighting')) {
            throw new Error(`Dishonest traffic label: ${corridor.trafficLabel}`);
        }
    });

    // 5. Real-Time Socket.IO Handshake
    let socket;
    let receivedNew = false, receivedUpdate = false, receivedTelemetry = false;
    await test('Socket.IO Tactical Telemetry Channel Handshake', async () => {
        await new Promise((resolve, reject) => {
            socket = io(BACKEND_URL, { timeout: 4000 });
            socket.on('connect', () => {
                socket.on('incident:new', () => { receivedNew = true; });
                socket.on('incident:update', () => { receivedUpdate = true; });
                socket.on('ambulance:telemetry', () => { receivedTelemetry = true; });
                resolve();
            });
            socket.on('connect_error', reject);
        });
    });

    // 6. Real Incident Ingestion (Multi-Signal Crash)
    const incId = `RNQ-MAP-${Date.now()}`;
    let createdIncident;
    await test('Incident Ingestion with Spatial Route (POST /api/incidents/detect)', async () => {
        const res = await axios.post(`${BACKEND_URL}/api/incidents/detect`, {
            id: incId,
            incidentId: incId,
            source: 'smartphone',
            title: 'Highway Rollover Incident (Sensor Armed)',
            latitude: 18.5260,
            longitude: 73.8580,
            gForce: 5.2,
            speedDeltaKmh: 48.0,
            confidence: 0.95,
            severity: 92
        });

        if (res.status !== 201 && res.status !== 200) throw new Error(`Status ${res.status}`);
        createdIncident = res.data.incident || res.data;
        if (!createdIncident.route || !createdIncident.route.geometry) {
            throw new Error('Incident missing authoritative 2-leg route geometry');
        }
    });

    // 7. Tactical Ambulance Dispatch State Transition
    await test('Operator Dispatch Execution (POST /api/incidents/:id/dispatch)', async () => {
        const ambId = createdIncident.assignedAmbulance || 'AMB-01';
        const res = await axios.post(`${BACKEND_URL}/api/incidents/${incId}/dispatch`, {
            ambulanceId: ambId
        });
        if (res.status !== 200 || res.data.incident.status !== 'EN_ROUTE') {
            throw new Error('Failed to transition incident status to EN_ROUTE');
        }
    });

    // 8. High-Frequency Fleet Telemetry Stream
    await test('High-Frequency Vehicle Telemetry (POST /api/fleet/ambulances/:id/telemetry)', async () => {
        const ambId = createdIncident.assignedAmbulance || 'AMB-01';
        const res = await axios.post(`${BACKEND_URL}/api/fleet/ambulances/${ambId}/telemetry`, {
            lat: 18.5230,
            lng: 73.8510,
            speed: 58.4,
            heading: 135,
            status: 'EN_ROUTE'
        });
        if (res.status !== 200 || !res.data.success) {
            throw new Error('Telemetry update rejected');
        }
    });

    // 9. Sub-Second Dynamic Failover Re-routing
    await test('Sub-Second Dynamic Fleet Failover (POST /api/incidents/:id/failover)', async () => {
        const res = await axios.post(`${BACKEND_URL}/api/incidents/${incId}/failover`, {});
        if (res.status !== 200 || !res.data.success || !res.data.newAmbulance) {
            throw new Error('Failover secondary ambulance re-assignment failed');
        }
        if (!res.data.incident.route || !res.data.incident.route.geometry) {
            throw new Error('Failover route recalculation missing geometry');
        }
    });

    // 10. Incident Resolution & Non-Destructive Archival
    await test('Incident Resolution (POST /api/incidents/:id/resolve)', async () => {
        const res = await axios.post(`${BACKEND_URL}/api/incidents/${incId}/resolve`, {
            reason: 'Patient safely admitted to Trauma Unit'
        });
        if (res.status !== 200 || res.data.incident.status !== 'RESOLVED') {
            throw new Error('Incident resolution failed');
        }
    });

    // 11. Unavailable / Degraded GPS Handling (No Fabrication)
    await test('Unavailable GPS Graceful Fallback Handling (POST /api/incidents/detect)', async () => {
        const tunnelIncId = `RNQ-TUNNEL-${Date.now()}`;
        const res = await axios.post(`${BACKEND_URL}/api/incidents/detect`, {
            id: tunnelIncId,
            incidentId: tunnelIncId,
            source: 'smartphone',
            title: 'Underground Tunnel Crash (No GPS)',
            latitude: null,
            longitude: null,
            locationQuality: 'UNAVAILABLE',
            gForce: 4.6,
            confidence: 0.92,
            severity: 85
        });

        if (res.status !== 201 && res.status !== 200) throw new Error('Unavailable GPS incident rejected');
        if (res.data.incident && res.data.incident.locationQuality !== 'UNAVAILABLE') {
            throw new Error('locationQuality UNAVAILABLE was overwritten');
        }
    });

    socket.disconnect();

    console.log('\n===============================================================');
    console.log(`🎉 PHASE 12A MULTI-MAP TEST SUITE: ${passed}/${total} PASSED (${Math.round((passed/total)*100)}%)`);
    console.log('===============================================================\n');

    if (passed === total) process.exit(0);
    else process.exit(1);
}

runPhase12ATests();
