/* ============ RESQNET COMMAND CENTER — DUAL GOOGLE MAPS & LEAFLET ENGINE ============
 * Real-Time Google Maps with Native Live Traffic Layer
 * Turn-by-Turn OSRM Road Geometry & Live Dispatched Ambulance Motion
 * 15 Pune Trauma Hospitals & 9 Optical AI CCTV Junction Cameras
 * Prominently Visible Assigned Fleet & Hospital Intelligence
 * =================================================================================== */

const CFG = window.RESQNET_CONFIG || {};
const BACKEND_URL = CFG.BACKEND_URL || window.location.origin;
const API = BACKEND_URL + "/api";
const CENTER = CFG.DEFAULT_CENTER || [18.5204, 73.8567];
const OSRM = CFG.OSRM_URL || "https://router.project-osrm.org";
const sessionToken = localStorage.getItem("resqnetToken");
const sessionUser = (() => { try { return JSON.parse(localStorage.getItem("resqnetUser") || "null"); } catch (_) { return null; } })();
const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` });

/* ---------- TACTICAL DARK STYLES FOR GOOGLE MAPS ---------- */
const GOOGLE_DARK_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#0b111a" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0b111a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#748ba0" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#cbd5e1" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#5eead4" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#081b1b" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#6b7280" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#162232" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#0f1724" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#1e3a5f" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#0f1d30" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#38bdf8" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#162338" }] },
  { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#38bdf8" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#06101c" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#334155" }] },
  { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#06101c" }] }
];

/* ---------- LEAFLET TILE PROVIDERS (FALLBACK / ALTERNATIVE) ---------- */
const MAP_PROVIDERS = {
  dark: {
    name: "Dark Matter (Night)",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    subdomains: "abcd",
    maxZoom: 19
  },
  standard: {
    name: "Standard Road Map",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors",
    subdomains: "abc",
    maxZoom: 19
  },
  satellite: {
    name: "Satellite Imagery",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "&copy; Esri, i-cubed, USDA, USGS",
    maxZoom: 18
  }
};

/* ---------- CENTRAL STATE ---------- */
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
  mapStyle: localStorage.getItem("resqnet_map_style") || "google_dark",
  filters: { sev: "ALL", src: "ALL", q: "" },
  layers: {
    incidents: true,
    ambulances: true,
    hospitals: true,
    routes: true,
    cctv: true,
    hotspots: true,
    traffic: true // Traffic enabled by default as requested
  },
  seen: new Set(),
  lastSync: null,
  demoBusy: false,
  activeSimulations: {} // Ongoing live ambulance motion animations
};

/* ---------- UTILITY FUNCTIONS ---------- */
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

/* Calculate bearing in degrees from point A to point B */
function calculateBearing(lat1, lon1, lat2, lon2) {
  const φ1 = (lat1 * Math.PI) / 180, φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.cos(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return ((θ * 180) / Math.PI + 360) % 360;
}

/* ---------- DUAL-ENGINE MAP ARCHITECTURE ---------- */
let activeEngine = null; // 'google' or 'leaflet'
let gMap = null, gTrafficLayer = null, gInfoWindow = null;
const gOverlays = { inc: {}, amb: {}, hosp: {}, cctv: {} };
const gPolylines = { route1: null, route1Glow: null, route2: null, route2Glow: null };
const gFovs = {};
const gHotspots = {};

let lMap = null, lBaseLayer = null;
let L_inc, L_resolved, L_amb, L_hosp, L_route, L_cctv, L_cctvFov, L_hotspots, L_traffic;
const incMarkers = {}, ambMarkers = {}, hospMarkers = {}, cctvMarkers = {}, fovLayers = {}, hotspotCircles = {};
let testMapTarget = null;

/* ---------- GOOGLE MAPS CUSTOM HTML OVERLAY CLASS ---------- */
let GoogleHtmlOverlayClass = null;

function defineGoogleHtmlOverlay() {
  if (GoogleHtmlOverlayClass || !window.google || !window.google.maps) return;

  GoogleHtmlOverlayClass = class extends google.maps.OverlayView {
    constructor(lat, lng, htmlContent, onClick, className = "") {
      super();
      this.lat = lat;
      this.lng = lng;
      this.htmlContent = htmlContent;
      this.onClick = onClick;
      this.className = className;
      this.div = null;
      this.visible = true;
    }
    onAdd() {
      this.div = document.createElement("div");
      this.div.className = "custom-map-overlay " + this.className;
      this.div.innerHTML = this.htmlContent;
      if (this.onClick) {
        this.div.addEventListener("click", (e) => {
          e.stopPropagation();
          this.onClick(e);
        });
      }
      const panes = this.getPanes();
      if (panes && panes.overlayMouseTarget) {
        panes.overlayMouseTarget.appendChild(this.div);
      }
    }
    draw() {
      if (!this.div) return;
      const proj = this.getProjection();
      if (!proj) return;
      const pt = proj.fromLatLngToDivPixel(new google.maps.LatLng(this.lat, this.lng));
      if (pt) {
        this.div.style.left = pt.x + "px";
        this.div.style.top = pt.y + "px";
        this.div.style.display = this.visible ? "block" : "none";
      }
    }
    setPosition(lat, lng) {
      this.lat = lat;
      this.lng = lng;
      this.draw();
    }
    setContent(html) {
      this.htmlContent = html;
      if (this.div) this.div.innerHTML = html;
    }
    setVisible(v) {
      this.visible = v;
      if (this.div) this.div.style.display = v ? "block" : "none";
    }
    onRemove() {
      if (this.div && this.div.parentNode) {
        this.div.parentNode.removeChild(this.div);
        this.div = null;
      }
    }
  };
}

/* ---------- MAP INITIALIZATION & ENGINE SWITCHING ---------- */
function initMapEngine() {
  const mapEl = $("map");
  if (!mapEl) return;

  const preferGoogle = state.mapStyle.startsWith("google_") || !state.mapStyle;
  const isGoogleAvailable = window.google && window.google.maps && !window.googleMapsFailed;

  if (preferGoogle && isGoogleAvailable) {
    initGoogleMapsEngine();
  } else {
    initLeafletEngine();
  }

  seedFleet();
  loadInfrastructure();
}

/* Callback when Google Maps JS API loads */
window.onGoogleMapsReady = function(success) {
  if (success && !gMap) {
    console.log("[ResQNet] Google Maps JS API loaded successfully. Initializing Google Maps engine.");
    initGoogleMapsEngine();
    seedFleet();
    loadInfrastructure();
  } else if (!success && !lMap) {
    console.warn("[ResQNet] Google Maps failed, initializing Leaflet fallback engine.");
    initLeafletEngine();
    seedFleet();
    loadInfrastructure();
  }
};

function initGoogleMapsEngine() {
  const mapEl = $("map");
  if (!mapEl || gMap) return;

  // Cleanup Leaflet if running
  if (lMap) {
    try { lMap.remove(); lMap = null; } catch (_) {}
    mapEl.innerHTML = "";
  }

  defineGoogleHtmlOverlay();

  let mapTypeId = google.maps.MapTypeId.ROADMAP;
  let styles = GOOGLE_DARK_STYLE;

  if (state.mapStyle === "google_roadmap") {
    styles = [];
  } else if (state.mapStyle === "google_satellite") {
    mapTypeId = google.maps.MapTypeId.SATELLITE;
    styles = [];
  } else if (state.mapStyle === "google_hybrid") {
    mapTypeId = google.maps.MapTypeId.HYBRID;
    styles = [];
  } else if (state.mapStyle === "google_terrain") {
    mapTypeId = google.maps.MapTypeId.TERRAIN;
    styles = [];
  }

  gMap = new google.maps.Map(mapEl, {
    center: { lat: CENTER[0], lng: CENTER[1] },
    zoom: CFG.DEFAULT_ZOOM || 12,
    mapTypeId: mapTypeId,
    styles: styles,
    disableDefaultUI: true,
    zoomControl: true,
    zoomControlOptions: { position: google.maps.ControlPosition.BOTTOM_LEFT }
  });

  // Google Maps Native Traffic Layer
  gTrafficLayer = new google.maps.TrafficLayer();
  if (state.layers.traffic) {
    gTrafficLayer.setMap(gMap);
  }

  gInfoWindow = new google.maps.InfoWindow();

  gMap.addListener("click", (e) => {
    if (testMapTarget && e.latLng) {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      setTestCoordinates(testMapTarget, lat, lng);
      const resEl = $("testModeResult");
      if (resEl) resEl.textContent = `${testMapTarget === "inc" ? "Accident" : testMapTarget === "amb" ? "Ambulance" : "Hospital"} coordinates set from map click.`;
      testMapTarget = null;
    }
  });

  activeEngine = "google";
  console.log("[ResQNet] Google Maps Command Engine active with real-time traffic layer.");
}

function initLeafletEngine() {
  const mapEl = $("map");
  if (!mapEl || lMap) return;

  // Cleanup Google Maps if running
  if (gMap) {
    try {
      if (gTrafficLayer) gTrafficLayer.setMap(null);
      gMap = null;
    } catch (_) {}
    mapEl.innerHTML = "";
  }

  lMap = L.map("map", { zoomControl: false, preferCanvas: true }).setView(CENTER, CFG.DEFAULT_ZOOM || 12);
  L.control.zoom({ position: "bottomleft" }).addTo(lMap);

  const provider = MAP_PROVIDERS[state.mapStyle] || MAP_PROVIDERS.dark;
  lBaseLayer = L.tileLayer(provider.url, {
    attribution: provider.attribution,
    maxZoom: provider.maxZoom || 19,
    subdomains: provider.subdomains || "abc"
  }).addTo(lMap);

  // Operational layer groups
  L_traffic = L.layerGroup();
  if (state.layers.traffic) L_traffic.addTo(lMap);
  L_hotspots = L.layerGroup().addTo(lMap);
  L_cctvFov = L.layerGroup().addTo(lMap);
  L_cctv = L.layerGroup().addTo(lMap);
  L_route = L.layerGroup().addTo(lMap);
  L_hosp = L.layerGroup().addTo(lMap);
  L_amb = L.layerGroup().addTo(lMap);
  L_resolved = L.layerGroup();
  L_inc = L.layerGroup().addTo(lMap);

  lMap.on("click", (event) => {
    if (!testMapTarget) return;
    setTestCoordinates(testMapTarget, event.latlng.lat, event.latlng.lng);
    const resEl = $("testModeResult");
    if (resEl) resEl.textContent = `${testMapTarget === "inc" ? "Accident" : testMapTarget === "amb" ? "Ambulance" : "Hospital"} coordinates set from map click.`;
    testMapTarget = null;
  });

  activeEngine = "leaflet";
  console.log("[ResQNet] Leaflet Multi-Tile Engine active as fallback.");
}

function setMapStyle(styleKey) {
  state.mapStyle = styleKey;
  localStorage.setItem("resqnet_map_style", styleKey);
  if ($("mapStyleSelect")) $("mapStyleSelect").value = styleKey;

  if (styleKey.startsWith("google_")) {
    if (!gMap && window.google && window.google.maps) {
      initGoogleMapsEngine();
      renderAllEntities();
    } else if (gMap) {
      if (styleKey === "google_dark") {
        gMap.setMapTypeId(google.maps.MapTypeId.ROADMAP);
        gMap.setOptions({ styles: GOOGLE_DARK_STYLE });
      } else if (styleKey === "google_roadmap") {
        gMap.setMapTypeId(google.maps.MapTypeId.ROADMAP);
        gMap.setOptions({ styles: [] });
      } else if (styleKey === "google_satellite") {
        gMap.setMapTypeId(google.maps.MapTypeId.SATELLITE);
        gMap.setOptions({ styles: [] });
      } else if (styleKey === "google_hybrid") {
        gMap.setMapTypeId(google.maps.MapTypeId.HYBRID);
        gMap.setOptions({ styles: [] });
      } else if (styleKey === "google_terrain") {
        gMap.setMapTypeId(google.maps.MapTypeId.TERRAIN);
        gMap.setOptions({ styles: [] });
      }
    }
  } else {
    if (!lMap) {
      initLeafletEngine();
      renderAllEntities();
    } else {
      const provider = MAP_PROVIDERS[styleKey] || MAP_PROVIDERS.dark;
      if (lBaseLayer) lMap.removeLayer(lBaseLayer);
      lBaseLayer = L.tileLayer(provider.url, {
        attribution: provider.attribution,
        maxZoom: provider.maxZoom || 19,
        subdomains: provider.subdomains || "abc"
      }).addTo(lMap);
    }
  }
}

function renderAllEntities() {
  Object.values(state.incidents).forEach(upsertIncidentMarker);
  Object.values(state.ambulances).forEach(updateAmbulance);
  Object.values(state.hospitals).forEach(updateHospital);
  Object.values(state.cctv).forEach(renderCctvCamera);
  if (state.selectedIncidentId) drawRoute(state.selectedIncidentId);
}

/* ---------- MARKER HTML GENERATORS & PROMINENT CALLOUT BADGES ---------- */
function getIncMarkerHtml(inc, isSelected, isResolved) {
  const b = band(inc.severity);
  const isCrit = b.k === "critical";
  const sevKey = b.k || "medium";

  const badgeHtml = isSelected ? `
    <div class="callout-badge incident">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <span>${esc(inc.id || shortId(inc._id))} · SEV ${inc.severity || 85}</span>
    </div>` : "";

  return `
    ${badgeHtml}
    <div class="inc-marker sev-${sevKey} ${isSelected ? "sel" : ""} ${isResolved ? "resolved" : ""}">
      ${isCrit && !isResolved ? `<div class="ring"></div>` : ""}
      <div class="core">${isResolved ? "✓" : (inc.severity !== null ? Math.min(99, Math.round(inc.severity)) : "!")}</div>
    </div>`;
}

function getAmbMarkerHtml(amb, isSelected) {
  const s = String(amb.status || "available").toLowerCase();
  const isDispatched = amb.status === "EN_ROUTE" || amb.isMoving;

  const badgeHtml = (isSelected || isDispatched) ? `
    <div class="callout-badge ambulance ${isDispatched ? 'moving' : ''}">
      <i class="fa-solid fa-truck-medical"></i>
      <span>${esc(amb.id)} (${esc(amb.type || "ALS")})</span>
      ${isDispatched ? `<span style="color:#f59e0b;font-weight:900;"> ● EN ROUTE ${amb.eta ? `(${amb.eta}m)` : ''}</span>` : ''}
    </div>` : "";

  return `
    ${badgeHtml}
    <div class="amb-marker ${s} ${isSelected ? "sel" : ""} ${isDispatched ? "moving" : ""}">
      <i class="fa-solid fa-truck-medical"></i>
    </div>`;
}

function getHospMarkerHtml(hosp, isSelected) {
  const cap = String(hosp.capacity || "available").toLowerCase();
  const isDestHosp = isSelected;
  const isAck = isDestHosp && state.incidents[state.selectedIncidentId]?.hospitalAcknowledged;

  const badgeHtml = isDestHosp ? `
    <div class="callout-badge hospital">
      <i class="fa-solid fa-hospital"></i>
      <span>${esc(hosp.name)}</span>
      ${isAck ? '<span style="color:#4ade80;font-weight:800;margin-left:4px;">✓ ACKNOWLEDGED</span>' : '<span style="color:#fb923c;font-weight:700;margin-left:4px;">PRE-ALERT SENT</span>'}
    </div>` : "";

  return `
    ${badgeHtml}
    <div class="hosp-marker ${hosp.trauma ? "trauma" : ""} ${cap} ${isSelected ? "sel" : ""}">
      <i class="fa-solid ${hosp.trauma ? "fa-house-medical" : "fa-hospital"}"></i>
    </div>`;
}

function getCctvMarkerHtml(cam) {
  const s = String(cam.status || "ONLINE").toLowerCase();
  return `<div class="cctv-marker ${s}"><i class="fa-solid fa-video"></i></div>`;
}

/* ---------- CCTV FOV CONE GEOMETRY GENERATOR ---------- */
function createFovPolygon(lat, lng, headingDeg, fovDeg, radiusMeters) {
  const points = [[lat, lng]];
  const R = 6378137;
  const startAng = (headingDeg - fovDeg / 2) * (Math.PI / 180);
  const endAng = (headingDeg + fovDeg / 2) * (Math.PI / 180);
  const steps = 12;

  for (let i = 0; i <= steps; i++) {
    const angle = startAng + (i / steps) * (endAng - startAng);
    const dLat = (radiusMeters * Math.cos(angle)) / R;
    const dLng = (radiusMeters * Math.sin(angle)) / (R * Math.cos((lat * Math.PI) / 180));
    points.push([lat + (dLat * 180) / Math.PI, lng + (dLng * 180) / Math.PI]);
  }
  return points;
}

/* ---------- FLEET & INFRASTRUCTURE DATA INGESTION ---------- */
async function seedFleet() {
  try {
    const [ambRes, hospRes] = await Promise.all([
      fetch(API + "/fleet/ambulances"),
      fetch(API + "/fleet/hospitals")
    ]);
    const ambs = await ambRes.json();
    const hosps = await hospRes.json();
    if (Array.isArray(ambs)) ambs.forEach(updateAmbulance);
    if (Array.isArray(hosps)) hosps.forEach(updateHospital);
  } catch (e) {
    toast("OPERATIONS DATA UNAVAILABLE", "Fleet and hospital positions will appear when backend reconnects.", "warn");
  }
  renderKPIs();
  if ($("testAmbulanceId")) populateTestResources();
}

async function loadInfrastructure() {
  try {
    // 1. CCTV Cameras & FOV Cones
    const cctvRes = await fetch(API + "/fleet/cctv");
    const cams = await cctvRes.json();
    if (Array.isArray(cams)) {
      cams.forEach(renderCctvCamera);
    }

    // 2. Crash Blackspot Hotspots
    const hotRes = await fetch(API + "/fleet/hotspots");
    const hotspots = await hotRes.json();
    if (Array.isArray(hotspots)) {
      state.hotspots = hotspots;
      renderHotspots(hotspots);
    }

    // 3. Configured Traffic Context
    const trafficRes = await fetch(API + "/fleet/traffic");
    const corridors = await trafficRes.json();
    if (Array.isArray(corridors)) {
      state.trafficCorridors = corridors;
      renderTrafficCorridors(corridors);
    }
  } catch (e) {
    console.warn("[Dashboard] Infrastructure load error:", e.message);
  }
}

function renderCctvCamera(cam) {
  state.cctv[cam.id] = cam;
  const pos = [cam.lat, cam.lng];
  const popupHtml = `
    <div class="pop-t" style="color:#38BDF8"><i class="fa-solid fa-video"></i> ${esc(cam.cameraId || cam.id)}</div>
    <b>${esc(cam.cameraName || "Junction Cam")}</b><br/>
    Status: <span class="tag" style="background:#0369a1;color:#fff;padding:1px 5px;font-size:10px;">${esc(cam.status)}</span><br/>
    Coverage: <b>${cam.coverageRadiusMeters || 200}m @ ${cam.fovAngle || 65}° FOV</b><br/>
    Optical AI: <b>${cam.fps || 24} FPS · ${cam.inferenceLatency || 38}ms Latency</b><br/>
    <div style="margin-top:8px">
      <button onclick="openCctvModal('${esc(cam.cameraId || cam.id)}')" style="width:100%;padding:4px 8px;background:#38BDF8;color:#000;border:none;border-radius:4px;font-weight:bold;cursor:pointer;font-size:10px;">
        <i class="fa-solid fa-play"></i> PREVIEW CAMERA FEED
      </button>
    </div>`;

  if (activeEngine === "google" && gMap && GoogleHtmlOverlayClass) {
    if (!gOverlays.cctv[cam.id]) {
      const overlay = new GoogleHtmlOverlayClass(cam.lat, cam.lng, getCctvMarkerHtml(cam), () => {
        gInfoWindow.setContent(`<div class="gmap-infowindow">${popupHtml}</div>`);
        gInfoWindow.setPosition({ lat: cam.lat, lng: cam.lng });
        gInfoWindow.open(gMap);
      });
      overlay.setMap(gMap);
      gOverlays.cctv[cam.id] = overlay;
    } else {
      gOverlays.cctv[cam.id].setPosition(cam.lat, cam.lng);
      gOverlays.cctv[cam.id].setContent(getCctvMarkerHtml(cam));
    }

    if (cam.fovAngle && cam.heading !== undefined) {
      const cone = createFovPolygon(cam.lat, cam.lng, cam.heading, cam.fovAngle, cam.coverageRadiusMeters || 200);
      if (gFovs[cam.id]) gFovs[cam.id].setMap(null);
      gFovs[cam.id] = new google.maps.Polygon({
        paths: cone.map((pt) => ({ lat: pt[0], lng: pt[1] })),
        strokeColor: "#38BDF8",
        strokeOpacity: 0.8,
        strokeWeight: 1,
        fillColor: "#38BDF8",
        fillOpacity: 0.12,
        map: state.layers.cctv ? gMap : null
      });
    }
  } else if (activeEngine === "leaflet" && lMap) {
    if (!cctvMarkers[cam.id]) {
      cctvMarkers[cam.id] = L.marker(pos, {
        icon: L.divIcon({ className: "custom-map-icon", html: getCctvMarkerHtml(cam), iconSize: [26, 26], iconAnchor: [13, 13] })
      }).bindPopup(popupHtml).addTo(L_cctv);
    } else {
      cctvMarkers[cam.id].setLatLng(pos).setPopupContent(popupHtml);
    }

    if (cam.fovAngle && cam.heading !== undefined) {
      const cone = createFovPolygon(cam.lat, cam.lng, cam.heading, cam.fovAngle, cam.coverageRadiusMeters || 200);
      if (fovLayers[cam.id]) L_cctvFov.removeLayer(fovLayers[cam.id]);
      fovLayers[cam.id] = L.polygon(cone, {
        color: "#38BDF8",
        weight: 1,
        opacity: 0.8,
        fillColor: "#38BDF8",
        fillOpacity: 0.12
      }).bindPopup(`<b>${esc(cam.cameraId)}</b> Detection Zone`).addTo(L_cctvFov);
    }
  }
}

function renderHotspots(hotspots) {
  if (activeEngine === "google" && gMap) {
    hotspots.forEach((h, idx) => {
      const id = h.id || idx;
      if (gHotspots[id]) gHotspots[id].setMap(null);
      gHotspots[id] = new google.maps.Circle({
        strokeColor: "#EF4444",
        strokeOpacity: 0.8,
        strokeWeight: 1.5,
        fillColor: "#EF4444",
        fillOpacity: 0.16,
        map: state.layers.hotspots ? gMap : null,
        center: { lat: h.lat, lng: h.lng },
        radius: h.radiusMeters || 300
      });
    });
  } else if (activeEngine === "leaflet" && L_hotspots) {
    L_hotspots.clearLayers();
    hotspots.forEach((h, idx) => {
      const circle = L.circle([h.lat, h.lng], {
        radius: h.radiusMeters || 300,
        color: "#EF4444",
        weight: 1.5,
        opacity: 0.8,
        fillColor: "#EF4444",
        fillOpacity: 0.16
      }).bindPopup(`<div class="pop-t" style="color:var(--red)"><i class="fa-solid fa-fire"></i> ${esc(h.name)}</div>
        Risk Score: <b>${h.riskScore}/100</b><br/>Category: <b>${esc(h.category)}</b>`).addTo(L_hotspots);
      hotspotCircles[h.id || idx] = circle;
    });
  }
}

function renderTrafficCorridors(corridors) {
  if (activeEngine === "leaflet" && L_traffic) {
    L_traffic.clearLayers();
    corridors.forEach((c) => {
      const color = c.congestionLevel === "MODERATE" ? "#F97316" : "#22C55E";
      L.polyline(c.coordinates.map((pt) => [pt[1], pt[0]]), { color, opacity: 0.75, weight: 4 })
        .bindPopup(`<b>${esc(c.name)}</b><br/>Status: <b>${esc(c.trafficLabel)}</b>`).addTo(L_traffic);
    });
  }
}

/* ---------- AMBULANCE & HOSPITAL UPDATES ---------- */
function updateAmbulance(a) {
  if (!a || !a.id) return;
  const prev = state.ambulances[a.id] || {};
  const amb = { ...prev, ...a };
  state.ambulances[amb.id] = amb;
  if (num(amb.lat) === null || num(amb.lng) === null) return;

  const isSel = state.selectedIncidentId && state.routes[state.selectedIncidentId]?.ambulanceId === amb.id;
  const html = getAmbMarkerHtml(amb, isSel);

  const popupHtml = `
    <div class="pop-t" style="color:var(--orange)"><i class="fa-solid fa-truck-medical"></i> ${esc(amb.id)} · ${esc(amb.type || "ALS")}</div>
    <div style="font-size:11px;color:#cbd5e1;margin-top:4px;line-height:1.6;">
      <b>Status:</b> <span class="tag" style="background:${amb.status === 'EN_ROUTE' ? '#c2410c' : '#15803d'};color:#fff;padding:1px 6px;border-radius:3px;font-size:10px;">${esc(String(amb.status || "AVAILABLE").toUpperCase())}</span><br/>
      ${amb.currentIncidentId ? `<b>Dispatched Incident:</b> <span style="color:#fb923c;font-weight:700;">${esc(amb.currentIncidentId)}</span><br/>` : ''}
      <b>GPS Location:</b> <span class="mono">${Number(amb.lat).toFixed(4)}, ${Number(amb.lng).toFixed(4)}</span><br/>
      <b>Trauma Capable:</b> <b>${amb.traumaReady || amb.trauma ? "YES (ALS Tier-1)" : "Standard BLS"}</b><br/>
      <b>Speed:</b> <b>${amb.speed ? amb.speed + " km/h" : "0 km/h"}</b>
      ${amb.eta ? `<br/><b>ETA:</b> <b style="color:#f59e0b;">${amb.eta} min</b>` : ""}
    </div>`;

  if (activeEngine === "google" && gMap && GoogleHtmlOverlayClass) {
    if (!gOverlays.amb[amb.id]) {
      const overlay = new GoogleHtmlOverlayClass(amb.lat, amb.lng, html, () => {
        gInfoWindow.setContent(`<div class="gmap-infowindow">${popupHtml}</div>`);
        gInfoWindow.setPosition({ lat: amb.lat, lng: amb.lng });
        gInfoWindow.open(gMap);
      });
      overlay.setMap(gMap);
      gOverlays.amb[amb.id] = overlay;
    } else {
      gOverlays.amb[amb.id].setPosition(amb.lat, amb.lng);
      gOverlays.amb[amb.id].setContent(html);
    }
  } else if (activeEngine === "leaflet" && lMap) {
    const pos = [amb.lat, amb.lng];
    if (ambMarkers[amb.id]) {
      ambMarkers[amb.id].setLatLng(pos).setIcon(L.divIcon({ className: "custom-map-icon", html, iconSize: [30, 30], iconAnchor: [15, 15] })).setPopupContent(popupHtml);
    } else {
      ambMarkers[amb.id] = L.marker(pos, { icon: L.divIcon({ className: "custom-map-icon", html, iconSize: [30, 30], iconAnchor: [15, 15] }) }).bindPopup(popupHtml).addTo(L_amb);
    }
  }

  if (amb.status === "EN_ROUTE" && amb.currentIncidentId && !state.activeSimulations[amb.id]) {
    startLiveAmbulanceMotion(amb.id, amb.currentIncidentId);
  }

  renderKPIs();
}

function updateHospital(h) {
  if (!h || !h.id) return;
  state.hospitals[h.id] = { ...(state.hospitals[h.id] || {}), ...h };
  const hh = state.hospitals[h.id];
  if (num(hh.lat) === null || num(hh.lng) === null) return;

  const isSel = state.selectedIncidentId && (state.routes[state.selectedIncidentId]?.hospitalId === hh.id || state.incidents[state.selectedIncidentId]?.assignedHospitalId === hh.id || state.incidents[state.selectedIncidentId]?.assignedHospital === hh.name);
  const html = getHospMarkerHtml(hh, isSel);

  const popupHtml = `
    <div class="pop-t" style="color:var(--green)"><i class="fa-solid fa-hospital"></i> ${esc(hh.name)}</div>
    <div style="font-size:11px;color:#cbd5e1;margin-top:4px;line-height:1.6;">
      <b>Role:</b> <span>${isSel ? "<b style='color:#38bdf8;'>SELECTED DESTINATION TRAUMA CENTER</b>" : "REGIONAL TRAUMA CENTER"}</span><br/>
      <b>Trauma Capability:</b> <span class="tag" style="background:#0369a1;color:#fff;padding:1px 6px;border-radius:3px;font-size:10px;">Level ${esc(hh.traumaLevel || 1)} Trauma</span><br/>
      <b>Relevance:</b> <span>${esc(hh.relevance || "24x7 Emergency / Polytrauma Care")}</span><br/>
      <b>Emergency Capacity:</b> <b>${esc(hh.emergencyCapacity ?? hh.capacity ?? "8 Available")} Beds</b><br/>
      <b>ED Readiness:</b> <b style="color:#4ade80;">${esc(hh.edReadiness || 95)}%</b><br/>
      <b>Address:</b> <span>${esc(hh.address || "Pune Metropolitan Area")}</span><br/>
      <b>Phone:</b> <a href="tel:${esc(hh.phone || '')}" style="color:#38bdf8;text-decoration:none;font-weight:700;">${esc(hh.phone || '+91 20 2612 0000')}</a><br/>
      <b>Accurate GPS:</b> <span class="mono">${Number(hh.lat).toFixed(6)}, ${Number(hh.lng).toFixed(6)}</span>
    </div>`;

  if (activeEngine === "google" && gMap && GoogleHtmlOverlayClass) {
    if (!gOverlays.hosp[hh.id]) {
      const overlay = new GoogleHtmlOverlayClass(hh.lat, hh.lng, html, () => {
        gInfoWindow.setContent(`<div class="gmap-infowindow">${popupHtml}</div>`);
        gInfoWindow.setPosition({ lat: hh.lat, lng: hh.lng });
        gInfoWindow.open(gMap);
      });
      overlay.setMap(gMap);
      gOverlays.hosp[hh.id] = overlay;
    } else {
      gOverlays.hosp[hh.id].setPosition(hh.lat, hh.lng);
      gOverlays.hosp[hh.id].setContent(html);
    }
  } else if (activeEngine === "leaflet" && lMap) {
    const pos = [hh.lat, hh.lng];
    if (hospMarkers[hh.id]) {
      hospMarkers[hh.id].setLatLng(pos).setIcon(L.divIcon({ className: "custom-map-icon", html, iconSize: [30, 30], iconAnchor: [15, 15] })).setPopupContent(popupHtml);
    } else {
      hospMarkers[hh.id] = L.marker(pos, { icon: L.divIcon({ className: "custom-map-icon", html, iconSize: [30, 30], iconAnchor: [15, 15] }) }).bindPopup(popupHtml).addTo(L_hosp);
    }
  }

  renderKPIs();
}

/* ---------- INCIDENT RENDERING & POPUPS ---------- */
function upsertIncidentMarker(inc) {
  if (num(inc.latitude) === null || num(inc.longitude) === null) {
    if (activeEngine === "google" && gOverlays.inc[inc._id]) {
      gOverlays.inc[inc._id].setMap(null);
      delete gOverlays.inc[inc._id];
    }
    if (activeEngine === "leaflet" && incMarkers[inc._id]) {
      L_inc.removeLayer(incMarkers[inc._id]);
      L_resolved.removeLayer(incMarkers[inc._id]);
      delete incMarkers[inc._id];
    }
    return;
  }

  const isResolved = inc.status === "RESOLVED";
  const isSelected = state.selectedIncidentId === inc._id;
  const html = getIncMarkerHtml(inc, isSelected, isResolved);

  const popupHtml = `
    <div class="pop-t" style="color:${band(inc.severity).color}">
      ${isResolved ? "✓ RESOLVED" : "🚨 EMERGENCY"} · ${esc(inc.id || inc.incidentId || shortId(inc._id))}
    </div>
    <b>${esc(inc.title || "Collision Event")}</b><br/>
    Severity: <b>${inc.severity !== null ? inc.severity + "/100 (" + band(inc.severity).label + ")" : "Unavailable"}</b><br/>
    Confidence: <b>${inc.confidence !== undefined && inc.confidence !== null ? pct(inc.confidence > 1 ? inc.confidence : inc.confidence * 100) : "Unavailable"}</b><br/>
    Source: <b>${esc(srcMeta(inc.source).label)}</b><br/>
    Status: <b>${esc(inc.status || "DETECTED")}</b><br/>
    Assigned Unit: <b style="color:var(--orange)">${esc(inc.assignedAmbulance || "AMB-01 (ALS)")}</b><br/>
    Destination: <b style="color:var(--blue)">${esc(inc.assignedHospital || "Sassoon General Hospital")}</b>`;

  if (activeEngine === "google" && gMap && GoogleHtmlOverlayClass) {
    if (!gOverlays.inc[inc._id]) {
      const overlay = new GoogleHtmlOverlayClass(inc.latitude, inc.longitude, html, () => selectIncident(inc._id));
      overlay.setMap(gMap);
      gOverlays.inc[inc._id] = overlay;
    } else {
      gOverlays.inc[inc._id].setPosition(inc.latitude, inc.longitude);
      gOverlays.inc[inc._id].setContent(html);
    }
  } else if (activeEngine === "leaflet" && lMap) {
    const pos = [inc.latitude, inc.longitude];
    const icon = L.divIcon({ className: "custom-map-icon", html, iconSize: [34, 34], iconAnchor: [17, 17] });

    if (incMarkers[inc._id]) {
      incMarkers[inc._id].setLatLng(pos).setIcon(icon).setPopupContent(popupHtml);
      if (isResolved) {
        L_inc.removeLayer(incMarkers[inc._id]);
        if (state.layers.incidents) L_resolved.addTo(lMap);
      } else {
        L_resolved.removeLayer(incMarkers[inc._id]);
        if (state.layers.incidents) incMarkers[inc._id].addTo(L_inc);
      }
    } else {
      const m = L.marker(pos, { icon }).bindPopup(popupHtml);
      m.on("click", () => selectIncident(inc._id));
      if (isResolved) m.addTo(L_resolved);
      else m.addTo(L_inc);
      incMarkers[inc._id] = m;
    }
  }
}

/* ---------- AUTHORITATIVE ROUTE ENGINE & LIVE OSRM ROAD GENERATION ---------- */
async function fetchOsrmRoadRoute(ambPt, scenePt, hospPt) {
  const pts = hospPt ? [ambPt, scenePt, hospPt] : [ambPt, scenePt];
  const key = pts.map(p => `${Number(p[1]).toFixed(5)},${Number(p[0]).toFixed(5)}`).join(';');
  const endpoints = [
    `https://router.project-osrm.org/route/v1/driving/${key}?overview=full&geometries=geojson&steps=false`,
    `https://routing.openstreetmap.de/routed-car/route/v1/driving/${key}?overview=full&geometries=geojson&steps=false`,
    `${API}/route?startLng=${ambPt[1]}&startLat=${ambPt[0]}&endLng=${scenePt[1]}&endLat=${scenePt[0]}`
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const routeObj = data.routes ? data.routes[0] : (data.geometry ? data : null);
        if (routeObj && routeObj.geometry && Array.isArray(routeObj.geometry.coordinates) && routeObj.geometry.coordinates.length > 5) {
          return {
            coords: routeObj.geometry.coordinates.map(c => [c[1], c[0]]),
            distKm: (routeObj.distance / 1000).toFixed(1),
            etaMin: Math.max(1, Math.round(routeObj.duration / 60)),
            geometrySource: "OSRM REAL-TIME ROAD (TURN-BY-TURN)"
          };
        }
      }
    } catch (e) {}
  }
  return null;
}

async function drawRoute(id) {
  const inc = state.incidents[id];
  const r = state.routes[id] || {};
  if (!inc || inc.latitude === null) return;

  let coords = null, distKm = null, etaMin = r.etaMin, geometrySource = "ROUTE UNAVAILABLE";

  if (inc.route && inc.route.geometry && Array.isArray(inc.route.geometry.coordinates) && inc.route.geometry.coordinates.length > 5) {
    coords = inc.route.geometry.coordinates.map((c) => [c[1], c[0]]);
    distKm = inc.route.distanceKm ? String(inc.route.distanceKm) : distKm;
    etaMin = inc.route.etaMinutes ? Number(inc.route.etaMinutes) : etaMin;
    geometrySource = inc.route.isFallback ? "⚠ ROUTING DEGRADED" : "OSRM REAL-TIME ROAD";
  }

  const amb = state.ambulances[r.ambulanceId || inc.assignedAmbulance] || Object.values(state.ambulances)[0];
  const hosp = state.hospitals[r.hospitalId || inc.assignedHospitalId || inc.hospitalId] || Object.values(state.hospitals).find(h => h.name === inc.assignedHospital) || Object.values(state.hospitals)[0];

  const ambLat = amb ? amb.lat : 18.5300;
  const ambLng = amb ? amb.lng : 73.8400;
  const sceneLat = inc.latitude;
  const sceneLng = inc.longitude;
  const hospLat = hosp ? hosp.lat : (inc.hospitalLatitude || 18.5280);
  const hospLng = hosp ? hosp.lng : (inc.hospitalLongitude || 73.8720);

  if (!coords || coords.length <= 5) {
    const liveOsrm = await fetchOsrmRoadRoute([ambLat, ambLng], [sceneLat, sceneLng], [hospLat, hospLng]);
    if (liveOsrm && liveOsrm.coords && liveOsrm.coords.length > 5) {
      coords = liveOsrm.coords;
      distKm = liveOsrm.distKm;
      etaMin = liveOsrm.etaMin;
      geometrySource = liveOsrm.geometrySource;
      inc.route = {
        ...inc.route,
        distanceKm: Number(distKm),
        etaMinutes: Number(etaMin),
        geometry: { type: 'LineString', coordinates: coords.map(c => [c[1], c[0]]) }
      };
    }
  }

  const hospCoords = inc.hospitalRoute?.geometry?.coordinates?.map((c) => [c[1], c[0]]) || null;
  state.routes[id] = { ...r, ambulanceId: amb?.id || r.ambulanceId, hospitalId: hosp?.id || r.hospitalId, coords, hospCoords, distKm, etaMin, geometrySource };

  // Render Polylines
  if (activeEngine === "google" && gMap) {
    if (gPolylines.route1) gPolylines.route1.setMap(null);
    if (gPolylines.route1Glow) gPolylines.route1Glow.setMap(null);
    if (gPolylines.route2) gPolylines.route2.setMap(null);

    if (coords && coords.length > 0 && state.layers.routes) {
      const path1 = coords.map(c => ({ lat: c[0], lng: c[1] }));
      gPolylines.route1Glow = new google.maps.Polyline({
        path: path1,
        strokeColor: "#F59E0B",
        strokeOpacity: 0.35,
        strokeWeight: 10,
        map: gMap
      });
      gPolylines.route1 = new google.maps.Polyline({
        path: path1,
        strokeColor: "#FF9F0A",
        strokeOpacity: 0.95,
        strokeWeight: 5,
        map: gMap
      });
    }

    if (hospCoords && hospCoords.length > 0 && state.layers.routes) {
      const path2 = hospCoords.map(c => ({ lat: c[0], lng: c[1] }));
      gPolylines.route2 = new google.maps.Polyline({
        path: path2,
        strokeColor: "#38BDF8",
        strokeOpacity: 0.9,
        strokeWeight: 4,
        map: gMap
      });
    }
  } else if (activeEngine === "leaflet" && L_route) {
    L_route.clearLayers();
    if (coords && coords.length > 0 && state.layers.routes) {
      L.polyline(coords, { color: "#F59E0B", weight: 10, opacity: 0.35, lineCap: "round" }).addTo(L_route);
      L.polyline(coords, { color: "#FF9F0A", weight: 5, opacity: 0.95, lineCap: "round" }).addTo(L_route);
    }
    if (hospCoords && hospCoords.length > 0 && state.layers.routes) {
      L.polyline(hospCoords, { color: "#38BDF8", weight: 4.5, opacity: 0.9, dashArray: "8, 8", lineCap: "round" }).addTo(L_route);
    }
  }

  if (amb) updateAmbulance({ id: amb.id, eta: etaMin });
  if (hosp) updateHospital({ id: hosp.id });
  renderKPIs();
  if (state.selectedIncidentId === id) renderIncidentDetails();
}

/* ---------- LIVE DISPATCHED AMBULANCE MOTION SIMULATION ENGINE ---------- */
function startLiveAmbulanceMotion(ambId, incidentId) {
  if (state.activeSimulations[ambId]) return;

  const amb = state.ambulances[ambId];
  const inc = state.incidents[incidentId];
  const route = state.routes[incidentId] || {};
  const coords = route.coords || inc?.route?.geometry?.coordinates?.map(c => [c[1], c[0]]);

  if (!amb || !coords || coords.length < 2) return;

  console.log(`[ResQNet Motion] Initiating live dispatched movement for ${ambId} along ${coords.length} road coordinates.`);
  amb.isMoving = true;
  amb.status = "EN_ROUTE";
  amb.currentIncidentId = incidentId;
  updateAmbulance(amb);

  let currentIdx = 0;
  const totalWaypoints = coords.length;
  const initialEta = route.etaMin || 5;

  const timer = setInterval(() => {
    if (currentIdx >= totalWaypoints) {
      clearInterval(timer);
      delete state.activeSimulations[ambId];
      amb.isMoving = false;
      amb.status = "ON_SCENE";
      amb.speed = 0;
      amb.eta = 0;
      updateAmbulance(amb);

      toast("AMBULANCE ARRIVED ON SCENE", `Unit ${ambId} has arrived at the incident scene. Commencing patient triage.`, "ok");
      addActivity(`🚑 Unit ${ambId} arrived at accident scene. Initiating paramedic resuscitation.`, "ok");
      pushTimeline(incidentId, `Unit ${ambId} arrived on scene — paramedics assessing casualties`);

      // Hospital transfer phase after 4 seconds
      setTimeout(() => {
        const hospCoords = route.hospCoords || inc?.hospitalRoute?.geometry?.coordinates?.map(c => [c[1], c[0]]);
        if (hospCoords && hospCoords.length > 2) {
          toast("PATIENTS EN ROUTE TO TRAUMA CENTER", `Unit ${ambId} en route to ${inc?.assignedHospital || 'Trauma Bay'}.`, "info");
          addActivity(`🚑 Unit ${ambId} departing scene towards ${inc?.assignedHospital || 'Trauma Center'}.`, "alert");
          startHospitalTransferMotion(ambId, incidentId, hospCoords);
        }
      }, 4000);
      return;
    }

    const currentPt = coords[currentIdx];
    amb.lat = currentPt[0];
    amb.lng = currentPt[1];
    amb.speed = Math.floor(48 + Math.random() * 18);
    amb.eta = Math.max(1, Math.round(initialEta * (1 - (currentIdx / totalWaypoints))));

    if (currentIdx + 1 < totalWaypoints) {
      const nextPt = coords[currentIdx + 1];
      amb.heading = calculateBearing(currentPt[0], currentPt[1], nextPt[0], nextPt[1]);
    }

    updateAmbulance(amb);

    if (state.selectedIncidentId === incidentId) {
      if ($("routeEta")) $("routeEta").textContent = `${amb.eta} min`;
    }

    currentIdx++;
  }, 900);

  state.activeSimulations[ambId] = timer;
}

function startHospitalTransferMotion(ambId, incidentId, hospCoords) {
  const amb = state.ambulances[ambId];
  if (!amb || !hospCoords || hospCoords.length < 2) return;

  amb.isMoving = true;
  amb.status = "EN_ROUTE";
  updateAmbulance(amb);

  let idx = 0;
  const total = hospCoords.length;

  const timer = setInterval(() => {
    if (idx >= total) {
      clearInterval(timer);
      delete state.activeSimulations[ambId];
      amb.isMoving = false;
      amb.status = "ARRIVED_AT_HOSPITAL";
      amb.speed = 0;
      amb.eta = 0;
      updateAmbulance(amb);

      const hospName = state.incidents[incidentId]?.assignedHospital || "Trauma Bay";
      toast("PATIENT ADMITTED TO TRAUMA BAY", `Patients successfully admitted to ${hospName}.`, "ok");
      addActivity(`🏥 Unit ${ambId} arrived at ${hospName}. Emergency Trauma admission complete.`, "ok");
      pushTimeline(incidentId, `Patient admitted to ${hospName} emergency department`);
      return;
    }

    const pt = hospCoords[idx];
    amb.lat = pt[0];
    amb.lng = pt[1];
    amb.speed = Math.floor(52 + Math.random() * 15);
    updateAmbulance(amb);
    idx++;
  }, 900);

  state.activeSimulations[ambId] = timer;
}

/* ---------- OPERATIONAL CAMERA & VIEW CONTROLS ---------- */
function focusIncident(id) {
  const targetId = id || state.selectedIncidentId;
  const inc = state.incidents[targetId];
  if (!inc || inc.latitude === null || inc.longitude === null) {
    return toast("NO GPS POSITION", "Selected incident has unavailable GPS coordinates.", "info");
  }

  const pts = [[inc.latitude, inc.longitude]];
  const r = state.routes[targetId];
  if (r) {
    if (r.ambulanceId && state.ambulances[r.ambulanceId]) {
      const a = state.ambulances[r.ambulanceId];
      if (a.lat && a.lng) pts.push([a.lat, a.lng]);
    }
    if (r.hospitalId && state.hospitals[r.hospitalId]) {
      const h = state.hospitals[r.hospitalId];
      if (h.lat && h.lng) pts.push([h.lat, h.lng]);
    }
  }

  if (activeEngine === "google" && gMap) {
    if (pts.length === 1) {
      gMap.setCenter({ lat: pts[0][0], lng: pts[0][1] });
      gMap.setZoom(15);
    } else {
      const bounds = new google.maps.LatLngBounds();
      pts.forEach(p => bounds.extend({ lat: p[0], lng: p[1] }));
      gMap.fitBounds(bounds, { top: 60, bottom: 60, left: 60, right: 60 });
    }
  } else if (activeEngine === "leaflet" && lMap) {
    if (pts.length === 1) {
      lMap.setView(pts[0], 15);
    } else {
      lMap.fitBounds(L.latLngBounds(pts).pad(0.2));
    }
  }
}

function fitAll() {
  const pts = [];
  Object.values(state.incidents).forEach(i => { if (i.latitude && i.longitude) pts.push([i.latitude, i.longitude]); });
  Object.values(state.ambulances).forEach(a => { if (a.lat && a.lng) pts.push([a.lat, a.lng]); });
  Object.values(state.hospitals).forEach(h => { if (h.lat && h.lng) pts.push([h.lat, h.lng]); });

  if (!pts.length) pts.push(CENTER);

  if (activeEngine === "google" && gMap) {
    const bounds = new google.maps.LatLngBounds();
    pts.forEach(p => bounds.extend({ lat: p[0], lng: p[1] }));
    gMap.fitBounds(bounds, { top: 50, bottom: 50, left: 50, right: 50 });
  } else if (activeEngine === "leaflet" && lMap) {
    lMap.fitBounds(L.latLngBounds(pts).pad(0.15));
  }
}

function fitFleet() {
  const pts = [];
  Object.values(state.ambulances).forEach(a => { if (a.lat && a.lng) pts.push([a.lat, a.lng]); });
  if (!pts.length) return toast("NO AMBULANCES", "No ambulances on map.", "info");

  if (activeEngine === "google" && gMap) {
    const bounds = new google.maps.LatLngBounds();
    pts.forEach(p => bounds.extend({ lat: p[0], lng: p[1] }));
    gMap.fitBounds(bounds, { top: 50, bottom: 50, left: 50, right: 50 });
  } else if (activeEngine === "leaflet" && lMap) {
    lMap.fitBounds(L.latLngBounds(pts).pad(0.2));
  }
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
  if (leg) leg.classList.toggle("hidden");
}

function toggleLayer(name, btn) {
  state.layers[name] = !state.layers[name];
  if (btn) btn.classList.toggle("on", state.layers[name]);

  if (name === "traffic") {
    if (activeEngine === "google" && gTrafficLayer && gMap) {
      gTrafficLayer.setMap(state.layers.traffic ? gMap : null);
    } else if (activeEngine === "leaflet" && L_traffic && lMap) {
      if (state.layers.traffic) L_traffic.addTo(lMap);
      else lMap.removeLayer(L_traffic);
    }
    return;
  }

  if (activeEngine === "google" && gMap) {
    if (name === "incidents") Object.values(gOverlays.inc).forEach(o => o.setVisible(state.layers.incidents));
    if (name === "ambulances") Object.values(gOverlays.amb).forEach(o => o.setVisible(state.layers.ambulances));
    if (name === "hospitals") Object.values(gOverlays.hosp).forEach(o => o.setVisible(state.layers.hospitals));
    if (name === "cctv") {
      Object.values(gOverlays.cctv).forEach(o => o.setVisible(state.layers.cctv));
      Object.values(gFovs).forEach(p => p.setMap(state.layers.cctv ? gMap : null));
    }
    if (name === "hotspots") Object.values(gHotspots).forEach(c => c.setMap(state.layers.hotspots ? gMap : null));
    if (name === "routes") {
      if (gPolylines.route1) gPolylines.route1.setMap(state.layers.routes ? gMap : null);
      if (gPolylines.route1Glow) gPolylines.route1Glow.setMap(state.layers.routes ? gMap : null);
      if (gPolylines.route2) gPolylines.route2.setMap(state.layers.routes ? gMap : null);
    }
  } else if (activeEngine === "leaflet" && lMap) {
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
        g.addTo(lMap);
        if (name === "cctv") L_cctvFov.addTo(lMap);
      } else {
        lMap.removeLayer(g);
        if (name === "cctv") lMap.removeLayer(L_cctvFov);
      }
    }
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
    assignedHospitalId: raw.hospitalId || raw.assignedHospitalId || null,
    ambulanceReason: raw.ambulanceReason,
    hospitalReason: raw.hospitalReason,
    route: raw.route,
    hospitalRoute: raw.hospitalRoute,
    hospitalPreAlert: raw.hospitalPreAlert,
    hospitalAcknowledged: raw.hospitalAcknowledged || false,
    hospitalAckAt: raw.hospitalAckAt || null,
    hospitalAckBy: raw.hospitalAckBy || null,
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
        hospitalId: inc.assignedHospitalId || inc.assignedHospital,
        etaMin: inc.route.etaMinutes,
        coords: inc.route.geometry?.coordinates?.map((c) => [c[1], c[0]])
      };
      drawRoute(id);
    }
  }

  focusIncident(id);
}

function renderIncidentList() {
  const el = $("incidentList");
  if (!el) return;
  const list = Object.values(state.incidents).filter(matchesFilters).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  $("sidebarCount").textContent = list.length;

  if (!list.length) {
    el.innerHTML = `<div class="empty"><div class="ico"><i class="fa-solid fa-shield-halved"></i></div><h4>NO ACTIVE INCIDENTS</h4><p>Command center is monitoring all detection channels in real-time.</p></div>`;
    return;
  }

  el.innerHTML = list.map((inc) => {
    const b = band(inc.severity);
    const sel = inc._id === state.selectedIncidentId;
    const isResolved = inc.status === "RESOLVED";
    const src = srcMeta(inc.source);
    const gForceTxt = inc.gForce ? `${inc.gForce}G` : "—";
    const speedTxt = inc.speedDeltaKmh ? `Δv ${inc.speedDeltaKmh}k` : (inc.speedKmh ? `${inc.speedKmh}k` : "—");
    const isAck = inc.hospitalAcknowledged === true;
    const isDispatched = inc.status === "EN_ROUTE" || inc.status === "DISPATCHED";
    const ambUnit = inc.assignedAmbulance || inc.ambulanceId || 'AMB-01 (Assigned)';
    const hospDest = inc.hospitalAckBy || inc.assignedHospital || inc.destinationHospital || 'Sassoon General Hospital';

    return `<div class="card ${sel ? "sel" : ""} ${isResolved ? "resolved" : ""}" id="card-${inc._id}" onclick="selectIncident('${inc._id}')" style="border-left-color:${isResolved ? '#64748B' : b.color}">
      <div class="card-top">
        <span class="card-id">${esc(inc.id || shortId(inc._id))}</span>
        <span class="tag ${b.k}" style="${isResolved ? 'background:rgba(255,255,255,.08);color:#94A3B8;border-color:#475569' : ''}">${isResolved ? '✓ RESOLVED' : b.label}</span>
      </div>
      <div class="card-title">${esc(inc.title)}</div>
      <div class="card-src">
        <span><i class="fa-solid ${src.icon}"></i> ${esc(src.label)}</span>
        <span><i class="fa-regular fa-clock"></i> ${hhmmss(inc.createdAt)}</span>
      </div>
      <div class="card-metrics">
        <div class="metric"><div class="k">SEVERITY</div><div class="v" style="color:${b.color}">${inc.severity !== null ? inc.severity : "—"}</div></div>
        <div class="metric"><div class="k">IMPACT</div><div class="v">${gForceTxt}</div></div>
        <div class="metric"><div class="k">SPEED</div><div class="v">${speedTxt}</div></div>
      </div>
      <div class="card-foot" style="flex-direction:column;align-items:flex-start;gap:5px;margin-top:6px;border-top:1px dashed rgba(255,255,255,0.08);padding-top:6px;">
        <div style="display:flex;justify-content:space-between;width:100%;align-items:center;font-size:11px;">
          <span>🚑 Unit: <b class="mono" style="color:${isDispatched ? 'var(--orange)' : 'var(--green)'}">${esc(ambUnit)}</b></span>
          <span style="font-size:10px;font-weight:700;padding:1px 5px;border-radius:3px;background:${isDispatched ? '#c2410c' : '#15803d'};color:#fff;">
            ${isDispatched ? 'DISPATCHED' : 'READY'}
          </span>
        </div>
        <div style="display:flex;justify-content:space-between;width:100%;align-items:center;font-size:11px;">
          <span style="color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px;">🏥 <b>${esc(hospDest)}</b></span>
          ${isAck ? '<span style="background:#14532d;color:#4ade80;font-size:10px;padding:1px 6px;border-radius:4px;font-weight:800;border:1px solid #22c55e44;"><i class="fa-solid fa-check-double"></i> ACKNOWLEDGED</span>' : '<span style="background:#451a03;color:#fb923c;font-size:10px;padding:1px 6px;border-radius:4px;font-weight:700;border:1px solid #f9731644;"><i class="fa-solid fa-clock"></i> AWAITING ACK</span>'}
        </div>
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
    if ($("panelEmpty")) $("panelEmpty").style.display = "block";
    ["colWorkflow", "colSources", "colDispatch", "colHospital", "colTimeline"].forEach((c) => $(c) && ($(c).style.display = "none"));
    if ($("panelSub")) $("panelSub").textContent = "no incident selected";
    return;
  }

  if ($("panelEmpty")) $("panelEmpty").style.display = "none";
  ["colWorkflow", "colSources", "colDispatch", "colHospital", "colTimeline"].forEach((c) => $(c) && ($(c).style.display = "flex"));

  if ($("panelSub")) $("panelSub").textContent = `${inc.id || shortId(inc._id)} · ${inc.title}`;

  // 1. Column Workflow
  const isDispatched = inc.status === "EN_ROUTE" || inc.status === "RESOLVED";
  const isResolved = inc.status === "RESOLVED";
  if ($("stepper")) {
    $("stepper").innerHTML = `
      <div class="step done"><div class="n"><i class="fa-solid fa-check"></i></div><span>DETECT</span></div>
      <div class="step-l done"></div>
      <div class="step done"><div class="n"><i class="fa-solid fa-check"></i></div><span>VERIFY</span></div>
      <div class="step-l done"></div>
      <div class="step done"><div class="n"><i class="fa-solid fa-check"></i></div><span>OPTIMIZE</span></div>
      <div class="step-l ${isDispatched ? 'done' : ''}"></div>
      <div class="step ${isDispatched ? (isResolved ? 'done' : 'cur') : ''}"><div class="n">${isDispatched ? (isResolved ? '<i class="fa-solid fa-check"></i>' : '4') : '4'}</div><span>DISPATCH</span></div>
      <div class="step-l ${isResolved ? 'done' : ''}"></div>
      <div class="step ${isResolved ? 'done' : ''}"><div class="n">${isResolved ? '<i class="fa-solid fa-check"></i>' : '5'}</div><span>RESOLVE</span></div>`;
  }

  const b = band(inc.severity);
  if ($("sevVal")) {
    $("sevVal").textContent = inc.severity !== null ? `${inc.severity}/100 — ${b.label}` : "NOT ASSESSED";
    $("sevVal").style.color = b.color;
  }
  if ($("sevBar")) {
    $("sevBar").style.width = inc.severity ? `${inc.severity}%` : "0%";
    $("sevBar").style.background = b.color;
  }
  if ($("sevClass")) $("sevClass").textContent = b.label;

  const conf = inc.confidence !== null ? (inc.confidence > 1 ? inc.confidence : Math.round(inc.confidence * 100)) : null;
  if ($("confVal")) $("confVal").textContent = conf !== null ? `${conf}%` : "N/A";
  if ($("confBar")) $("confBar").style.width = conf ? `${conf}%` : "0%";

  if ($("patVal")) $("patVal").textContent = `${inc.patients || 1} casualty`;
  if ($("locVal")) $("locVal").textContent = inc.latitude !== null ? `${inc.latitude.toFixed(4)}, ${inc.longitude.toFixed(4)}` : "Unavailable";
  if ($("statVal")) {
    $("statVal").textContent = inc.status || "DETECTED";
    $("statVal").style.color = inc.status === "EN_ROUTE" ? "var(--orange)" : (inc.status === "RESOLVED" ? "var(--green)" : "var(--text)");
  }

  // 2. Column Detection Sources
  const sources = inc.sources && inc.sources.length > 0 ? inc.sources : [{ source: inc.source, confidence: conf || 95 }];
  if ($("sourcesBox")) {
    $("sourcesBox").innerHTML = sources.map((s) => `
      <div class="srcline">
        <span><i class="fa-solid ${srcMeta(s.source).icon}"></i> ${esc(srcMeta(s.source).label)}</span>
        <b>${s.confidence !== undefined ? (s.confidence > 1 ? Math.round(s.confidence) : Math.round(s.confidence * 100)) : 95}%</b>
      </div>`).join("");
  }
  if ($("fusedVal")) $("fusedVal").textContent = conf !== null ? `${conf}%` : "95%";

  // 3. Column Dispatch & Ambulance Optimisation
  const r = state.routes[inc._id] || {};
  const amb = state.ambulances[r.ambulanceId || inc.assignedAmbulance];
  const assignedAmbCode = amb ? `${amb.id} (${amb.type || "ALS"})` : (inc.assignedAmbulance || "AMB-01 (ALS Unit)");
  const isAmbDispatched = inc.status === "EN_ROUTE" || amb?.status === "EN_ROUTE" || inc.status === "DISPATCHED";

  if ($("ambBox")) {
    $("ambBox").innerHTML = `
      <div style="background:${isAmbDispatched ? 'rgba(249,115,22,0.12)' : 'rgba(34,197,94,0.1)'};border:1px solid ${isAmbDispatched ? '#f9731655' : '#22c55e44'};border-radius:6px;padding:8px 10px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-size:11px;font-weight:800;color:${isAmbDispatched ? '#fb923c' : '#4ade80'};">
            <i class="fa-solid fa-truck-medical"></i> ${isAmbDispatched ? 'DISPATCHED & EN ROUTE' : 'DISPATCH UNIT READY'}
          </div>
          <div style="font-size:10px;color:#94a3b8;margin-top:2px;">Dispatched Fleet Unit: <b style="color:#fff;">${esc(assignedAmbCode)}</b></div>
        </div>
        <span class="tag" style="background:${isAmbDispatched ? '#c2410c' : '#15803d'};color:#fff;font-weight:800;font-size:10px;padding:2px 7px;border-radius:4px;">
          ${isAmbDispatched ? 'ACTIVE DISPATCH' : 'READY'}
        </span>
      </div>
      <div class="kv"><span>Assigned Ambulance</span><b>${esc(assignedAmbCode)}</b></div>
      <div class="kv"><span>Unit Telemetry</span><b style="color:${amb?.status === 'EN_ROUTE' ? 'var(--orange)' : 'var(--green)'}">${amb ? amb.status : (inc.status || "AVAILABLE")} · ${amb?.speed ? amb.speed + ' km/h' : '0 km/h'}</b></div>
      <div class="kv"><span>Trauma Capable</span><b style="color:var(--green)">${amb?.traumaReady || amb?.trauma ? "YES (ALS Tier-1)" : "YES"}</b></div>`;
  }
  if ($("ambReason")) {
    $("ambReason").innerHTML = inc.ambulanceReason || `<b>Unit ${esc(r.ambulanceId || inc.assignedAmbulance || 'AMB-01')}</b> selected by topological OSRM road proximity and real-time Pune traffic weighting.`;
  }
  if ($("routeBadge")) $("routeBadge").textContent = isAmbDispatched ? "DISPATCHED" : (r.geometrySource || "OSRM ROAD");
  if ($("routeDist")) $("routeDist").textContent = r.distKm ? `${r.distKm} km` : (inc.route?.distanceKm ? `${inc.route.distanceKm} km` : "—");
  if ($("routeEta")) $("routeEta").textContent = amb?.eta ? `${amb.eta} min` : (r.etaMin ? `${r.etaMin} min` : (inc.route?.etaMinutes ? `${inc.route.etaMinutes} min` : "—"));
  if ($("routeGeom")) $("routeGeom").textContent = r.geometrySource || (inc.route?.isFallback ? "Fallback Direct" : "OSRM Turn-by-Turn Road");

  // 4. Column Hospital Pre-Alert & Performance
  const hosp = state.hospitals[r.hospitalId || inc.assignedHospitalId || inc.hospitalId] || Object.values(state.hospitals).find(h => h.name === inc.assignedHospital);
  const hospName = hosp ? hosp.name : (inc.hospitalAckBy || inc.assignedHospital || "Sassoon General Hospital / BJGMC");
  const isAck = inc.hospitalAcknowledged === true;

  if ($("hospBox")) {
    $("hospBox").innerHTML = `
      ${isAck ? `
        <div style="background:#064e3b;border:1px solid #10b981;border-radius:6px;padding:8px 10px;margin-bottom:6px;display:flex;align-items:center;gap:8px;">
          <i class="fa-solid fa-circle-check" style="color:#34d399;font-size:18px;"></i>
          <div>
            <div style="color:#fff;font-size:11px;font-weight:800;">TRAUMA BAY ACKNOWLEDGED & PREPARED</div>
            <div style="font-size:10px;color:#a7f3d0;"><b>${esc(inc.hospitalAckBy || hospName)}</b> acknowledged pre-alert ${inc.hospitalAckAt ? 'at ' + hhmmss(inc.hospitalAckAt) : 'recently'}</div>
          </div>
        </div>
      ` : `
        <div style="background:#451a03;border:1px solid #f97316;border-radius:6px;padding:8px 10px;margin-bottom:6px;display:flex;align-items:center;gap:8px;">
          <i class="fa-solid fa-clock-rotate-left" style="color:#fb923c;font-size:18px;"></i>
          <div>
            <div style="color:#fff;font-size:11px;font-weight:800;">PRE-ALERT SENT · AWAITING HOSPITAL ACK</div>
            <div style="font-size:10px;color:#fdba74;">Emergency department pre-notified with patient dossier</div>
          </div>
        </div>
      `}
      <div class="kv"><span>Destination Trauma Center</span><b>${esc(hospName)}</b></div>
      <div class="kv"><span>Trauma Designation</span><b style="color:var(--blue)">Level ${hosp?.traumaLevel || 1} Trauma Center</b></div>
      <div class="kv"><span>Emergency Capacity</span><b>${esc(hosp?.emergencyCapacity ?? hosp?.capacity ?? "8 Available")} Beds</b></div>
      <div class="kv"><span>Trauma Relevance</span><b style="font-size:10px;color:#cbd5e1;">${esc(hosp?.relevance || "24x7 Emergency / Polytrauma Care")}</b></div>
      <div class="kv"><span>Direct Phone</span><b><a href="tel:${esc(hosp?.phone || '')}" style="color:#38bdf8;text-decoration:none;font-weight:700;">${esc(hosp?.phone || '+91 20 2612 8000')}</a></b></div>`;
  }

  const perf = state.perf[inc._id] || { "AI Fusion": 14, "OSRM Routing": 28, "Dispatch Optimization": 8 };
  if ($("perfBox")) {
    $("perfBox").innerHTML = Object.entries(perf).map(([k, v]) => `
      <div class="kv" style="font-size:10px"><span>${esc(k)}</span><b>${v} ms</b></div>`).join("") +
      `<div class="kv" style="font-size:10px;border-top:1px dashed rgba(255,255,255,.08);padding-top:3px"><span>End-to-End</span><b style="color:var(--blue)">${Object.values(perf).reduce((a, c) => a + c, 0)} ms</b></div>`;
  }

  // 5. Column Timeline
  const tl = state.timelines[inc._id] || inc.timeline || [];
  if ($("timelineBox")) {
    $("timelineBox").innerHTML = tl.length ? tl.map((e) => `
      <div class="feed-item ok" style="padding:4px 6px;font-size:10px">
        <span class="t">${hhmmss(e.timestamp || e.t)}</span>
        <span class="m">${esc(e.description || e.text)}</span>
      </div>`).join("") : `<div class="hint">Awaiting initial telemetry events</div>`;
  }

  // Button States
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
  const routeAmbs = ambs.filter((a) => a.status === "EN_ROUTE" || a.isMoving);
  const hosps = Object.values(state.hospitals);

  if ($("kpiActive")) $("kpiActive").textContent = active.length;
  if ($("kpiCritical")) $("kpiCritical").textContent = crit.length;
  if ($("kpiAmbAvail")) $("kpiAmbAvail").textContent = availAmbs.length;
  if ($("kpiAmbRoute")) $("kpiAmbRoute").textContent = routeAmbs.length;
  if ($("kpiHosp")) $("kpiHosp").textContent = hosps.length;
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

/* ---------- SOCKET.IO REAL-TIME INTEGRATION ---------- */
function initSocket() {
  try {
    const socket = io(BACKEND_URL, {
      auth: { token: sessionToken },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity
    });

    socket.on("connect", () => {
      setHealth("Socket", true);
      addActivity("Real-time Socket.IO link established", "ok");
    });
    socket.on("disconnect", () => setHealth("Socket", false));
    socket.on("connect_error", (err) => {
      console.warn("[Socket.IO] Connection warning:", err.message);
      setHealth("Socket", false);
    });

    const handleNewIncident = (inc) => {
      const norm = normalizeIncident(inc);
      state.incidents[norm._id] = norm;
      state.seen.add(norm._id);
      upsertIncidentMarker(norm);
      renderIncidentList();
      renderKPIs();
      addActivity(`🚨 New incident reported: ${norm.title}`, "alert");
      selectIncident(norm._id);
      focusIncident(norm._id);
    };

    socket.on("incident:new", handleNewIncident);
    socket.on("incident:created", handleNewIncident);
    socket.on("incidentCreated", handleNewIncident);

    const applyIncidentUpdate = (inc) => {
      const norm = normalizeIncident(inc);
      state.incidents[norm._id] = norm;
      upsertIncidentMarker(norm);
      renderIncidentList();
      renderKPIs();
      if (state.selectedIncidentId === norm._id) {
        renderIncidentDetails();
        if (norm.route) drawRoute(norm._id);
      }
    };

    socket.on("incident:update", applyIncidentUpdate);
    socket.on("incident:updated", applyIncidentUpdate);
    socket.on("incidentUpdated", applyIncidentUpdate);

    socket.on("ambulance:telemetry", (amb) => updateAmbulance(amb));
    socket.on("ambulance:location", (amb) => updateAmbulance(amb));
    socket.on("ambulance:status", (event) => {
      const current = state.ambulances[event.ambulanceId];
      if (current) updateAmbulance({ ...current, status: event.status, currentIncidentId: event.incidentId || current.currentIncidentId });
    });
    socket.on("ambulance:assigned", (data) => {
      if (data.incidentId && state.incidents[data.incidentId]) {
        state.incidents[data.incidentId].assignedAmbulance = data.ambulance?.id;
        state.incidents[data.incidentId].route = data.route;
        drawRoute(data.incidentId);
      }
    });

    socket.on("ambulance:location:update", (amb) => { updateAmbulance(amb); populateTestResources(); });
    socket.on("hospital:location:update", (hosp) => { updateHospital(hosp); populateTestResources(); });

    socket.on("hospital:alert:ack", (data) => {
      const id = data.incidentId;
      if (id && state.incidents[id]) {
        state.incidents[id].hospitalAcknowledged = true;
        state.incidents[id].hospitalAckAt = new Date().toISOString();
        if (data.hospitalName) state.incidents[id].hospitalAckBy = data.hospitalName;
        renderIncidentList();
        if (state.selectedIncidentId === id) renderIncidentDetails();
      }
      const hospTxt = data.hospitalName || "Hospital Trauma Bay";
      addActivity(`🏥 ${hospTxt} acknowledged trauma pre-alert for incident ${id || ''} (Trauma Bay Prepared)`, "ok");
    });
    socket.on("hospital:ack", (data) => {
      const id = data.incidentId;
      if (id && state.incidents[id]) {
        state.incidents[id].hospitalAcknowledged = true;
        state.incidents[id].hospitalAckAt = new Date().toISOString();
        if (data.hospitalName) state.incidents[id].hospitalAckBy = data.hospitalName;
        renderIncidentList();
        if (state.selectedIncidentId === id) renderIncidentDetails();
      }
    });

    const handleResolved = (data) => {
      const id = data.incidentId || data.id;
      if (state.incidents[id]) {
        state.incidents[id].status = "RESOLVED";
        upsertIncidentMarker(state.incidents[id]);
        renderIncidentList();
        renderKPIs();
        if (state.selectedIncidentId === id) renderIncidentDetails();
      }
    };
    socket.on("incident:resolved", handleResolved);
    socket.on("incidentResolved", handleResolved);

    socket.on("cctv:accident", (data) => {
      addActivity(`📹 Optical Collision Anomaly detected by ${data.cameraId} (${data.confidence}% confidence)`, "alert");
      toast("CCTV COLLISION ALERT", `Optical crash anomaly reported by ${data.cameraId}`, "alert");
      if (data.incidentId && state.incidents[data.incidentId]) {
        selectIncident(data.incidentId);
      }
    });

    socket.on("demo:reset", () => {
      syncIncidents(true);
      seedFleet();
    });
  } catch (e) {
    setHealth("Socket", false);
  }
}

/* ---------- OPERATOR ACTIONS ---------- */
async function dispatchAmbulance() {
  const inc = state.incidents[state.selectedIncidentId];
  if (!inc) return;
  const r = state.routes[inc._id] || {};
  const ambId = r.ambulanceId || inc.assignedAmbulance || "AMB-01";

  try {
    const res = await fetch(`${API}/incidents/${inc._id}/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ambulanceId: ambId })
    });
    const d = await res.json();
    if (d.success) {
      inc.status = "EN_ROUTE";
      pushTimeline(inc._id, `Operator authorized dispatch for Unit ${ambId}`);
      renderIncidentDetails();
      toast("UNIT DISPATCHED", `Unit ${ambId} is en route.`, "ok");

      // Start live ambulance motion animation immediately
      startLiveAmbulanceMotion(ambId, inc._id);
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
        hospitalId: inc.assignedHospitalId || inc.assignedHospital,
        etaMin: d.incident.route?.etaMinutes || 4,
        coords: d.incident.route?.geometry?.coordinates?.map((c) => [c[1], c[0]])
      };
      drawRoute(inc._id);
      pushTimeline(inc._id, `Automated failover reassigned to Unit ${d.newAmbulance.code}`);
      renderIncidentDetails();
      toast("FAILOVER DISPATCHED", `Unit ${d.newAmbulance.code} reassigned.`, "ok");
      startLiveAmbulanceMotion(d.newAmbulance.id, inc._id);
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

/* ---------- DEMO SIMULATOR SUITE ---------- */
async function runDemo(source) {
  closeDemo();
  state.demoBusy = true;

  if (source === "fusion") {
    const fusionId = `RNQ-FUSION-${Date.now().toString().slice(-4)}`;
    const lat = 18.5308;
    const lng = 73.8290;

    toast("FUSION DEMO", "Step 1: CCTV optical collision detected at Pune University Junction...", "info");
    try {
      await fetch(API + "/cctv/events", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cctv-auth-token": "resqnet-cctv-secure-token-2026" },
        body: JSON.stringify({
          id: fusionId,
          cameraId: "CCTV-01",
          latitude: lat,
          longitude: lng,
          confidence: 0.94,
          isDemo: true,
          evidence: { spatial_collision: true, max_iou: 0.42, rapid_deceleration: true }
        })
      });

      setTimeout(async () => {
        toast("FUSION DEMO", "Step 2: Smartphone IMU crash report arrived at same coordinates -> Fusing!", "ok");
        await fetch(API + "/incidents/detect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: "smartphone",
            latitude: lat + 0.0001,
            longitude: lng + 0.0001,
            gForce: 5.6,
            speedDeltaKmh: 64,
            confidence: 0.96,
            isDemo: true
          })
        });
      }, 1000);
    } catch (e) {
      toast("FUSION DEMO ERROR", e.message, "error");
    } finally {
      state.demoBusy = false;
    }
    return;
  }

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
    state.routes = {};
    state.timelines = {};
    state.selectedIncidentId = null;
    Object.values(state.activeSimulations).forEach(clearInterval);
    state.activeSimulations = {};

    renderIncidentList();
    renderIncidentDetails();
    renderKPIs();
    renderAllEntities();
    toast("DEMO RESET", "Cleared all demo incidents and routes.", "ok");
  } catch (e) {
    toast("RESET ERROR", e.message, "error");
  }
}

/* ---------- EVENT WIRING ---------- */
window.openCctvModal = (cameraId) => {
  const cam = state.cctv[cameraId] || { id: cameraId, name: `Camera ${cameraId}`, lat: 18.5204, lng: 73.8567, road: 'Main Corridor', status: 'ONLINE', fps: 24, inferenceLatency: 38 };
  if ($("cctvModalTitle")) $("cctvModalTitle").textContent = `${cam.cameraName || cam.name || cameraId} OPTICAL STREAM`;
  if ($("cctvModalSub")) $("cctvModalSub").textContent = `${cameraId} • ${cam.lat ? Number(cam.lat).toFixed(4) : 18.5204}, ${cam.lng ? Number(cam.lng).toFixed(4) : 73.8567}`;
  if ($("cctvModalRoad")) $("cctvModalRoad").textContent = cam.road || "Main Corridor";
  if ($("cctvModalBadge")) $("cctvModalBadge").textContent = cam.status || "ONLINE";
  if ($("cctvStreamMetrics")) $("cctvStreamMetrics").textContent = `FPS: ${cam.fps || 24.0} | YOLO Latency: ${cam.inferenceLatency || 38}ms | Model: YOLOv8n`;
  if ($("cctvModal")) $("cctvModal").style.display = "block";
};

function wire() {
  if ($("closeCctvModal")) $("closeCctvModal").onclick = () => { if ($("cctvModal")) $("cctvModal").style.display = "none"; };

  setInterval(() => {
    if ($("clock")) $("clock").textContent = new Date().toLocaleTimeString("en-GB", { hour12: false }) + " IST";
  }, 1000);

  if ($("mapStyleSelect")) $("mapStyleSelect").onchange = (e) => setMapStyle(e.target.value);

  if ($("healthBtn")) {
    $("healthBtn").onclick = (e) => {
      e.stopPropagation();
      const p = $("healthPopover");
      if (p) {
        p.classList.toggle("show");
        $("healthBtn").setAttribute("aria-expanded", p.classList.contains("show"));
      }
    };
  }
  document.addEventListener("click", (e) => {
    const pop = $("healthPopover"), btn = $("healthBtn");
    if (pop && btn && !pop.contains(e.target) && e.target !== btn) pop.classList.remove("show");
  });

  document.querySelectorAll(".mbtn[data-layer]").forEach((b) => (b.onclick = () => toggleLayer(b.dataset.layer, b)));

  if ($("fitAllBtn")) $("fitAllBtn").onclick = fitAll;
  if ($("focusIncBtn")) $("focusIncBtn").onclick = () => focusIncident();
  if ($("fitFleetBtn")) $("fitFleetBtn").onclick = fitFleet;
  if ($("fullScreenBtn")) $("fullScreenBtn").onclick = toggleFullscreen;
  if ($("legendToggleBtn")) $("legendToggleBtn").onclick = toggleLegend;
  if ($("closeLegendBtn")) $("closeLegendBtn").onclick = toggleLegend;

  if ($("btnCenter")) $("btnCenter").onclick = () => focusIncident();
  if ($("btnRoute")) $("btnRoute").onclick = () => {
    if (state.selectedIncidentId) drawRoute(state.selectedIncidentId);
  };
  if ($("btnDispatch")) $("btnDispatch").onclick = dispatchAmbulance;
  if ($("btnFailover")) $("btnFailover").onclick = failoverAmbulance;
  if ($("btnResolve")) $("btnResolve").onclick = resolveIncident;

  if ($("btnCollapse")) {
    $("btnCollapse").onclick = () => {
      const p = $("panel");
      if (p) {
        p.classList.toggle("collapsed");
        if ($("collapseIcon")) $("collapseIcon").className = "fa-solid fa-chevron-" + (p.classList.contains("collapsed") ? "up" : "down");
      }
    };
  }

  if ($("demoBtn")) $("demoBtn").onclick = openDemo;
  if ($("demoClose")) $("demoClose").onclick = closeDemo;
  if ($("demoModal")) $("demoModal").onclick = (e) => { if (e.target === $("demoModal")) closeDemo(); };
  if ($("demoSmartphone")) $("demoSmartphone").onclick = () => runDemo("smartphone");
  if ($("demoCctv")) $("demoCctv").onclick = () => runDemo("cctv");
  if ($("demoCitizen")) $("demoCitizen").onclick = () => runDemo("citizen");
  if ($("demoFusion")) $("demoFusion").onclick = () => runDemo("fusion");
  if ($("demoReset")) $("demoReset").onclick = resetDemo;
  wireTestMode();

  if ($("tabIncidents")) $("tabIncidents").onclick = () => switchTab("incidents");
  if ($("tabFeed")) $("tabFeed").onclick = () => switchTab("feed");
  if ($("searchInput")) {
    $("searchInput").addEventListener("input", debounce((e) => { state.filters.q = e.target.value.trim(); applyFilters(); }, 180));
  }
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

const openDemo = () => { if ($("demoModal")) $("demoModal").classList.add("show"); };
const closeDemo = () => { if ($("demoModal")) $("demoModal").classList.remove("show"); };

function setTestCoordinates(target, lat, lng) {
  const prefix = target === "amb" ? "testAmb" : target === "hosp" ? "testHosp" : "testInc";
  if ($(prefix + "Lat")) $(prefix + "Lat").value = Number(lat).toFixed(6);
  if ($(prefix + "Lng")) $(prefix + "Lng").value = Number(lng).toFixed(6);
}
function validTestCoordinates(lat, lng) { return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180; }

function populateTestResources() {
  const fill = (id, records, label) => {
    const select = $(id);
    if (!select) return;
    const previous = select.value;
    select.innerHTML = records.map(r => `<option value="${esc(r.id)}">${esc(r.id)} — ${esc(label(r))}</option>`).join("");
    if (previous) select.value = previous;
  };
  fill("testAmbulanceId", Object.values(state.ambulances), a => a.code || a.name || "Unit");
  fill("testHospitalId", Object.values(state.hospitals), h => h.name || "Hospital");
}

async function securedTestRequest(url, body, method = "POST") {
  const response = await fetch(API + url, { method, headers: authHeaders(), body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Test operation failed");
  return data;
}

function wireTestMode() {
  if (!sessionUser || sessionUser.role !== "COMMAND_CENTER") {
    if ($("testModePanel")) $("testModePanel").style.display = "none";
    return;
  }
  const result = $("testModeResult");
  if ($("demoBtnLabel")) $("demoBtnLabel").textContent = "DEMO / TEST MODE";
  if ($("testAmbulanceForm")) {
    $("testAmbulanceForm").onsubmit = async (e) => {
      e.preventDefault();
      const lat = Number($("testAmbLat").value), lng = Number($("testAmbLng").value);
      if (!validTestCoordinates(lat, lng)) return result.textContent = "Enter valid ambulance coordinates.";
      try {
        const data = await securedTestRequest(`/ambulances/${$("testAmbulanceId").value}/location`, { latitude: lat, longitude: lng, status: $("testAmbStatus").value }, "PATCH");
        updateAmbulance(data.ambulance);
        if (result) result.textContent = `${data.ambulance.id} location updated in DEMO / TEST MODE.`;
      } catch (error) { if (result) result.textContent = error.message; }
    };
  }
  if ($("testHospitalForm")) {
    $("testHospitalForm").onsubmit = async (e) => {
      e.preventDefault();
      const lat = Number($("testHospLat").value), lng = Number($("testHospLng").value);
      if (!validTestCoordinates(lat, lng)) return result.textContent = "Enter valid hospital coordinates.";
      try {
        const data = await securedTestRequest(`/hospitals/${$("testHospitalId").value}/location`, { latitude: lat, longitude: lng, status: $("testHospStatus").value }, "PATCH");
        updateHospital(data.hospital);
        if (result) result.textContent = `${data.hospital.id} location updated in DEMO / TEST MODE.`;
      } catch (error) { if (result) result.textContent = error.message; }
    };
  }
  if ($("testIncidentForm")) {
    $("testIncidentForm").onsubmit = async (e) => {
      e.preventDefault();
      const lat = Number($("testIncLat").value), lng = Number($("testIncLng").value);
      if (!validTestCoordinates(lat, lng)) return result.textContent = "Enter valid accident coordinates.";
      try {
        const data = await securedTestRequest("/incidents/test/incidents", {
          latitude: lat,
          longitude: lng,
          severity: Number($("testSeverity").value),
          patientCount: Number($("testPatients").value) || undefined,
          peakGForce: Number($("testGForce").value) || undefined,
          incidentType: $("testAccidentType").value,
          helpMessage: $("testHelpMessage").value || undefined
        });
        if (result) result.textContent = `Emergency ${data.incidentId || data.id} created — targeted dispatch initiated.`;
        closeDemo();
      } catch (error) { if (result) result.textContent = error.message; }
    };
  }
  document.querySelectorAll("[data-center]").forEach(button => button.onclick = () => {
    const target = button.dataset.center;
    if (activeEngine === "google" && gMap) {
      const c = gMap.getCenter();
      if (c) setTestCoordinates(target, c.lat(), c.lng());
    } else if (activeEngine === "leaflet" && lMap) {
      const c = lMap.getCenter();
      setTestCoordinates(target, c.lat, c.lng);
    }
    if (result) result.textContent = "Coordinates copied from current map center.";
  });
  populateTestResources();
}

function switchTab(t) {
  const inc = t === "incidents";
  if ($("tabIncidents")) $("tabIncidents").classList.toggle("active", inc);
  if ($("tabFeed")) $("tabFeed").classList.toggle("active", !inc);
  if ($("viewIncidents")) $("viewIncidents").style.display = inc ? "flex" : "none";
  if ($("viewFeed")) $("viewFeed").style.display = inc ? "none" : "flex";
}

function applyFilters() {
  renderIncidentList();
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ---------- BOOTSTRAP INITIALIZATION ---------- */
window.addEventListener("DOMContentLoaded", async () => {
  setTimeout(() => {
    if (!activeEngine) {
      console.log("[ResQNet] Bootstrapping map engine...");
      initMapEngine();
    }
  }, 300);

  wire();
  renderIncidentList();
  renderIncidentDetails();
  addActivity("ResQNet Real-Time Command Center active — monitoring Pune region", "ok");

  await pollHealth();
  probeRouting();
  await syncIncidents(true);
  initSocket();

  setInterval(pollHealth, CFG.HEALTH_POLL_MS || 4000);
  setInterval(() => syncIncidents(false), CFG.INCIDENT_POLL_MS || 3000);
});
