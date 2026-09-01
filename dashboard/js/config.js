/* ResQNet runtime configuration */
window.RESQNET_CONFIG = {
  // Use same origin when served from localhost:5000, or fallback to port 5000
  BACKEND_URL: window.location.origin.startsWith('http') ? window.location.origin : 'http://localhost:5000',
  // Active Socket.IO push
  SOCKET_URL: window.location.origin.startsWith('http') ? window.location.origin : 'http://localhost:5000',
  DEFAULT_CENTER: [18.5204, 73.8567],
  DEFAULT_ZOOM: 13,
  OSRM_URL: "https://router.project-osrm.org",
  GOOGLE_MAPS_API_KEY: "", // Provide your Google Maps API key here or via env
  HEALTH_POLL_MS: 5000,
  INCIDENT_POLL_MS: 3000
};
