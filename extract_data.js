const fs = require('fs');

const SUPA_URL = 'https://onnqatmndtjafyhtjsjb.supabase.co/rest/v1';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ubnFhdG1uZHRqYWZ5aHRqc2piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTcwNjYsImV4cCI6MjA5Mjg5MzA2Nn0.1TBz5189kyWwQLh0FnBtMwZu_hWmsQ5OPwWMVUlNzHo';

async function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}

async function fetchAll(table) {
  let allData = [];
  let from = 0;
  const limit = 1000;
  while (true) {
    const res = await fetch(`${SUPA_URL}/${table}?select=*`, {
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
        'Range': `${from}-${from + limit - 1}`
      }
    });
    
    if (!res.ok) {
      if (res.status === 404) return []; // Table might not exist
      throw new Error(`Failed to fetch ${table}: ${res.statusText}`);
    }

    const data = await res.json();
    if (!data || data.length === 0) break;
    allData = allData.concat(data);
    if (data.length < limit) break;
    from += limit;
  }
  return allData;
}

async function main() {
  console.log('Aguardando Supabase reiniciar...');
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${SUPA_URL}/`, {
        headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }
      });
      if (res.ok) {
        ready = true;
        break;
      }
    } catch(e) {}
    console.log(`Ainda offline. Tentando em 10s... (${i+1}/30)`);
    await delay(10000);
  }

  if (!ready) {
    console.error('Supabase não reiniciou a tempo.');
    return;
  }

  console.log('Supabase Online! Iniciando backup...');
  
  const tables = ['clientes', 'planos', 'pagamentos'];
  const backup = {};

  for (const table of tables) {
    try {
      console.log(`Extraindo ${table}...`);
      const data = await fetchAll(table);
      backup[table] = data;
      fs.writeFileSync(`backup_${table}.json`, JSON.stringify(data, null, 2));
      console.log(`✅ ${table}: ${data.length} registros extraídos.`);
    } catch(err) {
      console.error(`❌ Erro em ${table}:`, err.message);
    }
  }

  console.log('Backup concluído com sucesso!');
}

main().catch(console.error);
