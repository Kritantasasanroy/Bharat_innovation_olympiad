const axios = require('axios');
const jwt = require('jsonwebtoken');

async function run() {
    try {
        // Sign token
        const token = jwt.sign(
            { sub: '0b57ef62-403e-43b8-bfd7-0ccd5d088f29', email: 'kritantasasan@gmail.com', role: 'STUDENT' },
            'dev-jwt-secret-change-in-production',
            { expiresIn: '1h' }
        );

        const instanceId = '788720af-bd2d-4cc4-8bd6-a459a5dcf539';

        console.log("Starting instance:", instanceId);
        const startRes = await axios.post(`http://localhost:3000/api/exams/${instanceId}/start`, {}, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log("Start Response:", startRes.data);

        const attemptId = startRes.data.id;
        console.log("Submitting attempt:", attemptId);
        const submitRes = await axios.post(`http://localhost:3000/api/attempts/${attemptId}/submit`, {}, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log("Submit Response:", submitRes.data);
    } catch (e) {
        console.error("Error!!!:", e.response ? e.response.data : e.message);
    }
}
run();
