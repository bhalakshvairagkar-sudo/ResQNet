const mongoose = require('mongoose');

const AmbulanceSchema = new mongoose.Schema({
    id: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    code: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['ALS', 'BLS'],
        default: 'ALS'
    },
    traumaReady: {
        type: Boolean,
        default: true
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
    status: {
        type: String,
        enum: ['AVAILABLE', 'BUSY', 'EN_ROUTE', 'OFFLINE', 'ARRIVED', 'UNAVAILABLE'],
        default: 'AVAILABLE',
        index: true
    },
    currentIncidentId: {
        type: String,
        default: null
    },
    speed: {
        type: Number,
        default: 0
    },
    heading: {
        type: Number,
        default: 0
    },
    eta: {
        type: Number,
        default: 5
    }
}, {
    timestamps: true
});

AmbulanceSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Ambulance', AmbulanceSchema);
