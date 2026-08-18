/**
 * ResQNet AI Engine
 * Multi-source signal fusion, crash severity estimation,
 * and capability-weighted resource allocation algorithms.
 */

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in meters
}

class AIEngine {
    /**
     * Compute multi-source fused confidence score
     * Formula: 1 - product of (1 - source_conf)
     */
    static computeConfidence(sources = []) {
        if (!sources || sources.length === 0) return 0.85;
        
        let complementary = 1.0;
        sources.forEach(src => {
            const conf = src.confidence || (src.type === 'cctv' ? 0.92 : src.type === 'smartphone' ? 0.88 : 0.80);
            complementary *= (1 - conf);
        });

        const fused = 1.0 - complementary;
        return parseFloat(Math.min(0.99, Math.max(0.50, fused)).toFixed(2));
    }

    /**
     * Severity Estimation Model (0 - 100 Scale)
     * Inputs: gForce, speedKmh, speedDeltaKmh, rollover, sources, manualSeverity
     */
    static estimateSeverity(payload = {}) {
        if (payload.severity !== undefined && payload.severity !== null) {
            return Math.min(100, Math.max(1, parseInt(payload.severity)));
        }

        let baseScore = 40;

        // Sensor G-force contribution
        if (payload.gForce) {
            const g = parseFloat(payload.gForce);
            if (g >= 6.0) baseScore += 45;
            else if (g >= 4.0) baseScore += 30;
            else if (g >= 3.0) baseScore += 20;
            else if (g >= 2.0) baseScore += 10;
        }

        // Speed Delta drop contribution
        if (payload.speedDeltaKmh) {
            const delta = parseFloat(payload.speedDeltaKmh);
            if (delta >= 60) baseScore += 25;
            else if (delta >= 40) baseScore += 18;
            else if (delta >= 20) baseScore += 10;
        }

        // Rollover or severe rotational inversion
        if (payload.rollover) {
            baseScore += 20;
        }

        // Multiple sources confirm
        if (payload.sources && payload.sources.length > 1) {
            baseScore += 10;
        }

        return Math.min(100, Math.max(15, Math.round(baseScore)));
    }

    /**
     * Dynamic Ambulance Optimization Algorithm
     * Selects available ALS / BLS unit minimizing weighted response cost.
     */
    static selectBestAmbulance(incident, ambulances = []) {
        const available = ambulances.filter(a => a.status === 'AVAILABLE');
        if (available.length === 0) {
            return { ambulance: null, reason: 'No fleet units currently available' };
        }

        const needsTraumaALS = incident.severity >= 75;
        let best = null;
        let lowestCost = Infinity;

        available.forEach(amb => {
            const distMeters = calculateDistance(incident.latitude, incident.longitude, amb.lat, amb.lng);
            let cost = distMeters;

            // Prioritize Advanced Life Support (ALS) for critical Level-1 incidents
            if (needsTraumaALS && amb.traumaReady) {
                cost -= 1500; // negative cost advantage for equipped ALS
            }

            if (cost < lowestCost) {
                lowestCost = cost;
                best = amb;
            }
        });

        if (!best) return { ambulance: null, reason: 'No suitable unit found' };

        const approxKm = (calculateDistance(incident.latitude, incident.longitude, best.lat, best.lng) / 1000).toFixed(1);
        const reason = `${best.code}: Optimal unit (${approxKm} km away${best.traumaReady ? ', ALS Trauma Equipped' : ''})`;

        return { ambulance: best, reason };
    }

    /**
     * Dynamic Hospital Matching Algorithm
     * Selects closest Trauma Center for critical incidents, or nearest ED for moderate incidents.
     */
    static selectBestHospital(incident, hospitals = []) {
        const activeHospitals = hospitals.filter(h => h.status !== 'OFFLINE');
        if (activeHospitals.length === 0) {
            return { hospital: null, reason: 'No hospital emergency departments online' };
        }

        const isCritical = incident.severity >= 75;
        let best = null;
        let lowestCost = Infinity;

        activeHospitals.forEach(hosp => {
            const distMeters = calculateDistance(incident.latitude, incident.longitude, hosp.lat, hosp.lng);
            let cost = distMeters;

            if (isCritical && hosp.trauma) {
                cost -= 2500; // prioritize Level-1 trauma centers for severe incidents
            }

            if (cost < lowestCost) {
                lowestCost = cost;
                best = hosp;
            }
        });

        if (!best) return { hospital: null, reason: 'No matching hospital found' };

        const approxKm = (calculateDistance(incident.latitude, incident.longitude, best.lat, best.lng) / 1000).toFixed(1);
        const reason = `${best.name}: Best match (${approxKm} km${best.trauma ? ', Level-1 Trauma Certified' : ''})`;

        return { hospital: best, reason };
    }
}

module.exports = AIEngine;
