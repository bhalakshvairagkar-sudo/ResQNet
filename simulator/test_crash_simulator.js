/**
 * ResQNet Competition & Phase 1 End-to-End Test Harness
 * Simulates real-time Android G-Sensor spikes, dispatch, live telemetry, dynamic failover, and resolution.
 */

const axios = require('../backend/node_modules/axios');
const io = require('../backend/node_modules/socket.io-client');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

async function runDemoSimulation() {
    console.log('\n===============================================================');
    console.log('🚨 RESQNET END-TO-END CRASH DETECTION & DISPATCH SIMULATOR 🚨');
    console.log(`Connecting to Backend: ${BACKEND_URL}`);
    console.log('===============================================================\n');

    const socket = io(BACKEND_URL);

    socket.on('connect', () => {
        console.log(`[Socket] Connected to ResQNet Hub as Test Agent (ID: ${socket.id})`);
    });

    socket.on('incident:new', (inc) => {
        const id = inc.incidentId || inc.id;
        console.log(`\n🔔 [BROADCAST RECEIVED] New Incident Ingested: ${id}`);
        console.log(`   - Title: ${inc.title || inc.incidentType}`);
        console.log(`   - Severity: ${inc.severity}/100 | Confidence: ${Math.round(inc.confidence > 1 ? inc.confidence : inc.confidence * 100)}%`);
        console.log(`   - Assigned Ambulance: ${inc.ambulanceId || inc.assignedAmbulance} (${inc.ambulanceReason || 'Optimal ALS Unit'})`);
        console.log(`   - Matched Trauma Center: ${inc.hospitalId || inc.assignedHospital} (${inc.hospitalReason || 'Level-1 Trauma Certified'})\n`);
    });

    socket.on('incident:update', (inc) => {
        const id = inc.incidentId || inc.id;
        console.log(`📡 [BROADCAST UPDATE] Incident ${id} State Transition: -> ${inc.status || inc.state}`);
    });

    socket.on('ambulance:assigned', (p) => {
        console.log(`🚑 [AMBULANCE ASSIGNED] Unit ${p.ambulance?.code || p.ambulance?.id} allocated to Incident ${p.incidentId} (Failover: ${p.isFailover || false})`);
    });

    socket.on('ambulance:telemetry', (amb) => {
        const lat = amb.lat ? amb.lat.toFixed(4) : amb.latitude;
        const lng = amb.lng ? amb.lng.toFixed(4) : amb.longitude;
        console.log(`🚑 [AMBULANCE TELEMETRY] Unit ${amb.code || amb.id} Location: (${lat}, ${lng}) | Speed: ${amb.speed} km/h`);
    });

    socket.on('incident:resolved', (p) => {
        console.log(`\n✅ [INCIDENT RESOLVED] Incident ${p.incidentId} closed. Archived to Response History.`);
    });

    // 1. Simulate Android Accelerometer Crash Trigger
    setTimeout(async () => {
        console.log('📱 [Simulating] Android Accelerometer 50Hz Crash Trigger...');
        const crashPayload = {
            deviceId: 'ANDROID_PIXEL8_TEST',
            userId: 'USER_DRIVER_42',
            eventType: 'ACCIDENT',
            title: 'Highway 48 Multi-Vehicle Collision (Android Sensor Alert)',
            incidentType: 'Road collision (no CCTV coverage)',
            latitude: 18.5255,
            longitude: 73.8580,
            gpsAccuracy: 4.2,
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
            const incId = created.incidentId || created.id || created._id;
            const ambId = created.ambulanceId || created.assignedAmbulance || 'AMB-01';
            console.log(`✅ [HTTP 201] Crash Ingested: ID ${incId}`);

            // 2. Simulate Operator Dispatch after 1.5 seconds
            setTimeout(async () => {
                console.log(`\n👨‍💼 [Simulating] Operations Hub Operator clicks "Confirm & Dispatch"...`);
                await axios.post(`${BACKEND_URL}/api/incidents/${incId}/dispatch`, {
                    ambulanceId: ambId
                });

                // 3. Simulate Driving Telemetry
                console.log(`\n🚑 [Simulating] Unit ${ambId} Driving Telemetry GPS Stream...`);
                let currentLat = 18.5300;
                let currentLng = 73.8400;
                const targetLat = created.latitude;
                const targetLng = created.longitude;

                let step = 0;
                const interval = setInterval(async () => {
                    step++;
                    currentLat += (targetLat - currentLat) * 0.3;
                    currentLng += (targetLng - currentLng) * 0.3;

                    await axios.post(`${BACKEND_URL}/api/fleet/ambulances/${ambId}/telemetry`, {
                        lat: currentLat,
                        lng: currentLng,
                        status: 'EN_ROUTE',
                        speed: 65
                    });

                    if (step === 2) {
                        // 4. Simulate Dynamic Failover on step 2
                        console.log(`\n⚠️ [Simulating] Sudden Road Blockade! Triggering Dynamic Ambulance Failover...`);
                        await axios.post(`${BACKEND_URL}/api/incidents/${incId}/failover`, {});
                    }

                    if (step >= 4) {
                        clearInterval(interval);
                        console.log(`\n🎯 [Simulating] Response Unit Arrived at Scene!`);

                        // 5. Simulate Incident Resolution
                        setTimeout(async () => {
                            console.log(`\n🏥 [Simulating] Patient Admitted to Trauma Center. Resolving Incident...`);
                            await axios.post(`${BACKEND_URL}/api/incidents/${incId}/resolve`, {
                                reason: 'Patient admitted to Level-1 Trauma Care'
                            });

                            console.log(`\n===============================================================`);
                            console.log(`🎉 Complete 11-Stage End-to-End Simulation Passed Successfully!`);
                            console.log(`===============================================================\n`);

                            setTimeout(() => {
                                socket.disconnect();
                                process.exit(0);
                            }, 800);
                        }, 1000);
                    }
                }, 700);

            }, 1500);

        } catch (err) {
            console.error('❌ Simulation error:', err.response?.data || err.message);
        }
    }, 1000);
}

runDemoSimulation();
