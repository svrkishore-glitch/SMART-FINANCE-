const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config({ path: '.env' });

async function testGemini() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = 'Say hello';
    try {
        const result = await model.generateContent(prompt);
        console.log('Result:', result.response.text());
    } catch (e) {
        console.error('Error:', e);
    }
}

testGemini();
