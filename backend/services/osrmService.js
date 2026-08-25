const axios = require('axios');

class OSRMService {
    static getBaseUrl() {
        return process.env.OSRM_BASE_URL || 'https://router.project-osrm.org';
    }

    /**
     * Calculates driving route between two points: Origin -> Destination
     */
    static async getRouteBetween(originLng, originLat, destLng, destLat) {
        if (originLng == null || originLat == null || destLng == null || destLat == null) {
            return {
                success: false,
                isFallback: true,
                routingStatus: 'DEGRADED_MISSING_COORDS',
                distanceKm: null,
                etaMinutes: null,
                geometry: null,
                error: 'Missing required coordinate parameters'
            };
        }

        const url = `${this.getBaseUrl()}/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=false`;
        const startTime = Date.now();

        try {
            const response = await axios.get(url, { timeout: 3500 });
            if (response.data && response.data.code === 'Ok' && response.data.routes.length > 0) {
                const route = response.data.routes[0];
                const latencyMs = Date.now() - startTime;
                return {
                    success: true,
                    isFallback: false,
                    routingStatus: 'OPTIMAL_ROAD',
                    trafficWeighting: 'configured traffic weighting',
                    distanceMeters: Math.round(route.distance),
                    distanceKm: +(route.distance / 1000).toFixed(2),
                    durationSeconds: Math.round(route.duration),
                    etaMinutes: Math.max(1, Math.round(route.duration / 60)),
                    geometry: route.geometry,
                    osrmLatencyMs: latencyMs
                };
            }
        } catch (err) {
            console.warn(`[OSRM] Single-leg route degraded fallback (${err.message})`);
        }

        // Explicit degraded fallback using Haversine
        const haversineDistKm = this.calculateHaversineDistance(originLat, originLng, destLat, destLng);
        const estimatedDurationSeconds = Math.round((haversineDistKm / 45) * 3600); // 45 km/h avg speed
        return {
            success: true,
            isFallback: true,
            routingStatus: 'DEGRADED',
            trafficWeighting: 'configured traffic weighting',
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
            fallbackNote: 'Calculated via direct topological approximation (OSRM offline/timeout)'
        };
    }

    /**
     * Calculates full 2-leg emergency route: Ambulance -> Crash Site -> Hospital
     */
    static async getTwoLegRoute(ambLng, ambLat, sceneLng, sceneLat, hospLng, hospLat) {
        if (sceneLng == null || sceneLat == null) {
            return {
                success: false,
                isFallback: true,
                routingStatus: 'DEGRADED_NO_SCENE_GPS',
                distanceKm: null,
                etaMinutes: null,
                geometry: null
            };
        }

        const url = `${this.getBaseUrl()}/route/v1/driving/${ambLng},${ambLat};${sceneLng},${sceneLat};${hospLng},${hospLat}?overview=full&geometries=geojson&steps=false`;

        try {
            const response = await axios.get(url, { timeout: 4000 });
            if (response.data && response.data.code === 'Ok' && response.data.routes.length > 0) {
                const route = response.data.routes[0];
                return {
                    success: true,
                    isFallback: false,
                    routingStatus: 'OPTIMAL_ROAD',
                    trafficWeighting: 'configured traffic weighting',
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
            console.warn(`[OSRM] Two-leg route degraded fallback (${err.message})`);
        }

        const leg1 = await this.getRouteBetween(ambLng, ambLat, sceneLng, sceneLat);
        const leg2 = await this.getRouteBetween(sceneLng, sceneLat, hospLng, hospLat);

        return {
            success: true,
            isFallback: true,
            routingStatus: 'DEGRADED',
            trafficWeighting: 'configured traffic weighting',
            distanceMeters: (leg1.distanceMeters || 0) + (leg2.distanceMeters || 0),
            distanceKm: +((leg1.distanceKm || 0) + (leg2.distanceKm || 0)).toFixed(2),
            durationSeconds: (leg1.durationSeconds || 0) + (leg2.durationSeconds || 0),
            etaMinutes: (leg1.etaMinutes || 0) + (leg2.etaMinutes || 0),
            geometry: {
                type: 'LineString',
                coordinates: [
                    ...(leg1.geometry?.coordinates || []),
                    ...(leg2.geometry?.coordinates || [])
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
