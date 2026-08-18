const axios = require('axios');

class OSRMService {
    /**
     * Fetch routing geometry and duration between Ambulance -> Crash Site -> Hospital
     */
    static async getRoute(originLng, originLat, waypointLng, waypointLat, destLng, destLat) {
        const url = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${waypointLng},${waypointLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`;

        try {
            const response = await axios.get(url, { timeout: 3500 });
            if (response.data && response.data.code === 'Ok' && response.data.routes.length > 0) {
                const route = response.data.routes[0];
                return {
                    success: true,
                    distanceMeters: route.distance,
                    durationSeconds: route.duration,
                    geometry: route.geometry,
                    legs: route.legs
                };
            }
        } catch (err) {
            console.warn('[OSRM] Route calculation fallback due to network/timeout:', err.message);
        }

        return {
            success: false,
            fallback: true
        };
    }
}

module.exports = OSRMService;
