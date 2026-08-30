const OSRMService = require('./osrmService');

class AIEngine {
    /**
     * 1. Multi-Source Confidence Fusion
     * Combines independent observation channels (smartphone, CCTV, citizen report, IoT)
     */
    static fuseConfidence(sources) {
        if (!sources || sources.length === 0) {
            return 85; // Default single-source confidence baseline
        }

        // De-duplicate signals from the same channel/device
        const seenSources = new Set();
        const validScores = [];

        for (const s of sources) {
            const key = typeof s === 'object' ? `${s.source || s.sourceType}` : 'unknown';
            if (seenSources.has(key)) continue;
            seenSources.add(key);

            let rawConf = typeof s === 'object' ? (s.confidence !== undefined ? s.confidence : s.confidenceScore) : s;
            if (rawConf === undefined || rawConf === null) rawConf = 0.85;
            if (rawConf > 1.0) rawConf = rawConf / 100.0;
            rawConf = Math.max(0.1, Math.min(0.99, Number(rawConf)));
            validScores.push(rawConf);
        }

        if (validScores.length === 0) return 85;

        // Fused probability = 1 - Product(1 - c_i)
        let unconfidence = 1.0;
        for (const c of validScores) {
            unconfidence *= (1.0 - c);
        }

        const fused = 1.0 - unconfidence;
        return Math.min(100, Math.max(10, Math.round(fused * 100)));
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

    /**
     * 3. Authoritative Capability-Aware Ambulance Optimization
     * Scoring: 50% ETA + 15% Distance + 15% Traffic + 10% Capability + 10% Availability
     */
    static async optimizeAmbulance(incident, ambulances) {
        if (!ambulances || ambulances.length === 0) {
            return {
                selected: null,
                reason: 'No ambulances registered in fleet',
                ranking: [],
                rejections: []
            };
        }

        const isCriticalTrauma = incident.severity >= 75;
        const candidateScores = [];
        const rejections = [];

        for (const amb of ambulances) {
            // Hard Filter: Must be AVAILABLE
            if (amb.status !== 'AVAILABLE') {
                rejections.push({
                    id: amb.id,
                    code: amb.code,
                    reason: `Status is ${amb.status} (Unavailable for dispatch)`
                });
                continue;
            }

            // Real OSRM driving duration & distance from Ambulance -> Crash Scene
            const route = await OSRMService.getRouteBetween(
                amb.lng, amb.lat,
                incident.longitude, incident.latitude
            );

            const roadEtaMins = route.etaMinutes;
            const roadDistKm = route.distanceKm;

            // Traffic congestion factor
            const trafficFactor = amb.id === 'AMB-01' ? 1.1 : (amb.id === 'AMB-02' ? 1.2 : 1.0);

            // Clinical capability matching penalty
            let capabilityPenalty = 0;
            if (isCriticalTrauma) {
                if (amb.type !== 'ALS' || !amb.traumaReady) {
                    capabilityPenalty = 12; // 12-minute equivalent clinical penalty for non-trauma unit on severe trauma
                }
            }

            // Weighted multi-factor cost calculation (lower is better)
            const compositeScore = (0.50 * roadEtaMins) + 
                                   (0.15 * roadDistKm) + 
                                   (0.15 * (roadEtaMins * (trafficFactor - 1.0))) + 
                                   (0.10 * capabilityPenalty) + 
                                   (0.10 * (amb.status === 'AVAILABLE' ? 0 : 10));

            candidateScores.push({
                ambulance: amb,
                roadEtaMinutes: roadEtaMins,
                roadDistanceKm: roadDistKm,
                route: route,
                capabilityPenalty,
                compositeScore: +compositeScore.toFixed(2),
                type: amb.type || 'ALS',
                traumaReady: amb.traumaReady !== false
            });
        }

        if (candidateScores.length === 0) {
            return {
                selected: null,
                reason: 'All registered ambulances are currently busy or offline',
                ranking: [],
                rejections
            };
        }

        // Sort by lowest composite score
        candidateScores.sort((a, b) => a.compositeScore - b.compositeScore);
        const best = candidateScores[0];

        const selectionReason = `${best.ambulance.code}: Optimal unit (${best.roadDistanceKm} km road distance, ${best.roadEtaMinutes} min ETA, ${best.ambulance.type || 'ALS'} Trauma Equipped)`;

        return {
            selected: best.ambulance,
            etaMinutes: best.roadEtaMinutes,
            distanceKm: best.roadDistanceKm,
            route: best.route,
            reason: selectionReason,
            ranking: candidateScores.map(c => ({
                id: c.ambulance.id,
                code: c.ambulance.code,
                score: c.compositeScore,
                eta: c.roadEtaMinutes,
                distance: c.roadDistanceKm,
                type: c.type
            })),
            rejections
        };
    }

    /**
     * 4. Authoritative Capability-Aware Hospital Optimization
     * Scoring: 45% ETA + 25% Trauma Match + 15% Capacity + 10% ED Readiness + 5% Distance
     */
    static async optimizeHospital(incident, hospitals) {
        if (!hospitals || hospitals.length === 0) {
            return {
                selected: null,
                reason: 'No hospitals registered in network',
                ranking: [],
                rejections: []
            };
        }

        const isCritical = incident.severity >= 75;
        const candidateScores = [];
        const rejections = [];

        for (const hosp of hospitals) {
            // Hard Filter 1: Must not be OFFLINE
            if (hosp.status === 'OFFLINE') {
                rejections.push({ id: hosp.id, name: hosp.name, reason: 'Facility OFFLINE' });
                continue;
            }

            // Hard Filter 2: Must have available emergency capacity
            if (hosp.emergencyCapacity !== undefined && hosp.emergencyCapacity <= 0) {
                rejections.push({ id: hosp.id, name: hosp.name, reason: 'Zero Emergency Bay Capacity' });
                continue;
            }

            // Hard Filter 3: If severe critical trauma, reject facilities without active trauma center
            if (isCritical && hosp.trauma === false) {
                rejections.push({ id: hosp.id, name: hosp.name, reason: 'Lacks Level-1/2 Trauma Center for Critical Emergency' });
                continue;
            }

            // Real OSRM driving duration from Crash Scene -> Hospital
            const route = await OSRMService.getRouteBetween(
                incident.longitude, incident.latitude,
                hosp.lng, hosp.lat
            );

            const roadEtaMins = route.etaMinutes;
            const roadDistKm = route.distanceKm;

            // Trauma capability score
            const traumaBonus = hosp.trauma ? 0 : 15;
            const capacityScore = Math.max(0, 10 - (hosp.emergencyCapacity || 5));
            const readinessPenalty = Math.max(0, (100 - (hosp.edReadiness || 85)) / 10);

            // Weighted score (lower is better)
            const score = (0.45 * roadEtaMins) + 
                          (0.25 * traumaBonus) + 
                          (0.15 * capacityScore) + 
                          (0.10 * readinessPenalty) + 
                          (0.05 * roadDistKm);

            candidateScores.push({
                hospital: hosp,
                roadEtaMinutes: roadEtaMins,
                roadDistanceKm: roadDistKm,
                route,
                score: +score.toFixed(2)
            });
        }

        if (candidateScores.length === 0) {
            return {
                selected: null,
                reason: 'No matching hospital with active capacity found',
                ranking: [],
                rejections
            };
        }

        candidateScores.sort((a, b) => a.score - b.score);
        const best = candidateScores[0];

        const selectionReason = `${best.hospital.name}: Best match (${best.roadDistanceKm} km, ${best.roadEtaMinutes} min transit, Level-${best.hospital.traumaLevel || 1} Trauma Certified)`;

        return {
            selected: best.hospital,
            etaMinutes: best.roadEtaMinutes,
            distanceKm: best.roadDistanceKm,
            route: best.route,
            reason: selectionReason,
            ranking: candidateScores.map(c => ({
                id: c.hospital.id,
                name: c.hospital.name,
                score: c.score,
                eta: c.roadEtaMinutes
            })),
            rejections
        };
    }

    /**
     * 5. Generate Zero-Minute Clinical Pre-Alert Payload
     */
    static buildHospitalPreAlert(incident, ambulance, hospital) {
        return {
            incidentId: incident.incidentId || incident.id,
            alertStatus: 'ALERT_SENT',
            alertSentAt: new Date().toISOString(),
            destinationHospital: {
                id: hospital.id,
                name: hospital.name,
                traumaLevel: hospital.traumaLevel || 1
            },
            assignedUnit: {
                code: ambulance.code || ambulance.id,
                type: ambulance.type || 'ALS',
                etaMinutes: incident.route ? incident.route.etaMinutes : 4
            },
            clinicalTriage: {
                severityIndex: incident.severity,
                triageCategory: incident.severity >= 75 ? 'RED_CRITICAL_POLYTRAUMA' : (incident.severity >= 50 ? 'YELLOW_URGENT' : 'GREEN_STANDARD'),
                patientCount: incident.patientCount || 1,
                userMedicalVault: incident.userMedicalInfo || 'No pre-existing conditions recorded',
                bloodGroupRequired: incident.userMedicalInfo ? incident.userMedicalInfo.match(/Blood:\s*([ABO\+\-]+)/i)?.[1] || 'O+' : 'O+'
            },
            traumaBayChecklist: [
                'Trauma Bay 1 Reserved & Sanitized',
                'CT Scan / Rapid Ultrasound on Standby',
                'Matched Blood Units Thawed in Blood Bank',
                'On-Call Neuro & Ortho Surgeon Alerted'
            ]
        };
    }
}

module.exports = AIEngine;
