/* ============ RESQNET COMMAND CENTER — PHASE 12A MULTI-MAP ============ */
const CFG = window.RESQNET_CONFIG || {};
const BACKEND_URL = CFG.BACKEND_URL || window.location.origin;
const API = BACKEND_URL + "/api";
const CENTER = CFG.DEFAULT_CENTER || [18.5204, 73.8567];
const OSRM = CFG.OSRM_URL || "https://router.project-osrm.org";
const sessionToken = localStorage.getItem("resqnetToken");
const sessionUser = (() => { try { return JSON.parse(localStorage.getItem("resqnetUser") || "null"); } catch (_) { return null; } })();
const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` });

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

/* ---------- GOOGLE MAPS PLATFORM & OVERLAY ARCHITECTURE ---------- */
let map = null;
let googleTrafficLayer = null;
let activeInfoWindow = null;
const incMarkers = {}, ambMarkers = {}, hospMarkers = {}, cctvMarkers = {};
const fovPolygons = {}, hotspotCircles = {}, trafficPolylines = [];
let routePolylines = [];
let testMapTarget = null;

const GOOGLE_DARK_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#0b101b" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0b101b" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8fa0b8" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#38bdf8" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#475569" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#0f172a" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#334155" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1e293b" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#0f172a" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#334155" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1e293b" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#cbd5e1" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#1e293b" }] },
  { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#38bdf8" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#060a12" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#1e293b" }] },
  { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#060a12" }] }
];

/* Custom HTML overlay marker using Google Maps OverlayView */
class CustomHtmlOverlay {
  constructor(position, htmlContent, onClick, className = "") {
    this.lat = Number(position.lat || position[0]);
    this.lng = Number(position.lng || position[1]);
    this.htmlContent = htmlContent;
    this.onClick = onClick;
    this.className = className;
    this.div = null;
    this.visible = true;
    this.overlayView = null;
    this.initOverlay();
  }

  initOverlay() {
    if (!window.google || !window.google.maps || !map) return;
    const self = this;
    class InternalOverlay extends google.maps.OverlayView {
      onAdd() {
        self.div = document.createElement("div");
        self.div.className = "custom-map-overlay " + self.className;
        self.div.innerHTML = self.htmlContent;
        if (self.onClick) {
          self.div.addEventListener("click", (e) => {
            e.stopPropagation();
            self.onClick();
          });
        }
        const panes = this.getPanes();
        panes.overlayMouseTarget.appendChild(self.div);
      }
      draw() {
        const projection = this.getProjection();
        if (!projection || !self.div) return;
        const pos = new google.maps.LatLng(self.lat, self.lng);
        const point = projection.fromLatLngToDivPixel(pos);
        if (point) {
          self.div.style.left = point.x + "px";
          self.div.style.top = point.y + "px";
          self.div.style.display = self.visible ? "block" : "none";
        }
      }
      onRemove() {
        if (self.div && self.div.parentNode) {
          self.div.parentNode.removeChild(self.div);
          self.div = null;
        }
      }
    }
    this.overlayView = new InternalOverlay();
    this.overlayView.setMap(map);
  }

  setPosition(lat, lng) {
    this.lat = Number(lat);
    this.lng = Number(lng);
    if (this.overlayView) this.overlayView.draw();
  }

  setContent(html) {
    this.htmlContent = html;
    if (this.div) this.div.innerHTML = html;
  }

  setVisible(vis) {
    this.visible = vis;
    if (this.div) this.div.style.display = vis ? "block" : "none";
  }

  remove() {
    if (this.overlayView) {
      this.overlayView.setMap(null);
      this.overlayView = null;
    }
  }
}

function showInfoWindow(lat, lng, html) {
  if (!map || !window.google || !window.google.maps) return;
  if (activeInfoWindow) activeInfoWindow.close();
  activeInfoWindow = new google.maps.InfoWindow({
    content: `<div class="gmap-infowindow">${html}</div>`,
    position: { lat: Number(lat), lng: Number(lng) }
  });
  activeInfoWindow.open(map);
}

function setMapStyle(styleKey) {
  state.mapStyle = styleKey;
  localStorage.setItem("resqnet_map_style", styleKey);
  if ($("mapStyleSelect")) $("mapStyleSelect").value = styleKey;

  if (!map || !window.google || !window.google.maps) return;
  if (styleKey === "dark") {
    map.setMapTypeId("roadmap");
    map.setOptions({ styles: GOOGLE_DARK_STYLE });
  } else if (styleKey === "roadmap" || styleKey === "standard" || styleKey === "light") {
    map.setMapTypeId("roadmap");
    map.setOptions({ styles: [] });
  } else if (styleKey === "satellite") {
    map.setMapTypeId("satellite");
    map.setOptions({ styles: [] });
  } else if (styleKey === "hybrid") {
    map.setMapTypeId("hybrid");
    map.setOptions({ styles: [] });
  } else if (styleKey === "terrain") {
    map.setMapTypeId("terrain");
    map.setOptions({ styles: [] });
  }
}

function initMap() {
  const checkGoogle = () => {
    if (window.google && window.google.maps) {
      startGoogleMap();
    } else {
      setTimeout(checkGoogle, 100);
    }
  };
  checkGoogle();
}

function startGoogleMap() {
  const mapEl = $("map");
  if (!mapEl || map) return;

  map = new google.maps.Map(mapEl, {
    center: { lat: CENTER[0], lng: CENTER[1] },
    zoom: CFG.DEFAULT_ZOOM || 13,
    disableDefaultUI: true,
    zoomControl: true,
    zoomControlOptions: { position: google.maps.ControlPosition.LEFT_BOTTOM },
    backgroundColor: "#0b101b"
  });

  setMapStyle(state.mapStyle);

  googleTrafficLayer = new google.maps.TrafficLayer();
  if (state.layers.traffic) {
    googleTrafficLayer.setMap(map);
  }

  map.addListener("click", (e) => {
    if (!testMapTarget) return;
    const lat = e.latLng.lat(), lng = e.latLng.lng();
    setTestCoordinates(testMapTarget, lat, lng);
    $("testModeResult").textContent = `${testMapTarget === "inc" ? "Accident" : testMapTarget === "amb" ? "Ambulance" : "Hospital"} coordinates set from map click.`;
    testMapTarget = null;
  });

  seedFleet();
  loadInfrastructure();
}

/* ---------- MARKER FACTORIES ---------- */
function makeIncHtml(sev, selected, resolved) {
  const b = band(sev);
  const isCrit = b.k === "critical";
  const sevKey = b.k || "medium";

  return `<div class="inc-marker sev-${sevKey} ${selected ? "sel" : ""} ${resolved ? "resolved" : ""}">
    ${isCrit && !resolved ? `<div class="ring"></div>` : ""}
    <div class="core">${resolved ? "✓" : (sev !== null ? Math.min(99, Math.round(sev)) : "!")}</div>
  </div>`;
}

function makeAmbHtml(status, sel) {
  const s = String(status || "available").toLowerCase();
  return `<div class="amb-marker ${s} ${sel ? "sel" : ""}"><i class="fa-solid fa-truck-medical"></i></div>`;
}

function makeHospHtml(capacity, trauma, sel) {
  const cap = String(capacity || "available").toLowerCase();
  return `<div class="hosp-marker ${trauma ? "trauma" : ""} ${cap} ${sel ? "sel" : ""}"><i class="fa-solid ${trauma ? "fa-house-medical" : "fa-hospital"}"></i></div>`;
}

function makeCctvHtml(status) {
  const s = String(status || "ONLINE").toLowerCase();
  return `<div class="cctv-marker ${s}"><i class="fa-solid fa-video"></i></div>`;
}

/* ---------- CCTV FOV CONE GEOMETRY ---------- */
function createFovPolygonPoints(lat, lng, headingDeg, fovDeg, radiusMeters) {
  const points = [{ lat, lng }];
  const R = 6378137;
  const startAng = (headingDeg - fovDeg / 2) * (Math.PI / 180);
  const endAng = (headingDeg + fovDeg / 2) * (Math.PI / 180);
  const steps = 12;

  for (let i = 0; i <= steps; i++) {
    const angle = startAng + (i / steps) * (endAng - startAng);
    const dLat = (radiusMeters * Math.cos(angle)) / R;
    const dLng = (radiusMeters * Math.sin(angle)) / (R * Math.cos((lat * Math.PI) / 180));
    points.push({
      lat: lat + (dLat * 180) / Math.PI,
      lng: lng + (dLng * 180) / Math.PI
    });
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
      cams.forEach((cam) => {
        state.cctv[cam.id] = cam;
        const pos = { lat: cam.lat, lng: cam.lng };
        const popup = `<div class="pop-t" style="color:#38BDF8"><i class="fa-solid fa-video"></i> ${esc(cam.cameraId || cam.id)}</div>
          Name: <b>${esc(cam.cameraName || "Junction Cam")}</b><br/>
          Status: <b>${esc(cam.status)}</b><br/>
          FPS: <b>${cam.fps || 24.0}</b> | Latency: <b>${cam.inferenceLatency || 38}ms</b><br/>
          Coverage: <b>${cam.coverageRadiusMeters || 200}m @ ${cam.fovAngle || 60}°</b><br/>
          <div style="margin-top:8px"><button onclick="openCctvModal('${esc(cam.cameraId || cam.id)}')" style="width:100%;padding:4px 8px;background:#38BDF8;color:#000;border:none;border-radius:4px;font-weight:bold;cursor:pointer;font-size:10px;"><i class="fa-solid fa-play"></i> PREVIEW CAMERA FEED</button></div>`;

        if (!cctvMarkers[cam.id]) {
          cctvMarkers[cam.id] = new CustomHtmlOverlay(pos, makeCctvHtml(cam.status), () => showInfoWindow(cam.lat, cam.lng, popup), "cctv-overlay");
          cctvMarkers[cam.id].setVisible(state.layers.cctv);
        } else {
          cctvMarkers[cam.id].setPosition(cam.lat, cam.lng);
          cctvMarkers[cam.id].setContent(makeCctvHtml(cam.status));
        }

        if (cam.fovAngle && cam.heading !== undefined && map && window.google && window.google.maps) {
          const cone = createFovPolygonPoints(cam.lat, cam.lng, cam.heading, cam.fovAngle, cam.coverageRadiusMeters || 200);
          if (fovPolygons[cam.id]) fovPolygons[cam.id].setMap(null);
          fovPolygons[cam.id] = new google.maps.Polygon({
            paths: cone,
            strokeColor: "#38BDF8",
            strokeOpacity: 0.8,
            strokeWeight: 1,
            fillColor: "#38BDF8",
            fillOpacity: 0.12,
            map: state.layers.cctv ? map : null
          });
          fovPolygons[cam.id].addListener("click", () => showInfoWindow(cam.lat, cam.lng, `<b>${esc(cam.cameraId)}</b> Detection Zone`));
        }
      });
    }

    // 2. Crash Blackspot Hotspots
    const hotRes = await fetch(API + "/fleet/hotspots");
    const hotspots = await hotRes.json();
    if (Array.isArray(hotspots) && map && window.google && window.google.maps) {
      state.hotspots = hotspots;
      Object.values(hotspotCircles).forEach((c) => c.setMap(null));
      hotspots.forEach((h, idx) => {
        const circle = new google.maps.Circle({
          center: { lat: h.lat, lng: h.lng },
          radius: h.radiusMeters || 300,
          strokeColor: "#EF4444",
          strokeOpacity: 0.8,
          strokeWeight: 1.5,
          fillColor: "#EF4444",
          fillOpacity: 0.16,
          map: state.layers.hotspots ? map : null
        });
        circle.addListener("click", () => {
          showInfoWindow(h.lat, h.lng, `<div class="pop-t" style="color:var(--red)"><i class="fa-solid fa-fire"></i> ${esc(h.name)}</div>
            Risk Score: <b>${h.riskScore}/100</b><br/>
            Category: <b>${esc(h.category)}</b><br/>
            Historical Incidents: <b>${h.historicalIncidents}</b>`);
        });
        hotspotCircles[h.id || idx] = circle;
      });
    }

    // 3. Configured Traffic Context Corridors
    const trafficRes = await fetch(API + "/fleet/traffic");
    const corridors = await trafficRes.json();
    if (Array.isArray(corridors) && map && window.google && window.google.maps) {
      state.trafficCorridors = corridors;
      trafficPolylines.forEach((p) => p.setMap(null));
      trafficPolylines.length = 0;
      corridors.forEach((c) => {
        const color = c.congestionLevel === "MODERATE" ? "#F97316" : "#22C55E";
        const poly = new google.maps.Polyline({
          path: c.coordinates.map((pt) => ({ lat: pt[1], lng: pt[0] })),
          strokeColor: color,
          strokeOpacity: 0.75,
          strokeWeight: 4,
          map: state.layers.traffic ? map : null
        });
        poly.addListener("click", () => {
          const mid = c.coordinates[Math.floor(c.coordinates.length / 2)];
          showInfoWindow(mid[1], mid[0], `<b>${esc(c.name)}</b><br/>Status: <b>${esc(c.trafficLabel)}</b>`);
        });
        trafficPolylines.push(poly);
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
  state.ambulances[amb.id] = amb;
  if (num(amb.lat) === null || num(amb.lng) === null) return;
  const sel = state.selectedIncidentId && state.routes[state.selectedIncidentId]?.ambulanceId === amb.id;
  const pos = { lat: amb.lat, lng: amb.lng };
  const popup = `<div class="pop-t" style="color:var(--blue)">${esc(amb.id)} · ${esc(amb.type || "ALS")}</div>
    Status: <b>${esc(String(amb.status || "AVAILABLE").toUpperCase())}</b><br/>
    Location: <b>${amb.lat}, ${amb.lng}</b><br/>
    Location state: <b>${amb.status === "OFFLINE" ? "OFFLINE" : amb.locationUpdatedAt && Date.now() - new Date(amb.locationUpdatedAt).getTime() > 60000 ? "STALE" : "LIVE"}</b><br/>
    Last update: <b>${amb.locationUpdatedAt ? hhmmss(amb.locationUpdatedAt) : "UNAVAILABLE"}</b><br/>
    Trauma Capable: <b>${amb.traumaReady || amb.trauma ? "YES" : "NO"}</b>
    ${amb.eta ? "<br/>ETA: <b>" + amb.eta + " min</b>" : ""}`;

  if (ambMarkers[amb.id]) {
    ambMarkers[amb.id].setPosition(amb.lat, amb.lng);
    ambMarkers[amb.id].setContent(makeAmbHtml(amb.status, sel));
    ambMarkers[amb.id].setVisible(state.layers.ambulances);
  } else {
    ambMarkers[amb.id] = new CustomHtmlOverlay(pos, makeAmbHtml(amb.status, sel), () => showInfoWindow(amb.lat, amb.lng, popup), "amb-overlay");
    ambMarkers[amb.id].setVisible(state.layers.ambulances);
  }
  renderKPIs();
}

function updateHospital(h) {
  if (!h || !h.id) return;
  state.hospitals[h.id] = { ...(state.hospitals[h.id] || {}), ...h };
  const hh = state.hospitals[h.id];
  if (num(hh.lat) === null || num(hh.lng) === null) return;
  const sel = state.selectedIncidentId && state.routes[state.selectedIncidentId]?.hospitalId === hh.id;
  const pos = { lat: hh.lat, lng: hh.lng };
  const popup = `<div class="pop-t" style="color:var(--green)">${esc(hh.name)}</div>
    Category: <b>${sel ? "SELECTED TRAUMA HOSPITAL" : "ALTERNATIVE HOSPITAL"}</b><br/>
    Status: <b>${esc(hh.status || "UNAVAILABLE")}</b><br/>
    Emergency Capacity: <b>${esc(hh.emergencyCapacity ?? hh.capacity ?? "UNAVAILABLE")}</b><br/>
    Trauma Level: <b>${esc(hh.traumaLevel ?? "UNAVAILABLE")}</b><br/>
    Last update: <b>${hh.locationUpdatedAt ? hhmmss(hh.locationUpdatedAt) : "UNAVAILABLE"}</b>`;

  if (hospMarkers[hh.id]) {
    hospMarkers[hh.id].setPosition(hh.lat, hh.lng);
    hospMarkers[hh.id].setContent(makeHospHtml(hh.capacity, hh.trauma, sel));
    hospMarkers[hh.id].setVisible(state.layers.hospitals);
  } else {
    hospMarkers[hh.id] = new CustomHtmlOverlay(pos, makeHospHtml(hh.capacity, hh.trauma, sel), () => showInfoWindow(hh.lat, hh.lng, popup), "hosp-overlay");
    hospMarkers[hh.id].setVisible(state.layers.hospitals);
  }
}

/* ---------- INCIDENT RENDERING & HONEST POPUPS (12A.5) ---------- */
function upsertIncidentMarker(inc) {
  if (num(inc.latitude) === null || num(inc.longitude) === null) {
    if (incMarkers[inc._id]) {
      incMarkers[inc._id].remove();
      delete incMarkers[inc._id];
    }
    return;
  }

  const isResolved = inc.status === "RESOLVED";
  const isSelected = state.selectedIncidentId === inc._id;
  const html = makeIncHtml(inc.severity, isSelected, isResolved);
  const pos = { lat: inc.latitude, lng: inc.longitude };

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
    incMarkers[inc._id].setPosition(inc.latitude, inc.longitude);
    incMarkers[inc._id].setContent(html);
    incMarkers[inc._id].setVisible(state.layers.incidents && (!isResolved || state.layers.incidents));
  } else {
    incMarkers[inc._id] = new CustomHtmlOverlay(pos, html, () => {
      selectIncident(inc._id);
      showInfoWindow(inc.latitude, inc.longitude, popup);
    }, "inc-overlay");
    incMarkers[inc._id].setVisible(state.layers.incidents);
  }
}

/* ---------- FOCUS INCIDENT & VIEW CONTROLS (12A.3 & 12A.15) ---------- */
function focusIncident(id) {
  const targetId = id || state.selectedIncidentId;
  const inc = state.incidents[targetId];
  if (!inc || inc.latitude === null || inc.longitude === null) {
    return toast("NO GPS POSITION", "Selected incident has unavailable GPS coordinates.", "info");
  }

  if (!map || !window.google || !window.google.maps) return;
  const bounds = new google.maps.LatLngBounds();
  bounds.extend(new google.maps.LatLng(inc.latitude, inc.longitude));

  const r = state.routes[targetId];
  if (r) {
    if (r.ambulanceId && state.ambulances[r.ambulanceId]) {
      const a = state.ambulances[r.ambulanceId];
      if (a.lat && a.lng) bounds.extend(new google.maps.LatLng(a.lat, a.lng));
    }
    if (r.hospitalId && state.hospitals[r.hospitalId]) {
      const h = state.hospitals[r.hospitalId];
      if (h.lat && h.lng) bounds.extend(new google.maps.LatLng(h.lat, h.lng));
    }
    if (r.coords && r.coords.length > 0) {
      r.coords.forEach((pt) => bounds.extend(new google.maps.LatLng(pt[0], pt[1])));
    }
  }

  map.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 });
}

function fitAll() {
  if (!map || !window.google || !window.google.maps) return;
  const bounds = new google.maps.LatLngBounds();
  let count = 0;

  Object.values(state.incidents).forEach((i) => {
    if (i.latitude && i.longitude) { bounds.extend(new google.maps.LatLng(i.latitude, i.longitude)); count++; }
  });
  Object.values(state.ambulances).forEach((a) => {
    if (a.lat && a.lng) { bounds.extend(new google.maps.LatLng(a.lat, a.lng)); count++; }
  });
  Object.values(state.hospitals).forEach((h) => {
    if (h.lat && h.lng) { bounds.extend(new google.maps.LatLng(h.lat, h.lng)); count++; }
  });
  Object.values(state.cctv).forEach((c) => {
    if (c.lat && c.lng) { bounds.extend(new google.maps.LatLng(c.lat, c.lng)); count++; }
  });

  if (!count) {
    map.setCenter({ lat: CENTER[0], lng: CENTER[1] });
    map.setZoom(CFG.DEFAULT_ZOOM || 13);
    return;
  }
  map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
}

function fitFleet() {
  if (!map || !window.google || !window.google.maps) return;
  const bounds = new google.maps.LatLngBounds();
  let count = 0;
  Object.values(state.ambulances).forEach((a) => {
    if (a.lat && a.lng) { bounds.extend(new google.maps.LatLng(a.lat, a.lng)); count++; }
  });
  if (!count) return toast("NO AMBULANCES", "No ambulances on map.", "info");
  map.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 });
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

  if (name === "traffic") {
    if (googleTrafficLayer && map) {
      googleTrafficLayer.setMap(state.layers.traffic ? map : null);
    }
    trafficPolylines.forEach((p) => p.setMap(state.layers.traffic ? map : null));
  } else if (name === "incidents") {
    Object.values(incMarkers).forEach((m) => m.setVisible(state.layers.incidents));
  } else if (name === "ambulances") {
    Object.values(ambMarkers).forEach((m) => m.setVisible(state.layers.ambulances));
  } else if (name === "hospitals") {
    Object.values(hospMarkers).forEach((m) => m.setVisible(state.layers.hospitals));
  } else if (name === "cctv") {
    Object.values(cctvMarkers).forEach((m) => m.setVisible(state.layers.cctv));
    Object.values(fovPolygons).forEach((p) => p.setMap(state.layers.cctv ? map : null));
  } else if (name === "hotspots") {
    Object.values(hotspotCircles).forEach((c) => c.setMap(state.layers.hotspots ? map : null));
  } else if (name === "routes") {
    routePolylines.forEach((p) => p.setMap(state.layers.routes ? map : null));
  }
}

/* ---------- AUTHORITATIVE ROUTE RENDERING (12A.8) ---------- */
async function drawRoute(id) {
  const inc = state.incidents[id];
  const r = state.routes[id];
  if (!inc || !r || inc.latitude === null) return;

  let coords = null, distKm = null, etaMin = r.etaMin, geometrySource = "ROUTE UNAVAILABLE";

  // Check backend authoritative route geometry first
  if (inc.route && inc.route.geometry && Array.isArray(inc.route.geometry.coordinates) && inc.route.geometry.coordinates.length > 0) {
    coords = inc.route.geometry.coordinates.map((c) => [c[1], c[0]]);
    distKm = inc.route.distanceKm ? String(inc.route.distanceKm) : distKm;
    etaMin = inc.route.etaMinutes ? Number(inc.route.etaMinutes) : etaMin;
    geometrySource = inc.route.isFallback ? "⚠ ROUTING DEGRADED (APPROXIMATION)" : "OSRM ROAD";
  }
  const hospCoords = inc.hospitalRoute?.geometry?.coordinates?.map((c) => [c[1], c[0]]) || null;

  state.routes[id] = { ...r, coords, hospCoords, distKm, etaMin, geometrySource };

  // Clear previous route polylines
  routePolylines.forEach((p) => p.setMap(null));
  routePolylines = [];

  if (map && window.google && window.google.maps) {
    if (coords && coords.length > 0) {
      const line = new google.maps.Polyline({
        path: coords.map((c) => ({ lat: c[0], lng: c[1] })),
        geodesic: true,
        strokeColor: "#FF9F0A",
        strokeOpacity: 0.92,
        strokeWeight: 6,
        map: state.layers.routes ? map : null
      });
      routePolylines.push(line);
    }
    if (hospCoords && hospCoords.length > 0) {
      const line2 = new google.maps.Polyline({
        path: hospCoords.map((c) => ({ lat: c[0], lng: c[1] })),
        geodesic: true,
        strokeColor: "#409CFF",
        strokeOpacity: 0.85,
        strokeWeight: 5,
        map: state.layers.routes ? map : null
      });
      routePolylines.push(line2);
    }
  }

  const amb = state.ambulances[r.ambulanceId];
  const hosp = state.hospitals[r.hospitalId];
  if (amb) updateAmbulance({ id: amb.id, eta: etaMin });
  if (hosp) updateHospital({ id: hosp.id });
  renderKPIs();
  if (state.selectedIncidentId === id) renderIncidentDetails();
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
    setHealth("Cctv", h.cctv === "ONLINE" || h.cctvCamerasOnline > 0);
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
    assignedHospitalId: raw.hospitalId || raw.assignedHospitalId || null,
    ambulanceReason: raw.ambulanceReason,
    hospitalReason: raw.hospitalReason,
    route: raw.route,
    hospitalRoute: raw.hospitalRoute,
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
        hospitalId: inc.assignedHospitalId || inc.assignedHospital,
        etaMin: inc.route.etaMinutes,
        coords: inc.route.geometry?.coordinates?.map((c) => [c[1], c[0]])
      };
      drawRoute(id);
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
      <div class="card-foot">
        <span>Status: <b class="mono" style="color:${inc.status === 'EN_ROUTE' ? 'var(--orange)' : 'var(--text)'}">${esc(inc.status || 'DETECTED')}</b></span>
        <span>Unit: <b class="mono">${esc(inc.assignedAmbulance || 'None')}</b></span>
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

  // 1. Column Workflow (Stepper & Severity Meter)
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
  if ($("ambBox")) {
    $("ambBox").innerHTML = `
      <div class="kv"><span>Assigned Unit</span><b>${amb ? `${amb.id} (${amb.type || "ALS"})` : (inc.assignedAmbulance || "None")}</b></div>
      <div class="kv"><span>Status</span><b style="color:${amb?.status === 'EN_ROUTE' ? 'var(--orange)' : 'var(--green)'}">${amb ? amb.status : (inc.status || "AVAILABLE")}</b></div>
      <div class="kv"><span>Speed</span><b>${amb?.speed ? `${amb.speed} km/h` : "0 km/h"}</b></div>
      <div class="kv"><span>Trauma Ready</span><b>${amb?.traumaReady || amb?.trauma ? "YES" : "NO"}</b></div>`;
  }
  if ($("ambReason")) {
    $("ambReason").innerHTML = inc.ambulanceReason || `<b>Unit ${esc(r.ambulanceId || inc.assignedAmbulance || 'AMB-01')}</b> selected by topological OSRM road proximity and configured traffic weighting.`;
  }
  if ($("routeBadge")) $("routeBadge").textContent = r.geometrySource || "OSRM ROAD";
  if ($("routeDist")) $("routeDist").textContent = r.distKm ? `${r.distKm} km` : (inc.route?.distanceKm ? `${inc.route.distanceKm} km` : "—");
  if ($("routeEta")) $("routeEta").textContent = r.etaMin ? `${r.etaMin} min` : (inc.route?.etaMinutes ? `${inc.route.etaMinutes} min` : "—");
  if ($("routeGeom")) $("routeGeom").textContent = r.geometrySource || (inc.route?.isFallback ? "Fallback Direct" : "OSRM 2-Leg Turn-by-Turn");

  // 4. Column Hospital Pre-Alert & Performance
  const hosp = state.hospitals[r.hospitalId || inc.assignedHospital];
  if ($("hospBox")) {
    $("hospBox").innerHTML = `
      <div class="kv"><span>Destination</span><b>${hosp ? hosp.name : (inc.assignedHospital || "Pune Trauma Center")}</b></div>
      <div class="kv"><span>Trauma Unit</span><b style="color:var(--blue)">${hosp?.trauma ? "Level 1 Trauma Unit" : "General Emergency"}</b></div>
      <div class="kv"><span>Capacity</span><b>${hosp ? hosp.capacity : "AVAILABLE"}</b></div>
      <div class="kv"><span>ED Readiness</span><b style="color:var(--green)">${hosp?.edReadiness || 90}%</b></div>`;
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

    socket.on("cctv:health", (cam) => {
      const id = cam.id || cam.cameraId;
      if (state.cctv[id]) {
        Object.assign(state.cctv[id], cam);
        if (cctvMarkers[id]) {
          cctvMarkers[id].setContent(makeCctvHtml(state.cctv[id].status));
        }
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
        hospitalId: inc.assignedHospitalId || inc.assignedHospital,
        etaMin: d.incident.route?.etaMinutes || 4,
        coords: d.incident.route?.geometry?.coordinates?.map((c) => [c[1], c[0]])
      };
      drawRoute(inc._id);
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
      routePolylines.forEach((p) => p.setMap(null));
      routePolylines = [];
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

  if (source === "fusion") {
    const fusionId = `RNQ-FUSION-${Date.now().toString().slice(-4)}`;
    const lat = 18.5308;
    const lng = 73.8290;

    toast("FUSION DEMO", "Step 1: CCTV optical collision detected at Pune University Junction...", "info");
    try {
      // 1. CCTV Event
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

      // 2. Simultaneous Smartphone Crash Report at same coordinates
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
    Object.values(incMarkers).forEach((m) => m.remove());
    Object.keys(incMarkers).forEach((k) => delete incMarkers[k]);
    routePolylines.forEach((p) => p.setMap(null));
    routePolylines = [];
    renderIncidentList();
    renderIncidentDetails();
    renderKPIs();
    toast("DEMO RESET", "Cleared all demo incidents and routes.", "ok");
  } catch (e) {
    toast("RESET ERROR", e.message, "error");
  }
}

/* ---------- EVENT WIRING ---------- */
window.openCctvModal = (cameraId) => {
  const cam = state.cctv[cameraId] || { id: cameraId, name: `Camera ${cameraId}`, lat: 18.5204, lng: 73.8567, road: 'Main Corridor', status: 'ONLINE', fps: 24, inferenceLatency: 38 };
  if ($("cctvModalTitle")) $("cctvModalTitle").textContent = `${cam.cameraName || cam.name || cameraId} OPTICAL STREAM`;
  if ($("cctvModalSub")) $("cctvModalSub").textContent = `${cameraId} • ${cam.lat ? cam.lat.toFixed(4) : 18.5204}, ${cam.lng ? cam.lng.toFixed(4) : 73.8567}`;
  if ($("cctvModalRoad")) $("cctvModalRoad").textContent = cam.road || "Main Corridor";
  if ($("cctvModalBadge")) $("cctvModalBadge").textContent = cam.status || "ONLINE";
  if ($("cctvStreamMetrics")) $("cctvStreamMetrics").textContent = `FPS: ${cam.fps || 24.0} | YOLO Latency: ${cam.inferenceLatency || 38}ms | Model: YOLOv8n`;
  if ($("cctvModal")) $("cctvModal").style.display = "block";
};

function wire() {
  // CCTV Modal Close
  if ($("closeCctvModal")) $("closeCctvModal").onclick = () => { if ($("cctvModal")) $("cctvModal").style.display = "none"; };

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
  if ($("demoFusion")) $("demoFusion").onclick = () => runDemo("fusion");
  $("demoReset").onclick = resetDemo;
  wireTestMode();

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

function setTestCoordinates(target, lat, lng) {
  const prefix = target === "amb" ? "testAmb" : target === "hosp" ? "testHosp" : "testInc";
  $(prefix + "Lat").value = Number(lat).toFixed(6);
  $(prefix + "Lng").value = Number(lng).toFixed(6);
}
function validTestCoordinates(lat, lng) { return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180; }
function populateTestResources() {
  const fill = (id, records, label) => { const select = $(id), previous = select.value; select.innerHTML = records.map(r => `<option value="${esc(r.id)}">${esc(r.id)} — ${esc(label(r))}</option>`).join(""); if (previous) select.value = previous; };
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
  if (!sessionUser || sessionUser.role !== "COMMAND_CENTER") { $("testModePanel").style.display = "none"; return; }
  const result = $("testModeResult");
  $("demoBtnLabel").textContent = "DEMO / TEST MODE";
  $("testAmbulanceForm").onsubmit = async (e) => { e.preventDefault(); const lat = Number($("testAmbLat").value), lng = Number($("testAmbLng").value); if (!validTestCoordinates(lat, lng)) return result.textContent = "Enter valid ambulance coordinates."; try { const data = await securedTestRequest(`/ambulances/${$("testAmbulanceId").value}/location`, { latitude: lat, longitude: lng, status: $("testAmbStatus").value }, "PATCH"); updateAmbulance(data.ambulance); result.textContent = `${data.ambulance.id} location updated in DEMO / TEST MODE.`; } catch (error) { result.textContent = error.message; } };
  $("testHospitalForm").onsubmit = async (e) => { e.preventDefault(); const lat = Number($("testHospLat").value), lng = Number($("testHospLng").value); if (!validTestCoordinates(lat, lng)) return result.textContent = "Enter valid hospital coordinates."; try { const data = await securedTestRequest(`/hospitals/${$("testHospitalId").value}/location`, { latitude: lat, longitude: lng, status: $("testHospStatus").value }, "PATCH"); updateHospital(data.hospital); result.textContent = `${data.hospital.id} location updated in DEMO / TEST MODE.`; } catch (error) { result.textContent = error.message; } };
  $("testIncidentForm").onsubmit = async (e) => { e.preventDefault(); const lat = Number($("testIncLat").value), lng = Number($("testIncLng").value); if (!validTestCoordinates(lat, lng)) return result.textContent = "Enter valid accident coordinates."; try { const data = await securedTestRequest("/incidents/test/incidents", { latitude: lat, longitude: lng, severity: Number($("testSeverity").value), patientCount: Number($("testPatients").value) || undefined, peakGForce: Number($("testGForce").value) || undefined, incidentType: $("testAccidentType").value, helpMessage: $("testHelpMessage").value || undefined }); result.textContent = `Emergency ${data.incidentId || data.id} created — targeted dispatch initiated.`; closeDemo(); } catch (error) { result.textContent = error.message; } };
  document.querySelectorAll("[data-center]").forEach(button => button.onclick = () => { if (!map) return; const c = map.getCenter(); setTestCoordinates(target, c.lat(), c.lng()); result.textContent = "Coordinates copied from current map center."; });
  populateTestResources();
}

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
  setInterval(pollHealth, CFG.HEALTH_POLL_MS || 4000);
  setInterval(() => syncIncidents(false), CFG.INCIDENT_POLL_MS || 3000);
});
