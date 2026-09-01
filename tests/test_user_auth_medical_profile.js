const axios = require('../backend/node_modules/axios');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

async function runAuthMedicalTests() {
    console.log('\n===============================================================');
    console.log('👤 RESQNET USER REGISTRATION & MEDICAL INTAKE AUDIT 🩸');
    console.log(`Target Backend: ${BACKEND_URL}`);
    console.log('===============================================================\n');

    let passed = 0;
    let total = 0;

    async function test(name, fn) {
        total++;
        process.stdout.write(`🧪 [AUTH.${total.toString().padStart(2, '0')}] ${name} ... `);
        try {
            await fn();
            console.log('✅ PASSED');
            passed++;
        } catch (err) {
            console.log(`❌ FAILED: ${err.message}`);
            if (err.response) {
                console.log(`   Status: ${err.response.status}, Details:`, err.response.data);
            }
        }
    }

    const uniqueSuffix = Date.now().toString().slice(-4);
    const testUsername = `citizen_${uniqueSuffix}`;
    const testPassword = `pass_${uniqueSuffix}_secure`;
    let userToken = null;
    let registeredUser = null;

    // 1. Register a new user with custom credentials
    await test(`Register New User Account (${testUsername}) (POST /api/auth/register)`, async () => {
        const res = await axios.post(`${BACKEND_URL}/api/auth/register`, {
            username: testUsername,
            password: testPassword,
            fullName: 'Aarav Deshmukh',
            phone: '+91 98220 12345',
            role: 'USER'
        });
        if (res.status !== 201 || !res.data.token || !res.data.user) {
            throw new Error('Registration failed to return valid token and user');
        }
        userToken = res.data.token;
        registeredUser = res.data.user;
        if (registeredUser.username !== testUsername) throw new Error('Username mismatch');
    });

    // 2. Prevent duplicate username registration
    await test('Reject Duplicate Username Registration', async () => {
        try {
            await axios.post(`${BACKEND_URL}/api/auth/register`, {
                username: testUsername,
                password: 'differentPassword123',
                fullName: 'Another Person'
            });
            throw new Error('Server allowed duplicate username registration');
        } catch (err) {
            if (err.response && err.response.status === 400) {
                // Expected 400 Bad Request
            } else {
                throw err;
            }
        }
    });

    // 3. Login with newly created custom credentials
    await test('Authenticate with Custom User Credentials (POST /api/auth/login)', async () => {
        const res = await axios.post(`${BACKEND_URL}/api/auth/login`, {
            username: testUsername,
            password: testPassword
        });
        if (res.status !== 200 || !res.data.token || !res.data.user) {
            throw new Error('Login failed for new custom user credentials');
        }
        userToken = res.data.token;
    });

    // 4. Reject invalid password
    await test('Reject Authentication with Incorrect Password', async () => {
        try {
            await axios.post(`${BACKEND_URL}/api/auth/login`, {
                username: testUsername,
                password: 'WrongPassword999'
            });
            throw new Error('Server accepted incorrect password');
        } catch (err) {
            if (err.response && err.response.status === 401) {
                // Expected 401 Unauthorized
            } else {
                throw err;
            }
        }
    });

    // 5. Submit Google Form Emergency Medical Profile Intake
    const sampleMedicalProfile = {
        fullName: 'Aarav Deshmukh',
        dateOfBirth: '1995-08-14',
        gender: 'Male',
        bloodGroup: 'O-',
        allergies: ['Penicillin', 'Latex'],
        chronicConditions: ['Type 1 Diabetes', 'Mild Asthma'],
        currentMedications: 'Insulin Glargine 20U daily, Salbutamol inhaler PRN',
        primaryContact: {
            name: 'Pooja Deshmukh',
            phone: '+91 98220 54321',
            relation: 'Spouse'
        },
        organDonor: true,
        specialNotes: 'Prefers Sahyadri Specialty Hospital Trauma Bay'
    };

    await test('Submit Google Form Medical Intake Profile (POST /api/auth/medical-profile)', async () => {
        const res = await axios.post(`${BACKEND_URL}/api/auth/medical-profile`, sampleMedicalProfile, {
            headers: { Authorization: `Bearer ${userToken}` }
        });
        if (res.status !== 200 || !res.data.success || !res.data.profile) {
            throw new Error('Failed to save medical emergency profile');
        }
        const profile = res.data.profile;
        if (profile.bloodGroup !== 'O-') throw new Error(`Blood group expected O-, got ${profile.bloodGroup}`);
        if (!profile.allergies.includes('Penicillin')) throw new Error('Allergies not stored correctly');
    });

    // 6. Retrieve Stored Medical Profile
    await test('Fetch Stored Emergency Medical Vault (GET /api/auth/medical-profile)', async () => {
        const res = await axios.get(`${BACKEND_URL}/api/auth/medical-profile`, {
            headers: { Authorization: `Bearer ${userToken}` }
        });
        if (res.status !== 200 || !res.data.profile) {
            throw new Error('Failed to fetch medical profile');
        }
        const p = res.data.profile;
        if (p.primaryContact.name !== 'Pooja Deshmukh') throw new Error('Primary contact mismatch');
        if (!p.organDonor) throw new Error('Organ donor flag not preserved');
    });

    // 7. Backward Compatibility Check for Demo Accounts
    await test('Verify Legacy Demo Accounts Backward Compatibility (operator)', async () => {
        const res = await axios.post(`${BACKEND_URL}/api/auth/login`, {
            username: 'operator',
            password: 'configurable-demo-password'
        });
        if (res.status !== 200 || res.data.user.role !== 'COMMAND_CENTER') {
            throw new Error('Legacy demo operator login failed');
        }
    });

    console.log('\n===============================================================');
    console.log(`🎉 AUTH & MEDICAL PROFILE AUDIT: ${passed}/${total} PASSED (${Math.round((passed / total) * 100)}%)`);
    console.log('===============================================================\n');

    if (passed !== total) process.exit(1);
}

runAuthMedicalTests().catch(err => {
    console.error('Fatal Test Runner Error:', err);
    process.exit(1);
});
