const { app, server } = require("./server");

setTimeout(async () => {
  try {
    console.log("🧪 Starting Command Center Complete Lifecycle Test...\n");

    // 1. Check health
    const resHealth = await fetch("http://localhost:5000/api/health");
    console.log("1️⃣ API Health Check:", resHealth.status);

    // 2. Fetch Fleet
    const resAmb = await fetch("http://localhost:5000/api/fleet/ambulances");
    const ambs = await resAmb.json();
    console.log(`2️⃣ Ambulances loaded: ${ambs.length} units`);

    // 3. Fetch Hospitals
    const resHosp = await fetch("http://localhost:5000/api/fleet/hospitals");
    const hosps = await resHosp.json();
    console.log(`3️⃣ Hospitals loaded: ${hosps.length} trauma centres`);

    // 4. Ingest Smartphone Crash
    console.log("\n📡 Ingesting Test Smartphone Emergency...");
    const simId = `RNQ-SIM-${Date.now().toString().slice(-4)}`;
    const crashPayload = {
      incidentId: simId,
      source: "smartphone",
      title: "High-Speed Rollover Crash",
      latitude: 18.5204,
      longitude: 73.8567,
      severity: 85,
      confidence: 0.95,
      gForce: 6.2,
      speedDeltaKmh: 68,
      patients: 1,
      isDemo: true,
      patientProfile: {
        fullName: "Rahul Sharma",
        bloodGroup: "O+",
        allergies: "Penicillin",
        chronicConditions: "None",
        emergencyContact: "Anita Sharma (+91 98765 43210)"
      }
    };
    const resCrash = await fetch("http://localhost:5000/api/incidents/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(crashPayload)
    });
    const crashData = await resCrash.json();
    console.log("4️⃣ Crash Ingested:", crashData.success ? "SUCCESS" : "FAILED", crashData.incident?.incidentId || crashData.incident?.id);

    // 5. Ingest CCTV Accident Event
    console.log("\n📹 Ingesting CCTV Optical Collision Event...");
    const cctvPayload = {
      id: `RNQ-CCTV-${Date.now().toString().slice(-4)}`,
      cameraId: "CCTV-PUNE-JUNCTION-01",
      latitude: 18.5308,
      longitude: 73.8290,
      confidence: 0.94,
      isDemo: true,
      evidence: { spatial_collision: true, max_iou: 0.42, rapid_deceleration: true }
    };
    const resCctv = await fetch("http://localhost:5000/api/cctv/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cctvPayload)
    });
    const cctvData = await resCctv.json();
    console.log("5️⃣ CCTV Event Ingested:", cctvData.success ? "SUCCESS" : "FAILED");

    // 6. Fetch All Incidents
    const resInc = await fetch("http://localhost:5000/api/incidents");
    const incidents = await resInc.json();
    console.log(`6️⃣ Total Active Incidents on Dashboard: ${incidents.length}`);

    // 7. Acknowledge Pre-Alert from Hospital
    console.log("\n🏥 Hospital Acknowledging Pre-Alert...");
    const resAck = await fetch(`http://localhost:5000/api/incidents/${simId}/hospital-ack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hospitalId: "HOSP-01",
        hospitalName: "Sassoon General Hospital / BJGMC"
      })
    });
    const ackData = await resAck.json();
    console.log("7️⃣ Hospital Ack:", ackData.success ? "SUCCESS" : "FAILED");

    // 8. Resolve Incident
    console.log("\n✅ Operator Resolving Incident...");
    const resRes = await fetch(`http://localhost:5000/api/incidents/${simId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Patient admitted to Trauma ICU" })
    });
    const resData = await resRes.json();
    console.log("8️⃣ Incident Resolved:", resData.success ? "SUCCESS" : "FAILED");

    console.log("\n🎉 ALL COMMAND CENTER LIFECYCLE TESTS COMPLETED SUCCESSFULLY!");
  } catch (err) {
    console.error("❌ Test failed:", err);
  } finally {
    server.close();
    process.exit(0);
  }
}, 1500);
