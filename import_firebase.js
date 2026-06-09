const fs = require('fs');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, doc, setDoc, writeBatch } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyCHLr5xQGqGckcLESs5I5R7nsOcqK0ZhMo",
  authDomain: "gestor-flex-app.firebaseapp.com",
  projectId: "gestor-flex-app",
  storageBucket: "gestor-flex-app.firebasestorage.app",
  messagingSenderId: "481092517076",
  appId: "1:481092517076:web:0944fb99e65f2e86eb0f41"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function uploadCollection(collectionName, fileName) {
  if (!fs.existsSync(fileName)) {
    console.log(`Arquivo ${fileName} não encontrado. Pulando...`);
    return;
  }
  const data = JSON.parse(fs.readFileSync(fileName, 'utf-8'));
  console.log(`Iniciando upload de ${data.length} documentos para ${collectionName}...`);
  
  let batch = writeBatch(db);
  let count = 0;
  let totalCount = 0;

  for (const item of data) {
    // Preserve the original ID if possible
    const docId = item.id ? item.id.toString() : null;
    let docRef;
    if (docId) {
      docRef = doc(db, collectionName, docId);
    } else {
      docRef = doc(collection(db, collectionName));
    }
    
    // Convert object nulls or undefined values if necessary
    const safeItem = {};
    for (const key in item) {
      if (item[key] !== undefined) {
        safeItem[key] = item[key];
      }
    }

    batch.set(docRef, safeItem);
    count++;
    totalCount++;

    if (count === 500) {
      await batch.commit();
      console.log(`Commit de 500 documentos... (${totalCount}/${data.length})`);
      batch = writeBatch(db);
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
    console.log(`Commit final de ${count} documentos... (${totalCount}/${data.length})`);
  }
  console.log(`Upload de ${collectionName} concluído com sucesso!`);
}

async function main() {
  try {
    await uploadCollection('planos', 'backup_planos.json');
    await uploadCollection('clientes', 'backup_clientes.json');
    await uploadCollection('pagamentos', 'backup_pagamentos.json');
    console.log('Migração para o Firebase concluída!');
    process.exit(0);
  } catch (err) {
    console.error('Erro na migração:', err);
    process.exit(1);
  }
}

main();
