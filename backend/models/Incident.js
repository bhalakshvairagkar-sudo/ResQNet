const mongoose = require('mongoose');

const IncidentSchema = new mongoose.Schema({
    incidentId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    source: {
        type: String,
        enum: ['smartphone', 'cctv', 'citizen', 'iot'],
        default: 'smartphone'
    },
    type: {
        type: String,
        default: 'Road collision'
    },
    title: {
        type: String,
        default: 'Emergency Incident'
    },
    location: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number], // [longitude, latitude]
            required: true
        }
    },
    latitude: {
        type: Number,
        required: true
    },
    longitude: {
        type: Number,
        required: true
    },
    gpsAccuracy: {
        type: Number,
        default: 5.0
    },
    confidence: {
        type: Number,
        min: 0,
        max: 100,
        default: 90
    },
    severity: {
        type: Number,
        min: 0,
        max: 100,
        default: 50
    },
    status: {
        type: String,
        enum: [
            'DETECTED',
            'VERIFYING',
            'VERIFIED',
            'SEVERITY_ASSESSED',
            'AMBULANCE_ASSIGNED',
            'ROUTE_CALCULATED',
            'HOSPITAL_SELECTED',
            'HOSPITAL_PRE_ALERTED',
            'DISPATCHING',
            'EN_ROUTE',
            'ARRIVED',
            'RESOLVED'
        ],
        default: 'DETECTED',
        index: true
    },
    ambulanceId: {
        type: String,
        default: null
    },
    ambulanceReason: {
        type: String,
        default: null
    },
    hospitalId: {
        type: String,
        default: null
    },
    hospitalReason: {
        type: String,
        default: null
    },
    route: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    hospitalRoute: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    hospitalPreAlert: {
        status: { type: String, default: 'PENDING' },
        alertSentAt: { type: Date, default: null },
        acknowledgedAt: { type: Date, default: null },
        details: { type: mongoose.Schema.Types.Mixed, default: null }
    },
    patientCount: {
        type: Number,
        default: 1
    },
    userMedicalInfo: {
        type: String,
        default: null
    },
    isDemo: {
        type: Boolean,
        default: false
    },
    sources: [{
        source: String,
        confidence: Number,
        timestamp: { type: Date, default: Date.now },
        metadata: mongoose.Schema.Types.Mixed
    }],
    timeline: [{
        status: String,
        timestamp: { type: Date, default: Date.now },
        description: String,
        actor: { type: String, default: 'SYSTEM' }
    }],
    resolvedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

IncidentSchema.index({ location: '2dsphere' });
IncidentSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Incident', IncidentSchema);
