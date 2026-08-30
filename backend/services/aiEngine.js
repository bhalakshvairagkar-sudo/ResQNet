const OSRMService = require('./osrmService');

class AIEngine {
    static fuseConfidence(sources = []) {
        const seen = new Set(); let unconfidence = 1;
        for (const item of sources) {
            const s = typeof item === 'object' ? item : { confidence: item };
            const key = `${s.source || s.sourceType || 'unknown'}:${s.deviceId || s.cameraId || ''}`;
            if (seen.has(key)) continue; seen.add(key);
            let c = Number(s.confidence ?? s.confidenceScore ?? 0.85); if (c > 1) c /= 100;
            unconfidence *= 1 - Math.min(.99, Math.max(.1, c));
        }
        return Math.round(Math.max(.1, 1 - unconfidence) * 100);
    }

    /**
     * 2. Polytrauma Severity Scoring Engine (0-100)
     */
    static calculateSeverity(payload) {
        const { gForce, speedDeltaKmh, rollover, patients, confidence, sourceType, evidence } = payload;

        let total = 0;

        if (sourceType === 'cctv' || (evidence && (evidence.spatial_collision || evidence.is_confirmed))) {
            // CCTV Optical Severity Formula (0-100)
            let opticalScore = 35; // Base optical impact severity
            if (evidence) {
                if (evidence.spatial_collision) opticalScore += 25 + Math.min(15, Math.round((evidence.max_iou || 0.3) * 30));
                if (evidence.rapid_deceleration) opticalScore += 15;
                if (evidence.rollover_detected) opticalScore += 20;
                if (evidence.pedestrian_involved) opticalScore += 15;
            }
            const patientCount = Number(patients || payload.patientCount) || 1;
            opticalScore += Math.min(10, patientCount * 5);
            total = opticalScore;
        } else {
            // IMU / Kinematic Shock Contribution (max 40 pts)
            const gVal = Number(gForce) || (sourceType === 'smartphone' ? 4.5 : 2.5);
            const gScore = Math.min(40, (gVal / 6.0) * 40);

            // Velocity Delta (max 30 pts)
            const deltaV = Number(speedDeltaKmh) || (gVal > 4.0 ? 55 : 25);
            const deltaScore = Math.min(30, (deltaV / 80.0) * 30);

            // Vehicle Rollover Flag (20 pts)
            const isRollover = (rollover === true || rollover === 'true' || (evidence && evidence.rollover_detected));
            const rolloverScore = isRollover ? 20 : 0;

            // Occupant Risk Factor (max 10 pts)
            const patientCount = Number(patients || payload.patientCount) || 1;
            const patientScore = Math.min(10, patientCount * 5);

            total = Math.round(gScore + deltaScore + rolloverScore + patientScore);
        }

        if (payload.severity !== undefined && !isNaN(Number(payload.severity))) {
            total = Math.max(total, Number(payload.severity));
        }

        return Math.min(100, Math.max(15, total));
    }
    static async optimizeAmbulance(incident, ambulances = []) {
        const critical = incident.severity >= 75, rejected = [], candidates = ambulances.filter(a => {
            if (a.status !== 'AVAILABLE' || a.currentIncidentId) { rejected.push({ id: a.id, code: a.code, reason: 'Not available' }); return false; }
            if (critical && (a.type !== 'ALS' || !a.traumaReady)) { rejected.push({ id: a.id, code: a.code, reason: 'Critical trauma requires ALS and trauma-ready capability' }); return false; }
            return true;
        });
        if (incident.latitude == null || incident.longitude == null) return { selected: null, reason: 'Scene location unavailable; unit selection deferred', ranking: [], rejections: rejected };
        const settled = await Promise.allSettled(candidates.map(async ambulance => ({ ambulance, route: await OSRMService.getRouteBetween(ambulance.lng, ambulance.lat, incident.longitude, incident.latitude) })));
        const rankings = settled.filter(x => x.status === 'fulfilled').map(x => {
            const { ambulance, route } = x.value, capabilityPenalty = critical ? 0 : (ambulance.type === 'ALS' ? 0 : 1);
            const score = +(route.etaMinutes * .65 + route.distanceKm * .2 + capabilityPenalty * 5).toFixed(2);
            return { ambulance, route, score, reasons: [`${route.etaMinutes} min ETA`, `${route.distanceKm} km`, route.isFallback ? 'degraded routing fallback' : 'road route', `${ambulance.type} ${ambulance.traumaReady ? 'trauma-ready' : 'standard'}`] };
        }).sort((a, b) => a.score - b.score);
        const best = rankings[0];
        return { selected: best?.ambulance || null, route: best?.route || null, etaMinutes: best?.route?.etaMinutes ?? null, distanceKm: best?.route?.distanceKm ?? null, reason: best ? `${best.ambulance.code}: ${best.reasons.join(', ')}` : 'No route candidates available', ranking: rankings.map(x => ({ id: x.ambulance.id, code: x.ambulance.code, score: x.score, eta: x.route.etaMinutes, distance: x.route.distanceKm, type: x.ambulance.type, reasons: x.reasons })), rejections: rejected };
    }
    static async optimizeHospital(incident, hospitals = []) {
        const critical = incident.severity >= 75, rejected = [], candidates = hospitals.filter(h => {
            if (h.status === 'OFFLINE' || h.emergencyCapacity <= 0) { rejected.push({ id: h.id, name: h.name, reason: 'Facility unavailable or no emergency capacity' }); return false; }
            if (critical && (!h.trauma || h.traumaLevel > 2)) { rejected.push({ id: h.id, name: h.name, reason: 'Critical trauma requires Level 1 or 2 trauma centre' }); return false; }
            return true;
        });
        if (incident.latitude == null || incident.longitude == null) return { selected: null, reason: 'Scene location unavailable; destination selection deferred', ranking: [], rejections: rejected };
        const settled = await Promise.allSettled(candidates.map(async hospital => ({ hospital, route: await OSRMService.getRouteBetween(incident.longitude, incident.latitude, hospital.lng, hospital.lat) })));
        const rankings = settled.filter(x => x.status === 'fulfilled').map(x => {
            const { hospital, route } = x.value, score = +(route.etaMinutes * .45 + route.distanceKm * .05 + (100 - (hospital.edReadiness ?? 0)) * .1 + (10 - (hospital.emergencyCapacity ?? 0)) * .15 + (hospital.trauma ? 0 : 20)).toFixed(2);
            return { hospital, route, score, reasons: [`Level ${hospital.traumaLevel || 'UNAVAILABLE'} trauma`, `${hospital.emergencyCapacity ?? 'UNAVAILABLE'} bays`, `ED readiness ${hospital.edReadiness ?? 'UNAVAILABLE'}%`, `${route.etaMinutes} min ETA`] };
        }).sort((a, b) => a.score - b.score);
        const best = rankings[0];
        return { selected: best?.hospital || null, route: best?.route || null, etaMinutes: best?.route?.etaMinutes ?? null, distanceKm: best?.route?.distanceKm ?? null, reason: best ? `${best.hospital.name}: ${best.reasons.join(', ')}` : 'No suitable hospital route available', ranking: rankings.map(x => ({ id: x.hospital.id, name: x.hospital.name, score: x.score, eta: x.route.etaMinutes, reasons: x.reasons })), rejections: rejected };
    }
    static buildHospitalPreAlert(incident, ambulance, hospital) {
        const medical = incident.userMedicalInfo || null, blood = medical?.match(/blood\s*:\s*([ABO][+-]?)/i)?.[1] || 'NOT PROVIDED';
        return { incidentId: incident.incidentId || incident.id, alertStatus: 'PENDING', alertSentAt: new Date().toISOString(), destinationHospital: { id: hospital.id, name: hospital.name, traumaLevel: hospital.traumaLevel ?? 'UNAVAILABLE' }, assignedUnit: { code: ambulance.code || ambulance.id, type: ambulance.type || 'UNAVAILABLE', etaMinutes: incident.route?.etaMinutes ?? 'UNAVAILABLE' }, clinicalTriage: { severityIndex: incident.severity, confidence: incident.confidence, patientCount: incident.patientCount ?? 'NOT PROVIDED', peakGForce: incident.peakGForce ?? incident.gForce ?? 'UNAVAILABLE', deltaV: incident.speedDeltaKmh ?? 'UNAVAILABLE', rollover: incident.rollover ?? 'NOT PROVIDED', locationQuality: incident.locationQuality, medicalInformation: medical || 'NOT PROVIDED', bloodGroup: blood, allergies: medical?.match(/allerg(?:y|ies)\s*:\s*([^|]+)/i)?.[1]?.trim() || 'NOT PROVIDED', routeStatus: incident.route?.routingStatus || 'UNAVAILABLE' } };
    }
}
module.exports = AIEngine;
