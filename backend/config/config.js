require('dotenv').config();

module.exports = {
    PORT: process.env.PORT || 5000,
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/resqnet',
    CORS_ORIGINS: [
        'https://emergency-ops-hub-7.emergent.host',
        'http://localhost:3000',
        'http://localhost:5000',
        'http://localhost:5500',
        'http://localhost:8080',
        'http://127.0.0.1:5500',
        '*'
    ],
    PUNE_COORDINATES: {
        latitude: 18.5204,
        longitude: 73.8567
    },
    CCTV_AUTH_TOKEN: process.env.CCTV_AUTH_TOKEN || 'resqnet-cctv-secure-token-2026'
};
