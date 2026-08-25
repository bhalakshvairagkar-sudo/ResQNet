const mongoose = require('mongoose');

const ResponseHistorySchema = new mongoose.Schema({
    incidentId: {
        type: String,
        required: true,
        index: true
    },
    dispatchLatencyMs: {
        type: Number,
        default: 0
    },
    arrivalLatencyMs: {
        type: Number,
        default: 0
    },
    totalDurationMinutes: {
        type: Number,
        default: 0
    },
    outcome: {
        type: String,
        default: 'RESOLVED_SUCCESSFULLY'
    },
    auditLog: [{
        action: String,
        timestamp: { type: Date, default: Date.now },
        details: mongoose.Schema.Types.Mixed
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('ResponseHistory', ResponseHistorySchema);
