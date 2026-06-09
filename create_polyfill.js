const fs = require('fs');

let appJs = fs.readFileSync('app.js', 'utf8');

// The polyfill to replace the Supabase initialization
const polyfill = `// === FIREBASE & SUPABASE POLYFILL ===
let db;
let auth;
let firebaseApp;

try {
  console.log('Starting Firebase init...');
  const firebaseConfig = {
    apiKey: "AIzaSyCHLr5xQGqGckcLESs5I5R7nsOcqK0ZhMo",
    authDomain: "gestor-flex-app.firebaseapp.com",
    projectId: "gestor-flex-app",
    storageBucket: "gestor-flex-app.firebasestorage.app",
    messagingSenderId: "481092517076",
    appId: "1:481092517076:web:0944fb99e65f2e86eb0f41"
  };
  
  if (typeof firebase !== 'undefined') {
    firebaseApp = firebase.initializeApp(firebaseConfig);
    const firestore = firebase.firestore();
    auth = firebase.auth();
    console.log('Firebase initialized');

    // Supabase Auth Polyfill
    const supaAuth = {
      getSession: async () => {
        return new Promise((resolve) => {
          const unsubscribe = auth.onAuthStateChanged(user => {
            unsubscribe();
            if (user) resolve({ data: { session: { user: { id: user.uid, email: user.email } } }, error: null });
            else resolve({ data: { session: null }, error: null });
          });
        });
      },
      signUp: async ({email, password}) => {
        try {
          const cred = await auth.createUserWithEmailAndPassword(email, password);
          return { data: { user: { id: cred.user.uid, email: cred.user.email } }, error: null };
        } catch (error) {
          return { data: null, error };
        }
      },
      signInWithPassword: async ({email, password}) => {
        try {
          const cred = await auth.signInWithEmailAndPassword(email, password);
          return { data: { user: { id: cred.user.uid, email: cred.user.email } }, error: null };
        } catch (error) {
          return { data: null, error };
        }
      },
      signOut: async () => {
        await auth.signOut();
        return { error: null };
      },
      resetPasswordForEmail: async (email) => {
        try {
          await auth.sendPasswordResetEmail(email);
          return { error: null };
        } catch (error) {
          return { error };
        }
      },
      updateUser: async ({ password }) => {
        try {
          await auth.currentUser.updatePassword(password);
          return { error: null };
        } catch (error) {
          return { error };
        }
      }
    };

    // Supabase DB Polyfill
    const createQueryChain = (table) => {
      let chain = {
        _table: table,
        _action: null, // select, insert, update, delete
        _data: null,
        _eqChecks: [],
        _limit: null,
        _single: false,
        _order: null,
        
        select: function(cols) { this._action = 'select'; return this; },
        insert: function(data) { this._action = 'insert'; this._data = data; return this; },
        update: function(data) { this._action = 'update'; this._data = data; return this; },
        delete: function() { this._action = 'delete'; return this; },
        
        eq: function(col, val) { this._eqChecks.push({col, val}); return this; },
        range: function(from, to) { /* Firestore doesn't easily do offset without cursors, we just fetch all for now */ return this; },
        limit: function(num) { this._limit = num; return this; },
        single: function() { this._single = true; return this; },
        order: function(col, opts) { this._order = {col, asc: opts?.ascending !== false}; return this; },

        then: function(resolve, reject) {
          this.execute().then(resolve).catch(reject);
        },

        execute: async function() {
          try {
            const collectionRef = firestore.collection(this._table);
            
            if (this._action === 'select') {
              let q = collectionRef;
              for (const check of this._eqChecks) {
                if (check.col === 'id') {
                  const docSnap = await collectionRef.doc(check.val.toString()).get();
                  if (docSnap.exists) {
                    const data = { id: docSnap.id, ...docSnap.data() };
                    return { data: this._single ? data : [data], error: null };
                  } else {
                    return { data: this._single ? null : [], error: null };
                  }
                }
                q = q.where(check.col, '==', check.val);
              }
              if (this._order) q = q.orderBy(this._order.col, this._order.asc ? 'asc' : 'desc');
              if (this._limit) q = q.limit(this._limit);
              
              const snap = await q.get();
              const docs = snap.docs.map(d => ({ id: isNaN(d.id) ? d.id : Number(d.id), ...d.data() }));
              return { data: this._single ? (docs[0] || null) : docs, error: null };
            }
            
            if (this._action === 'insert') {
              const dataArray = Array.isArray(this._data) ? this._data : [this._data];
              const batch = firestore.batch();
              const inserted = [];
              for (const item of dataArray) {
                let docRef;
                if (item.id) docRef = collectionRef.doc(item.id.toString());
                else docRef = collectionRef.doc();
                const toSave = { ...item };
                if (toSave.id) delete toSave.id; // optionally keep it in payload or not
                toSave.created_at = toSave.created_at || new Date().toISOString();
                batch.set(docRef, toSave);
                inserted.push({ id: docRef.id, ...toSave });
              }
              await batch.commit();
              return { data: this._single ? inserted[0] : inserted, error: null };
            }
            
            if (this._action === 'update' || this._action === 'delete') {
              // Usually updates/deletes use .eq('id', val)
              const idCheck = this._eqChecks.find(c => c.col === 'id' || c.col === 'auth_id');
              if (!idCheck) throw new Error("Update/Delete without ID not fully supported in polyfill");
              
              let docRef;
              if (idCheck.col === 'id') {
                docRef = collectionRef.doc(idCheck.val.toString());
              } else {
                // Must query first
                const snap = await collectionRef.where(idCheck.col, '==', idCheck.val).get();
                if (snap.empty) return { data: null, error: null };
                docRef = snap.docs[0].ref;
              }
              
              if (this._action === 'update') {
                await docRef.update(this._data);
                return { data: [this._data], error: null };
              } else {
                await docRef.delete();
                return { data: null, error: null };
              }
            }
            
          } catch (error) {
            console.error("Polyfill error:", error);
            return { data: null, error };
          }
        }
      };
      return chain;
    };

    db = {
      auth: supaAuth,
      from: createQueryChain
    };
    
  } else {
    alert('ERRO: A biblioteca do banco de dados (Firebase) não carregou.');
  }
} catch (e) {
  alert('Erro ao iniciar banco: ' + e.message);
}
// === FIM POLYFILL ===
`;

// Extract old Supabase init logic block to replace
const startIndex = appJs.indexOf('// === SUPABASE SETUP ===');
const endIndex = appJs.indexOf('// === HELPER PARA FETCH ALL (bypassa limite 1000 do Supabase) ===');

if (startIndex !== -1 && endIndex !== -1) {
  appJs = appJs.substring(0, startIndex) + polyfill + '\n' + appJs.substring(endIndex);
  fs.writeFileSync('app.js', appJs);
  console.log('app.js successfully polyfilled for Firebase!');
} else {
  console.error('Could not find Supabase setup block in app.js');
}
