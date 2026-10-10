/**
 * ResQNet CCTV & Computer Vision End-to-End Backend Integration Test Suite
 * Uses native fetch for dependency-free, robust execution.
 * Tests camera registry, authentication, health metrics, optical event ingestion,
 * OSRM routing, hospital pre-alerts, and Bayesian multi-source correlation.
 */

const BASE_URL = 'http://localhost:5000/api';
const AUTH_TOKEN = 'resqnet-cctv-secure-token-2026';
const HEADERS = {
    'Content-Type': 'application/json',
    'x-cctv-auth-token': AUTH_TOKEN
};

let passed = 0;
let total = 0;

function assert(condition, message) {
    total++;
    if (condition) {
        passed++;
        console.log(`  [OK] Test ${total}: ${message}`);
    } else {
        console.error(`  [FAIL] Test ${total}: ${message}`);
        throw new Error(`Assertion failed: ${message}`);
    }
}

async function request(url, options = {}) {
    const res = await fetch(url, options);
    const text = await res.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        data = text;
    }
    return { status: res.status, data, headers: res.headers };
}

async function runTests() {
    console.log('\n=======================================================');
    console.log('🧪 Starting ResQNet YOLO/CCTV Backend Integration Suite');
    console.log('=======================================================\n');

    // 0. Reset Demo State
    try {
        await request(`${BASE_URL}/incidents/demo/reset`, { method: 'POST' });
    } catch (e) { }

    // 1. Health API Subsystem Check
    console.log('--- Step 1: CCTV Subsystem Health Verification ---');
    const healthRes = await request(`${BASE_URL}/health`);
    assert(healthRes.status === 200, 'GET /api/health returned 200 OK');
    assert(healthRes.data.cctv === 'ONLINE', 'CCTV subsystem reported as ONLINE');
    assert(healthRes.data.cctvCamerasOnline >= 4, `CCTV online cameras count >= 4 (actual: ${healthRes.data.cctvCamerasOnline})`);

    // 2. Camera Registry Endpoints
    console.log('\n--- Step 2: CCTV Camera Registry Verification ---');
    const camsRes = await request(`${BASE_URL}/cctv/cameras`);
    assert(camsRes.status === 200, 'GET /api/cctv/cameras returned 200 OK');
    assert(Array.isArray(camsRes.data) && camsRes.data.length >= 4, 'Returned registered camera array');
    
    const cam1 = camsRes.data.find(c => c.id === 'CCTV-01' || c.cameraId === 'CCTV-01' || c.cameraId === 'CCTV-PUNE-JUNCTION-01');
    assert(cam1 !== undefined, 'Found camera CCTV-01 in registry');
    assert(cam1.lat === 18.5308 || cam1.latitude === 18.5308, 'CCTV-01 latitude is 18.5308');
    assert(cam1.lng === 73.8290 || cam1.longitude === 73.8290, 'CCTV-01 longitude is 73.8290');

    // 3. Dynamic Camera Registration
    console.log('\n--- Step 3: Dynamic Camera Registration (POST /api/cctv/register) ---');
    const newCamPayload = {
        camera_id: 'CCTV-TEST-99',
        camera_name: 'Koregaon Park North Main Road Junction',
        latitude: 18.5362,
        longitude: 73.8940,
        road: 'North Main Road',
        direction: 'WESTBOUND',
        source_type: 'rtsp',
        status: 'ONLINE'
    };
    const regRes = await request(`${BASE_URL}/cctv/register`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(newCamPayload)
    });
    assert(regRes.status === 201, 'POST /api/cctv/register returned 201 Created');
    assert(regRes.data.success === true, 'Registration success is true');

    const checkReg = await request(`${BASE_URL}/cctv/cameras/CCTV-TEST-99`);
    assert(checkReg.status === 200, 'Lookup GET /api/cctv/cameras/CCTV-TEST-99 returned 200 OK');
    assert(checkReg.data.cameraName.includes('Koregaon Park'), 'Verified registered camera name');

    // 4. Ingest Camera Health Heartbeat
    console.log('\n--- Step 4: Camera Health Heartbeat Telemetry (POST /api/cctv/health) ---');
    const heartbeatPayload = {
        camera_id: 'CCTV-TEST-99',
        fps: 28.5,
        inference_latency_ms: 32.4,
        status: 'ONLINE'
    };
    const hbRes = await request(`${BASE_URL}/cctv/health`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(heartbeatPayload)
    });
    assert(hbRes.status === 200, 'POST /api/cctv/health returned 200 OK');
    
    const cctvHealthRes = await request(`${BASE_URL}/cctv/health`);
    assert(cctvHealthRes.data.onlineCameras >= 5, 'Network aggregate reflects registered online cameras');

    // 5. Independent CCTV Optical Accident Event Ingestion
    console.log('\n--- Step 5: Independent CCTV Optical Accident Ingestion (POST /api/cctv/events) ---');
    const incId1 = `RNQ-TEST-CCTV-${Date.now().toString().slice(-4)}`;
    const eventPayload = {
        id: incId1,
        cameraId: 'CCTV-01',
        latitude: 18.5308,
        longitude: 73.8290,
        confidence: 0.94,
        patients: 2,
        isDemo: true,
        evidence: {
            spatial_collision: true,
            max_iou: 0.44,
            rapid_deceleration: true,
            involved_track_ids: [1, 2],
            is_confirmed: true
        }
    };
    const eventRes = await request(`${BASE_URL}/cctv/events`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(eventPayload)
    });
    assert(eventRes.status === 201, 'POST /api/cctv/events created new incident with HTTP 201');
    assert(eventRes.data.incidentId === incId1, 'Incident ID matches payload');
    assert(eventRes.data.confidence >= 90, `Fused confidence >= 90% (actual: ${eventRes.data.confidence}%)`);
    assert(eventRes.data.severity >= 80, `Assessed severity >= 80/100 (actual: ${eventRes.data.severity})`);
    assert(eventRes.data.assignedAmbulance !== null, `Ambulance assigned: ${eventRes.data.assignedAmbulance}`);
    assert(eventRes.data.assignedHospital !== null, `Hospital assigned: ${eventRes.data.assignedHospital}`);
    assert(eventRes.data.route && eventRes.data.route.geometry, 'Turn-by-turn emergency route geometry generated');
    assert(eventRes.data.hospitalPreAlert !== null, 'Zero-Minute Hospital Pre-Alert dispatched');

    // 6. Idempotency Check
    console.log('\n--- Step 6: Idempotent Resubmission Check ---');
    const dupRes = await request(`${BASE_URL}/cctv/events`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(eventPayload)
    });
    assert(dupRes.status === 200, 'Duplicate submission returned 200 OK');
    assert(dupRes.data.incidentId === incId1, 'Returned existing incident ID without duplicate dispatch');

    // 7. Multi-Source Bayesian Fusion & Spatial-Temporal Correlation Check
    console.log('\n--- Step 7: Multi-Source Spatial-Temporal Correlation (CCTV + Smartphone IMU) ---');
    const phonePayload = {
        source: 'smartphone',
        sourceType: 'smartphone',
        latitude: 18.5309,
        longitude: 73.8291,
        gForce: 5.4,
        speedDeltaKmh: 58.0,
        confidence: 0.95,
        isDemo: true
    };
    const phoneRes = await request(`${BASE_URL}/incidents/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(phonePayload)
    });
    assert(phoneRes.status === 200, 'POST /api/incidents/detect correlated report (HTTP 200)');
    assert(phoneRes.data.fused === true, 'Backend returned fused = true');
    assert(phoneRes.data.incidentId === incId1, `Correlated into existing incident ${incId1}`);

    // Verify fused incident in database
    const fusedInc = await request(`${BASE_URL}/incidents/${incId1}`);
    assert(fusedInc.data.sources.length >= 2, `Incident sources count >= 2 (actual: ${fusedInc.data.sources.length})`);
    assert(fusedInc.data.sources.some(s => s.source === 'cctv'), 'Contains CCTV optical source');
    assert(fusedInc.data.sources.some(s => s.source === 'smartphone'), 'Contains Smartphone IMU source');
    assert(fusedInc.data.confidence >= 95, `Multi-source Bayesian confidence boosted to ${fusedInc.data.confidence}%`);

    console.log('\n=======================================================');
    console.log(`✅ CCTV Backend Integration Test Passed: ${passed}/${total} assertions (100%)`);
    console.log('=======================================================\n');
}

runTests().catch(err => {
    console.error('\n❌ Test Suite Failed:', err.message);
    process.exit(1);
});
