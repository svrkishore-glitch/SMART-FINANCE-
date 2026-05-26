const Groq = require('groq-sdk');
require('dotenv').config({ path: '.env' });

async function testGroq() {
    if (!process.env.GROQ_API_KEY) {
        console.error('GROQ_API_KEY not found');
        return;
    }
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: 'user', content: 'Say hello' }],
            model: 'llama-3.1-8b-instant',
        });
        console.log('Result:', chatCompletion.choices[0].message.content);
    } catch (e) {
        console.error('Error:', e);
    }
}

testGroq();
