const mongoose = require('mongoose');

const HospitalSchema = new mongoose.Schema({
    id: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    name: {
        type: String,
        required: true
    },
    location: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number], // [lng, lat]
            required: true
        }
    },
    lat: {
        type: Number,
        required: true
    },
    lng: {
        type: Number,
        required: true
    },
    trauma: {
        type: Boolean,
        default: true
    },
    traumaLevel: {
        type: Number,
        default: 1
    },
    capacity: {
        type: String,
        enum: ['PRE-ALERT READY', 'STANDBY', 'LIMITED', 'CRITICAL'],
        default: 'PRE-ALERT READY'
    },
    emergencyCapacity: {
        type: Number,
        default: 8 // Available trauma bays
    },
    edReadiness: {
        type: Number,
        default: 95 // 0-100%
    },
    bloodBankStock: {
        type: mongoose.Schema.Types.Mixed,
        default: { "O+": 12, "O-": 4, "A+": 8, "B+": 10 }
    },
    status: {
        type: String,
        enum: ['AVAILABLE', 'LIMITED', 'BUSY', 'OFFLINE'],
        default: 'AVAILABLE'
    }
}, {
    timestamps: true
});

HospitalSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Hospital', HospitalSchema);
