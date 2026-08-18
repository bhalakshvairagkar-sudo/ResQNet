/**
 * ResQNet Competition Live Demonstration Simulator
 * Simulates real-time Android G-Sensor spikes, CCTV optical alerts, and live ambulance driving telemetry.
 */

const axios = require('../backend/node_modules/axios');
const io = require('../backend/node_modules/socket.io-client');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

async function runDemoSimulation() {
    console.log('\n===============================================================');
    console.log('🚨 RESQNET END-TO-END CRASH DETECTION & DISPATCH SIMULATOR 🚨');
    console.log(`Connecting to Backend: ${BACKEND_URL}`);
    console.log('===============================================================\n');

    // 1. Connect Socket.IO client to listen for real-time broadcasts
    const socket = io(BACKEND_URL);

    socket.on('connect', () => {
        console.log(`[Socket] Connected to ResQNet Hub as Test Agent (ID: ${socket.id})`);
    });

    socket.on('incident:new', (inc) => {
        console.log(`\n🔔 [BROADCAST RECEIVED] New Incident Ingested: ${inc.id}`);
        console.log(`   - Title: ${inc.title || inc.incidentType}`);
        console.log(`   - Severity: ${inc.severity}/100 | Confidence: ${Math.round((inc.confidence || 0.95) * 100)}%`);
        console.log(`   - Assigned Ambulance: ${inc.ambulanceId || inc.assignedAmbulance} (${inc.ambulanceReason || 'Optimal ALS Unit'})`);
        console.log(`   - Matched Trauma Center: ${inc.hospitalId || inc.assignedHospital} (${inc.hospitalReason || 'Level-1 Trauma Certified'})\n`);
    });

    socket.on('incident:update', (inc) => {
        console.log(`📡 [BROADCAST UPDATE] Incident ${inc.id} State Transition: -> ${inc.state || inc.status}`);
    });

    socket.on('ambulance:telemetry', (amb) => {
        console.log(`🚑 [AMBULANCE TELEMETRY] Unit ${amb.code || amb.id} Location: (${amb.lat ? amb.lat.toFixed(4) : amb.latitude}, ${amb.lng ? amb.lng.toFixed(4) : amb.longitude})`);
    });

    // 2. Wait 1 second then simulate a severe Android Crash Detection event
    setTimeout(async () => {
        console.log('📱 [Simulating] Android Accelerometer Crash Trigger...');
        const crashPayload = {
            title: 'Highway 48 Multi-Vehicle Collision (Android Sensor Alert)',
            incidentType: 'Road collision (no CCTV coverage)',
            latitude: 18.5255,
            longitude: 73.8580,
            sourceType: 'smartphone',
            source: 'smartphone',
            gForce: 5.2,
            speedKmh: 75,
            speedDeltaKmh: 60,
            rollover: true,
            confidence: 0.96,
            confidenceScore: 96,
            severity: 100,
            patients: 2,
            isDemo: false,
            userMedicalInfo: 'Blood: A+ | Emergency Contact: +91-9876543210'
        };

        try {
            const res = await axios.post(`${BACKEND_URL}/api/incidents/detect`, crashPayload);
            const created = res.data.incident || res.data;
            const incId = created.id || created._id;
            const ambId = created.ambulanceId || created.assignedAmbulance || 'AMB-02';
            console.log(`✅ [HTTP 201] Crash Ingested: ID ${incId}`);

            // 3. Simulate Operator Dispatch after 2 seconds
            setTimeout(async () => {
                console.log(`\n👨‍💼 [Simulating] Operations Hub Operator clicks "Confirm & Dispatch"...`);
                await axios.post(`${BACKEND_URL}/api/incidents/${incId}/dispatch`, {
                    ambulanceId: ambId
                });

                // 4. Simulate Live GPS Movement of the dispatched ambulance
                console.log(`\n🚑 [Simulating] Unit ${ambId} Driving Telemetry GPS Stream...`);
                let currentLat = 18.5300;
                let currentLng = 73.8400;
                const targetLat = created.latitude;
                const targetLng = created.longitude;

                let step = 0;
                const interval = setInterval(async () => {
                    step++;
                    currentLat += (targetLat - currentLat) * 0.25;
                    currentLng += (targetLng - currentLng) * 0.25;

                    await axios.post(`${BACKEND_URL}/api/fleet/ambulances/${ambId}/telemetry`, {
                        lat: currentLat,
                        lng: currentLng,
                        status: 'EN_ROUTE',
                        speed: 65
                    });

                    if (step >= 4) {
                        clearInterval(interval);
                        console.log(`\n🎯 [Simulating] Ambulance Arrived at Crash Site!`);
                        console.log(`\n===============================================================`);
                        console.log(`🎉 Demo Flow Completed Successfully! Check your Ops Dashboard.`);
                        console.log(`===============================================================\n`);
                        setTimeout(() => {
                            socket.disconnect();
                            process.exit(0);
                        }, 1000);
                    }
                }, 800);

            }, 2000);

        } catch (err) {
            console.error('❌ Simulation error:', err.message);
        }
    }, 1200);
}

runDemoSimulation();
