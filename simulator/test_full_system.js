/**
 * ResQNet Full Real-System Integration Verification Suite
 * Validates the complete pipeline across all 13 distributed subsystems.
 */

const axios = require('../backend/node_modules/axios');
const io = require('../backend/node_modules/socket.io-client');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

async function runFullSystemIntegration() {
    console.log('\n===============================================================');
    console.log('🌐 RESQNET FULL REAL-SYSTEM INTEGRATION TEST SUITE 🌐');
    console.log(`Target Backend: ${BACKEND_URL}`);
    console.log('===============================================================\n');

    let passed = 0;
    let total = 0;

    async function test(name, fn) {
        total++;
        process.stdout.write(`🧪 [Step ${total.toString().padStart(2, '0')}] ${name} ... `);
        try {
            await fn();
            console.log('✅ PASSED');
            passed++;
        } catch (err) {
            console.log(`❌ FAILED: ${err.message}`);
            if (err.response) {
                console.log(`   Status: ${err.response.status}, Data:`, err.response.data);
            }
        }
    }

    // Step 1: Health probe
    await test('Authoritative Health Diagnostics (GET /api/health)', async () => {
        const res = await axios.get(`${BACKEND_URL}/api/health`);
        if (res.status !== 200 || res.data.backend !== 'ONLINE') {
            throw new Error(`Health probe failed: ${JSON.stringify(res.data)}`);
        }
    });

    // Step 2: Fleet and Hospital registry
    let seedAmb, seedHosp;
    await test('Fleet & Hospital Spatial Registry (GET /api/fleet)', async () => {
        const ambRes = await axios.get(`${BACKEND_URL}/api/fleet/ambulances`);
        const hospRes = await axios.get(`${BACKEND_URL}/api/fleet/hospitals`);
        if (!Array.isArray(ambRes.data) || ambRes.data.length === 0) throw new Error('No ambulances returned');
        if (!Array.isArray(hospRes.data) || hospRes.data.length === 0) throw new Error('No hospitals returned');
        seedAmb = ambRes.data[0];
        seedHosp = hospRes.data[0];
    });

    // Step 3: OSRM Topological Routing
    await test('OSRM Topological Street Routing (GET /api/routes)', async () => {
        const res = await axios.get(`${BACKEND_URL}/api/routes?startLng=73.8412&startLat=18.5148&endLng=73.8567&endLat=18.5204`);
        if (res.status !== 200 || !res.data.distanceKm || !res.data.geometry) {
            throw new Error('OSRM route calculation missing geometry or distance');
        }
    });

    // Step 4: Real-time Socket.IO Connection & Event Listener
    let socket;
    let socketReceivedNew = false;
    let socketReceivedUpdate = false;
    let socketReceivedTelemetry = false;

    await test('Socket.IO Bi-Directional Real-Time Handshake', async () => {
        await new Promise((resolve, reject) => {
            socket = io(BACKEND_URL, { timeout: 4000 });
            socket.on('connect', () => {
                socket.on('incident:new', () => { socketReceivedNew = true; });
                socket.on('incident:update', () => { socketReceivedUpdate = true; });
                socket.on('ambulance:telemetry', () => { socketReceivedTelemetry = true; });
                resolve();
            });
            socket.on('connect_error', reject);
        });
    });

    // Step 5: Real Smartphone Incident Ingestion
    const uniqueIncId = `RNQ-FULL-${Date.now()}`;
    let createdIncident;

    await test('Real Incident Ingestion & AI Optimization (POST /api/incidents/detect)', async () => {
        const payload = {
            id: uniqueIncId,
            incidentId: uniqueIncId,
            deviceId: 'ANDROID_PIXEL8_PRO',
            userId: 'USER_DRIVER_88',
            eventType: 'ACCIDENT',
            source: 'smartphone',
            sourceType: 'smartphone',
            title: 'High-Impact Vehicle Rollover (Sensor Detection)',
            latitude: 18.5255,
            longitude: 73.8580,
            gpsAccuracy: 3.8,
            gForce: 5.4,
            speedKmh: 70.0,
            speedDeltaKmh: 55.0,
            rollover: true,
            confidence: 0.96,
            severity: 95,
            userMedicalInfo: 'Blood: O- | Allergies: Penicillin'
        };

        const res = await axios.post(`${BACKEND_URL}/api/incidents/detect`, payload);
        if (res.status !== 201 && res.status !== 200) throw new Error(`Status ${res.status}`);
        createdIncident = res.data.incident || res.data;
        if (!createdIncident.assignedAmbulance) throw new Error('Ambulance optimizer failed to assign unit');
        if (!createdIncident.assignedHospital) throw new Error('Hospital optimizer failed to match trauma center');
        if (!createdIncident.route || !createdIncident.route.geometry) throw new Error('2-Leg route missing geometry');
    });

    // Step 6: Server-Side Idempotency
    await test('Server-Side Idempotency (Duplicate Ingestion Protection)', async () => {
        const duplicateRes = await axios.post(`${BACKEND_URL}/api/incidents/detect`, {
            id: uniqueIncId,
            incidentId: uniqueIncId,
            deviceId: 'ANDROID_PIXEL8_PRO',
            title: 'Duplicate Retry Incident',
            latitude: 18.5255,
            longitude: 73.8580
        });

        if (duplicateRes.status !== 200) throw new Error(`Expected HTTP 200 for idempotent duplicate, got ${duplicateRes.status}`);
        const returnedId = duplicateRes.data.incidentId || duplicateRes.data.id;
        if (returnedId !== uniqueIncId) throw new Error(`Idempotency returned wrong ID: ${returnedId}`);
    });

    // Step 7: Operator Dispatch State Transition
    await test('Operator Dispatch Confirmation (POST /api/incidents/:id/dispatch)', async () => {
        const ambId = createdIncident.assignedAmbulance || createdIncident.ambulanceId || 'AMB-01';
        const res = await axios.post(`${BACKEND_URL}/api/incidents/${uniqueIncId}/dispatch`, {
            ambulanceId: ambId
        });

        if (res.status !== 200 || res.data.incident.status !== 'EN_ROUTE') {
            throw new Error(`Dispatch state transition failed: status is ${res.data.incident?.status}`);
        }
    });

    // Step 8: Live Fleet Telemetry GPS Streaming
    await test('Live Vehicle Telemetry Stream (POST /api/fleet/ambulances/:id/telemetry)', async () => {
        const ambId = createdIncident.assignedAmbulance || createdIncident.ambulanceId || 'AMB-01';
        const res = await axios.post(`${BACKEND_URL}/api/fleet/ambulances/${ambId}/telemetry`, {
            lat: 18.5270,
            lng: 73.8500,
            status: 'EN_ROUTE',
            speed: 62.5
        });

        if (res.status !== 200 || !res.data.success) {
            throw new Error('Telemetry update failed');
        }
    });

    // Step 9: Dynamic Ambulance Failover
    await test('Dynamic Fleet Failover Re-routing (POST /api/incidents/:id/failover)', async () => {
        const res = await axios.post(`${BACKEND_URL}/api/incidents/${uniqueIncId}/failover`, {});
        if (res.status !== 200 || !res.data.success) {
            throw new Error(`Failover failed: ${res.data.error || 'Unknown error'}`);
        }
        if (!res.data.newAmbulance) throw new Error('Secondary failover ambulance was not allocated');
        if (!res.data.incident.route || !res.data.incident.route.geometry) throw new Error('Failover route recalculation failed');
    });

    // Step 10: Hospital Pre-Alert Delivery
    await test('Hospital Trauma Pre-Alert Vault (POST /api/fleet/hospitals/:id/alert)', async () => {
        const hospId = seedHosp.id || 'HOSP-01';
        const alertPayload = {
            incidentId: uniqueIncId,
            severity: 95,
            etaMinutes: 4,
            patientCount: 1,
            userMedicalInfo: 'Blood: O- | Allergies: Penicillin',
            triageNotes: 'High-Impact Vehicle Rollover'
        };

        const res = await axios.post(`${BACKEND_URL}/api/fleet/hospitals/${hospId}/alert`, alertPayload);
        if (res.status !== 200 || !res.data.success) {
            throw new Error('Hospital pre-alert submission failed');
        }
    });

    // Step 11: Non-Destructive Incident Resolution & Audit History
    await test('Incident Resolution & History Archive (POST /api/incidents/:id/resolve)', async () => {
        const res = await axios.post(`${BACKEND_URL}/api/incidents/${uniqueIncId}/resolve`, {
            reason: 'Patient safely admitted to Trauma ICU'
        });

        if (res.status !== 200 || res.data.incident.status !== 'RESOLVED') {
            throw new Error('Incident resolution status transition failed');
        }
        if (!res.data.incident.resolvedAt) throw new Error('resolvedAt timestamp missing');
    });

    // Step 12: Degraded / Unavailable GPS Handling
    await test('Degraded / Unavailable GPS Fallback Handling (No Data Loss)', async () => {
        const degradedId = `RNQ-TUNNEL-${Date.now()}`;
        const res = await axios.post(`${BACKEND_URL}/api/incidents/detect`, {
            id: degradedId,
            incidentId: degradedId,
            deviceId: 'ANDROID_TEST',
            title: 'Underground Tunnel Crash (No GPS)',
            latitude: 0.0,
            longitude: 0.0,
            gpsAccuracy: 999.0,
            locationQuality: 'UNAVAILABLE',
            gForce: 4.8,
            confidence: 0.94,
            severity: 85
        });

        if (res.status !== 201 && res.status !== 200) {
            throw new Error('Degraded GPS incident was rejected');
        }
    });

    // Step 13: Real-Time WebSocket Delivery Verification
    await test('Real-Time WebSocket Emission Verification (No Browser Refresh)', async () => {
        if (!socketReceivedNew && !socketReceivedUpdate) {
            // Check if socket got at least one broadcast during the test flow
            throw new Error('Socket.IO did not receive incident emissions');
        }
    });

    socket.disconnect();

    console.log('\n===============================================================');
    console.log(`🎉 FULL SYSTEM INTEGRATION AUDIT: ${passed}/${total} STEPS PASSED (${Math.round((passed/total)*100)}%)`);
    console.log('===============================================================\n');

    if (passed === total) {
        process.exit(0);
    } else {
        process.exit(1);
    }
}

runFullSystemIntegration();
