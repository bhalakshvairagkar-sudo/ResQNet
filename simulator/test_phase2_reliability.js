/**
 * ResQNet Phase 2: Reliability & Emergency Continuity Test Suite
 * Validates Idempotency, GPS Fallback, Retry Resilience, and Backend Confirmation.
 */

const axios = require('../backend/node_modules/axios');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

async function runReliabilityTests() {
    console.log('\n===============================================================');
    console.log('🛡️  RESQNET PHASE 2: RELIABILITY & CONTINUITY TEST SUITE 🛡️');
    console.log(`Target Backend: ${BACKEND_URL}`);
    console.log('===============================================================\n');

    let passedTests = 0;
    let totalTests = 0;

    async function assertTest(name, fn) {
        totalTests++;
        process.stdout.write(`🧪 [Test ${totalTests}] ${name} ... `);
        try {
            await fn();
            console.log('✅ PASSED');
            passedTests++;
        } catch (err) {
            console.log(`❌ FAILED: ${err.message}`);
            if (err.response) {
                console.log(`   Response status: ${err.response.status}, Data:`, err.response.data);
            }
        }
    }

    // 1. Test Idempotency: Duplicate submissions with the same incident ID
    await assertTest('Server-Side Idempotency (Duplicate Retry with Same ID)', async () => {
        const stableId = `RNQ-IDEMPOTENT-${Date.now()}`;
        const payload = {
            id: stableId,
            incidentId: stableId,
            deviceId: 'ANDROID_PIXEL_8',
            userId: 'USER_DRIVER_99',
            title: 'Idempotency Collision Verification',
            // Isolate idempotency from the production spatial-correlation window.
            latitude: 20.0 + (Date.now() % 1000) / 100000,
            longitude: 75.0 + (Date.now() % 1000) / 100000,
            gForce: 4.5,
            confidence: 0.95,
            severity: 85,
            isDemo: true
        };

        // First attempt (Simulating initial submission)
        const res1 = await axios.post(`${BACKEND_URL}/api/incidents/detect`, payload);
        if (res1.status !== 201 && res1.status !== 200) {
            throw new Error(`Initial submission failed with status ${res1.status}`);
        }

        // Second attempt (Simulating network retry of same incident)
        const res2 = await axios.post(`${BACKEND_URL}/api/incidents/detect`, payload);
        if (res2.status !== 200 && res2.status !== 201) {
            throw new Error(`Retry submission failed with status ${res2.status}`);
        }

        const id1 = res1.data.incidentId || res1.data.id;
        const id2 = res2.data.incidentId || res2.data.id;

        if (id1 !== id2 || id1 !== stableId) {
            throw new Error(`Idempotency broken: Expected ${stableId}, got ${id1} vs ${id2}`);
        }
    });

    // 2. Test Degraded / Missing GPS Fallback
    await assertTest('Degraded GPS Fallback Ingestion (No silent failure)', async () => {
        const degradedId = `RNQ-DEGRADED-${Date.now()}`;
        const degradedPayload = {
            id: degradedId,
            incidentId: degradedId,
            deviceId: 'ANDROID_PIXEL_8',
            title: 'Underground Tunnel Crash (GPS Unavailable)',
            latitude: 0.0,
            longitude: 0.0,
            gpsAccuracy: 999.0,
            locationQuality: 'UNAVAILABLE',
            gForce: 5.8,
            confidence: 0.98,
            severity: 95,
            isDemo: true
        };

        const res = await axios.post(`${BACKEND_URL}/api/incidents/detect`, degradedPayload);
        if (res.status !== 201 && res.status !== 200) {
            throw new Error(`Failed to ingest degraded GPS incident: ${res.status}`);
        }
        if (!res.data.success) {
            throw new Error('Backend response reported success: false');
        }
    });

    // 3. Test Fleet Dispatch and State Transition Integrity
    await assertTest('Fleet Dispatch State Transition (VERIFIED -> EN_ROUTE)', async () => {
        // Earlier test incidents are demo-only. Resetting here makes selection deterministic
        // without touching non-demo incident records.
        await axios.post(`${BACKEND_URL}/api/incidents/demo/reset`);
        const incId = `RNQ-DISPATCH-${Date.now()}`;
        const createRes = await axios.post(`${BACKEND_URL}/api/incidents/detect`, {
            id: incId,
            incidentId: incId,
            deviceId: 'ANDROID_PIXEL_8',
            title: 'Highway Rapid Dispatch Test',
            latitude: 18.5255,
            longitude: 73.8580,
            severity: 90,
            isDemo: true
        });

        const ambId = createRes.data.assignedAmbulance || 'AMB-01';
        const dispatchRes = await axios.post(`${BACKEND_URL}/api/incidents/${incId}/dispatch`, {
            ambulanceId: ambId
        });

        if (dispatchRes.status !== 200 || dispatchRes.data.incident.status !== 'EN_ROUTE') {
            throw new Error(`Status transition failed: ${dispatchRes.data.incident?.status}`);
        }
        await axios.post(`${BACKEND_URL}/api/incidents/${incId}/resolve`, { reason: 'Reliability test cleanup' });
    });

    // 4. Test Health & Telemetry System Endpoints
    await assertTest('System Health Diagnostics (/api/health)', async () => {
        const healthRes = await axios.get(`${BACKEND_URL}/api/health`);
        if (healthRes.status !== 200 || !healthRes.data.status) {
            throw new Error('Health check returned non-200');
        }
    });

    console.log('\n===============================================================');
    console.log(`📊 Reliability Test Results: ${passedTests}/${totalTests} Tests Passed (${Math.round((passedTests/totalTests)*100)}%)`);
    console.log('===============================================================\n');

    if (passedTests === totalTests) {
        process.exit(0);
    } else {
        process.exit(1);
    }
}

runReliabilityTests();
