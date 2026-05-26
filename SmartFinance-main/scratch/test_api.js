// Using global fetch available in Node 18+


async function test() {
    try {
        const response = await fetch('http://localhost:3000/api/predict-alerts');
        console.log('Status:', response.status);
        console.log('Headers:', response.headers.get('content-type'));
        const text = await response.text();
        console.log('Body:', text);
    } catch (error) {
        console.error('Error:', error);
    }
}

test();
