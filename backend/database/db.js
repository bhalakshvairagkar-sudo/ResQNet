const mongoose = require('mongoose');
const config = require('../config/config');

class DataStore {
    constructor() {
        this.isMongoConnected = false;
        this.incidents = new Map();
        this.ambulances = new Map();
        this.hospitals = new Map();
        this.seedInitialFleet();
    }

    seedInitialFleet() {
        const initialAmbulances = [
            { id: 'AMB-01', code: 'AMB-01', lat: 18.5300, lng: 73.8400, status: 'AVAILABLE', traumaReady: true, eta: 4 },
            { id: 'AMB-02', code: 'AMB-02', lat: 18.5100, lng: 73.8600, status: 'AVAILABLE', traumaReady: true, eta: 5 },
            { id: 'AMB-03', code: 'AMB-03', lat: 18.5400, lng: 73.8700, status: 'AVAILABLE', traumaReady: false, eta: 8 },
            { id: 'AMB-04', code: 'AMB-04', lat: 18.4900, lng: 73.8300, status: 'UNAVAILABLE', traumaReady: true, eta: 12 }
        ];

        const initialHospitals = [
            { id: 'HOSP-01', name: 'Pune Trauma Center', lat: 18.5280, lng: 73.8720, capacity: 'PRE-ALERT READY', trauma: true, status: 'AVAILABLE' },
            { id: 'HOSP-02', name: 'Ruby Hall General', lat: 18.5350, lng: 73.8780, capacity: 'STANDBY', trauma: true, status: 'AVAILABLE' },
            { id: 'HOSP-03', name: 'City Emergency Care', lat: 18.5050, lng: 73.8350, capacity: 'LIMITED', trauma: false, status: 'LIMITED' }
        ];

        initialAmbulances.forEach(a => this.ambulances.set(a.id, a));
        initialHospitals.forEach(h => this.hospitals.set(h.id, h));
    }

    connect() {
        mongoose.connect(config.MONGODB_URI, {
            serverSelectionTimeoutMS: 1500
        }).then(() => {
            this.isMongoConnected = true;
            console.log('[Database] MongoDB connected successfully.');
        }).catch(() => {
            this.isMongoConnected = false;
            console.log('[Database] MongoDB unreachable - operating with high-speed In-Memory Data Store.');
        });
    }

    // Incidents Operations
    async saveIncident(incident) {
        this.incidents.set(incident.id, { ...incident, updatedAt: new Date().toISOString() });
        return this.incidents.get(incident.id);
    }

    async getIncident(id) {
        return this.incidents.get(id) || null;
    }

    async getAllIncidents() {
        return Array.from(this.incidents.values());
    }

    async updateIncident(id, updates) {
        const existing = this.incidents.get(id);
        if (!existing) return null;
        const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
        this.incidents.set(id, updated);
        return updated;
    }

    async deleteIncident(id) {
        return this.incidents.delete(id);
    }

    // Fleet Operations
    async getAmbulances() {
        return Array.from(this.ambulances.values());
    }

    async getAmbulance(id) {
        return this.ambulances.get(id) || null;
    }

    async updateAmbulance(id, updates) {
        const existing = this.ambulances.get(id);
        if (!existing) return null;
        const updated = { ...existing, ...updates };
        this.ambulances.set(id, updated);
        return updated;
    }

    // Hospitals Operations
    async getHospitals() {
        return Array.from(this.hospitals.values());
    }

    async getHospital(id) {
        return this.hospitals.get(id) || null;
    }
}

const store = new DataStore();
module.exports = store;
