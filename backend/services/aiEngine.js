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
    static calculateSeverity(p) {
        const g = Number(p.gForce), delta = Number(p.speedDeltaKmh), patients = Number(p.patients ?? p.patientCount ?? 1);
        let score = (Number.isFinite(g) ? Math.min(40, g / 6 * 40) : 0) + (Number.isFinite(delta) ? Math.min(30, delta / 80 * 30) : 0) + (p.rollover === true || p.rollover === 'true' ? 20 : 0) + Math.min(10, patients * 5);
        if (Number.isFinite(Number(p.severity))) score = Math.max(score, Number(p.severity));
        return Math.min(100, Math.max(15, Math.round(score)));
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
    static buildHospitalPreAlert(incident, ambulance, hospital, patientProfile = null) {
        const profile = patientProfile || incident.patientProfile || null;
        const blood = profile?.bloodGroup || incident.userMedicalInfo?.match(/blood\s*:\s*([ABO][+-]?\s*(?:positive|negative)?)/i)?.[1] || 'O+ POSITIVE';
        const allergies = Array.isArray(profile?.allergies) ? profile.allergies.join(', ') : (profile?.allergies || (incident.userMedicalInfo?.match(/allerg(?:y|ies)\s*:\s*([^|]+)/i)?.[1]?.trim()) || 'None Reported');
        const conditions = Array.isArray(profile?.chronicConditions) ? profile.chronicConditions.join(', ') : (profile?.chronicConditions || 'None Reported');
        const medications = Array.isArray(profile?.currentMedications) ? profile.currentMedications.join(', ') : (profile?.currentMedications || 'None Reported');
        const ice = profile?.emergencyContact || (profile?.primaryContact ? `${profile.primaryContact.name} (${profile.primaryContact.phone})` : (profile?.iceContact || 'Emergency Next-of-Kin'));

        const hospId = hospital?.id || 'HOSP-01';
        const hospName = hospital?.name || 'Sassoon General Hospital / BJGMC';
        const hospLat = hospital?.lat || 18.5253295;
        const hospLng = hospital?.lng || 73.8705450;

        return {
            id: incident.incidentId || incident.id,
            incidentId: incident.incidentId || incident.id,
            alertStatus: 'PENDING',
            alertSentAt: new Date().toISOString(),
            priority: (incident.severity >= 75) ? 'LEVEL-1 TRAUMA PRE-ALERT' : 'URGENT ER PRE-ALERT',
            severity: incident.severity || 85,
            confidence: incident.confidence || 95,
            incomingAmbulance: ambulance ? `${ambulance.code || ambulance.id} (${ambulance.type || 'ALS'} Unit)` : 'AMB-01 (ALS Unit)',
            destinationHospital: {
                id: hospId,
                name: hospName,
                traumaLevel: hospital?.traumaLevel ?? 1,
                address: hospital?.address || 'Near Pune Railway Station, Sassoon Road, Pune - 411001',
                phone: hospital?.phone || '+91 20 2612 8000',
                emergencyCapacity: hospital?.emergencyCapacity || 8
            },
            assignedUnit: {
                id: ambulance?.id || 'AMB-01',
                code: ambulance?.code || ambulance?.id || 'AMB-01',
                type: ambulance?.type || 'ALS',
                etaMinutes: incident.route?.etaMinutes ?? 4,
                distanceKm: incident.route?.distanceKm ?? 3.2
            },
            patientProfile: profile,
            clinicalTriage: {
                severityIndex: incident.severity || 85,
                confidence: incident.confidence || 95,
                patientCount: incident.patientCount ?? 1,
                peakGForce: incident.peakGForce ?? incident.gForce ?? '4.8G',
                deltaV: incident.speedDeltaKmh ?? '52 km/h',
                rollover: incident.rollover ?? false,
                locationQuality: incident.locationQuality || 'FRESH_GPS',
                medicalInformation: incident.userMedicalInfo || `Blood: ${blood} | Allergies: ${allergies} | ICE: ${ice}`,
                bloodGroup: blood,
                allergies: allergies,
                chronicConditions: conditions,
                currentMedications: medications,
                emergencyContact: ice,
                routeStatus: incident.route?.routingStatus || 'OPTIMAL'
            },
            accidentLatitude: incident.latitude || 18.5308,
            accidentLongitude: incident.longitude || 73.8290,
            mapUrl: `https://www.google.com/maps/dir/?api=1&destination=${incident.latitude || 18.5308},${incident.longitude || 73.8290}`,
            hospitalMapUrl: `https://www.google.com/maps/dir/?api=1&destination=${hospLat},${hospLng}`,
            acknowledged: false
        };
    }
}
module.exports = AIEngine;
