const axios = require('axios');

/** Bounded, failure-tolerant routing. A route never holds up emergency ingestion. */
class OSRMService {
    static cache = new Map(); static failures = 0; static openUntil = 0;
    static timeoutMs = Number(process.env.OSRM_TIMEOUT_MS || 1800);
    static circuitMs = Number(process.env.OSRM_CIRCUIT_MS || 15000);
    static getBaseUrl() { return process.env.OSRM_BASE_URL || 'https://router.project-osrm.org'; }
    static status() { return Date.now() < this.openUntil ? 'DEGRADED' : 'ONLINE'; }
    static calculateHaversineDistance(lat1, lon1, lat2, lon2) {
        const r = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    static fallback(points, note = 'OSRM unavailable') {
        if (points.some(p => p[0] == null || p[1] == null)) return { success: false, isFallback: true, routingStatus: 'DEGRADED_MISSING_COORDS', distanceKm: null, etaMinutes: null, geometry: null };
        let km = 0; for (let i = 1; i < points.length; i++) km += this.calculateHaversineDistance(points[i - 1][1], points[i - 1][0], points[i][1], points[i][0]);
        const seconds = Math.round(km / 45 * 3600);
        return { success: true, isFallback: true, routingStatus: 'DEGRADED', trafficWeighting: 'CONFIGURED_TRAFFIC_CONTEXT', distanceMeters: Math.round(km * 1000), distanceKm: +km.toFixed(2), durationSeconds: seconds, etaMinutes: Math.max(1, Math.round(seconds / 60)), geometry: { type: 'LineString', coordinates: points }, fallbackNote: note };
    }
    static async route(points) {
        if (points.some(p => p[0] == null || p[1] == null)) return this.fallback(points);
        const key = points.map(p => p.join(',')).join(';'), cached = this.cache.get(key);
        if (cached && cached.expires > Date.now()) return cached.value;
        if (Date.now() < this.openUntil) return this.fallback(points, 'OSRM circuit breaker is open');
        const started = Date.now();
        try {
            const { data } = await axios.get(`${this.getBaseUrl()}/route/v1/driving/${key}?overview=full&geometries=geojson&steps=false`, { timeout: this.timeoutMs });
            if (!data?.routes?.length || data.code !== 'Ok') throw new Error('OSRM returned no route');
            const r = data.routes[0], value = { success: true, isFallback: false, routingStatus: 'OPTIMAL_ROAD', trafficWeighting: 'CONFIGURED_TRAFFIC_CONTEXT', distanceMeters: Math.round(r.distance), distanceKm: +(r.distance / 1000).toFixed(2), durationSeconds: Math.round(r.duration), etaMinutes: Math.max(1, Math.round(r.duration / 60)), geometry: r.geometry, legs: (r.legs || []).map(l => ({ distanceKm: +(l.distance / 1000).toFixed(2), durationSeconds: Math.round(l.duration), etaMinutes: Math.max(1, Math.round(l.duration / 60)) })), osrmLatencyMs: Date.now() - started };
            this.failures = 0; this.cache.set(key, { value, expires: Date.now() + 30000 }); return value;
        } catch (error) {
            if (++this.failures >= 2) this.openUntil = Date.now() + this.circuitMs;
            return this.fallback(points, `OSRM degraded: ${error.code || error.message}`);
        }
    }
    static getRouteBetween(originLng, originLat, destLng, destLat) { return this.route([[originLng, originLat], [destLng, destLat]]); }
    static getTwoLegRoute(ambLng, ambLat, sceneLng, sceneLat, hospLng, hospLat) { return this.route([[ambLng, ambLat], [sceneLng, sceneLat], [hospLng, hospLat]]); }
    static async probe() { if (Date.now() < this.openUntil) return 'DEGRADED'; return (await this.getRouteBetween(73.8567, 18.5204, 73.878, 18.536)).isFallback ? 'DEGRADED' : 'ONLINE'; }
}
module.exports = OSRMService;
