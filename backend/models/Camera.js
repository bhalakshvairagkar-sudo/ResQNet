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
        unique: true,
        index: true
    },
    cameraName: {
        type: String,
        default: 'Junction Cam'
    },
    lat: {
        type: Number,
        required: true
    },
    lng: {
        type: Number,
        required: true
    },
    latitude: {
        type: Number
    },
    longitude: {
        type: Number
    },
    road: {
        type: String,
        default: 'Main Corridor'
    },
    direction: {
        type: String,
        default: 'NORTHBOUND'
    },
    sourceType: {
        type: String,
        enum: ['webcam', 'file', 'rtsp', 'FIXED_OPTICAL_AI'],
        default: 'FIXED_OPTICAL_AI'
    },
    status: {
        type: String,
        enum: ['ONLINE', 'OFFLINE', 'DEGRADED', 'NO_FRAMES', 'HIGH_LATENCY'],
        default: 'ONLINE',
        index: true
    },
    fps: {
        type: Number,
        default: 0.0
    },
    inferenceLatency: {
        type: Number,
        default: 0.0
    },
    fovAngle: {
        type: Number,
        default: 60
    },
    heading: {
        type: Number,
        default: 0
    },
    coverageRadiusMeters: {
        type: Number,
        default: 200
    },
    lastDetection: {
        type: mongoose.Schema.Types.Mixed
    },
    lastFrameAt: {
        type: Date,
        default: Date.now
    },
    isDemo: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Camera', CameraSchema);
