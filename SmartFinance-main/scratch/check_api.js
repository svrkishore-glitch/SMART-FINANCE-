async function checkApi() {
    try {
        const response = await fetch('http://localhost:3000/api/roast?month=2026-05');
        const text = await response.text();
        console.log('Status:', response.status);
        console.log('Content-Type:', response.headers.get('content-type'));
        console.log('Body starts with:', text.substring(0, 100));
    } catch (e) {
        console.error('Fetch error:', e.message);
    }
}

checkApi();
