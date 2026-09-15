const mongoose = require('mongoose');

const CameraSchema = new mongoose.Schema({
    id: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    cameraId: {
        type: String,
        required: true,
        index: true
    },
    cameraName: {
        type: String,
        required: true
    },
    lat: {
        type: Number,
        required: true
    },
    lng: {
        type: Number,
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
    status: {
        type: String,
        enum: ['ONLINE', 'DEGRADED', 'OFFLINE'],
        default: 'ONLINE'
    },
    sourceType: {
        type: String,
        default: 'FIXED_OPTICAL_AI'
    },
    fovAngle: {
        type: Number,
        default: 65
    },
    heading: {
        type: Number,
        default: 0
    },
    coverageRadiusMeters: {
        type: Number,
        default: 200
    },
    fps: {
        type: Number,
        default: 24.0
    },
    inferenceLatency: {
        type: Number,
        default: 38
    },
    lastDetection: {
        timestamp: { type: String },
        detected: { type: Boolean, default: false },
        confidence: { type: Number, default: 0.94 }
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Camera', CameraSchema);
