const axios = require('axios');

async function testChat() {
    try {
        const res = await axios.post('http://localhost:3100/api/chat', {
            message: "Faturas de ABDIAS",
            user: "midnet"
        });
        console.log("Response:", JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.log("Error:", e.message);
    }
}

testChat();
