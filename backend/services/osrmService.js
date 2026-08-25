const axios = require('axios');

class OSRMService {
    static getBaseUrl() {
        return process.env.OSRM_BASE_URL || 'https://router.project-osrm.org';
    }

    /**
     * Calculates driving route between two points: Origin -> Destination
     */
    static async getRouteBetween(originLng, originLat, destLng, destLat) {
        const url = `${this.getBaseUrl()}/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=false`;
        const startTime = Date.now();

        try {
            const response = await axios.get(url, { timeout: 3000 });
            if (response.data && response.data.code === 'Ok' && response.data.routes.length > 0) {
                const route = response.data.routes[0];
                const latencyMs = Date.now() - startTime;
                return {
                    success: true,
                    isFallback: false,
                    distanceMeters: Math.round(route.distance),
                    distanceKm: +(route.distance / 1000).toFixed(2),
                    durationSeconds: Math.round(route.duration),
                    etaMinutes: Math.max(1, Math.round(route.duration / 60)),
                    geometry: route.geometry,
                    osrmLatencyMs: latencyMs
                };
            }
        } catch (err) {
            console.warn(`[OSRM] Single-leg route fallback (${err.message})`);
        }

        // Fallback estimation using Haversine
        const haversineDistKm = this.calculateHaversineDistance(originLat, originLng, destLat, destLng);
        const estimatedDurationSeconds = Math.round((haversineDistKm / 45) * 3600); // 45 km/h avg speed
        return {
            success: true,
            isFallback: true,
            distanceMeters: Math.round(haversineDistKm * 1000),
            distanceKm: +haversineDistKm.toFixed(2),
            durationSeconds: estimatedDurationSeconds,
            etaMinutes: Math.max(1, Math.round(estimatedDurationSeconds / 60)),
            geometry: {
                type: 'LineString',
                coordinates: [
                    [originLng, originLat],
                    [destLng, destLat]
                ]
            },
            fallbackNote: 'Calculated via topological road approximation (OSRM offline/timeout)'
        };
    }

    /**
     * Calculates full 2-leg emergency route: Ambulance -> Crash Site -> Hospital
     */
    static async getTwoLegRoute(ambLng, ambLat, sceneLng, sceneLat, hospLng, hospLat) {
        const url = `${this.getBaseUrl()}/route/v1/driving/${ambLng},${ambLat};${sceneLng},${sceneLat};${hospLng},${hospLat}?overview=full&geometries=geojson&steps=false`;

        try {
            const response = await axios.get(url, { timeout: 3500 });
            if (response.data && response.data.code === 'Ok' && response.data.routes.length > 0) {
                const route = response.data.routes[0];
                return {
                    success: true,
                    isFallback: false,
                    distanceMeters: Math.round(route.distance),
                    distanceKm: +(route.distance / 1000).toFixed(2),
                    durationSeconds: Math.round(route.duration),
                    etaMinutes: Math.max(1, Math.round(route.duration / 60)),
                    geometry: route.geometry,
                    legs: route.legs ? route.legs.map(l => ({
                        distanceKm: +(l.distance / 1000).toFixed(2),
                        durationSeconds: Math.round(l.duration),
                        etaMinutes: Math.max(1, Math.round(l.duration / 60))
                    })) : []
                };
            }
        } catch (err) {
            console.warn(`[OSRM] Two-leg route fallback (${err.message})`);
        }

        const leg1 = await this.getRouteBetween(ambLng, ambLat, sceneLng, sceneLat);
        const leg2 = await this.getRouteBetween(sceneLng, sceneLat, hospLng, hospLat);

        return {
            success: true,
            isFallback: leg1.isFallback || leg2.isFallback,
            distanceMeters: leg1.distanceMeters + leg2.distanceMeters,
            distanceKm: +(leg1.distanceKm + leg2.distanceKm).toFixed(2),
            durationSeconds: leg1.durationSeconds + leg2.durationSeconds,
            etaMinutes: leg1.etaMinutes + leg2.etaMinutes,
            geometry: {
                type: 'LineString',
                coordinates: [
                    ...(leg1.geometry.coordinates || []),
                    ...(leg2.geometry.coordinates || [])
                ]
            },
            legs: [leg1, leg2]
        };
    }

    static calculateHaversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
}

module.exports = OSRMService;
