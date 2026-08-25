/* ============ RESQNET COMMAND CENTER ============ */
const CFG = window.RESQNET_CONFIG || {};
const BACKEND_URL = CFG.BACKEND_URL || window.location.origin;
const API = BACKEND_URL + "/api";
const CENTER = CFG.DEFAULT_CENTER || [18.5204, 73.8567];
const OSRM = CFG.OSRM_URL || "https://router.project-osrm.org";

const state = {
  incidents: {},
  ambulances: {},
  hospitals: {},
  routes: {},
  timelines: {},
  perf: {},
  candidates: {},
  selectedIncidentId: null,
  activity: [],
  systemHealth: {},
  demoMode: false,
  filters: { sev: "ALL", src: "ALL", q: "" },
  layers: { incidents: true, ambulances: true, hospitals: true, routes: true },
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
  cctv: { icon: "fa-video", label: "CCTV" },
  citizen: { icon: "fa-user-shield", label: "Citizen" },
  iot: { icon: "fa-car-on", label: "Vehicle / IoT" }
};
const srcMeta = (s) => SOURCE_META[String(s || "").toLowerCase()] || { icon: "fa-satellite-dish", label: s ? String(s) : "Unknown" };
function haversine(a, b) {
  const R = 6371, dLat = ((b[0] - a[0]) * Math.PI) / 180, dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const maskPhone = (p) => (p ? String(p).slice(0, 3) + "•••••" + String(p).slice(-2) : null);

/* ---------- map ---------- */
let map, L_inc, L_amb, L_hosp, L_route;
const incMarkers = {}, ambMarkers = {}, hospMarkers = {};
let ambAnim = null;

function makeIncIcon(sev, selected) {
  const c = band(sev).color;
  const isCrit = band(sev).k === "critical" || band(sev).k === "high";
  return L.divIcon({
    className: "",
    html: `<div class="inc-marker ${selected ? "sel" : ""}">
      ${isCrit ? `<div class="ring" style="background:${c};opacity:.35"></div>` : ""}
      <div class="core" style="background:${c};box-shadow:0 0 12px ${c}"></div></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });
}
const makeAmbIcon = (status, sel) =>
  L.divIcon({ className: "", html: `<div class="amb-marker ${status || "available"} ${sel ? "sel" : ""}"><i class="fa-solid fa-truck-medical"></i></div>`, iconSize: [28, 28], iconAnchor: [14, 14] });
const makeHospIcon = (cap, sel) =>
  L.divIcon({ className: "", html: `<div class="hosp-marker ${String(cap || "available").toLowerCase()} ${sel ? "sel" : ""}"><i class="fa-solid fa-hospital"></i></div>`, iconSize: [28, 28], iconAnchor: [14, 14] });

function initMap() {
  map = L.map("map", { zoomControl: false, preferCanvas: true }).setView(CENTER, CFG.DEFAULT_ZOOM || 12);
  L.control.zoom({ position: "bottomleft" }).addTo(map);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    maxZoom: 19,
    subdomains: "abcd"
  }).addTo(map);
  L_route = L.layerGroup().addTo(map);
  L_hosp = L.layerGroup().addTo(map);
  L_amb = L.layerGroup().addTo(map);
  L_inc = L.layerGroup().addTo(map);
  seedFleet();
}

/* ---------- demo fleet & hospitals (clearly labelled DEMO assets) ---------- */
const FLEET_SEED = [
  { id: "AMB-01", lat: 18.5148, lng: 73.8412, status: "available", type: "ALS", trauma: true, traffic: "HIGH" },
  { id: "AMB-02", lat: 18.5412, lng: 73.8631, status: "available", type: "ALS", trauma: true, traffic: "LOW" },
  { id: "AMB-03", lat: 18.4921, lng: 73.8228, status: "available", type: "BLS", trauma: false, traffic: "MEDIUM" },
  { id: "AMB-04", lat: 18.5601, lng: 73.9020, status: "available", type: "ALS", trauma: true, traffic: "MEDIUM" },
  { id: "AMB-05", lat: 18.4785, lng: 73.8790, status: "available", type: "BLS", trauma: false, traffic: "LOW" }
];
const HOSP_SEED = [
  { id: "HOSP-01", name: "Pune City Trauma Centre", lat: 18.5304, lng: 73.8567, capacity: "AVAILABLE", trauma: true, emergency: "AVAILABLE" },
  { id: "HOSP-02", name: "Ruby Emergency Institute", lat: 18.5360, lng: 73.8780, capacity: "AVAILABLE", trauma: true, emergency: "AVAILABLE" },
  { id: "HOSP-03", name: "Sahyadri Speciality Base", lat: 18.5080, lng: 73.8340, capacity: "LIMITED", trauma: false, emergency: "AVAILABLE" },
  { id: "HOSP-04", name: "Deenanath General Hospital", lat: 18.4980, lng: 73.8290, capacity: "AVAILABLE", trauma: false, emergency: "AVAILABLE" }
];

function seedFleet() {
  FLEET_SEED.forEach((a) => updateAmbulance({ ...a }));
  HOSP_SEED.forEach((h) => updateHospital({ ...h }));
  renderKPIs();
}

function updateAmbulance(a) {
  if (!a || !a.id) return;
  const prev = state.ambulances[a.id] || {};
  const amb = { ...prev, ...a };
  if (num(amb.lat) === null || num(amb.lng) === null) return;
  state.ambulances[amb.id] = amb;
  const sel = state.selectedIncidentId && state.routes[state.selectedIncidentId]?.ambulanceId === amb.id;
  const pos = [amb.lat, amb.lng];
  const popup = `<div class="pop-t" style="color:var(--blue)">${esc(amb.id)} · ${esc(amb.type || "—")}</div>
    Status: <b>${esc(String(amb.status || "unknown").toUpperCase())}</b><br/>
    Trauma capable: ${amb.trauma ? "YES" : "NO"}${amb.eta ? "<br/>ETA: <b>" + amb.eta + " min</b>" : ""}
    <br/><span style="color:var(--orange);font-size:9px;letter-spacing:.1em">DEMO FLEET ASSET</span>`;
  if (ambMarkers[amb.id]) {
    ambMarkers[amb.id].setLatLng(pos).setIcon(makeAmbIcon(amb.status, sel)).setPopupContent(popup);
  } else {
    ambMarkers[amb.id] = L.marker(pos, { icon: makeAmbIcon(amb.status, sel), keyboard: false }).bindPopup(popup).addTo(L_amb);
  }
  renderKPIs();
}

function updateHospital(h) {
  if (!h || !h.id) return;
  state.hospitals[h.id] = { ...(state.hospitals[h.id] || {}), ...h };
  const hh = state.hospitals[h.id];
  const sel = state.selectedIncidentId && state.routes[state.selectedIncidentId]?.hospitalId === hh.id;
  const popup = `<div class="pop-t" style="color:var(--green)">${esc(hh.name)}</div>
    Emergency: <b>${esc(hh.emergency || "UNKNOWN")}</b><br/>Trauma unit: <b>${hh.trauma ? "YES" : "NO"}</b><br/>Capacity: <b>${esc(hh.capacity || "UNKNOWN")}</b>
    <br/><span style="color:var(--orange);font-size:9px;letter-spacing:.1em">DEMO REGISTRY</span>`;
  if (hospMarkers[hh.id]) hospMarkers[hh.id].setIcon(makeHospIcon(hh.capacity, sel)).setPopupContent(popup);
  else hospMarkers[hh.id] = L.marker([hh.lat, hh.lng], { icon: makeHospIcon(hh.capacity, sel) }).bindPopup(popup).addTo(L_hosp);
  renderKPIs();
}

/* ---------- incidents ---------- */
function normalize(raw) {
  const id = raw.incidentId || raw.id || raw._id || "local-" + Math.random().toString(36).slice(2, 10);
  const primary = String(raw.source || "unknown").toLowerCase();
  const conf = num(raw.confidenceScore) ?? (raw.confidence ? (raw.confidence > 1 ? Math.round(raw.confidence) : Math.round(raw.confidence * 100)) : null);
  let sources = Array.isArray(raw.detectionSources) ? raw.detectionSources : (raw.sources ? raw.sources.map(s => ({ source: s.type || s.source, confidence: s.confidence ? (s.confidence > 1 ? s.confidence : Math.round(s.confidence * 100)) : 90 })) : null);
  if (!sources) sources = [{ source: primary, confidence: conf }];
  return {
    _id: id,
    id: id,
    incidentId: id,
    displayId: raw.incidentId || raw.displayId || shortId(id),
    source: primary,
    sources,
    latitude: num(raw.latitude),
    longitude: num(raw.longitude),
    timestamp: raw.timestamp || raw.createdAt || null,
    confidenceScore: conf,
    severity: num(raw.severity),
    status: raw.status || raw.state || "pending",
    patients: num(raw.patients) || 1,
    incidentType: raw.incidentType || raw.title || "Emergency Collision",
    isDemo: raw.isDemo !== undefined ? !!raw.isDemo : true,
    assignedAmbulance: raw.assignedAmbulance || raw.ambulanceId || null,
    assignedHospital: raw.assignedHospital || (raw.hospitalId ? "Pune City Trauma Centre" : null),
    hospitalAlerted: !!raw.hospitalAlerted || !!raw.hospitalId,
    reporterPhone: maskPhone(raw.reporterPhone)
  };
}

function upsertIncident(raw, live) {
  const inc = normalize(raw);
  const isNew = !state.incidents[inc._id];
  state.incidents[inc._id] = { ...(state.incidents[inc._id] || {}), ...inc };
  if (!state.timelines[inc._id]) {
    state.timelines[inc._id] = [{ t: inc.timestamp || new Date().toISOString(), text: "Event received by ResQNet", done: true }];
    if (inc.status && inc.status !== "pending")
      state.timelines[inc._id].push({ t: inc.timestamp, text: "Status: " + String(inc.status).replace(/_/g, " "), done: true });
  }
  renderMarker(inc, isNew);
  renderCard(inc, isNew && live);
  renderKPIs();
  if (isNew && live) {
    const b = band(inc.severity);
    addActivity(`${b.label} incident ${inc.displayId} detected via ${srcMeta(inc.source).label}`, b.k === "critical" ? "crit" : "");
    if (b.k === "critical" || b.k === "high") notify(inc);
    selectIncident(inc._id);
  }
  if (state.selectedIncidentId === inc._id) renderIncidentDetails();
  return inc;
}

function renderMarker(inc, isNew) {
  if (inc.latitude === null || inc.longitude === null) return;
  const pos = [inc.latitude, inc.longitude];
  const b = band(inc.severity);
  const popup = `<div class="pop-t" style="color:${b.color}">${esc(inc.displayId)} · ${esc(b.label)}</div>
    ${esc(inc.incidentType || "Emergency event")}<br/>
    Source: <b>${esc(srcMeta(inc.source).label)}</b><br/>
    Confidence: <b>${pct(inc.confidenceScore)}</b><br/>
    Severity: <b>${inc.severity === null ? "NOT ASSESSED" : inc.severity + "/100"}</b><br/>
    Status: <b>${esc(String(inc.status).replace(/_/g, " ").toUpperCase())}</b>
    ${inc.isDemo ? '<br/><span style="color:var(--orange);font-size:9px;letter-spacing:.1em">DEMO EVENT</span>' : ""}`;
  const sel = state.selectedIncidentId === inc._id;
  if (incMarkers[inc._id]) {
    incMarkers[inc._id].setLatLng(pos).setIcon(makeIncIcon(inc.severity, sel)).setPopupContent(popup);
  } else {
    const m = L.marker(pos, { icon: makeIncIcon(inc.severity, sel) }).bindPopup(popup).addTo(L_inc);
    m.on("click", () => selectIncident(inc._id));
    incMarkers[inc._id] = m;
  }
}

function matchesFilters(inc) {
  const f = state.filters;
  if (f.sev !== "ALL" && band(inc.severity).label !== f.sev) return false;
  if (f.src !== "ALL" && !inc.sources.some((s) => String(s.source).toLowerCase() === f.src)) return false;
  if (f.q) {
    const hay = [inc.displayId, inc._id, inc.incidentType, inc.source, inc.status, inc.latitude, inc.longitude].join(" ").toLowerCase();
    if (!hay.includes(f.q.toLowerCase())) return false;
  }
  return true;
}

function cardHTML(inc) {
  const b = band(inc.severity);
  const srcList = inc.sources.map((s) => `<span><i class="fa-solid ${srcMeta(s.source).icon}"></i> ${esc(srcMeta(s.source).label)}</span>`).join(' <span style="color:var(--text-3)">+</span> ');
  return `<div class="card-top">
      <span class="tag ${b.k}">${b.k === "unknown" ? "" : "●"} ${esc(b.label)}</span>
      <span class="card-id">${esc(inc.displayId)}</span>
    </div>
    <div class="card-title">${esc(inc.incidentType || "Emergency event")}</div>
    <div class="card-src">${srcList}${inc.isDemo ? ' <span class="badge-demo">DEMO</span>' : ' <span class="badge-demo badge-real">LIVE</span>'}</div>
    <div class="card-metrics">
      <div class="metric"><div class="k">CONFIDENCE</div><div class="v">${pct(inc.confidenceScore)}</div></div>
      <div class="metric"><div class="k">SEVERITY</div><div class="v" style="color:${b.color}">${inc.severity === null ? "—" : inc.severity}</div></div>
      <div class="metric"><div class="k">PATIENTS</div><div class="v">${inc.patients === null ? "—" : inc.patients}</div></div>
    </div>
    <div class="card-foot">
      <span>${inc.assignedAmbulance ? '<i class="fa-solid fa-truck-medical" style="color:var(--orange)"></i> ' + esc(inc.assignedAmbulance) : '<span style="color:var(--text-3)">Awaiting dispatch</span>'}
      ${inc.assignedHospital ? ' · <i class="fa-solid fa-hospital" style="color:var(--green)"></i> ' + esc(inc.assignedHospital) : ""}</span>
      <span class="mono">${hhmmss(inc.timestamp)}</span>
    </div>`;
}

function renderCard(inc, fresh) {
  const list = $("incidentList");
  let card = $("card-" + inc._id);
  if (!card) {
    card = document.createElement("div");
    card.id = "card-" + inc._id;
    card.className = "card";
    card.tabIndex = 0;
    card.setAttribute("data-testid", "incident-card");
    card.setAttribute("role", "button");
    card.onclick = () => selectIncident(inc._id);
    card.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectIncident(inc._id); } };
    const empty = $("emptyState");
    if (empty) empty.remove();
    list.prepend(card);
  }
  card.innerHTML = cardHTML(inc);
  card.style.borderLeftColor = band(inc.severity).color;
  card.classList.toggle("sel", state.selectedIncidentId === inc._id);
  card.style.display = matchesFilters(inc) ? "" : "none";
  if (fresh) { card.classList.add("fresh"); setTimeout(() => card.classList.remove("fresh"), 2500); }
}

function renderIncidentList() {
  const list = $("incidentList");
  const incidents = Object.values(state.incidents);
  if (!incidents.length) {
    list.innerHTML = `<div class="empty" id="emptyState" data-testid="empty-state">
      <div class="ico"><i class="fa-solid fa-shield-halved"></i></div>
      <h4>RESQNET MONITORING ACTIVE</h4>
      <p>No active emergencies detected.<br/>All connected detection channels — smartphone, CCTV, citizen and IoT — are being monitored.</p></div>`;
    return;
  }
  incidents.forEach((i) => renderCard(i, false));
  let visible = 0;
  incidents.forEach((i) => { if (matchesFilters(i)) visible++; });
  if (!visible && !$("noMatch")) {
    const d = document.createElement("div");
    d.className = "empty"; d.id = "noMatch";
    d.innerHTML = `<div class="ico"><i class="fa-solid fa-filter-circle-xmark"></i></div><h4>NO MATCHING INCIDENTS</h4><p>Filters are active. Underlying incident data is retained.</p>`;
    list.appendChild(d);
  } else if (visible && $("noMatch")) $("noMatch").remove();
}

/* ---------- KPIs ---------- */
let lastKpi = {};
function setKpi(id, val) {
  const el = $(id);
  if (!el || String(el.textContent) === String(val)) return;
  el.textContent = val;
  el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump");
}
function renderKPIs() {
  const list = Object.values(state.incidents).filter((i) => !["resolved", "closed"].includes(String(i.status).toLowerCase()));
  setKpi("kpiActive", list.length);
  setKpi("kpiCritical", list.filter((i) => band(i.severity).k === "critical").length);
  const ambs = Object.values(state.ambulances);
  setKpi("kpiAmbAvail", ambs.filter((a) => a.status === "available").length);
  setKpi("kpiAmbRoute", ambs.filter((a) => ["en_route", "assigned"].includes(a.status)).length);
  setKpi("kpiHosp", Object.values(state.hospitals).filter((h) => String(h.capacity).toUpperCase() !== "UNAVAILABLE").length);
  const etas = Object.values(state.routes).map((r) => num(r.etaMin)).filter((v) => v !== null);
  if (etas.length) {
    setKpi("kpiEta", Math.round(etas.reduce((a, b) => a + b, 0) / etas.length) + " min");
    $("kpiEtaTag").textContent = "MEASURED · " + etas.length + " DISPATCH" + (etas.length > 1 ? "ES" : "");
  } else {
    setKpi("kpiEta", "—");
    $("kpiEtaTag").textContent = "NO DISPATCHES";
  }
  $("sidebarCount").textContent = Object.keys(state.incidents).length;
  $("kpiActiveTag").textContent = list.some((i) => i.isDemo) ? "INCLUDES DEMO EVENTS" : "LIVE DATA";
}

/* ---------- activity feed ---------- */
function addActivity(msg, kind) {
  const item = { t: new Date().toISOString(), msg, kind: kind || "" };
  state.activity.unshift(item);
  state.activity = state.activity.slice(0, 60);
  const feed = $("activityFeed");
  const el = document.createElement("div");
  el.className = "feed-item " + item.kind;
  el.setAttribute("data-testid", "activity-item");
  el.innerHTML = `<span class="t">${hhmmss(item.t)}</span><span class="m">${esc(msg)}</span>`;
  feed.prepend(el);
  while (feed.children.length > 60) feed.lastChild.remove();
}

/* ---------- toasts ---------- */
let toastCount = 0;
function toast(title, body, kind, onClick) {
  if (toastCount >= 3) return;
  toastCount++;
  const el = document.createElement("div");
  el.className = "toast " + (kind || "");
  el.setAttribute("data-testid", "toast");
  el.innerHTML = `<div class="h"><i class="fa-solid ${kind === "info" ? "fa-circle-info" : kind === "warn" ? "fa-triangle-exclamation" : "fa-bell"}"></i> ${esc(title)}</div>
    <div class="b">${body}</div>${onClick ? '<div class="cta">VIEW INCIDENT →</div>' : ""}`;
  el.onclick = () => { if (onClick) onClick(); el.remove(); toastCount--; };
  $("toasts").appendChild(el);
  setTimeout(() => { if (el.parentNode) { el.remove(); toastCount--; } }, kind === "warn" ? 9000 : 6500);
}
function notify(inc) {
  toast("NEW " + band(inc.severity).label + " INCIDENT",
    `<span class="mono">${esc(inc.displayId)}</span><br/>${esc(srcMeta(inc.source).label)} detection · Confidence ${pct(inc.confidenceScore)}`,
    "", () => selectIncident(inc._id));
}

/* ---------- selection & details ---------- */
const PIPELINE = [
  { k: "detected", label: "DETECT", icon: "fa-eye" },
  { k: "verified", label: "VERIFY", icon: "fa-check-double" },
  { k: "severity", label: "SEVERITY", icon: "fa-gauge-high" },
  { k: "ambulance", label: "DISPATCH", icon: "fa-truck-medical" },
  { k: "route", label: "ROUTE", icon: "fa-route" },
  { k: "hospital", label: "HOSPITAL", icon: "fa-hospital" }
];
function pipelineProgress(inc) {
  const r = state.routes[inc._id] || {};
  const done = { detected: true };
  const st = String(inc.status || "").toLowerCase();
  if (["verified", "dispatched", "en_route", "ambulance_en_route", "resolved"].includes(st) || r.ambulanceId) done.verified = true;
  if (inc.severity !== null) done.severity = true;
  if (r.ambulanceId || inc.assignedAmbulance) done.ambulance = true;
  if (r.coords) done.route = true;
  if (inc.hospitalAlerted) done.hospital = true;
  return done;
}

function selectIncident(id) {
  const inc = state.incidents[id];
  if (!inc) return;
  const prev = state.selectedIncidentId;
  state.selectedIncidentId = id;
  if (prev && state.incidents[prev]) renderMarker(state.incidents[prev], false);
  document.querySelectorAll(".card").forEach((c) => c.classList.toggle("sel", c.id === "card-" + id));
  renderMarker(inc, false);
  if (inc.latitude !== null && inc.longitude !== null) {
    map.flyTo([inc.latitude, inc.longitude], 14, { duration: 0.9 });
    if (incMarkers[id]) incMarkers[id].openPopup();
  }
  $("panel").classList.remove("collapsed");
  $("collapseIcon").className = "fa-solid fa-chevron-down";
  renderIncidentDetails();
  if (!state.candidates[id]) computeDispatch(inc);
  else drawRoute(id);
}

function renderIncidentDetails() {
  const inc = state.incidents[state.selectedIncidentId];
  const cols = ["colWorkflow", "colSources", "colDispatch", "colHospital", "colTimeline"];
  if (!inc) {
    $("panelEmpty").style.display = "grid";
    cols.forEach((c) => ($(c).style.display = "none"));
    $("panelSub").textContent = "no incident selected";
    return;
  }
  $("panelEmpty").style.display = "none";
  cols.forEach((c) => ($(c).style.display = "flex"));
  const b = band(inc.severity);
  $("panelSub").innerHTML = `${esc(inc.displayId)} · ${esc(inc.incidentType || "Emergency event")} · <span style="color:${b.color}">${b.label}</span>${inc.isDemo ? ' · <span style="color:var(--orange)">DEMO</span>' : ""}`;

  const done = pipelineProgress(inc);
  const firstPending = PIPELINE.find((p) => !done[p.k]);
  $("stepper").innerHTML = PIPELINE.map((p, i) => {
    const cls = done[p.k] ? "done" : firstPending && firstPending.k === p.k ? "cur" : "";
    return `${i ? `<span class="step-l ${done[p.k] ? "done" : ""}"></span>` : ""}
      <span class="step ${cls}" data-testid="step-${p.k}"><span class="n"><i class="fa-solid ${done[p.k] ? "fa-check" : p.icon}"></i></span>${p.label}</span>`;
  }).join("");

  $("confVal").textContent = pct(inc.confidenceScore);
  $("confBar").style.width = (inc.confidenceScore ?? 0) + "%";
  $("sevVal").textContent = inc.severity === null ? "NOT ASSESSED" : inc.severity + " / 100";
  $("sevBar").style.width = (inc.severity ?? 0) + "%";
  $("sevBar").style.background = b.color;
  $("sevClass").textContent = b.label;
  $("sevClass").style.color = b.color;
  $("patVal").textContent = inc.patients === null ? "UNKNOWN" : inc.patients;
  $("locVal").textContent = inc.latitude === null ? "NO GPS FIX" : inc.latitude.toFixed(4) + ", " + inc.longitude.toFixed(4);
  $("statVal").textContent = String(inc.status).replace(/_/g, " ").toUpperCase();

  const confs = inc.sources.map((s) => num(s.confidence)).filter((v) => v !== null);
  $("sourcesBox").innerHTML =
    inc.sources.map((s) => `<div class="srcline"><span><i class="fa-solid ${srcMeta(s.source).icon}"></i> ${esc(srcMeta(s.source).label)}</span><b>${pct(num(s.confidence))}</b></div>`).join("") +
    (inc.sources.length < 2 ? `<div class="hint" style="border-color:rgba(255,159,10,.3);color:var(--orange)">No secondary confirmation available — response proceeded on a single channel.</div>` : "");
  $("fusedVal").textContent = inc.confidenceScore !== null ? pct(inc.confidenceScore) : confs.length ? pct(Math.max(...confs)) : "N/A";

  const cands = state.candidates[inc._id];
  $("ambBox").innerHTML = !cands
    ? `<div class="hint">Evaluating fleet…</div>`
    : cands.map((c) => `<div class="amb-opt ${c.selected ? "win" : ""}" data-testid="amb-candidate">
        <div class="h"><b>${esc(c.id)}${c.selected ? ' <span style="color:var(--green)">★ SELECTED</span>' : ""}</b><span style="font-family:var(--font-mono);color:${c.selected ? "var(--green)" : "var(--text-2)"}">ETA ${c.eta} min</span></div>
        <div class="d"><span>Dist <em>${c.dist} km</em></span><span>Traffic <em>${esc(c.traffic)}</em></span><span>Trauma <em>${c.trauma ? "YES" : "NO"}</em></span></div></div>`).join("");

  const r = state.routes[inc._id] || {};
  $("routeDist").textContent = r.distKm ? r.distKm + " km" : "—";
  $("routeEta").textContent = r.etaMin ? r.etaMin + " min" : "—";
  $("routeGeom").textContent = r.geometrySource || "—";
  $("routeBadge").textContent = r.geometrySource === "OSRM ROAD" ? "REAL GEOMETRY" : r.coords ? "STRAIGHT LINE" : "PENDING";
  $("routeBadge").className = "badge-demo" + (r.geometrySource === "OSRM ROAD" ? " badge-real" : "");

  const hosp = state.hospitals[r.hospitalId];
  $("hospBox").innerHTML = !hosp
    ? `<div class="hint">No receiving hospital selected yet.</div>`
    : `<div class="srcline"><span><i class="fa-solid fa-hospital" style="color:var(--green)"></i> ${esc(hosp.name)}</span></div>
       <div class="kv"><span>Emergency</span><b>${esc(hosp.emergency)}</b></div>
       <div class="kv"><span>Trauma unit</span><b>${hosp.trauma ? "YES" : "NO"}</b></div>
       <div class="kv"><span>Incoming patients</span><b>${inc.patients === null ? "UNKNOWN" : inc.patients}</b></div>
       <div class="kv"><span>Severity</span><b style="color:${b.color}">${b.label}</b></div>
       <div class="kv"><span>Pre-alert</span><b style="color:${inc.hospitalAlerted ? "var(--green)" : "var(--orange)"}" data-testid="hospital-alert-status">${inc.hospitalAlerted ? "✓ ALERT SENT" : "● PENDING"}</b></div>`;

  const perf = state.perf[inc._id];
  $("perfBox").innerHTML = !perf || !Object.keys(perf).length
    ? `<div class="hint">Awaiting telemetry — timings are only shown when measured.</div>`
    : Object.entries(perf).map(([k, v]) => `<div class="perf-row"><span>${esc(k)}</span><b>${v} ms</b></div>`).join("") +
      `<div class="perf-row perf-total"><span>End-to-end</span><b>${Object.values(perf).reduce((a, c) => a + c, 0)} ms</b></div>`;

  const tl = state.timelines[inc._id] || [];
  $("timelineBox").innerHTML = tl.map((e, i) => `<div class="tl ${i === tl.length - 1 && !e.final ? "cur" : ""}"><span class="stem"><i></i></span><span class="txt"><em>${hhmmss(e.t)}</em>${esc(e.text)}</span></div>`).reverse().join("");
}

function pushTimeline(id, text) {
  if (!state.timelines[id]) state.timelines[id] = [];
  state.timelines[id].push({ t: new Date().toISOString(), text });
  if (state.selectedIncidentId === id) renderIncidentDetails();
}

/* ---------- dispatch optimisation + routing ---------- */
function computeDispatch(inc) {
  if (inc.latitude === null || inc.longitude === null) return;
  const needsTrauma = band(inc.severity).k === "critical";
  const cands = Object.values(state.ambulances)
    .filter((a) => a.status === "available" || a.id === (state.routes[inc._id] || {}).ambulanceId)
    .map((a) => {
      const dist = haversine([a.lat, a.lng], [inc.latitude, inc.longitude]);
      const factor = { LOW: 1.0, MEDIUM: 1.45, HIGH: 2.1 }[a.traffic] || 1.3;
      const eta = Math.max(2, Math.round((dist / 42) * 60 * factor));
      const score = eta + (needsTrauma && !a.trauma ? 12 : 0);
      return { id: a.id, dist: dist.toFixed(1), eta, traffic: a.traffic, trauma: !!a.trauma, score };
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

  state.routes[inc._id] = { ...(state.routes[inc._id] || {}), ambulanceId: cands[0].id, hospitalId: hospital ? hospital.h.id : null, etaMin: cands[0].eta };
  $("ambReason").innerHTML = `<b>ResQNet selected ${esc(cands[0].id)}</b> — best feasible response score (${needsTrauma ? "trauma capability required, " : ""}road ETA weighted by demo traffic factor). Not the geographically nearest unit by default.`;
  renderKPIs();
  drawRoute(inc._id);
}

async function drawRoute(id) {
  const inc = state.incidents[id];
  const r = state.routes[id];
  if (!inc || !r || inc.latitude === null) return;
  const amb = state.ambulances[r.ambulanceId];
  const hosp = state.hospitals[r.hospitalId];
  if (!amb) return;
  let coords = null, distKm = null, etaMin = r.etaMin, geometrySource = "STRAIGHT LINE (OSRM UNAVAILABLE)";
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
    } catch (e) { hospCoords = [[inc.latitude, inc.longitude], [hosp.lat, hosp.lng]]; }
  }
  state.routes[id] = { ...r, coords, hospCoords, distKm, etaMin, geometrySource };
  const cands = state.candidates[id];
  if (cands) {
    const win = cands.find((c) => c.id === amb.id);
    if (win) { win.eta = etaMin; win.dist = distKm; }
  }
  L_route.clearLayers();
  L.polyline(coords, { color: "#FF9F0A", weight: 5, opacity: 0.9, lineCap: "round" }).addTo(L_route);
  if (hospCoords) L.polyline(hospCoords, { color: "#409CFF", weight: 4, opacity: 0.8, dashArray: "9,9" }).addTo(L_route);
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
    updateAmbulance({ id: ambId, lat: pts[i][0], lng: pts[i][1], status: "en_route" });
  }, 700);
}

/* ---------- system health ---------- */
const HEALTH_KEYS = { Backend: ["hBackend", "tBackend"], Socket: ["hSocket", "tSocket"], Database: ["hDb", "tDb"], AI: ["hAi", "tAi"], Routing: ["hRouting", "tRouting"] };
function setHealth(key, val) {
  state.systemHealth[key] = val;
  const ids = HEALTH_KEYS[key];
  if (!ids) return;
  const dot = $(ids[0]), txt = $(ids[1]);
  const cls = val === true ? "online" : val === false ? "offline" : "unknown";
  const label = val === true ? "ONLINE" : val === false ? "OFFLINE" : "UNKNOWN";
  dot.className = "dot " + cls;
  if (txt) txt.textContent = label;
  const vals = Object.values(state.systemHealth);
  const anyDown = vals.includes(false);
  const allUp = state.systemHealth.Backend === true && !anyDown;
  $("dotSystem").className = "dot live " + (allUp ? "online" : anyDown ? "degraded" : "unknown");
  $("systemLabel").textContent = state.systemHealth.Backend === false ? "BACKEND OFFLINE" : anyDown ? "DEGRADED" : allUp ? "SYSTEM OPERATIONAL" : "PARTIAL TELEMETRY";
}

async function pollHealth() {
  try {
    const t0 = performance.now();
    const res = await fetch(API + "/health", { cache: "no-store" });
    const data = await res.json();
    setHealth("Backend", true);
    setHealth("Database", data.database === true ? true : data.database === false ? false : true);
    setHealth("AI", data.ai === true ? true : data.ai === false ? false : true);
    if (data.ai === null || data.ai === undefined) $("tAi").textContent = "ONLINE";
    state.lastSync = new Date();
    state.apiLatency = Math.round(performance.now() - t0);
  } catch (e) {
    setHealth("Backend", false);
    toast("CONNECTION LOST", `Backend unreachable.<br/>Last successful update: <span class="mono">${state.lastSync ? hhmmss(state.lastSync) : "never"}</span>`, "warn", () => { pollHealth(); syncIncidents(); });
  }
}

async function probeRouting() {
  try {
    const res = await fetch(`${OSRM}/route/v1/driving/73.8567,18.5204;73.8780,18.5360?overview=false`);
    const d = await res.json();
    setHealth("Routing", !!(d && d.routes));
  } catch (e) { setHealth("Routing", false); }
}

/* ---------- API sync + socket ---------- */
async function syncIncidents(initial) {
  try {
    const res = await fetch(API + "/emergencies", { cache: "no-store" });
    const data = await res.json();
    if (!Array.isArray(data)) return;
    setHealth("Backend", true);
    state.lastSync = new Date();
    data.slice().reverse().forEach((raw) => {
      const id = raw.incidentId || raw.id || raw._id;
      const live = !initial && !state.seen.has(id);
      state.seen.add(id);
      upsertIncident(raw, live);
    });
    renderIncidentList();
  } catch (e) {
    setHealth("Backend", false);
  }
}

function initSocket() {
  const url = CFG.SOCKET_URL;
  if (!url || typeof io === "undefined") {
    setHealth("Socket", null);
    $("tSocket").textContent = "NOT CONFIGURED";
    return;
  }
  const socket = io(url, { transports: ["websocket", "polling"] });
  socket.on("connect", () => { setHealth("Socket", true); addActivity("Socket.IO connected to command backend", "ok"); });
  socket.on("disconnect", () => { setHealth("Socket", false); addActivity("Socket disconnected — reconnecting…", "crit"); });
  socket.on("connect_error", () => setHealth("Socket", false));
  
  // Dual event listener support
  socket.on("newEmergency", (p) => { if (!p) return; const id = p.incidentId || p._id || p.id; if (id && state.seen.has(id)) return; if (id) state.seen.add(id); upsertIncident(p, true); renderIncidentList(); });
  socket.on("incident:new", (p) => { if (!p) return; const id = p.incidentId || p._id || p.id; if (id && state.seen.has(id)) return; if (id) state.seen.add(id); upsertIncident(p, true); renderIncidentList(); });
  socket.on("incidentUpdated", (p) => { if (p && (p.incidentId || p._id || p.id)) { upsertIncident(p, false); renderIncidentList(); } });
  socket.on("incident:update", (p) => { if (p && (p.incidentId || p._id || p.id)) { upsertIncident(p, false); renderIncidentList(); } });
  socket.on("incidentStatusChanged", (p) => { if (!p) return; const inc = state.incidents[p.incidentId || p._id || p.id]; if (inc) { upsertIncident({ ...inc, status: p.status }, false); pushTimeline(inc._id, "Status: " + p.status); } });
  socket.on("incidentResolved", (p) => { if (!p) return; const inc = state.incidents[p.incidentId || p._id || p.id]; if (inc) upsertIncident({ ...inc, status: "resolved" }, false); });
  socket.on("incident:resolved", (p) => { if (!p) return; const inc = state.incidents[p.incidentId || p._id || p.id]; if (inc) upsertIncident({ ...inc, status: "resolved" }, false); });
  socket.on("ambulanceAssigned", (p) => { if (!p) return; const inc = state.incidents[p.incidentId]; if (inc) { upsertIncident({ ...inc, assignedAmbulance: p.ambulanceId }, false); state.routes[inc._id] = { ...(state.routes[inc._id] || {}), ambulanceId: p.ambulanceId, etaMin: num(p.eta) }; updateAmbulance({ id: p.ambulanceId, status: "assigned" }); drawRoute(inc._id); } });
  socket.on("ambulanceLocationUpdated", (p) => { if (p && (p.ambulanceId || p.id)) updateAmbulance({ id: p.ambulanceId || p.id, lat: num(p.latitude || p.lat), lng: num(p.longitude || p.lng), status: p.status || "en_route", eta: num(p.eta) }); });
  socket.on("ambulance:telemetry", (p) => { if (p && (p.id || p.ambulanceId || p.code)) updateAmbulance({ id: p.id || p.ambulanceId || p.code, lat: num(p.lat || p.latitude), lng: num(p.lng || p.longitude), status: p.status || "en_route", eta: num(p.eta) }); });
  socket.on("hospitalSelected", (p) => { if (!p) return; const inc = state.incidents[p.incidentId]; if (inc) { state.routes[inc._id] = { ...(state.routes[inc._id] || {}), hospitalId: p.hospitalId }; upsertIncident({ ...inc, assignedHospital: p.hospitalName || p.hospitalId }, false); drawRoute(inc._id); } });
  socket.on("hospitalAlerted", (p) => { if (!p) return; const inc = state.incidents[p.incidentId]; if (inc) { upsertIncident({ ...inc, hospitalAlerted: true }, false); pushTimeline(inc._id, "Hospital pre-alert confirmed by backend"); } });
}

/* ---------- DEMO MODE ---------- */
const DEMO_PRESETS = {
  smartphone: { incidentType: "Road collision (no CCTV coverage)", confidenceScore: 87, severity: 87, patients: 2, sources: [{ source: "smartphone", confidence: 87 }] },
  cctv: { incidentType: "Road collision at monitored junction", confidenceScore: 92, severity: 78, patients: 2, sources: [{ source: "cctv", confidence: 92 }, { source: "smartphone", confidence: 81 }] },
  citizen: { incidentType: "Reported two-wheeler crash", confidenceScore: 74, severity: 58, patients: 1, sources: [{ source: "citizen", confidence: 74 }] }
};

async function runDemo(kind) {
  if (state.demoBusy) { toast("DEMO RUNNING", "Wait for the current simulation to complete.", "info"); return; }
  state.demoBusy = true;
  closeDemo();
  setDemoMode(true);
  const p = DEMO_PRESETS[kind];
  const jitter = () => (Math.random() - 0.5) * 0.05;
  const payload = {
    source: kind,
    incidentType: p.incidentType,
    latitude: +(CENTER[0] + jitter()).toFixed(5),
    longitude: +(CENTER[1] + jitter()).toFixed(5),
    confidenceScore: p.confidenceScore,
    severity: null,
    patients: p.patients,
    status: "detected",
    isDemo: true,
    detectionSources: p.sources,
    timestamp: new Date().toISOString()
  };
  const t0 = performance.now();
  let created;
  try {
    const res = await fetch(API + "/emergencies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    created = await res.json();
    setHealth("Backend", true);
  } catch (e) {
    setHealth("Backend", false);
    created = { ...payload, _id: "demo-" + Date.now() };
    toast("BACKEND OFFLINE", "Demo event kept in browser memory only.", "warn");
  }
  const detectMs = Math.round(performance.now() - t0);
  const inc = upsertIncident(created, true);
  state.seen.add(inc._id);
  state.perf[inc._id] = { Detection: detectMs };
  renderIncidentList();
  selectIncident(inc._id);
  addActivity(`${kind === "cctv" ? "CCTV/YOLO" : kind === "smartphone" ? "Smartphone sensor" : "Citizen SOS"} event ${inc.displayId} entered the pipeline`, "crit");
  pushTimeline(inc._id, kind === "cctv" ? "YOLO accident event detected on camera feed" : kind === "smartphone" ? "Possible crash detected by phone IMU + acoustics" : "Citizen SOS report submitted");

  const steps = [
    { d: 900, run: async () => { pushTimeline(inc._id, "GPS fix acquired"); addActivity("GPS acquired for " + inc.displayId); } },
    { d: 1100, run: async () => { await patch(inc, { status: "verifying" }); pushTimeline(inc._id, "Cross-channel verification in progress"); } },
    { d: 1200, run: async () => { const t = performance.now(); await patch(inc, { status: "verified" }); state.perf[inc._id].Verification = Math.round(performance.now() - t); pushTimeline(inc._id, "Emergency verified"); addActivity("Verification complete for " + inc.displayId, "ok"); } },
    { d: 1000, run: async () => { await patch(inc, { severity: p.severity }); pushTimeline(inc._id, `Severity assessed: ${p.severity}/100 (${band(p.severity).label})`); } },
    { d: 1200, run: async () => { const t = performance.now(); computeDispatch(state.incidents[inc._id]); const chosen = (state.routes[inc._id] || {}).ambulanceId; if (chosen) { updateAmbulance({ id: chosen, status: "assigned" }); await patch(inc, { assignedAmbulance: chosen, status: "dispatched" }); state.perf[inc._id].Dispatch = Math.round(performance.now() - t); pushTimeline(inc._id, `Ambulance ${chosen} selected — best feasible response score`); addActivity(`${chosen} dispatched to ${inc.displayId}`, "ok"); } } },
    { d: 1400, run: async () => { await drawRoute(inc._id); const r = state.routes[inc._id] || {}; pushTimeline(inc._id, `Route calculated — ${r.distKm || "?"} km, ETA ${r.etaMin || "?"} min (${r.geometrySource})`); } },
    { d: 1200, run: async () => { const r = state.routes[inc._id] || {}; const hosp = state.hospitals[r.hospitalId]; if (hosp) { const t = performance.now(); await patch(inc, { assignedHospital: hosp.name, hospitalAlerted: true }); state.perf[inc._id]["Hospital alert"] = Math.round(performance.now() - t); updateHospital({ id: hosp.id }); pushTimeline(inc._id, `${hosp.name} pre-alerted — ${p.patients} incoming patient(s)`); addActivity(`${hosp.name} alerted for ${inc.displayId}`, "ok"); } } },
    { d: 900, run: async () => { const r = state.routes[inc._id] || {}; if (r.ambulanceId) { updateAmbulance({ id: r.ambulanceId, status: "en_route" }); await patch(inc, { status: "ambulance_en_route" }); pushTimeline(inc._id, `Ambulance ${r.ambulanceId} en route`); addActivity(`${r.ambulanceId} en route to ${inc.displayId}`); animateAmbulance(inc._id); } state.demoBusy = false; } }
  ];
  let delay = 0;
  steps.forEach((s) => { delay += s.d; setTimeout(() => { s.run().then(() => { if (state.selectedIncidentId === inc._id) renderIncidentDetails(); renderIncidentList(); }); }, delay); });
}

async function patch(inc, body) {
  Object.assign(state.incidents[inc._id], body);
  renderMarker(state.incidents[inc._id], false);
  renderCard(state.incidents[inc._id], false);
  renderKPIs();
  if (String(inc._id).startsWith("demo-") || String(inc._id).startsWith("local-")) return;
  try { await fetch(`${API}/emergencies/${inc._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); } catch (e) { setHealth("Backend", false); }
}

async function resetDemo() {
  closeDemo();
  if (ambAnim) { clearInterval(ambAnim); ambAnim = null; }
  state.demoBusy = false;
  try { await fetch(API + "/emergencies/demo", { method: "DELETE" }); } catch (e) {}
  Object.values(state.incidents).forEach((inc) => {
    if (!inc.isDemo) return;
    if (incMarkers[inc._id]) { L_inc.removeLayer(incMarkers[inc._id]); delete incMarkers[inc._id]; }
    const card = $("card-" + inc._id); if (card) card.remove();
    delete state.incidents[inc._id]; delete state.timelines[inc._id]; delete state.routes[inc._id];
    delete state.perf[inc._id]; delete state.candidates[inc._id]; state.seen.delete(inc._id);
  });
  L_route.clearLayers();
  Object.keys(ambMarkers).forEach((id) => { L_amb.removeLayer(ambMarkers[id]); delete ambMarkers[id]; });
  state.ambulances = {};
  FLEET_SEED.forEach((a) => updateAmbulance({ ...a, eta: null }));
  HOSP_SEED.forEach((h) => updateHospital({ ...h }));
  state.selectedIncidentId = null;
  state.activity = [];
  $("activityFeed").innerHTML = "";
  renderIncidentList();
  renderIncidentDetails();
  renderKPIs();
  $("panel").classList.add("collapsed");
  $("collapseIcon").className = "fa-solid fa-chevron-up";
  map.flyTo(CENTER, CFG.DEFAULT_ZOOM || 12, { duration: 0.8 });
  addActivity("Demo state reset — command center back to monitoring", "ok");
  toast("DEMO RESET", "Demo incidents, routes and fleet positions cleared.", "info");
}

function setDemoMode(on) {
  state.demoMode = on;
  $("demoBtn").classList.toggle("on", on);
  $("demoBtnLabel").textContent = on ? "DEMO MODE ACTIVE" : "DEMO MODE";
}
const openDemo = () => $("demoModal").classList.add("show");
const closeDemo = () => $("demoModal").classList.remove("show");

/* ---------- map helpers ---------- */
function fitAll() {
  const layers = [];
  [L_inc, L_amb, L_hosp].forEach((g) => g && g.eachLayer((l) => layers.push(l)));
  if (!layers.length) return map.flyTo(CENTER, CFG.DEFAULT_ZOOM || 12);
  map.fitBounds(L.featureGroup(layers).getBounds().pad(0.18));
}
function centerSelected() {
  const inc = state.incidents[state.selectedIncidentId];
  if (!inc || inc.latitude === null) return toast("NO INCIDENT SELECTED", "Pick an incident from the list first.", "info");
  map.flyTo([inc.latitude, inc.longitude], 15, { duration: 0.8 });
  if (incMarkers[inc._id]) incMarkers[inc._id].openPopup();
}
function toggleLayer(name, btn) {
  state.layers[name] = !state.layers[name];
  btn.classList.toggle("on", state.layers[name]);
  const g = { incidents: L_inc, ambulances: L_amb, hospitals: L_hosp, routes: L_route }[name];
  if (state.layers[name]) g.addTo(map); else map.removeLayer(g);
}

/* ---------- wiring ---------- */
function wire() {
  setInterval(() => { $("clock").textContent = new Date().toLocaleTimeString("en-GB", { hour12: false }) + " IST"; }, 1000);

  $("healthBtn").onclick = (e) => { e.stopPropagation(); const p = $("healthPopover"); p.classList.toggle("show"); $("healthBtn").setAttribute("aria-expanded", p.classList.contains("show")); };
  document.addEventListener("click", (e) => { if (!$("healthPopover").contains(e.target) && e.target !== $("healthBtn")) $("healthPopover").classList.remove("show"); });

  $("demoBtn").onclick = openDemo;
  $("demoClose").onclick = closeDemo;
  $("demoModal").onclick = (e) => { if (e.target === $("demoModal")) closeDemo(); };
  $("demoSmartphone").onclick = () => runDemo("smartphone");
  $("demoCctv").onclick = () => runDemo("cctv");
  $("demoCitizen").onclick = () => runDemo("citizen");
  $("demoReset").onclick = resetDemo;
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDemo(); });

  $("tabIncidents").onclick = () => switchTab("incidents");
  $("tabFeed").onclick = () => switchTab("feed");

  $("searchInput").addEventListener("input", debounce((e) => { state.filters.q = e.target.value.trim(); applyFilters(); }, 180));
  document.querySelectorAll("#sevChips .chip").forEach((c) => (c.onclick = () => { document.querySelectorAll("#sevChips .chip").forEach((x) => x.classList.remove("on")); c.classList.add("on"); state.filters.sev = c.dataset.sev; applyFilters(); }));
  document.querySelectorAll("#srcChips .chip").forEach((c) => (c.onclick = () => { document.querySelectorAll("#srcChips .chip").forEach((x) => x.classList.remove("on")); c.classList.add("on"); state.filters.src = c.dataset.src; applyFilters(); }));

  document.querySelectorAll(".mbtn[data-layer]").forEach((b) => (b.onclick = () => toggleLayer(b.dataset.layer, b)));
  $("fitAllBtn").onclick = fitAll;
  $("centerIncBtn").onclick = centerSelected;
  $("btnCenter").onclick = centerSelected;
  $("btnRoute").onclick = () => { if (state.selectedIncidentId) drawRoute(state.selectedIncidentId); else toast("NO INCIDENT SELECTED", "Pick an incident to draw its emergency route.", "info"); };
  $("btnCollapse").onclick = () => {
    const p = $("panel"); p.classList.toggle("collapsed");
    $("collapseIcon").className = "fa-solid fa-chevron-" + (p.classList.contains("collapsed") ? "up" : "down");
  };
}
function switchTab(t) {
  const inc = t === "incidents";
  $("tabIncidents").classList.toggle("active", inc);
  $("tabFeed").classList.toggle("active", !inc);
  $("viewIncidents").style.display = inc ? "flex" : "none";
  $("viewFeed").style.display = inc ? "none" : "flex";
}
function applyFilters() {
  Object.values(state.incidents).forEach((inc) => {
    const card = $("card-" + inc._id);
    const ok = matchesFilters(inc);
    if (card) card.style.display = ok ? "" : "none";
    const m = incMarkers[inc._id];
    if (m) { if (ok) { if (!L_inc.hasLayer(m)) L_inc.addLayer(m); } else if (L_inc.hasLayer(m)) L_inc.removeLayer(m); }
  });
  renderIncidentList();
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

/* ---------- boot ---------- */
window.addEventListener("DOMContentLoaded", async () => {
  initMap();
  wire();
  renderIncidentList();
  renderIncidentDetails();
  addActivity("ResQNet command center initialised — monitoring all detection channels", "ok");
  await pollHealth();
  probeRouting();
  await syncIncidents(true);
  initSocket();
  setInterval(pollHealth, CFG.HEALTH_POLL_MS || 5000);
  setInterval(() => syncIncidents(false), CFG.INCIDENT_POLL_MS || 4000);
});
