const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config({ path: '.env' });

async function listModels() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    try {
        // List models is not directly exposed in the same way in the SDK
        // But we can try to guess or use a known one.
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
        const result = await model.generateContent('hello');
        console.log('Result with flash-latest:', result.response.text());
    } catch (e) {
        console.error('Error with flash-latest:', e.message);
        
        try {
            const model2 = genAI.getGenerativeModel({ model: 'gemini-pro' });
            const result2 = await model2.generateContent('hello');
            console.log('Result with gemini-pro:', result2.response.text());
        } catch (e2) {
            console.error('Error with gemini-pro:', e2.message);
        }
    }
}

listModels();
