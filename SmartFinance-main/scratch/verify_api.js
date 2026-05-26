
async function test() {
    try {
        const response = await fetch('http://localhost:3000/api/predict-alerts');
        console.log('Status:', response.status);
        console.log('Content-Type:', response.headers.get('content-type'));
        const text = await response.text();
        console.log('Body snippet:', text.substring(0, 100));
        try {
            JSON.parse(text);
            console.log('Body is valid JSON');
        } catch (e) {
            console.log('Body is NOT valid JSON');
        }
    } catch (e) {
        console.error('Fetch failed:', e.message);
    }
}
test();
