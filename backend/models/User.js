const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    passwordHash: {
        type: String,
        required: true
    },
    salt: {
        type: String,
        required: true
    },
    fullName: {
        type: String,
        trim: true,
        default: ''
    },
    phone: {
        type: String,
        trim: true,
        default: ''
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
        default: ''
    },
    role: {
        type: String,
        enum: ['USER', 'CITIZEN', 'AMBULANCE', 'HOSPITAL', 'COMMAND_CENTER'],
        default: 'USER'
    },
    resourceId: {
        type: String,
        default: null
    },
    medicalProfile: {
        bloodGroup: {
            type: String,
            enum: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-', 'UNKNOWN'],
            default: 'UNKNOWN'
        },
        dateOfBirth: {
            type: String,
            default: ''
        },
        gender: {
            type: String,
            default: ''
        },
        allergies: {
            type: [String],
            default: []
        },
        chronicConditions: {
            type: [String],
            default: []
        },
        currentMedications: {
            type: String,
            default: ''
        },
        primaryContact: {
            name: { type: String, default: '' },
            phone: { type: String, default: '' },
            relation: { type: String, default: 'Primary Emergency Contact' }
        },
        secondaryContact: {
            name: { type: String, default: '' },
            phone: { type: String, default: '' },
            relation: { type: String, default: 'Secondary Emergency Contact' }
        },
        organDonor: {
            type: Boolean,
            default: false
        },
        specialNotes: {
            type: String,
            default: ''
        },
        googleFormUrl: {
            type: String,
            default: ''
        },
        googleFormResponseId: {
            type: String,
            default: ''
        },
        isComplete: {
            type: Boolean,
            default: false
        },
        completedAt: {
            type: Date,
            default: null
        }
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('User', UserSchema);
