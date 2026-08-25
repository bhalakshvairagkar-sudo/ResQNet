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
        this.responseHistory = new Map();
        this.seedInitialFleet();
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
