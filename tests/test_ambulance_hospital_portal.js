const axios = require('../backend/node_modules/axios');
const io = require('../backend/node_modules/socket.io-client');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

async function runPortalTests() {
    console.log('\n===============================================================');
    console.log('🚑 RESQNET AMBULANCE & HOSPITAL OPERATIONS PORTAL AUDIT 🏥');
    console.log(`Target Backend: ${BACKEND_URL}`);
    console.log('===============================================================\n');

    let passed = 0;
    let total = 0;

    async function test(name, fn) {
        total++;
        process.stdout.write(`🧪 [PORTAL.${total.toString().padStart(2, '0')}] ${name} ... `);
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

    // 0. Reset demo state
    try {
        await axios.post(`${BACKEND_URL}/api/incidents/demo/reset`);
    } catch (e) {}

    // Socket client setup
    let ambAlertReceived = false;
    let hospAlertReceived = false;
    const socket = io(BACKEND_URL, { transports: ['websocket', 'polling'] });
    socket.on('ambulance:alert', (a) => { ambAlertReceived = true; });
    socket.on('hospital:alert', (h) => { hospAlertReceived = true; });
    await new Promise(r => setTimeout(r, 500));

    // 1. Create a high-severity emergency incident
    const testIncId = `RNQ-PORTAL-${Date.now().toString().slice(-4)}`;
    let incident;
    await test('Ingest Emergency Collision Incident (POST /api/incidents/detect)', async () => {
        const res = await axios.post(`${BACKEND_URL}/api/incidents/detect`, {
            id: testIncId,
            incidentId: testIncId,
            source: 'cctv',
            title: 'Critical Intersection Crash at University Circle',
            latitude: 18.5308,
            longitude: 73.8290,
            severity: 92,
            confidence: 0.95,
            isDemo: true
        });
        if (res.status !== 201 && res.status !== 200) throw new Error(`Unexpected status: ${res.status}`);
        incident = res.data.incident || res.data;
    });

    // 2. Verify WebSocket alert broadcast
    await test('Verify Real-Time WebSocket Alerts Broadcasted to Units', async () => {
        await new Promise(r => setTimeout(r, 400));
        if (!ambAlertReceived) throw new Error('Ambulance WebSocket alert not received');
        if (!hospAlertReceived) throw new Error('Hospital WebSocket alert not received');
    });

    // 3. Query Pending Alerts for Ambulance AMB-01
    let ambAlerts;
    await test('Fetch Ambulance Pending Alerts (GET /api/incidents/alerts/pending?role=AMBULANCE)', async () => {
        const res = await axios.get(`${BACKEND_URL}/api/incidents/alerts/pending?role=AMBULANCE&resourceId=AMB-01`);
        if (res.status !== 200 || !Array.isArray(res.data) || res.data.length === 0) {
            throw new Error('No pending alerts returned for AMB-01');
        }
        ambAlerts = res.data;
        const alert = ambAlerts[0];
        if (!alert.incidentId || !alert.mapUrl || alert.mapUrl.indexOf('google.com') === -1) {
            throw new Error('Alert structure invalid or missing Google Maps navigation URL');
        }
    });

    // 4. Ambulance Accepts Dispatch
    await test('Ambulance Accepts Dispatch (POST /api/incidents/:id/accept)', async () => {
        const res = await axios.post(`${BACKEND_URL}/api/incidents/${testIncId}/accept`, {
            ambulanceId: 'AMB-01'
        });
        if (res.status !== 200 || !res.data.success) throw new Error('Accept dispatch returned false');
        const updated = res.data.incident;
        if (updated.status !== 'EN_ROUTE') throw new Error(`Incident status is ${updated.status}, expected EN_ROUTE`);
    });

    // 5. Query Pending Alerts for Hospital
    let hospAlerts;
    await test('Fetch Hospital Pending Pre-Alerts (GET /api/incidents/alerts/pending?role=HOSPITAL)', async () => {
        const res = await axios.get(`${BACKEND_URL}/api/incidents/alerts/pending?role=HOSPITAL&resourceId=HOSP-04`);
        if (res.status !== 200 || !Array.isArray(res.data) || res.data.length === 0) {
            throw new Error('No pending pre-alerts returned for Hospital');
        }
        hospAlerts = res.data;
        const hAlert = hospAlerts[0];
        if (!hAlert.incomingAmbulance || hAlert.etaMinutes === undefined) {
            throw new Error('Hospital pre-alert missing incoming ambulance or ETA');
        }
    });

    // 6. Hospital Acknowledges Trauma Pre-Alert
    await test('Hospital Acknowledges Pre-Alert (POST /api/incidents/:id/hospital-ack)', async () => {
        const res = await axios.post(`${BACKEND_URL}/api/incidents/${testIncId}/hospital-ack`);
        if (res.status !== 200 || !res.data.success) throw new Error('Hospital ack returned false');
        const updated = res.data.incident;
        if (!updated.hospitalAcknowledged) throw new Error('hospitalAcknowledged flag was not set to true');
    });

    // 7. Resolve Mission
    await test('Resolve Emergency Mission (POST /api/incidents/:id/resolve)', async () => {
        const res = await axios.post(`${BACKEND_URL}/api/incidents/${testIncId}/resolve`, {
            reason: 'Patient delivered to trauma team'
        });
        if (res.status !== 200 || !res.data.success) throw new Error('Resolve failed');
    });

    socket.disconnect();

    console.log('\n===============================================================');
    console.log(`🎉 PORTAL TEST AUDIT: ${passed}/${total} PASSED (${Math.round((passed / total) * 100)}%)`);
    console.log('===============================================================\n');

    if (passed !== total) process.exit(1);
}

runPortalTests().catch(err => {
    console.error('Fatal Test Runner Error:', err);
    process.exit(1);
});
