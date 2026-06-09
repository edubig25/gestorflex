const SUPA_URL = 'https://onnqatmndtjafyhtjsjb.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ubnFhdG1uZHRqYWZ5aHRqc2piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTcwNjYsImV4cCI6MjA5Mjg5MzA2Nn0.1TBz5189kyWwQLh0FnBtMwZu_hWmsQ5OPwWMVUlNzHo';

async function testSupabase() {
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/`, {
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`
      }
    });
    console.log('Status HTTP Supabase:', res.status);
    if (!res.ok) {
      console.log('Erro de resposta:', await res.text());
    } else {
      console.log('Supabase respondendo corretamente.');
    }
  } catch (err) {
    console.error('Erro de rede ao conectar no Supabase:', err.message);
  }
}

testSupabase();
