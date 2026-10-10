const db = require('./database/db');
const auth = require('./services/authService');
const AIEngine = require('./services/aiEngine');

async function runTest() {
  console.log('🧪 Starting Hospital Pre-Alert & Patient Dossier Integration Test...\n');

  try {
    // 1. Authenticate as Sassoon General Hospital (HOSP-01)
    const session = await auth.login('sassoon_trauma01', 'Sassoon@RQN26!');
    if (!session || !session.token) {
      throw new Error('❌ Authentication failed for sassoon_trauma01');
    }
    console.log(`✅ Hospital Authentication Succeeded: ${session.fullName} (${session.resourceId})`);

    // 2. Clear demo data and ingest a simulated crash incident
    await db.resetDemoData();

    const crashPayload = {
      id: `RNQ-TEST-${Date.now().toString().slice(-4)}`,
      source: 'smartphone',
      incidentType: 'Severe Two-Wheeler Collision',
      latitude: 18.5280,
      longitude: 73.8720,
      gForce: 6.2,
      speedDeltaKmh: 58,
      severity: 92,
      confidence: 0.98,
      userMedicalInfo: 'Blood: O+ POSITIVE | Allergies: Penicillin, Sulfa | ICE: Suresh Deshmukh (+91 98220 12345)',
      isDemo: true
    };

    console.log(`📡 Ingesting Test Crash Incident (${crashPayload.id})...`);
    
    const hospitalObj = await db.getHospital('HOSP-01');
    const ambObj = await db.getAmbulance('AMB-01');

    const defaultProfile = {
      fullName: 'Aditya Deshmukh',
      bloodGroup: 'O+ POSITIVE',
      dateOfBirth: '1996-08-14',
      gender: 'Male',
      allergies: ['Penicillin', 'Sulfa Drugs'],
      chronicConditions: ['Asthma (Mild)'],
      currentMedications: 'Salbutamol Inhaler (PRN)',
      primaryContact: {
        name: 'Suresh Deshmukh (Father)',
        phone: '+91 98220 12345',
        relation: 'Father / Next-of-Kin'
      },
      specialNotes: 'No prior surgical complications. Emergency Vault Armed.'
    };

    const preAlert = AIEngine.buildHospitalPreAlert(crashPayload, ambObj, hospitalObj, defaultProfile);

    // Ingest via direct internal simulation
    const createdIncident = {
      id: crashPayload.id,
      incidentId: crashPayload.id,
      title: crashPayload.incidentType,
      latitude: crashPayload.latitude,
      longitude: crashPayload.longitude,
      severity: crashPayload.severity,
      confidence: 98,
      status: 'VERIFIED',
      assignedAmbulance: 'AMB-01',
      assignedHospital: hospitalObj.name,
      hospitalId: 'HOSP-01',
      hospitalAcknowledged: false,
      hospitalPreAlert: preAlert,
      patientProfile: defaultProfile,
      createdAt: new Date().toISOString()
    };

    await db.saveIncident(createdIncident);
    console.log(`✅ Incident ${createdIncident.id} saved to datastore.`);

    // 3. Test Hospital Alerts Pending Retrieval
    const incidents = await db.getAllIncidents();
    const matched = incidents.filter(i => i.status !== 'RESOLVED' && (i.hospitalId === 'HOSP-01' || i.assignedHospital === hospitalObj.name));

    if (matched.length === 0) {
      throw new Error('❌ Hospital pending alert matching failed');
    }
    console.log(`✅ Found ${matched.length} pending alert(s) for ${hospitalObj.name}`);

    const targetAlert = matched[0];
    if (!targetAlert.patientProfile || targetAlert.patientProfile.bloodGroup !== 'O+ POSITIVE') {
      throw new Error('❌ Patient profile or blood group missing in pre-alert payload');
    }
    console.log(`✅ Pre-Alert Patient Clinical Dossier Verified:`);
    console.log(`   • Patient Name: ${targetAlert.patientProfile.fullName}`);
    console.log(`   • Blood Group: ${targetAlert.patientProfile.bloodGroup}`);
    console.log(`   • Allergies: ${targetAlert.patientProfile.allergies.join(', ')}`);
    console.log(`   • Emergency Contact: ${targetAlert.patientProfile.primaryContact.name} (${targetAlert.patientProfile.primaryContact.phone})`);
    console.log(`   • Chronic Conditions: ${targetAlert.patientProfile.chronicConditions.join(', ')}`);

    // 4. Test Hospital Acknowledgment
    const updated = await db.updateIncident(targetAlert.id, {
      hospitalAcknowledged: true,
      hospitalAckAt: new Date().toISOString(),
      hospitalAckBy: hospitalObj.name
    });

    if (!updated.hospitalAcknowledged) {
      throw new Error('❌ Hospital acknowledgment failed');
    }
    console.log(`✅ Hospital Pre-Alert Acknowledged by ${updated.hospitalAckBy} at ${updated.hospitalAckAt}`);

    console.log('\n🎉 ALL HOSPITAL PRE-ALERT & PATIENT CLINICAL DOSSIER TESTS PASSED SUCCESSFULLY!\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Test Failure:', err.message);
    process.exit(1);
  }
}

runTest();
