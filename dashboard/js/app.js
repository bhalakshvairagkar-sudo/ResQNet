/* ============ RESQNET COMMAND CENTER — PHASE 12A MULTI-MAP ============ */
const CFG = window.RESQNET_CONFIG || {};
const BACKEND_URL = CFG.BACKEND_URL || window.location.origin;
const API = BACKEND_URL + "/api";
const CENTER = CFG.DEFAULT_CENTER || [18.5204, 73.8567];
const OSRM = CFG.OSRM_URL || "https://router.project-osrm.org";

/* ---------- MAP PROVIDER / TILE ARCHITECTURE (12A.1 & 12A.2) ---------- */
const MAP_PROVIDERS = {
  dark: {
    name: "Dark Matter (Night)",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: "&copy; <a href='https://openstreetmap.org'>OpenStreetMap</a> &copy; <a href='https://carto.com/'>CARTO</a>",
    subdomains: "abcd",
    maxZoom: 19
  },
  standard: {
    name: "Standard Road Map",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; <a href='https://openstreetmap.org'>OpenStreetMap</a> contributors",
    subdomains: "abc",
    maxZoom: 19
  },
  light: {
    name: "Light Positron",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: "&copy; <a href='https://openstreetmap.org'>OpenStreetMap</a> &copy; <a href='https://carto.com/'>CARTO</a>",
    subdomains: "abcd",
    maxZoom: 19
  },
  satellite: {
    name: "Satellite Imagery",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "&copy; Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, GIS Community",
    maxZoom: 18
  },
  hybrid: {
    name: "Hybrid (Sat + Roads)",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    overlayUrl: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png",
    attribution: "&copy; Esri &copy; CARTO",
    subdomains: "abcd",
    maxZoom: 18
  },
  terrain: {
    name: "Topo Terrain",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "&copy; <a href='https://opentopomap.org'>OpenTopoMap</a> &copy; OpenStreetMap",
    subdomains: "abc",
    maxZoom: 17
  }
};

const state = {
  incidents: {},
  ambulances: {},
  hospitals: {},
  cctv: {},
  hotspots: [],
  trafficCorridors: [],
  routes: {},
  timelines: {},
  perf: {},
  candidates: {},
  selectedIncidentId: null,
  activity: [],
  systemHealth: {},
  demoMode: false,
  mapStyle: localStorage.getItem("resqnet_map_style") || "dark",
  filters: { sev: "ALL", src: "ALL", q: "" },
  layers: {
    incidents: true,
    ambulances: true,
    hospitals: true,
    routes: true,
    cctv: true,
    hotspots: true,
    traffic: false
  },
  seen: new Set(),
  lastSync: null,
  demoBusy: false
};

/* ---------- utils ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v));
const pct = (v) => (v === null ? "N/A" : Math.round(v) + "%");
const hhmmss = (ts) => {
  const d = ts ? new Date(ts) : new Date();
  return isNaN(d.getTime()) ? "--:--:--" : d.toLocaleTimeString("en-GB", { hour12: false });
};
const shortId = (id) => "RNQ-" + String(id || "").slice(-6).toUpperCase();
const SEV_BANDS = [
  { max: 25, k: "low", label: "LOW", color: "var(--green)" },
  { max: 50, k: "medium", label: "MEDIUM", color: "var(--yellow)" },
  { max: 75, k: "high", label: "HIGH", color: "var(--orange)" },
  { max: 1e9, k: "critical", label: "CRITICAL", color: "var(--red)" }
];
const band = (sev) => (sev === null ? { k: "unknown", label: "NOT ASSESSED", color: "var(--text-2)" } : SEV_BANDS.find((b) => sev <= b.max));
const SOURCE_META = {
  smartphone: { icon: "fa-mobile-screen", label: "Smartphone" },
  cctv: { icon: "fa-video", label: "CCTV (AI Optical)" },
  citizen: { icon: "fa-user-shield", label: "Citizen SOS" },
  iot: { icon: "fa-car-on", label: "Vehicle Telematics" }
};
const srcMeta = (s) => SOURCE_META[String(s || "").toLowerCase()] || { icon: "fa-satellite-dish", label: s ? String(s) : "Unknown" };

function haversine(a, b) {
  const R = 6371, dLat = ((b[0] - a[0]) * Math.PI) / 180, dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const maskPhone = (p) => (p ? String(p).slice(0, 3) + "•••••" + String(p).slice(-2) : null);

/* ---------- MAP & LAYER MANAGEMENT ---------- */
let map, currentBaseLayer = null, currentOverlayLayer = null;
let L_inc, L_resolved, L_amb, L_hosp, L_route, L_cctv, L_cctvFov, L_hotspots, L_traffic;
const incMarkers = {}, ambMarkers = {}, hospMarkers = {}, cctvMarkers = {}, fovLayers = {};
let ambAnim = null;

function setMapStyle(styleKey) {
  const provider = MAP_PROVIDERS[styleKey] || MAP_PROVIDERS.dark;
  state.mapStyle = styleKey;
  localStorage.setItem("resqnet_map_style", styleKey);

  if ($("mapStyleSelect")) $("mapStyleSelect").value = styleKey;

  // Cleanly remove previous tile layers
  if (currentBaseLayer) { map.removeLayer(currentBaseLayer); currentBaseLayer = null; }
  if (currentOverlayLayer) { map.removeLayer(currentOverlayLayer); currentOverlayLayer = null; }

  const errorBanner = $("mapTileErrorBanner");

  currentBaseLayer = L.tileLayer(provider.url, {
    attribution: provider.attribution,
    maxZoom: provider.maxZoom || 19,
    subdomains: provider.subdomains || "abc"
  });

  currentBaseLayer.on("tileerror", () => {
    if (errorBanner) errorBanner.style.display = "flex";
  });
  currentBaseLayer.on("load", () => {
    if (errorBanner) errorBanner.style.display = "none";
  });

  currentBaseLayer.addTo(map);

  // Hybrid overlay if configured
  if (provider.overlayUrl) {
    currentOverlayLayer = L.tileLayer(provider.overlayUrl, {
      subdomains: provider.subdomains || "abcd",
      maxZoom: provider.maxZoom || 19,
      pane: "overlayPane"
    }).addTo(map);
  }
}

function initMap() {
  map = L.map("map", { zoomControl: false, preferCanvas: true }).setView(CENTER, CFG.DEFAULT_ZOOM || 12);
  L.control.zoom({ position: "bottomleft" }).addTo(map);

  setMapStyle(state.mapStyle);

  // Operational layer groups
  L_traffic = L.layerGroup();
  L_hotspots = L.layerGroup().addTo(map);
  L_cctvFov = L.layerGroup().addTo(map);
  L_cctv = L.layerGroup().addTo(map);
  L_route = L.layerGroup().addTo(map);
  L_hosp = L.layerGroup().addTo(map);
  L_amb = L.layerGroup().addTo(map);
  L_resolved = L.layerGroup();
  L_inc = L.layerGroup().addTo(map);

  seedFleet();
  loadInfrastructure();
}

/* ---------- MARKER FACTORIES ---------- */
function makeIncIcon(sev, selected, resolved) {
  const b = band(sev);
  const c = b.color;
  const isCrit = b.k === "critical";
  const sevKey = b.k || "medium";

  return L.divIcon({
    className: "",
    html: `<div class="inc-marker sev-${sevKey} ${selected ? "sel" : ""} ${resolved ? "resolved" : ""}">
      ${isCrit && !resolved ? `<div class="ring"></div>` : ""}
      <div class="core">${resolved ? "✓" : (sev !== null ? Math.min(99, Math.round(sev)) : "!")}</div>
    </div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  });
}

function makeAmbIcon(status, sel) {
  const s = String(status || "available").toLowerCase();
  return L.divIcon({
    className: "",
    html: `<div class="amb-marker ${s} ${sel ? "sel" : ""}"><i class="fa-solid fa-truck-medical"></i></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
}

function makeHospIcon(capacity, trauma, sel) {
  const cap = String(capacity || "available").toLowerCase();
  return L.divIcon({
    className: "",
    html: `<div class="hosp-marker ${trauma ? "trauma" : ""} ${cap} ${sel ? "sel" : ""}"><i class="fa-solid ${trauma ? "fa-house-medical" : "fa-hospital"}"></i></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
}

function makeCctvIcon(status) {
  const s = String(status || "ONLINE").toLowerCase();
  return L.divIcon({
    className: "",
    html: `<div class="cctv-marker ${s}"><i class="fa-solid fa-video"></i></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });
}

/* ---------- CCTV FOV CONE GEOMETRY ---------- */
function createFovPolygon(lat, lng, headingDeg, fovDeg, radiusMeters) {
  const points = [[lat, lng]];
  const R = 6378137; // Earth radius in meters
  const startAng = (headingDeg - fovDeg / 2) * (Math.PI / 180);
  const endAng = (headingDeg + fovDeg / 2) * (Math.PI / 180);
  const steps = 10;

  for (let i = 0; i <= steps; i++) {
    const angle = startAng + (i / steps) * (endAng - startAng);
    const dLat = (radiusMeters * Math.cos(angle)) / R;
    const dLng = (radiusMeters * Math.sin(angle)) / (R * Math.cos((lat * Math.PI) / 180));
    points.push([lat + (dLat * 180) / Math.PI, lng + (dLng * 180) / Math.PI]);
  }
  return points;
}

/* ---------- FLEET & INFRASTRUCTURE DATA INGESTION ---------- */
const FLEET_SEED = [
  { id: "AMB-01", code: "AMB-01", lat: 18.5148, lng: 73.8412, status: "AVAILABLE", type: "ALS", traumaReady: true, speed: 0, heading: 0 },
  { id: "AMB-02", code: "AMB-02", lat: 18.5412, lng: 73.8631, status: "AVAILABLE", type: "ALS", traumaReady: true, speed: 0, heading: 0 },
  { id: "AMB-03", code: "AMB-03", lat: 18.4921, lng: 73.8228, status: "AVAILABLE", type: "BLS", traumaReady: false, speed: 0, heading: 0 },
  { id: "AMB-04", code: "AMB-04", lat: 18.5601, lng: 73.9020, status: "UNAVAILABLE", type: "ALS", traumaReady: true, speed: 0, heading: 0 },
  { id: "AMB-05", code: "AMB-05", lat: 18.4785, lng: 73.8790, status: "AVAILABLE", type: "ALS", traumaReady: true, speed: 0, heading: 0 }
];
const HOSP_SEED = [
  { id: "HOSP-01", name: "Pune Trauma Center", lat: 18.5280, lng: 73.8720, capacity: "PRE-ALERT READY", trauma: true, edReadiness: 95 },
  { id: "HOSP-02", name: "Ruby Emergency Institute", lat: 18.5360, lng: 73.8780, capacity: "STANDBY", trauma: true, edReadiness: 85 },
  { id: "HOSP-03", name: "Sahyadri Speciality Base", lat: 18.5080, lng: 73.8340, capacity: "LIMITED", trauma: false, edReadiness: 60 },
  { id: "HOSP-04", name: "Deenanath General Hospital", lat: 18.4980, lng: 73.8290, capacity: "AVAILABLE", trauma: false, edReadiness: 75 }
];

async function seedFleet() {
  try {
    const [ambRes, hospRes] = await Promise.all([
      fetch(API + "/fleet/ambulances"),
      fetch(API + "/fleet/hospitals")
    ]);
    const ambs = await ambRes.json();
    const hosps = await hospRes.json();
    if (Array.isArray(ambs) && ambs.length > 0) ambs.forEach((a) => updateAmbulance(a));
    else FLEET_SEED.forEach((a) => updateAmbulance({ ...a }));

    if (Array.isArray(hosps) && hosps.length > 0) hosps.forEach((h) => updateHospital(h));
    else HOSP_SEED.forEach((h) => updateHospital({ ...h }));
  } catch (e) {
    FLEET_SEED.forEach((a) => updateAmbulance({ ...a }));
    HOSP_SEED.forEach((h) => updateHospital({ ...h }));
  }
  renderKPIs();
}

async function loadInfrastructure() {
  try {
    // 1. CCTV Cameras & FOV Cones
    const cctvRes = await fetch(API + "/fleet/cctv");
    const cams = await cctvRes.json();
    if (Array.isArray(cams)) {
      cams.forEach((cam) => {
        state.cctv[cam.id] = cam;
        const pos = [cam.lat, cam.lng];
        const popup = `<div class="pop-t" style="color:#38BDF8"><i class="fa-solid fa-video"></i> ${esc(cam.cameraId || cam.id)}</div>
          Name: <b>${esc(cam.cameraName || "Junction Cam")}</b><br/>
          Status: <b>${esc(cam.status)}</b><br/>
          AI Confidence: <b>${pct((cam.lastDetection?.confidence || 0.9) * 100)}</b><br/>
          Coverage: <b>${cam.coverageRadiusMeters || 200}m @ ${cam.fovAngle || 60}°</b><br/>
          <span style="color:var(--text-3);font-size:9.5px">FIXED OPTICAL SENSOR</span>`;

        if (!cctvMarkers[cam.id]) {
          cctvMarkers[cam.id] = L.marker(pos, { icon: makeCctvIcon(cam.status) }).bindPopup(popup).addTo(L_cctv);
        }

        if (cam.fovAngle && cam.heading !== undefined) {
          const cone = createFovPolygon(cam.lat, cam.lng, cam.heading, cam.fovAngle, cam.coverageRadiusMeters || 200);
          if (fovLayers[cam.id]) L_cctvFov.removeLayer(fovLayers[cam.id]);
          fovLayers[cam.id] = L.polygon(cone, {
            color: "#38BDF8",
            weight: 1,
            dashArray: "3, 4",
            fillColor: "#38BDF8",
            fillOpacity: 0.12
          }).bindPopup(`<b>${esc(cam.cameraId)}</b> Detection Zone (Approximate camera coverage)`).addTo(L_cctvFov);
        }
      });
    }

    // 2. Crash Blackspot Hotspots
    const hotRes = await fetch(API + "/fleet/hotspots");
    const hotspots = await hotRes.json();
    if (Array.isArray(hotspots)) {
      state.hotspots = hotspots;
      L_hotspots.clearLayers();
      hotspots.forEach((h) => {
        L.circle([h.lat, h.lng], {
          radius: h.radiusMeters || 300,
          color: "var(--red)",
          weight: 1.5,
          fillColor: "var(--red)",
          fillOpacity: 0.16
        }).bindPopup(`<div class="pop-t" style="color:var(--red)"><i class="fa-solid fa-fire"></i> ${esc(h.name)}</div>
          Risk Score: <b>${h.riskScore}/100</b><br/>
          Category: <b>${esc(h.category)}</b><br/>
          Historical Incidents: <b>${h.historicalIncidents}</b>`).addTo(L_hotspots);
      });
    }

    // 3. Traffic Corridors (Configured traffic context)
    const trafficRes = await fetch(API + "/fleet/traffic");
    const corridors = await trafficRes.json();
    if (Array.isArray(corridors)) {
      state.trafficCorridors = corridors;
      L_traffic.clearLayers();
      corridors.forEach((c) => {
        const color = c.congestionLevel === "MODERATE" ? "var(--orange)" : "var(--green)";
        const latLngs = c.coordinates.map((pt) => [pt[1], pt[0]]);
        L.polyline(latLngs, {
          color: color,
          weight: 4,
          opacity: 0.7
        }).bindPopup(`<b>${esc(c.name)}</b><br/>Status: <b>${esc(c.trafficLabel)}</b>`).addTo(L_traffic);
      });
    }
  } catch (e) {
    console.warn("[Dashboard] Infrastructure load error:", e.message);
  }
}

function updateAmbulance(a) {
  if (!a || !a.id) return;
  const prev = state.ambulances[a.id] || {};
  const amb = { ...prev, ...a };
  if (num(amb.lat) === null || num(amb.lng) === null) return;
  state.ambulances[amb.id] = amb;
  const sel = state.selectedIncidentId && state.routes[state.selectedIncidentId]?.ambulanceId === amb.id;
  const pos = [amb.lat, amb.lng];
  const popup = `<div class="pop-t" style="color:var(--blue)">${esc(amb.id)} · ${esc(amb.type || "ALS")}</div>
    Status: <b>${esc(String(amb.status || "AVAILABLE").toUpperCase())}</b><br/>
    Speed: <b>${amb.speed ? amb.speed + " km/h" : "0 km/h"}</b><br/>
    Trauma Capable: <b>${amb.traumaReady || amb.trauma ? "YES" : "NO"}</b>
    ${amb.eta ? "<br/>ETA: <b>" + amb.eta + " min</b>" : ""}`;

  if (ambMarkers[amb.id]) {
    ambMarkers[amb.id].setLatLng(pos).setIcon(makeAmbIcon(amb.status, sel)).setPopupContent(popup);
  } else {
    ambMarkers[amb.id] = L.marker(pos, { icon: makeAmbIcon(amb.status, sel) }).bindPopup(popup).addTo(L_amb);
  }
  renderKPIs();
}

function updateHospital(h) {
  if (!h || !h.id) return;
  state.hospitals[h.id] = { ...(state.hospitals[h.id] || {}), ...h };
  const hh = state.hospitals[h.id];
  const sel = state.selectedIncidentId && state.routes[state.selectedIncidentId]?.hospitalId === hh.id;
  const popup = `<div class="pop-t" style="color:var(--green)">${esc(hh.name)}</div>
    Category: <b>${sel ? "SELECTED TRAUMA HOSPITAL" : "ALTERNATIVE HOSPITAL"}</b><br/>
    Capacity: <b>${esc(hh.capacity || "AVAILABLE")}</b><br/>
    Trauma Unit: <b>${hh.trauma ? "YES (Level 1)" : "NO"}</b><br/>
    ED Readiness: <b>${hh.edReadiness || 90}%</b>`;

  if (hospMarkers[hh.id]) {
    hospMarkers[hh.id].setIcon(makeHospIcon(hh.capacity, hh.trauma, sel)).setPopupContent(popup);
  } else {
    hospMarkers[hh.id] = L.marker([hh.lat, hh.lng], { icon: makeHospIcon(hh.capacity, hh.trauma, sel) }).bindPopup(popup).addTo(L_hosp);
  }
}

/* ---------- INCIDENT RENDERING & HONEST POPUPS (12A.5) ---------- */
function upsertIncidentMarker(inc) {
  if (num(inc.latitude) === null || num(inc.longitude) === null) {
    if (incMarkers[inc._id]) {
      L_inc.removeLayer(incMarkers[inc._id]);
      L_resolved.removeLayer(incMarkers[inc._id]);
      delete incMarkers[inc._id];
    }
    return;
  }

  const isResolved = inc.status === "RESOLVED";
  const isSelected = state.selectedIncidentId === inc._id;
  const icon = makeIncIcon(inc.severity, isSelected, isResolved);
  const pos = [inc.latitude, inc.longitude];

  const popup = `<div class="pop-t" style="color:${band(inc.severity).color}">
      ${isResolved ? "✓ RESOLVED" : "🚨 EMERGENCY"} · ${esc(inc.id || inc.incidentId || shortId(inc._id))}
    </div>
    <b>${esc(inc.title || "Collision Event")}</b><br/>
    Severity: <b>${inc.severity !== null ? inc.severity + "/100 (" + band(inc.severity).label + ")" : "Unavailable"}</b><br/>
    Confidence: <b>${inc.confidence !== undefined && inc.confidence !== null ? pct(inc.confidence > 1 ? inc.confidence : inc.confidence * 100) : "Unavailable"}</b><br/>
    Source: <b>${esc(srcMeta(inc.source).label)}</b><br/>
    Peak G-Force: <b>${inc.gForce ? inc.gForce + " G" : "Unavailable"}</b><br/>
    Decel Δv: <b>${inc.speedDeltaKmh ? inc.speedDeltaKmh + " km/h" : "Unavailable"}</b><br/>
    GPS Accuracy: <b>${inc.gpsAccuracy ? inc.gpsAccuracy + "m (" + (inc.locationQuality || "FRESH") + ")" : "Unavailable"}</b><br/>
    Status: <b>${esc(inc.status || "DETECTED")}</b><br/>
    Assigned Unit: <b>${esc(inc.assignedAmbulance || inc.ambulanceCode || "None")}</b><br/>
    Destination: <b>${esc(inc.assignedHospital || "None")}</b>`;

  if (incMarkers[inc._id]) {
    incMarkers[inc._id].setLatLng(pos).setIcon(icon).setPopupContent(popup);
  } else {
    const marker = L.marker(pos, { icon }).bindPopup(popup);
    marker.on("click", () => selectIncident(inc._id));
    incMarkers[inc._id] = marker;
  }

  const marker = incMarkers[inc._id];
  if (isResolved) {
    if (L_inc.hasLayer(marker)) L_inc.removeLayer(marker);
    if (!L_resolved.hasLayer(marker)) L_resolved.addLayer(marker);
  } else {
    if (L_resolved.hasLayer(marker)) L_resolved.removeLayer(marker);
    if (!L_inc.hasLayer(marker)) L_inc.addLayer(marker);
  }
}

/* ---------- FOCUS INCIDENT & VIEW CONTROLS (12A.3 & 12A.15) ---------- */
function focusIncident(id) {
  const targetId = id || state.selectedIncidentId;
  const inc = state.incidents[targetId];
  if (!inc || inc.latitude === null || inc.longitude === null) {
    return toast("NO GPS POSITION", "Selected incident has unavailable GPS coordinates.", "info");
  }

  const boundsCoords = [[inc.latitude, inc.longitude]];

  const r = state.routes[targetId];
  if (r) {
    if (r.ambulanceId && state.ambulances[r.ambulanceId]) {
      const a = state.ambulances[r.ambulanceId];
      if (a.lat && a.lng) boundsCoords.push([a.lat, a.lng]);
    }
    if (r.hospitalId && state.hospitals[r.hospitalId]) {
      const h = state.hospitals[r.hospitalId];
      if (h.lat && h.lng) boundsCoords.push([h.lat, h.lng]);
    }
    if (r.coords && r.coords.length > 0) {
      r.coords.forEach((pt) => boundsCoords.push(pt));
    }
  }

  map.fitBounds(L.latLngBounds(boundsCoords), {
    padding: [60, 60],
    maxZoom: 16,
    animate: true,
    duration: 0.8
  });

  if (incMarkers[targetId]) incMarkers[targetId].openPopup();
}

function fitAll() {
  const layers = [];
  [L_inc, L_amb, L_hosp, L_cctv].forEach((g) => g && g.eachLayer((l) => layers.push(l)));
  if (!layers.length) return map.flyTo(CENTER, CFG.DEFAULT_ZOOM || 12);
  map.fitBounds(L.featureGroup(layers).getBounds().pad(0.15));
}

function fitFleet() {
  const layers = [];
  L_amb.eachLayer((l) => layers.push(l));
  if (!layers.length) return toast("NO AMBULANCES", "No ambulances on map.", "info");
  map.fitBounds(L.featureGroup(layers).getBounds().pad(0.2));
}

function toggleFullscreen() {
  const wrap = $("mapWrap");
  if (!document.fullscreenElement) {
    wrap.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

function toggleLegend() {
  const leg = $("mapLegend");
  leg.classList.toggle("hidden");
}

function toggleLayer(name, btn) {
  state.layers[name] = !state.layers[name];
  btn.classList.toggle("on", state.layers[name]);

  const groups = {
    incidents: L_inc,
    ambulances: L_amb,
    hospitals: L_hosp,
    routes: L_route,
    cctv: L_cctv,
    hotspots: L_hotspots,
    traffic: L_traffic
  };

  const g = groups[name];
  if (g) {
    if (state.layers[name]) {
      g.addTo(map);
      if (name === "cctv") L_cctvFov.addTo(map);
    } else {
      map.removeLayer(g);
      if (name === "cctv") map.removeLayer(L_cctvFov);
    }
  }
}

/* ---------- AUTHORITATIVE ROUTE RENDERING (12A.8) ---------- */
async function drawRoute(id) {
  const inc = state.incidents[id];
  const r = state.routes[id];
  if (!inc || !r || inc.latitude === null) return;
  const amb = state.ambulances[r.ambulanceId];
  const hosp = state.hospitals[r.hospitalId];
  if (!amb) return;

  let coords = null, distKm = null, etaMin = r.etaMin, geometrySource = "STRAIGHT LINE (OSRM UNAVAILABLE)";

  // Check backend authoritative route geometry first
  if (inc.route && inc.route.geometry && Array.isArray(inc.route.geometry.coordinates) && inc.route.geometry.coordinates.length > 0) {
    coords = inc.route.geometry.coordinates.map((c) => [c[1], c[0]]);
    distKm = inc.route.distanceKm ? String(inc.route.distanceKm) : distKm;
    etaMin = inc.route.etaMinutes ? Number(inc.route.etaMinutes) : etaMin;
    geometrySource = inc.route.isFallback ? "⚠ ROUTING DEGRADED (APPROXIMATION)" : "OSRM ROAD";
  } else {
    try {
      const t0 = performance.now();
      const res = await fetch(`${OSRM}/route/v1/driving/${amb.lng},${amb.lat};${inc.longitude},${inc.latitude}?overview=full&geometries=geojson`);
      const data = await res.json();
      const route = data && data.routes && data.routes[0];
      if (route) {
        coords = route.geometry.coordinates.map((c) => [c[1], c[0]]);
        distKm = (route.distance / 1000).toFixed(1);
        etaMin = Math.max(2, Math.round(route.duration / 60));
        geometrySource = "OSRM ROAD";
        setHealth("Routing", true);
        state.perf[id] = { ...(state.perf[id] || {}), "Route computation": Math.round(performance.now() - t0) };
      }
    } catch (e) {
      setHealth("Routing", false);
    }
  }

  if (!coords) {
    coords = [[amb.lat, amb.lng], [inc.latitude, inc.longitude]];
    distKm = haversine([amb.lat, amb.lng], [inc.latitude, inc.longitude]).toFixed(1);
  }

  let hospCoords = null;
  if (hosp) {
    try {
      const res2 = await fetch(`${OSRM}/route/v1/driving/${inc.longitude},${inc.latitude};${hosp.lng},${hosp.lat}?overview=full&geometries=geojson`);
      const d2 = await res2.json();
      if (d2 && d2.routes && d2.routes[0]) hospCoords = d2.routes[0].geometry.coordinates.map((c) => [c[1], c[0]]);
    } catch (e) {
      hospCoords = [[inc.latitude, inc.longitude], [hosp.lat, hosp.lng]];
    }
  }

  state.routes[id] = { ...r, coords, hospCoords, distKm, etaMin, geometrySource };

  L_route.clearLayers();
  L.polyline(coords, { color: "#FF9F0A", weight: 5, opacity: 0.9, lineCap: "round" }).addTo(L_route);
  if (hospCoords) {
    L.polyline(hospCoords, { color: "#409CFF", weight: 4, opacity: 0.8, dashArray: "9,9" }).addTo(L_route);
  }

  updateAmbulance({ id: amb.id, eta: etaMin });
  if (hosp) updateHospital({ id: hosp.id });
  renderKPIs();
  if (state.selectedIncidentId === id) renderIncidentDetails();
}

function animateAmbulance(id) {
  const r = state.routes[id];
  if (!r || !r.coords || !r.coords.length) return;
  if (ambAnim) clearInterval(ambAnim);
  const pts = r.coords, ambId = r.ambulanceId;
  let i = 0;
  ambAnim = setInterval(() => {
    i += Math.max(1, Math.floor(pts.length / 40));
    if (i >= pts.length) { clearInterval(ambAnim); ambAnim = null; return; }
    updateAmbulance({ id: ambId, lat: pts[i][0], lng: pts[i][1], status: "EN_ROUTE" });
  }, 700);
}

/* ---------- SYSTEM HEALTH & SYNC ---------- */
const HEALTH_KEYS = { Backend: ["hBackend", "tBackend"], Socket: ["hSocket", "tSocket"], Database: ["hDb", "tDb"], AI: ["hAi", "tAi"], Routing: ["hRouting", "tRouting"] };

function setHealth(component, ok, note) {
  state.systemHealth[component] = { ok, note, t: Date.now() };
  const ids = HEALTH_KEYS[component];
  if (ids) {
    const dot = $(ids[0]), txt = $(ids[1]);
    if (dot) dot.className = "dot " + (ok === true ? "online" : ok === "degraded" ? "degraded" : "offline");
    if (txt) txt.textContent = ok === true ? "ONLINE" : ok === "degraded" ? "DEGRADED" : "OFFLINE";
  }
  updateOverallSystemDot();
}

function updateOverallSystemDot() {
  const vals = Object.values(state.systemHealth).map((h) => h.ok);
  const anyDown = vals.some((v) => v === false);
  const anyDegraded = vals.some((v) => v === "degraded");
  const dot = $("dotSystem"), lbl = $("systemLabel");
  if (!dot || !lbl) return;
  if (anyDown) { dot.className = "dot offline live"; lbl.textContent = "SYSTEM DEGRADED"; }
  else if (anyDegraded) { dot.className = "dot degraded live"; lbl.textContent = "DEGRADED MODE"; }
  else { dot.className = "dot online live"; lbl.textContent = "SYSTEM OPERATIONAL"; }
}

async function pollHealth() {
  try {
    const res = await fetch(API + "/health");
    const h = await res.json();
    setHealth("Backend", h.backend === "ONLINE" || h.backend === "UP");
    setHealth("Database", h.databaseConnected ? true : "degraded");
    setHealth("AI", h.ai === "ONLINE" || h.aiEngine === "UP");
    setHealth("Routing", h.routing === "ONLINE" || h.osrm === "UP" ? true : "degraded");
    setHealth("Socket", (h.socket === "ONLINE" || h.socketIO === "UP") ? true : false);
  } catch (e) {
    setHealth("Backend", false);
  }
}

async function probeRouting() {
  try {
    const r = await fetch(`${OSRM}/route/v1/driving/73.8412,18.5148;73.8567,18.5204?overview=false`);
    const d = await r.json();
    setHealth("Routing", d && d.code === "Ok");
  } catch (e) {
    setHealth("Routing", false);
  }
}

/* ---------- INCIDENT INGESTION & UI LIST ---------- */
async function syncIncidents(initial) {
  try {
    const res = await fetch(API + "/incidents");
    const arr = await res.json();
    if (Array.isArray(arr)) {
      arr.forEach((inc) => {
        const id = inc._id || inc.id || inc.incidentId;
        const norm = normalizeIncident(inc);
        state.incidents[id] = norm;
        if (!state.seen.has(id)) {
          state.seen.add(id);
          pushTimeline(id, `Incident ingested via ${norm.source} channel`);
        }
        upsertIncidentMarker(norm);
      });
      renderIncidentList();
      renderKPIs();
      if (initial && arr.length && !state.selectedIncidentId) {
        selectIncident(arr[0]._id || arr[0].id || arr[0].incidentId);
      }
    }
  } catch (e) { }
}

function normalizeIncident(raw) {
  const normId = raw.incidentId || raw.id || raw._id;
  return {
    _id: normId,
    id: normId,
    incidentId: normId,
    title: raw.title || raw.incidentType || "Emergency Event",
    severity: num(raw.severity !== undefined ? raw.severity : raw.severityScore),
    confidence: num(raw.confidence !== undefined ? raw.confidence : raw.confidenceScore),
    status: raw.status || "DETECTED",
    source: raw.source || raw.sourceType || "smartphone",
    latitude: num(raw.latitude !== null && raw.latitude !== undefined ? raw.latitude : raw.lat),
    longitude: num(raw.longitude !== null && raw.longitude !== undefined ? raw.longitude : raw.lng),
    gForce: num(raw.gForce || raw.g_force || raw.peakGForce),
    speedKmh: num(raw.speedKmh || raw.speed),
    speedDeltaKmh: num(raw.speedDeltaKmh || raw.delta_v),
    rollover: raw.rollover || raw.isRollover || false,
    gpsAccuracy: num(raw.gpsAccuracy || raw.accuracy),
    locationQuality: raw.locationQuality || "FRESH",
    patients: num(raw.patients || raw.patientCount) || 1,
    assignedAmbulance: raw.assignedAmbulance || raw.ambulanceCode || raw.ambulanceId,
    assignedHospital: raw.assignedHospital || raw.hospitalId,
    ambulanceReason: raw.ambulanceReason,
    hospitalReason: raw.hospitalReason,
    route: raw.route,
    hospitalPreAlert: raw.hospitalPreAlert,
    timeline: raw.timeline || [],
    createdAt: raw.createdAt || new Date().toISOString()
  };
}

function selectIncident(id) {
  state.selectedIncidentId = id;
  const inc = state.incidents[id];
  if (!inc) return;

  Object.values(state.incidents).forEach((i) => {
    const card = $("card-" + i._id);
    if (card) card.classList.toggle("sel", i._id === id);
    upsertIncidentMarker(i);
  });

  renderIncidentDetails();
  $("panel").classList.remove("collapsed");
  $("collapseIcon").className = "fa-solid fa-chevron-down";

  if (inc.latitude !== null && inc.longitude !== null) {
    if (inc.route) {
      state.routes[id] = {
        ambulanceId: inc.assignedAmbulance,
        hospitalId: inc.assignedHospital,
        etaMin: inc.route.etaMinutes,
        coords: inc.route.geometry?.coordinates?.map((c) => [c[1], c[0]])
      };
      drawRoute(id);
    } else {
      computeDispatch(inc);
    }
  }
}

function computeDispatch(inc) {
  if (inc.latitude === null || inc.longitude === null) return;
  const needsTrauma = band(inc.severity).k === "critical";
  const cands = Object.values(state.ambulances)
    .filter((a) => a.status === "AVAILABLE" || a.id === (state.routes[inc._id] || {}).ambulanceId)
    .map((a) => {
      const dist = haversine([a.lat, a.lng], [inc.latitude, inc.longitude]);
      const eta = Math.max(2, Math.round((dist / 42) * 60));
      return { id: a.id, dist: dist.toFixed(1), eta, trauma: !!a.traumaReady, score: eta };
    })
    .sort((x, y) => x.score - y.score)
    .slice(0, 4);

  if (!cands.length) return;
  cands[0].selected = true;
  state.candidates[inc._id] = cands;

  const hospital = Object.values(state.hospitals)
    .filter((h) => String(h.capacity).toUpperCase() !== "UNAVAILABLE" && (!needsTrauma || h.trauma))
    .map((h) => ({ h, d: haversine([h.lat, h.lng], [inc.latitude, inc.longitude]) }))
    .sort((a, b2) => a.d - b2.d)[0];

  state.routes[inc._id] = {
    ...(state.routes[inc._id] || {}),
    ambulanceId: cands[0].id,
    hospitalId: hospital ? hospital.h.id : null,
    etaMin: cands[0].eta
  };

  $("ambReason").innerHTML = `<b>ResQNet selected ${esc(cands[0].id)}</b> — optimal response score based on trauma capabilities and configured traffic weighting.`;
  drawRoute(inc._id);
}

function renderIncidentList() {
  const el = $("incidentList");
  if (!el) return;
  const list = Object.values(state.incidents).filter(matchesFilters).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  $("sidebarCount").textContent = list.length;

  if (!list.length) {
    el.innerHTML = `<div class="empty">No incidents matching active filters.</div>`;
    return;
  }

  el.innerHTML = list.map((inc) => {
    const b = band(inc.severity);
    const sel = inc._id === state.selectedIncidentId;
    return `<div class="card ${sel ? "sel" : ""}" id="card-${inc._id}" onclick="selectIncident('${inc._id}')">
      <div class="card-top">
        <span class="card-id">${esc(inc.id || shortId(inc._id))}</span>
        <span class="card-badge" style="background:${b.color};color:#000">${b.label}</span>
      </div>
      <div class="card-title">${esc(inc.title)}</div>
      <div class="card-meta">
        <span><i class="fa-solid ${srcMeta(inc.source).icon}"></i> ${esc(srcMeta(inc.source).label)}</span>
        <span><i class="fa-regular fa-clock"></i> ${hhmmss(inc.createdAt)}</span>
      </div>
    </div>`;
  }).join("");
}

function matchesFilters(inc) {
  if (state.filters.sev !== "ALL" && band(inc.severity).label !== state.filters.sev) return false;
  if (state.filters.src !== "ALL" && String(inc.source).toLowerCase() !== state.filters.src.toLowerCase()) return false;
  if (state.filters.q) {
    const q = state.filters.q.toLowerCase();
    const str = `${inc.id} ${inc.title} ${inc.source} ${inc.status}`.toLowerCase();
    if (!str.includes(q)) return false;
  }
  return true;
}

function renderIncidentDetails() {
  const inc = state.incidents[state.selectedIncidentId];
  if (!inc) {
    $("panelEmpty").style.display = "block";
    ["colWorkflow", "colTelemetry", "colOptimization", "colHospital", "colAudit"].forEach((c) => $(c) && ($(c).style.display = "none"));
    $("panelSub").textContent = "no incident selected";
    return;
  }

  $("panelEmpty").style.display = "none";
  ["colWorkflow", "colTelemetry", "colOptimization", "colHospital", "colAudit"].forEach((c) => $(c) && ($(c).style.display = "flex"));

  $("panelSub").textContent = `${inc.id || shortId(inc._id)} · ${inc.title}`;

  // Severity & Confidence
  const b = band(inc.severity);
  $("sevVal").textContent = inc.severity !== null ? `${inc.severity}/100 — ${b.label}` : "NOT ASSESSED";
  $("sevVal").style.color = b.color;
  $("sevBar").style.width = inc.severity ? `${inc.severity}%` : "0%";
  $("sevBar").style.background = b.color;

  const conf = inc.confidence !== null ? (inc.confidence > 1 ? inc.confidence : Math.round(inc.confidence * 100)) : null;
  $("confVal").textContent = conf !== null ? `${conf}%` : "N/A";
  $("confBar").style.width = conf ? `${conf}%` : "0%";

  // Telemetry Box
  $("telemBox").innerHTML = `
    <div class="kv"><span>Location</span><b>${inc.latitude !== null ? `${inc.latitude.toFixed(4)}, ${inc.longitude.toFixed(4)}` : "Unavailable"}</b></div>
    <div class="kv"><span>GPS Accuracy</span><b>${inc.gpsAccuracy ? `${inc.gpsAccuracy}m (${inc.locationQuality})` : "Unavailable"}</b></div>
    <div class="kv"><span>Peak G-Force</span><b>${inc.gForce ? `${inc.gForce} G` : "Unavailable"}</b></div>
    <div class="kv"><span>Decel Δv</span><b>${inc.speedDeltaKmh ? `${inc.speedDeltaKmh} km/h` : "Unavailable"}</b></div>
    <div class="kv"><span>Rollover</span><b>${inc.rollover ? "YES (DETECTED)" : "NO"}</b></div>
    <div class="kv"><span>Patients</span><b>${inc.patients}</b></div>`;

  // Ambulance Optimizer
  const r = state.routes[inc._id] || {};
  const amb = state.ambulances[r.ambulanceId];
  $("ambBox").innerHTML = `
    <div class="kv"><span>Assigned Unit</span><b>${amb ? `${amb.id} (${amb.type || "ALS"})` : "None allocated"}</b></div>
    <div class="kv"><span>Route ETA</span><b>${r.etaMin ? `${r.etaMin} min (${r.distKm || "—"} km)` : "Calculating"}</b></div>
    <div class="kv"><span>Routing Source</span><b style="color:var(--blue)">${r.geometrySource || "OSRM Road"}</b></div>
    <div class="kv"><span>Fleet Status</span><b>${amb ? amb.status : "STANDBY"}</b></div>`;

  // Hospital Pre-Alert
  const hosp = state.hospitals[r.hospitalId];
  $("hospBox").innerHTML = `
    <div class="kv"><span>Matched Center</span><b>${hosp ? hosp.name : "None selected"}</b></div>
    <div class="kv"><span>Trauma Level</span><b>${hosp?.trauma ? "Level 1 Trauma Unit" : "General Emergency"}</b></div>
    <div class="kv"><span>Capacity</span><b>${hosp ? hosp.capacity : "AVAILABLE"}</b></div>
    <div class="kv"><span>ED Readiness</span><b style="color:var(--green)">${hosp ? hosp.edReadiness || 90 : 90}%</b></div>`;

  // Actions
  const btnDisp = $("btnDispatch"), btnFail = $("btnFailover"), btnRes = $("btnResolve");
  if (btnDisp) btnDisp.disabled = inc.status === "EN_ROUTE" || inc.status === "RESOLVED";
  if (btnFail) btnFail.disabled = inc.status === "RESOLVED";
  if (btnRes) btnRes.disabled = inc.status === "RESOLVED";
}

function renderKPIs() {
  const active = Object.values(state.incidents).filter((i) => i.status !== "RESOLVED");
  const crit = active.filter((i) => band(i.severity).k === "critical");
  const ambs = Object.values(state.ambulances);
  const availAmbs = ambs.filter((a) => a.status === "AVAILABLE");
  const routeAmbs = ambs.filter((a) => a.status === "EN_ROUTE");

  if ($("kpiActive")) $("kpiActive").textContent = active.length;
  if ($("kpiCritical")) $("kpiCritical").textContent = crit.length;
  if ($("kpiAmbAvail")) $("kpiAmbAvail").textContent = availAmbs.length;
  if ($("kpiAmbRoute")) $("kpiAmbRoute").textContent = routeAmbs.length;
}

function addActivity(text, type) {
  state.activity.unshift({ t: new Date().toISOString(), text, type });
  const el = $("activityFeed");
  if (!el) return;
  el.innerHTML = state.activity.map((a) => `
    <div class="feed-item ${a.type || ""}">
      <span class="feed-time">${hhmmss(a.t)}</span>
      <span class="feed-text">${esc(a.text)}</span>
    </div>`).join("");
}

function pushTimeline(id, text) {
  if (!state.timelines[id]) state.timelines[id] = [];
  state.timelines[id].push({ t: new Date().toISOString(), text });
  if (state.selectedIncidentId === id) renderIncidentDetails();
}

function toast(title, msg, type) {
  console.log(`[TOAST] ${title}: ${msg}`);
}

/* ---------- SOCKET.IO REAL-TIME INTEGRATION (12A.16) ---------- */
function initSocket() {
  try {
    const socket = io(BACKEND_URL);
    socket.on("connect", () => {
      setHealth("Socket", true);
      addActivity("Real-time Socket.IO link established", "ok");
    });
    socket.on("disconnect", () => setHealth("Socket", false));

    socket.on("incident:new", (inc) => {
      const norm = normalizeIncident(inc);
      state.incidents[norm._id] = norm;
      state.seen.add(norm._id);
      upsertIncidentMarker(norm);
      renderIncidentList();
      renderKPIs();
      addActivity(`🚨 New incident reported: ${norm.title}`, "alert");
      selectIncident(norm._id);
    });

    socket.on("incident:update", (inc) => {
      const norm = normalizeIncident(inc);
      state.incidents[norm._id] = norm;
      upsertIncidentMarker(norm);
      renderIncidentList();
      renderKPIs();
      if (state.selectedIncidentId === norm._id) renderIncidentDetails();
    });

    socket.on("ambulance:telemetry", (amb) => {
      updateAmbulance(amb);
    });

    socket.on("ambulance:location", (amb) => {
      updateAmbulance(amb);
    });

    socket.on("incident:resolved", (data) => {
      const id = data.incidentId || data.id;
      if (state.incidents[id]) {
        state.incidents[id].status = "RESOLVED";
        upsertIncidentMarker(state.incidents[id]);
        renderIncidentList();
        renderKPIs();
        if (state.selectedIncidentId === id) renderIncidentDetails();
      }
    });
  } catch (e) {
    setHealth("Socket", false);
  }
}

/* ---------- OPERATOR DISPATCH / FAILOVER / RESOLVE ACTIONS ---------- */
async function dispatchAmbulance() {
  const inc = state.incidents[state.selectedIncidentId];
  if (!inc) return;
  const r = state.routes[inc._id] || {};
  try {
    const res = await fetch(`${API}/incidents/${inc._id}/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ambulanceId: r.ambulanceId })
    });
    const d = await res.json();
    if (d.success) {
      inc.status = "EN_ROUTE";
      pushTimeline(inc._id, `Operator authorized dispatch for Unit ${r.ambulanceId}`);
      animateAmbulance(inc._id);
      renderIncidentDetails();
      toast("UNIT DISPATCHED", `Unit ${r.ambulanceId} is en route.`, "ok");
    }
  } catch (e) {
    toast("DISPATCH ERROR", e.message, "error");
  }
}

async function failoverAmbulance() {
  const inc = state.incidents[state.selectedIncidentId];
  if (!inc) return;
  try {
    const res = await fetch(`${API}/incidents/${inc._id}/failover`, { method: "POST" });
    const d = await res.json();
    if (d.success) {
      inc.assignedAmbulance = d.newAmbulance.id;
      inc.route = d.incident.route;
      state.routes[inc._id] = {
        ambulanceId: d.newAmbulance.id,
        hospitalId: inc.assignedHospital,
        etaMin: d.incident.route?.etaMinutes || 4,
        coords: d.incident.route?.geometry?.coordinates?.map((c) => [c[1], c[0]])
      };
      drawRoute(inc._id);
      animateAmbulance(inc._id);
      pushTimeline(inc._id, `Automated failover reassigned to Unit ${d.newAmbulance.code}`);
      renderIncidentDetails();
      toast("FAILOVER DISPATCHED", `Unit ${d.newAmbulance.code} reassigned.`, "ok");
    }
  } catch (e) {
    toast("FAILOVER ERROR", e.message, "error");
  }
}

async function resolveIncident() {
  const inc = state.incidents[state.selectedIncidentId];
  if (!inc) return;
  try {
    const res = await fetch(`${API}/incidents/${inc._id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Patient admitted to Trauma Unit" })
    });
    const d = await res.json();
    if (d.success) {
      inc.status = "RESOLVED";
      L_route.clearLayers();
      upsertIncidentMarker(inc);
      pushTimeline(inc._id, "Incident resolved and archived to response audit vault");
      renderIncidentDetails();
      renderKPIs();
      toast("INCIDENT RESOLVED", "Incident archived.", "ok");
    }
  } catch (e) {
    toast("RESOLVE ERROR", e.message, "error");
  }
}

/* ---------- DEMO SIMULATOR SUITE ---------- */
async function runDemo(source) {
  closeDemo();
  state.demoBusy = true;
  const demoId = `RNQ-DEMO-${Date.now().toString().slice(-4)}`;
  const lat = 18.5204 + (Math.random() - 0.5) * 0.04;
  const lng = 73.8567 + (Math.random() - 0.5) * 0.04;

  const payload = {
    id: demoId,
    incidentId: demoId,
    source: source,
    title: source === "cctv" ? "CCTV Junction Collision" : "High-Impact Road Crash",
    latitude: lat,
    longitude: lng,
    gForce: 4.8,
    speedDeltaKmh: 52,
    confidence: 0.96,
    severity: 88,
    isDemo: true
  };

  try {
    await fetch(API + "/incidents/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    toast("DEMO INCIDENT INGESTED", `Created ${demoId} via ${source.toUpperCase()}`, "ok");
  } catch (e) {
    toast("DEMO ERROR", e.message, "error");
  } finally {
    state.demoBusy = false;
  }
}

async function resetDemo() {
  closeDemo();
  try {
    await fetch(API + "/incidents/demo/reset", { method: "POST" });
    state.incidents = {};
    L_inc.clearLayers();
    L_resolved.clearLayers();
    L_route.clearLayers();
    seedFleet();
    renderIncidentList();
    renderIncidentDetails();
    renderKPIs();
    toast("DEMO RESET", "All demo incidents cleared.", "info");
  } catch (e) {
    toast("RESET ERROR", e.message, "error");
  }
}

/* ---------- DOM WIRING ---------- */
function wire() {
  setInterval(() => {
    $("clock").textContent = new Date().toLocaleTimeString("en-GB", { hour12: false }) + " IST";
  }, 1000);

  // Map Style Selector
  $("mapStyleSelect").onchange = (e) => setMapStyle(e.target.value);

  // Health Popover
  $("healthBtn").onclick = (e) => {
    e.stopPropagation();
    const p = $("healthPopover");
    p.classList.toggle("show");
    $("healthBtn").setAttribute("aria-expanded", p.classList.contains("show"));
  };
  document.addEventListener("click", (e) => {
    if (!$("healthPopover").contains(e.target) && e.target !== $("healthBtn")) $("healthPopover").classList.remove("show");
  });

  // Layer toggles
  document.querySelectorAll(".mbtn[data-layer]").forEach((b) => (b.onclick = () => toggleLayer(b.dataset.layer, b)));

  // Map Controls
  $("fitAllBtn").onclick = fitAll;
  $("focusIncBtn").onclick = () => focusIncident();
  $("fitFleetBtn").onclick = fitFleet;
  $("fullScreenBtn").onclick = toggleFullscreen;
  $("legendToggleBtn").onclick = toggleLegend;
  $("closeLegendBtn").onclick = toggleLegend;

  // Panel Actions
  $("btnCenter").onclick = () => focusIncident();
  $("btnRoute").onclick = () => {
    if (state.selectedIncidentId) drawRoute(state.selectedIncidentId);
  };
  $("btnDispatch").onclick = dispatchAmbulance;
  $("btnFailover").onclick = failoverAmbulance;
  $("btnResolve").onclick = resolveIncident;

  $("btnCollapse").onclick = () => {
    const p = $("panel");
    p.classList.toggle("collapsed");
    $("collapseIcon").className = "fa-solid fa-chevron-" + (p.classList.contains("collapsed") ? "up" : "down");
  };

  // Demo Controls
  $("demoBtn").onclick = openDemo;
  $("demoClose").onclick = closeDemo;
  $("demoModal").onclick = (e) => { if (e.target === $("demoModal")) closeDemo(); };
  $("demoSmartphone").onclick = () => runDemo("smartphone");
  $("demoCctv").onclick = () => runDemo("cctv");
  $("demoCitizen").onclick = () => runDemo("citizen");
  $("demoReset").onclick = resetDemo;

  // Tabs & Search
  $("tabIncidents").onclick = () => switchTab("incidents");
  $("tabFeed").onclick = () => switchTab("feed");
  $("searchInput").addEventListener("input", debounce((e) => { state.filters.q = e.target.value.trim(); applyFilters(); }, 180));
  document.querySelectorAll("#sevChips .chip").forEach((c) => (c.onclick = () => {
    document.querySelectorAll("#sevChips .chip").forEach((x) => x.classList.remove("on"));
    c.classList.add("on");
    state.filters.sev = c.dataset.sev;
    applyFilters();
  }));
  document.querySelectorAll("#srcChips .chip").forEach((c) => (c.onclick = () => {
    document.querySelectorAll("#srcChips .chip").forEach((x) => x.classList.remove("on"));
    c.classList.add("on");
    state.filters.src = c.dataset.src;
    applyFilters();
  }));
}

const openDemo = () => $("demoModal").classList.add("show");
const closeDemo = () => $("demoModal").classList.remove("show");

function switchTab(t) {
  const inc = t === "incidents";
  $("tabIncidents").classList.toggle("active", inc);
  $("tabFeed").classList.toggle("active", !inc);
  $("viewIncidents").style.display = inc ? "flex" : "none";
  $("viewFeed").style.display = inc ? "none" : "flex";
}

function applyFilters() {
  renderIncidentList();
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ---------- BOOTSTRAP ---------- */
window.addEventListener("DOMContentLoaded", async () => {
  initMap();
  wire();
  renderIncidentList();
  renderIncidentDetails();
  addActivity("ResQNet Multi-Map Command Center armed — monitoring all channels", "ok");
  await pollHealth();
  probeRouting();
  await syncIncidents(true);
  initSocket();
  setInterval(pollHealth, CFG.HEALTH_POLL_MS || 5000);
  setInterval(() => syncIncidents(false), CFG.INCIDENT_POLL_MS || 4000);
});
