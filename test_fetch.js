const SUPA_URL = 'https://onnqatmndtjafyhtjsjb.supabase.co/rest/v1';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ubnFhdG1uZHRqYWZ5aHRqc2piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTcwNjYsImV4cCI6MjA5Mjg5MzA2Nn0.1TBz5189kyWwQLh0FnBtMwZu_hWmsQ5OPwWMVUlNzHo';

async function testFetch() {
  const res = await fetch(`${SUPA_URL}/clientes?select=*&limit=5000`, {
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': `Bearer ${SUPA_KEY}`
    }
  });
  const data = await res.json();
  console.log('Returned rows:', data.length);
}
testFetch().catch(console.error);
