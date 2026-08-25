const mongoose = require('mongoose');
const config = require('../config/config');
const Incident = require('../models/Incident');
const Ambulance = require('../models/Ambulance');
const Hospital = require('../models/Hospital');
const ResponseHistory = require('../models/ResponseHistory');

class DataStore {
    constructor() {
        this.isMongoConnected = false;
        this.incidents = new Map();
        this.ambulances = new Map();
        this.hospitals = new Map();
        this.cctvCameras = new Map();
        this.hotspots = new Map();
        this.responseHistory = new Map();
        this.seedInitialFleet();
        this.seedInitialInfrastructure();
    }

    seedInitialInfrastructure() {
        const initialCCTV = [
            {
                id: 'CCTV-01',
                cameraId: 'CCTV-PUNE-JUNCTION-01',
                cameraName: 'Pune University Smart Junction Cam',
                lat: 18.5308,
                lng: 73.8290,
                status: 'ONLINE',
                sourceType: 'FIXED_OPTICAL_AI',
                fovAngle: 65,
                heading: 50,
                coverageRadiusMeters: 200,
                lastDetection: {
                    timestamp: new Date().toISOString(),
                    detected: false,
                    confidence: 0.94
                }
            },
            {
                id: 'CCTV-02',
                cameraId: 'CCTV-PUNE-SWARGATE-02',
                cameraName: 'Swargate High-Density Transit Hub',
                lat: 18.5018,
                lng: 73.8576,
                status: 'ONLINE',
                sourceType: 'FIXED_OPTICAL_AI',
                fovAngle: 75,
                heading: 180,
                coverageRadiusMeters: 220,
                lastDetection: {
                    timestamp: new Date().toISOString(),
                    detected: false,
                    confidence: 0.91
                }
            },
            {
                id: 'CCTV-03',
                cameraId: 'CCTV-PUNE-STATION-03',
                cameraName: 'Pune Railway Station Flyover Cam',
                lat: 18.5284,
                lng: 73.8744,
                status: 'ONLINE',
                sourceType: 'FIXED_OPTICAL_AI',
                fovAngle: 55,
                heading: 90,
                coverageRadiusMeters: 175,
                lastDetection: {
                    timestamp: new Date().toISOString(),
                    detected: false,
                    confidence: 0.96
                }
            },
            {
                id: 'CCTV-04',
                cameraId: 'CCTV-PUNE-KATRAJ-04',
                cameraName: 'Katraj Tunnel Highway Cam',
                lat: 18.4480,
                lng: 73.8620,
                status: 'ONLINE',
                sourceType: 'FIXED_OPTICAL_AI',
                fovAngle: 50,
                heading: 160,
                coverageRadiusMeters: 260,
                lastDetection: {
                    timestamp: new Date().toISOString(),
                    detected: false,
                    confidence: 0.89
                }
            }
        ];

        const initialHotspots = [
            {
                id: 'HOTSPOT-01',
                name: 'NH48 Katraj Ghat Multi-Lane Hazard Zone',
                lat: 18.4380,
                lng: 73.8540,
                radiusMeters: 350,
                riskScore: 88,
                historicalIncidents: 14,
                category: 'HIGHWAY_HAZARD'
            },
            {
                id: 'HOTSPOT-02',
                name: 'Hadapsar Solapur Freight Corridor Blackspot',
                lat: 18.5020,
                lng: 73.9280,
                radiusMeters: 300,
                riskScore: 78,
                historicalIncidents: 11,
                category: 'COMMERCIAL_CONGESTION'
            },
            {
                id: 'HOTSPOT-03',
                name: 'Hinjewadi IT Expressway Interchange',
                lat: 18.5910,
                lng: 73.7380,
                radiusMeters: 400,
                riskScore: 84,
                historicalIncidents: 16,
                category: 'HIGH_SPEED_MERGE'
            }
        ];

        initialCCTV.forEach(c => this.cctvCameras.set(c.id, c));
        initialHotspots.forEach(h => this.hotspots.set(h.id, h));
    }

    seedInitialFleet() {
        const initialAmbulances = [
            { id: 'AMB-01', code: 'AMB-01', type: 'ALS', traumaReady: true, lat: 18.5300, lng: 73.8400, location: { type: 'Point', coordinates: [73.8400, 18.5300] }, status: 'AVAILABLE', eta: 4, speed: 0, heading: 0 },
            { id: 'AMB-02', code: 'AMB-02', type: 'ALS', traumaReady: true, lat: 18.5100, lng: 73.8600, location: { type: 'Point', coordinates: [73.8600, 18.5100] }, status: 'AVAILABLE', eta: 5, speed: 0, heading: 0 },
            { id: 'AMB-03', code: 'AMB-03', type: 'BLS', traumaReady: false, lat: 18.5400, lng: 73.8700, location: { type: 'Point', coordinates: [73.8700, 18.5400] }, status: 'AVAILABLE', eta: 8, speed: 0, heading: 0 },
            { id: 'AMB-04', code: 'AMB-04', type: 'ALS', traumaReady: true, lat: 18.4900, lng: 73.8300, location: { type: 'Point', coordinates: [73.8300, 18.4900] }, status: 'UNAVAILABLE', eta: 12, speed: 0, heading: 0 },
            { id: 'AMB-05', code: 'AMB-05', type: 'ALS', traumaReady: true, lat: 18.5500, lng: 73.8200, location: { type: 'Point', coordinates: [73.8200, 18.5500] }, status: 'AVAILABLE', eta: 6, speed: 0, heading: 0 }
        ];

        const initialHospitals = [
            { id: 'HOSP-01', name: 'Pune Trauma Center', lat: 18.5280, lng: 73.8720, location: { type: 'Point', coordinates: [73.8720, 18.5280] }, trauma: true, traumaLevel: 1, capacity: 'PRE-ALERT READY', emergencyCapacity: 8, edReadiness: 95, status: 'AVAILABLE', bloodBankStock: { "O+": 12, "O-": 4, "A+": 8, "B+": 10 } },
            { id: 'HOSP-02', name: 'Ruby Hall General', lat: 18.5350, lng: 73.8780, location: { type: 'Point', coordinates: [73.8780, 18.5350] }, trauma: true, traumaLevel: 2, capacity: 'STANDBY', emergencyCapacity: 4, edReadiness: 85, status: 'AVAILABLE', bloodBankStock: { "O+": 6, "A+": 4, "B+": 5 } },
            { id: 'HOSP-03', name: 'City Emergency Care', lat: 18.5050, lng: 73.8350, location: { type: 'Point', coordinates: [73.8350, 18.5050] }, trauma: false, traumaLevel: 3, capacity: 'LIMITED', emergencyCapacity: 2, edReadiness: 60, status: 'LIMITED', bloodBankStock: { "O+": 2, "A+": 1 } },
            { id: 'HOSP-04', name: 'Sahyadri Specialty Hospital', lat: 18.5120, lng: 73.8340, location: { type: 'Point', coordinates: [73.8340, 18.5120] }, trauma: true, traumaLevel: 1, capacity: 'PRE-ALERT READY', emergencyCapacity: 6, edReadiness: 90, status: 'AVAILABLE', bloodBankStock: { "O+": 8, "O-": 2, "A+": 6, "B+": 7 } }
        ];

        initialAmbulances.forEach(a => this.ambulances.set(a.id, a));
        initialHospitals.forEach(h => this.hospitals.set(h.id, h));
    }

    async connect() {
        try {
            await mongoose.connect(config.MONGODB_URI, {
                serverSelectionTimeoutMS: 2000
            });
            this.isMongoConnected = true;
            console.log('[Database] MongoDB connected successfully.');
            await this.syncToMongo();
        } catch (err) {
            this.isMongoConnected = false;
            console.log('[Database] MongoDB unreachable - operating with high-speed In-Memory Data Store.');
        }
    }

    async syncToMongo() {
        if (!this.isMongoConnected) return;
        try {
            // Seed ambulances if collection is empty
            const ambCount = await Ambulance.countDocuments();
            if (ambCount === 0) {
                for (const amb of this.ambulances.values()) {
                    await Ambulance.findOneAndUpdate({ id: amb.id }, amb, { upsert: true });
                }
            } else {
                const dbAmbs = await Ambulance.find();
                dbAmbs.forEach(a => this.ambulances.set(a.id, a.toObject()));
            }

            // Seed hospitals if collection is empty
            const hospCount = await Hospital.countDocuments();
            if (hospCount === 0) {
                for (const hosp of this.hospitals.values()) {
                    await Hospital.findOneAndUpdate({ id: hosp.id }, hosp, { upsert: true });
                }
            } else {
                const dbHosps = await Hospital.find();
                dbHosps.forEach(h => this.hospitals.set(h.id, h.toObject()));
            }

            // Sync existing incidents into in-memory cache
            const dbIncidents = await Incident.find();
            dbIncidents.forEach(inc => this.incidents.set(inc.incidentId || inc.id, inc.toObject()));
        } catch (e) {
            console.error('[Database] Mongo sync error:', e.message);
        }
    }

    // Incidents Operations
    async saveIncident(incident) {
        const id = incident.incidentId || incident.id;
        const normalized = {
            ...incident,
            incidentId: id,
            id: id,
            updatedAt: new Date().toISOString()
        };
        this.incidents.set(id, normalized);

        if (this.isMongoConnected) {
            try {
                const doc = {
                    ...normalized,
                    location: normalized.location || { type: 'Point', coordinates: [normalized.longitude, normalized.latitude] }
                };
                await Incident.findOneAndUpdate({ incidentId: id }, doc, { upsert: true, new: true });
            } catch (err) {
                console.error('[Database] Mongo saveIncident error:', err.message);
            }
        }
        return this.incidents.get(id);
    }

    async getIncident(id) {
        if (this.isMongoConnected) {
            try {
                const found = await Incident.findOne({ incidentId: id });
                if (found) return found.toObject();
            } catch (e) { }
        }
        return this.incidents.get(id) || null;
    }

    async getAllIncidents() {
        if (this.isMongoConnected) {
            try {
                const docs = await Incident.find().sort({ createdAt: -1 });
                return docs.map(d => d.toObject());
            } catch (e) { }
        }
        return Array.from(this.incidents.values());
    }

    async updateIncident(id, updates) {
        const existing = await this.getIncident(id);
        if (!existing) return null;
        
        const updated = { 
            ...existing, 
            ...updates, 
            updatedAt: new Date().toISOString() 
        };
        
        // Append to timeline if a status change occurred
        if (updates.status && updates.status !== existing.status) {
            updated.timeline = updated.timeline || [];
            updated.timeline.push({
                status: updates.status,
                timestamp: new Date(),
                description: updates.statusDescription || `State transition to ${updates.status}`,
                actor: updates.actor || 'SYSTEM'
            });
        }

        this.incidents.set(id, updated);

        if (this.isMongoConnected) {
            try {
                await Incident.findOneAndUpdate({ incidentId: id }, updated, { new: true });
            } catch (err) {
                console.error('[Database] Mongo updateIncident error:', err.message);
            }
        }
        return updated;
    }

    async resolveIncident(id, reason = 'Incident resolved successfully') {
        const existing = await this.getIncident(id);
        if (!existing) return null;

        const resolved = {
            ...existing,
            status: 'RESOLVED',
            resolvedAt: new Date(),
            updatedAt: new Date().toISOString()
        };

        resolved.timeline = resolved.timeline || [];
        resolved.timeline.push({
            status: 'RESOLVED',
            timestamp: new Date(),
            description: reason,
            actor: 'OPERATOR'
        });

        this.incidents.set(id, resolved);

        // Free up the ambulance if assigned
        if (resolved.ambulanceId) {
            await this.updateAmbulance(resolved.ambulanceId, {
                status: 'AVAILABLE',
                currentIncidentId: null
            });
        }

        // Record response history
        const historyRecord = {
            incidentId: id,
            totalDurationMinutes: Math.round((new Date() - new Date(resolved.createdAt || Date.now())) / 60000),
            outcome: reason,
            auditLog: resolved.timeline
        };
        this.responseHistory.set(id, historyRecord);

        if (this.isMongoConnected) {
            try {
                await Incident.findOneAndUpdate({ incidentId: id }, resolved);
                await ResponseHistory.create(historyRecord);
            } catch (err) {
                console.error('[Database] Mongo resolveIncident error:', err.message);
            }
        }

        return resolved;
    }

    // Ambulances Operations
    async getAllAmbulances() {
        if (this.isMongoConnected) {
            try {
                const docs = await Ambulance.find();
                return docs.map(d => d.toObject());
            } catch (e) { }
        }
        return Array.from(this.ambulances.values());
    }

    async getAmbulance(id) {
        if (this.isMongoConnected) {
            try {
                const doc = await Ambulance.findOne({ id });
                if (doc) return doc.toObject();
            } catch (e) { }
        }
        return this.ambulances.get(id) || null;
    }

    async updateAmbulance(id, updates) {
        const amb = this.ambulances.get(id);
        if (!amb) return null;

        const updated = { 
            ...amb, 
            ...updates,
            updatedAt: new Date().toISOString()
        };
        if (updates.lat && updates.lng) {
            updated.location = { type: 'Point', coordinates: [updates.lng, updates.lat] };
        }
        this.ambulances.set(id, updated);

        if (this.isMongoConnected) {
            try {
                await Ambulance.findOneAndUpdate({ id }, updated, { new: true });
            } catch (e) { }
        }
        return updated;
    }

    // Hospitals Operations
    async getAllHospitals() {
        if (this.isMongoConnected) {
            try {
                const docs = await Hospital.find();
                return docs.map(d => d.toObject());
            } catch (e) { }
        }
        return Array.from(this.hospitals.values());
    }

    async getHospital(id) {
        if (this.isMongoConnected) {
            try {
                const doc = await Hospital.findOne({ id });
                if (doc) return doc.toObject();
            } catch (e) { }
        }
        return this.hospitals.get(id) || null;
    }

    async updateHospital(id, updates) {
        const hosp = this.hospitals.get(id);
        if (!hosp) return null;
        const updated = { ...hosp, ...updates, updatedAt: new Date().toISOString() };
        this.hospitals.set(id, updated);
        if (this.isMongoConnected) {
            try {
                await Hospital.findOneAndUpdate({ id }, updated, { new: true });
            } catch (e) { }
        }
        return updated;
    }

    // CCTV Cameras Operations
    async getAllCCTV() {
        return Array.from(this.cctvCameras.values());
    }

    async getCCTV(id) {
        return this.cctvCameras.get(id) || null;
    }

    // Historical Blackspot Hotspots Operations
    async getAllHotspots() {
        return Array.from(this.hotspots.values());
    }

    // Configured Traffic Context (honest labeling)
    async getTrafficContext() {
        return [
            {
                corridorId: 'TRAFFIC-CORRIDOR-01',
                name: 'JM Road / FC Road Ring Corridor',
                congestionLevel: 'MODERATE',
                speedWeightFactor: 0.85,
                trafficLabel: 'Configured traffic weighting (Moderate)',
                coordinates: [
                    [73.8412, 18.5148],
                    [73.8450, 18.5220],
                    [73.8510, 18.5310]
                ]
            },
            {
                corridorId: 'TRAFFIC-CORRIDOR-02',
                name: 'Pune-Bangalore NH48 Bypass',
                congestionLevel: 'LOW',
                speedWeightFactor: 1.0,
                trafficLabel: 'Configured traffic weighting (Free Flow)',
                coordinates: [
                    [73.7850, 18.5620],
                    [73.8050, 18.5020],
                    [73.8540, 18.4380]
                ]
            }
        ];
    }

    async resetDemoData() {
        // Keeps non-demo incidents, resets demo incidents and restores fleet
        for (const [id, inc] of this.incidents.entries()) {
            if (inc.isDemo || inc.id.startsWith('DEMO-') || inc.id.startsWith('RNQ-')) {
                inc.status = 'RESOLVED';
                inc.resolvedAt = new Date();
            }
        }
        this.seedInitialFleet();
        if (this.isMongoConnected) {
            try {
                await Ambulance.deleteMany({});
                await Hospital.deleteMany({});
                await this.syncToMongo();
            } catch (e) { }
        }
        return true;
    }
}

const db = new DataStore();
db.connect();

module.exports = db;
