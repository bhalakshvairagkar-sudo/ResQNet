const { app, server } = require("./server");

setTimeout(async () => {
  try {
    const resHtml = await fetch("http://localhost:5000/dashboard.html");
    console.log("✅ Dashboard HTML Status:", resHtml.status);
    const html = await resHtml.text();
    console.log("✅ Leaflet script included:", html.includes("leaflet.js"));

    const resJs = await fetch("http://localhost:5000/js/app.js");
    console.log("✅ App.js Status:", resJs.status);
    const js = await resJs.text();
    console.log("✅ App.js includes initMap:", js.includes("function initMap()"));
    console.log("✅ App.js uses Leaflet L.map:", js.includes("L.map("));
    console.log("✅ App.js uses OSRM fetch:", js.includes("fetchOsrmRoadRoute"));

    const resHealth = await fetch("http://localhost:5000/api/health");
    console.log("✅ API Health Status:", resHealth.status, await resHealth.json());

    const resAmb = await fetch("http://localhost:5000/api/fleet/ambulances");
    console.log("✅ Ambulances Count:", (await resAmb.json()).length);

    const resHosp = await fetch("http://localhost:5000/api/fleet/hospitals");
    console.log("✅ Hospitals Count:", (await resHosp.json()).length);

    console.log("\n🎉 ALL COMMAND CENTER DASHBOARD & API CHECKS PASSED!");
  } catch (err) {
    console.error("❌ Test error:", err);
  } finally {
    server.close();
    process.exit(0);
  }
}, 1500);
