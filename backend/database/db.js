const mongoose = require('mongoose');
const config = require('../config/config');
const Incident = require('../models/Incident');
const Ambulance = require('../models/Ambulance');
const Hospital = require('../models/Hospital');
const Camera = require('../models/Camera');
const ResponseHistory = require('../models/ResponseHistory');
const EmergencyAlert = require('../models/EmergencyAlert');
const User = require('../models/User');

class DataStore {
    constructor() {
        this.isMongoConnected = false;
        this.incidents = new Map();
        this.ambulances = new Map();
        this.hospitals = new Map();
        this.cctvCameras = new Map();
        this.hotspots = new Map();
        this.responseHistory = new Map();
        this.alerts = new Map();
        this.users = new Map();
        this.seedInitialFleet();
        this.seedInitialInfrastructure();
        this.seedInitialUsers();
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

        initialCCTV.forEach(c => {
            this.cctvCameras.set(c.id, c);
            this.cctvCameras.set(c.cameraId, c);
        });
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
            {
                id: 'HOSP-01',
                name: 'Sassoon General Hospital / BJGMC',
                lat: 18.5253295,
                lng: 73.8705450,
                location: { type: 'Point', coordinates: [73.8705450, 18.5253295] },
                trauma: true,
                traumaLevel: 1,
                relevance: 'Major trauma centre; accident & polytrauma',
                capacity: 'PRE-ALERT READY',
                emergencyCapacity: 12,
                edReadiness: 98,
                status: 'AVAILABLE',
                address: 'Near Pune Railway Station, Sassoon Road, Pune - 411001',
                phone: '+91 20 2612 8000',
                bloodBankStock: { "O+": 16, "O-": 6, "A+": 10, "B+": 12, "AB+": 8 }
            },
            {
                id: 'HOSP-02',
                name: 'Ruby Hall Clinic – Sassoon Road',
                lat: 18.5335374,
                lng: 73.8771538,
                location: { type: 'Point', coordinates: [73.8771538, 18.5335374] },
                trauma: true,
                traumaLevel: 1,
                relevance: '24×7 accident/emergency; RTA/polytrauma',
                capacity: 'PRE-ALERT READY',
                emergencyCapacity: 8,
                edReadiness: 94,
                status: 'AVAILABLE',
                address: '40, Sassoon Road, Sangamvadi, Pune - 411001',
                phone: '+91 20 6645 5100',
                bloodBankStock: { "O+": 10, "O-": 4, "A+": 8, "B+": 8, "AB+": 4 }
            },
            {
                id: 'HOSP-03',
                name: 'Jehangir Hospital',
                lat: 18.5303811,
                lng: 73.8766572,
                location: { type: 'Point', coordinates: [73.8766572, 18.5303811] },
                trauma: true,
                traumaLevel: 1,
                relevance: 'Emergency/tertiary hospital',
                capacity: 'PRE-ALERT READY',
                emergencyCapacity: 7,
                edReadiness: 90,
                status: 'AVAILABLE',
                address: '32, Sassoon Road, Central Railway Station, Pune - 411001',
                phone: '+91 20 6681 1000',
                bloodBankStock: { "O+": 8, "O-": 2, "A+": 6, "B+": 6, "AB+": 3 }
            },
            {
                id: 'HOSP-04',
                name: 'Ranka Hospital',
                lat: 18.4950117,
                lng: 73.8618860,
                location: { type: 'Point', coordinates: [73.8618860, 18.4950117] },
                trauma: true,
                traumaLevel: 2,
                relevance: 'Emergency/orthopaedic & trauma care',
                capacity: 'PRE-ALERT READY',
                emergencyCapacity: 6,
                edReadiness: 88,
                status: 'AVAILABLE',
                address: 'Mukund Nagar, Swargate, Pune - 411037',
                phone: '+91 20 2426 1600',
                bloodBankStock: { "O+": 6, "A+": 4, "B+": 5, "AB+": 2 }
            },
            {
                id: 'HOSP-05',
                name: 'Noble Hospital, Hadapsar',
                lat: 18.5049366,
                lng: 73.9271433,
                location: { type: 'Point', coordinates: [73.9271433, 18.5049366] },
                trauma: true,
                traumaLevel: 1,
                relevance: '24×7 emergency; accident-related care',
                capacity: 'PRE-ALERT READY',
                emergencyCapacity: 9,
                edReadiness: 92,
                status: 'AVAILABLE',
                address: '169, Magarpatta City Road, Hadapsar, Pune - 411013',
                phone: '+91 20 6628 5000',
                bloodBankStock: { "O+": 12, "O-": 3, "A+": 7, "B+": 9, "AB+": 4 }
            },
            {
                id: 'HOSP-06',
                name: 'Sancheti Hospital',
                lat: 18.5299514,
                lng: 73.8528812,
                location: { type: 'Point', coordinates: [73.8528812, 18.5299514] },
                trauma: true,
                traumaLevel: 1,
                relevance: 'Orthopaedic/emergency; trauma relevance',
                capacity: 'PRE-ALERT READY',
                emergencyCapacity: 8,
                edReadiness: 95,
                status: 'AVAILABLE',
                address: '16, Shivajinagar, Pune - 411005',
                phone: '+91 20 2899 9999',
                bloodBankStock: { "O+": 10, "O-": 4, "A+": 6, "B+": 8, "AB+": 3 }
            },
            {
                id: 'HOSP-07',
                name: 'Deenanath Mangeshkar Hospital',
                lat: 18.5020099,
                lng: 73.8328426,
                location: { type: 'Point', coordinates: [73.8328426, 18.5020099] },
                trauma: true,
                traumaLevel: 1,
                relevance: 'Emergency care; major tertiary hospital',
                capacity: 'PRE-ALERT READY',
                emergencyCapacity: 10,
                edReadiness: 96,
                status: 'AVAILABLE',
                address: 'Erandwane, Near Mhatre Bridge, Pune - 411004',
                phone: '+91 20 4015 1000',
                bloodBankStock: { "O+": 14, "O-": 5, "A+": 9, "B+": 11, "AB+": 5 }
            },
            {
                id: 'HOSP-08',
                name: 'Sahyadri Super Speciality – Nagar Road',
                lat: 18.5543086,
                lng: 73.8971383,
                location: { type: 'Point', coordinates: [73.8971383, 18.5543086] },
                trauma: true,
                traumaLevel: 1,
                relevance: 'Emergency/tertiary care',
                capacity: 'PRE-ALERT READY',
                emergencyCapacity: 7,
                edReadiness: 91,
                status: 'AVAILABLE',
                address: 'Plot No. 30C, Nagar Road, Shastri Nagar, Yerawada, Pune - 411006',
                phone: '+91 20 6721 5000',
                bloodBankStock: { "O+": 8, "O-": 2, "A+": 6, "B+": 7, "AB+": 3 }
            },
            {
                id: 'HOSP-09',
                name: 'AIMS Hospital, Aundh',
                lat: 18.5625409,
                lng: 73.8106962,
                location: { type: 'Point', coordinates: [73.8106962, 18.5625409] },
                trauma: true,
                traumaLevel: 2,
                relevance: 'Emergency department',
                capacity: 'PRE-ALERT READY',
                emergencyCapacity: 5,
                edReadiness: 85,
                status: 'AVAILABLE',
                address: 'Near Bremen Chowk, Aundh, Pune - 411007',
                phone: '+91 20 6740 0000',
                bloodBankStock: { "O+": 5, "A+": 4, "B+": 4, "AB+": 2 }
            },
            {
                id: 'HOSP-10',
                name: 'Bharati Hospital & Research Centre',
                lat: 18.45969,
                lng: 73.85678,
                location: { type: 'Point', coordinates: [73.85678, 18.45969] },
                trauma: true,
                traumaLevel: 1,
                relevance: 'Dedicated Emergency Medicine Department',
                capacity: 'PRE-ALERT READY',
                emergencyCapacity: 11,
                edReadiness: 94,
                status: 'AVAILABLE',
                address: 'Pune-Satara Road, Dhankawadi, Pune - 411043',
                phone: '+91 20 4055 5555',
                bloodBankStock: { "O+": 12, "O-": 4, "A+": 8, "B+": 10, "AB+": 4 }
            },
            {
                id: 'HOSP-11',
                name: 'Lokmanya Hospital, Pune',
                lat: 18.5089079,
                lng: 73.8341050,
                location: { type: 'Point', coordinates: [73.8341050, 18.5089079] },
                trauma: true,
                traumaLevel: 2,
                relevance: 'Emergency/orthopaedic care',
                capacity: 'PRE-ALERT READY',
                emergencyCapacity: 6,
                edReadiness: 87,
                status: 'AVAILABLE',
                address: 'Paud Road, Kothrud, Pune - 411038',
                phone: '+91 20 2544 0404',
                bloodBankStock: { "O+": 6, "A+": 4, "B+": 5, "AB+": 2 }
            },
            {
                id: 'HOSP-12',
                name: 'Z Plus Accident Hospital, Hadapsar',
                lat: 18.5017,
                lng: 73.9260,
                location: { type: 'Point', coordinates: [73.9260, 18.5017] },
                trauma: true,
                traumaLevel: 1,
                relevance: 'Accident/trauma hospital; 24×7 trauma services',
                capacity: 'PRE-ALERT READY',
                emergencyCapacity: 7,
                edReadiness: 90,
                status: 'AVAILABLE',
                address: 'Solapur Road, Gadital, Hadapsar, Pune - 411028',
                phone: '+91 20 2687 0055',
                bloodBankStock: { "O+": 8, "O-": 2, "A+": 5, "B+": 6, "AB+": 3 }
            },
            {
                id: 'HOSP-13',
                name: 'Metro Superspeciality Hospital & Trauma Center, Wagholi',
                lat: 18.5790,
                lng: 73.9830,
                location: { type: 'Point', coordinates: [73.9830, 18.5790] },
                trauma: true,
                traumaLevel: 1,
                relevance: 'Trauma centre / emergency',
                capacity: 'PRE-ALERT READY',
                emergencyCapacity: 8,
                edReadiness: 92,
                status: 'AVAILABLE',
                address: 'Pune-Nagar Highway, Wagholi, Pune - 412207',
                phone: '+91 20 6733 1111',
                bloodBankStock: { "O+": 9, "O-": 3, "A+": 6, "B+": 7, "AB+": 3 }
            },
            {
                id: 'HOSP-14',
                name: 'Global Multispeciality Hospital, Dighi',
                lat: 18.6200,
                lng: 73.8750,
                location: { type: 'Point', coordinates: [73.8750, 18.6200] },
                trauma: true,
                traumaLevel: 2,
                relevance: '24×7 emergency + fracture/trauma care',
                capacity: 'PRE-ALERT READY',
                emergencyCapacity: 5,
                edReadiness: 86,
                status: 'AVAILABLE',
                address: 'Dighi - Alandi Road, Dighi, Pune - 411015',
                phone: '+91 20 2715 0000',
                bloodBankStock: { "O+": 6, "A+": 4, "B+": 4, "AB+": 2 }
            },
            {
                id: 'HOSP-15',
                name: 'YCM Hospital, Pimpri',
                lat: 18.6220146,
                lng: 73.8210657,
                location: { type: 'Point', coordinates: [73.8210657, 18.6220146] },
                trauma: true,
                traumaLevel: 1,
                relevance: 'Major public hospital/emergency facility',
                capacity: 'PRE-ALERT READY',
                emergencyCapacity: 14,
                edReadiness: 97,
                status: 'AVAILABLE',
                address: 'Sant Tukaram Nagar, Pimpri Colony, Pimpri-Chinchwad, Pune - 411018',
                phone: '+91 20 2742 0555',
                bloodBankStock: { "O+": 18, "O-": 6, "A+": 12, "B+": 14, "AB+": 6 }
            }
        ];

        initialAmbulances.forEach(a => this.ambulances.set(a.id, a));
        initialHospitals.forEach(h => this.hospitals.set(h.id, h));
    }

    async connect() {
        // Prevent unhandled error event from exiting process
        mongoose.connection.on('error', (err) => {
            console.error('[Database] MongoDB runtime connection warning:', err.message);
            this.isMongoConnected = false;
        });
        mongoose.connection.on('disconnected', () => {
            this.isMongoConnected = false;
        });

        try {
            await mongoose.connect(config.MONGODB_URI, {
                serverSelectionTimeoutMS: 2500
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

            // Sync / Upsert all 15 Pune hospitals into MongoDB
            for (const hosp of this.hospitals.values()) {
                await Hospital.findOneAndUpdate({ id: hosp.id }, hosp, { upsert: true, new: true });
            }
            const dbHosps = await Hospital.find();
            dbHosps.forEach(h => this.hospitals.set(h.id, h.toObject()));

            // Seed / Update CCTV cameras with FOV metadata
            for (const cam of this.cctvCameras.values()) {
                await Camera.findOneAndUpdate({ id: cam.id }, cam, { upsert: true });
            }
            const dbCams = await Camera.find();
            dbCams.forEach(c => {
                const obj = c.toObject();
                this.cctvCameras.set(obj.id, obj);
                this.cctvCameras.set(obj.cameraId, obj);
            });

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
                const hasCoordinates = (normalized.latitude !== null && normalized.longitude !== null);
                const doc = {
                    ...normalized,
                    location: hasCoordinates ? (normalized.location || { type: 'Point', coordinates: [normalized.longitude, normalized.latitude] }) : null
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
                const found = await Incident.findOne({ $or: [{ incidentId: id }, { id: id }] });
                if (found) {
                    const obj = found.toObject();
                    obj.id = obj.incidentId || obj.id || id;
                    return obj;
                }
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
        const eventTime = status => resolved.timeline?.find(e => e.status === status)?.timestamp;
        const detectedAt = eventTime('DETECTED') || resolved.createdAt;
        const dispatchedAt = eventTime('EN_ROUTE') || resolved.dispatchedAt;
        const arrivedAt = eventTime('ARRIVED') || resolved.arrivedAt;
        const historyRecord = {
            incidentId: id,
            dispatchLatencyMs: dispatchedAt ? Math.max(0, new Date(dispatchedAt) - new Date(detectedAt)) : null,
            arrivalLatencyMs: arrivedAt && dispatchedAt ? Math.max(0, new Date(arrivedAt) - new Date(dispatchedAt)) : null,
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

    async getResponseHistory() {
        if (this.isMongoConnected) {
            try { return (await ResponseHistory.find().sort({ createdAt: -1 })).map(item => item.toObject()); } catch (e) { /* fall through */ }
        }
        return Array.from(this.responseHistory.values());
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
        if (updates.lat !== undefined && updates.lng !== undefined) updated.location = { type: 'Point', coordinates: [updates.lng, updates.lat] };
        this.hospitals.set(id, updated);
        if (this.isMongoConnected) {
            try {
                await Hospital.findOneAndUpdate({ id }, updated, { new: true });
            } catch (e) { }
        }
        return updated;
    }

    async saveAlert(alert) {
        this.alerts.set(alert.id, alert);
        if (this.isMongoConnected) try { await EmergencyAlert.findOneAndUpdate({ id: alert.id }, alert, { upsert: true }); } catch (e) { console.error('[Database] alert save error:', e.message); }
        return alert;
    }
    async getAlertsFor(recipientType, recipientId) { return Array.from(this.alerts.values()).filter(a => a.recipientType === recipientType && a.recipientId === recipientId && ['CREATED', 'DELIVERED'].includes(a.status)); }
    async updateAlert(id, updates) { const alert = this.alerts.get(id); if (!alert) return null; return this.saveAlert({ ...alert, ...updates }); }

    // CCTV Cameras Operations
    async getAllCCTV() {
        if (this.isMongoConnected) {
            try {
                const docs = await Camera.find();
                if (docs && docs.length > 0) return docs.map(d => d.toObject());
            } catch (e) { }
        }
        // Deduplicate in-memory map entries (since stored by both id and cameraId)
        const unique = new Map();
        for (const cam of this.cctvCameras.values()) {
            unique.set(cam.cameraId || cam.id, cam);
        }
        return Array.from(unique.values());
    }

    async getCCTV(id) {
        if (this.isMongoConnected) {
            try {
                const doc = await Camera.findOne({ $or: [{ id }, { cameraId: id }] });
                if (doc) return doc.toObject();
            } catch (e) { }
        }
        return this.cctvCameras.get(id) || null;
    }

    async registerCCTV(cameraData) {
        const id = cameraData.camera_id || cameraData.cameraId || cameraData.id;
        const normalized = {
            id,
            cameraId: id,
            cameraName: cameraData.camera_name || cameraData.cameraName || `CCTV ${id}`,
            lat: Number(cameraData.latitude || cameraData.lat || 18.5204),
            lng: Number(cameraData.longitude || cameraData.lng || 73.8567),
            latitude: Number(cameraData.latitude || cameraData.lat || 18.5204),
            longitude: Number(cameraData.longitude || cameraData.lng || 73.8567),
            road: cameraData.road || 'Main Arterial Corridor',
            direction: cameraData.direction || 'NORTHBOUND',
            sourceType: cameraData.source_type || cameraData.sourceType || 'FIXED_OPTICAL_AI',
            status: cameraData.status || 'ONLINE',
            fps: Number(cameraData.fps || 0.0),
            inferenceLatency: Number(cameraData.inference_latency_ms || cameraData.inferenceLatency || 0.0),
            fovAngle: cameraData.fovAngle !== undefined ? Number(cameraData.fovAngle) : (cameraData.fov_angle !== undefined ? Number(cameraData.fov_angle) : 60),
            heading: cameraData.heading !== undefined ? Number(cameraData.heading) : 0,
            coverageRadiusMeters: cameraData.coverageRadiusMeters !== undefined ? Number(cameraData.coverageRadiusMeters) : 200,
            lastDetection: cameraData.lastDetection || { timestamp: new Date().toISOString(), detected: false, confidence: 0.9 },
            lastFrameAt: new Date().toISOString(),
            isDemo: cameraData.is_demo !== undefined ? cameraData.is_demo : (cameraData.isDemo || false)
        };

        this.cctvCameras.set(id, normalized);
        this.cctvCameras.set(normalized.cameraId, normalized);

        if (this.isMongoConnected) {
            try {
                await Camera.findOneAndUpdate(
                    { $or: [{ id }, { cameraId: id }] },
                    normalized,
                    { upsert: true, new: true }
                );
            } catch (err) {
                console.error('[Database] Mongo registerCCTV error:', err.message);
            }
        }
        return normalized;
    }

    async updateCCTVHealth(id, healthData) {
        const existing = await this.getCCTV(id);
        const updated = {
            ...(existing || {}),
            id: id,
            cameraId: id,
            status: healthData.status || (existing ? existing.status : 'ONLINE'),
            fps: healthData.fps !== undefined ? Number(healthData.fps) : (existing ? existing.fps : 0),
            inferenceLatency: healthData.inference_latency_ms !== undefined ? Number(healthData.inference_latency_ms) : (healthData.inferenceLatency !== undefined ? Number(healthData.inferenceLatency) : (existing ? existing.inferenceLatency : 0)),
            lastFrameAt: healthData.last_frame_at || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.cctvCameras.set(id, updated);
        this.cctvCameras.set(updated.cameraId, updated);

        if (this.isMongoConnected) {
            try {
                await Camera.findOneAndUpdate(
                    { $or: [{ id }, { cameraId: id }] },
                    updated,
                    { upsert: true, new: true }
                );
            } catch (err) {
                console.error('[Database] Mongo updateCCTVHealth error:', err.message);
            }
        }
        return updated;
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

    seedInitialUsers() {
        const defaultUser = {
            username: 'user1',
            fullName: 'Aditya Deshmukh (Registered Citizen)',
            phone: '+91 98220 12345',
            email: 'aditya.deshmukh@gmail.com',
            role: 'USER',
            resourceId: 'USER-01',
            medicalProfile: {
                fullName: 'Aditya Deshmukh',
                dateOfBirth: '1996-08-14',
                age: 29,
                gender: 'Male',
                bloodGroup: 'O+ POSITIVE',
                allergies: ['Penicillin', 'Sulfa Drugs'],
                chronicConditions: ['Asthma (Mild)'],
                currentMedications: 'Salbutamol Inhaler (PRN)',
                primaryContact: {
                    name: 'Suresh Deshmukh (Father)',
                    phone: '+91 98220 12345',
                    relation: 'Father / Next-of-Kin'
                },
                organDonor: true,
                specialNotes: 'No prior surgical complications. Emergency Medical Profile Armed.',
                isComplete: true
            }
        };
        this.users.set('user1', defaultUser);
    }

    // User Management & Emergency Medical Profile Vault
    async getUserByUsername(username) {
        return this.findUserByUsername(username);
    }

    async createUser(userData) {
        const username = String(userData.username || '').toLowerCase().trim();
        const userObj = {
            ...userData,
            username,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        this.users.set(username, userObj);

        if (this.isMongoConnected) {
            try {
                const created = await User.create(userObj);
                return created.toObject();
            } catch (err) {
                console.error('[Database] Mongo createUser error:', err.message);
            }
        }
        return userObj;
    }

    async findUserByUsername(username) {
        const cleanUsername = String(username || '').toLowerCase().trim();
        if (this.isMongoConnected) {
            try {
                const found = await User.findOne({ username: cleanUsername }).lean();
                if (found) return found;
            } catch (err) {
                console.error('[Database] Mongo findUserByUsername error:', err.message);
            }
        }
        return this.users.get(cleanUsername) || null;
    }

    async findUserById(id) {
        if (this.isMongoConnected) {
            try {
                const found = await User.findById(id).lean();
                if (found) return found;
            } catch (err) {
                console.error('[Database] Mongo findUserById error:', err.message);
            }
        }
        for (const user of this.users.values()) {
            if (user._id === id || user.id === id || user.username === id) return user;
        }
        return null;
    }

    async saveMedicalProfile(usernameOrId, profileData) {
        const cleanKey = String(usernameOrId || '').toLowerCase().trim();
        const user = await this.findUserByUsername(cleanKey) || await this.findUserById(cleanKey);
        if (!user) return null;

        const medicalProfile = {
            ...(user.medicalProfile || {}),
            ...profileData,
            isComplete: true,
            completedAt: new Date()
        };

        const updated = {
            ...user,
            medicalProfile,
            updatedAt: new Date().toISOString()
        };

        this.users.set(user.username, updated);

        if (this.isMongoConnected) {
            try {
                const saved = await User.findOneAndUpdate(
                    { username: user.username },
                    { $set: { medicalProfile, updatedAt: new Date() } },
                    { new: true }
                ).lean();
                return saved ? saved.medicalProfile : medicalProfile;
            } catch (err) {
                console.error('[Database] Mongo saveMedicalProfile error:', err.message);
            }
        }
        return medicalProfile;
    }

    async getMedicalProfile(usernameOrId) {
        const cleanKey = String(usernameOrId || '').toLowerCase().trim();
        const user = await this.findUserByUsername(cleanKey) || await this.findUserById(cleanKey);
        return user ? (user.medicalProfile || null) : null;
    }

    async resetDemoData() {
        // Keeps non-demo incidents, resets demo incidents and restores fleet
        for (const [id, inc] of this.incidents.entries()) {
            if (inc.isDemo || String(inc.id || '').startsWith('DEMO-') || String(inc.id || '').startsWith('RNQ-')) {
                inc.status = 'RESOLVED';
                inc.resolvedAt = new Date();
                for (const alert of this.alerts.values()) if (alert.incidentId === id) alert.status = 'EXPIRED';
            }
        }
        this.seedInitialFleet();
        if (this.isMongoConnected) {
            try {
                await Incident.updateMany(
                    { $or: [{ isDemo: true }, { incidentId: /^RNQ-/ }, { id: /^RNQ-/ }] },
                    { status: 'RESOLVED', resolvedAt: new Date() }
                );
                await Ambulance.deleteMany({});
                await Hospital.deleteMany({});
                this.seedInitialFleet();
                for (const amb of this.ambulances.values()) {
                    await Ambulance.findOneAndUpdate({ id: amb.id }, amb, { upsert: true });
                }
                for (const hosp of this.hospitals.values()) {
                    await Hospital.findOneAndUpdate({ id: hosp.id }, hosp, { upsert: true });
                }
            } catch (e) { }
        }
        return true;
    }
}

const db = new DataStore();
db.connect();

module.exports = db;
