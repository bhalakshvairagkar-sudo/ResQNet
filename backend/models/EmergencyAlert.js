const mongoose = require('mongoose');
module.exports = mongoose.models.EmergencyAlert || mongoose.model('EmergencyAlert', new mongoose.Schema({
  id: { type: String, unique: true }, incidentId: String, recipientType: String, recipientId: String,
  alertType: String, priority: String, helpMessage: String, accidentLatitude: Number, accidentLongitude: Number,
  mapUrl: String, createdAt: String, deliveredAt: String, acknowledgedAt: String, status: String
}, { strict: false }));
