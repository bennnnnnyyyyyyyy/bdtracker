async function checkApi() {
  try {
    const res = await fetch('http://localhost:3000/api/dashboard');
    console.log('Status:', res.status, res.statusText);
    const text = await res.text();
    console.log('Body:', text.slice(0, 500));
  } catch (e) {
    console.error('Fetch error:', e.message);
  }
}
checkApi();
