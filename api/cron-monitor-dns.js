// api/cron-monitor-dns.js
// Monitoramento DNS 24/7 para Vercel Cron.
// Lê SOMENTE os domínios cadastrados na coleção `dominios_monitoramento`
// e grava os resultados em `monitoramentos_dns`.

const admin = require('firebase-admin');

let MONITOR_CONFIG = {};
try {
  MONITOR_CONFIG = require('./monitor-config.js') || {};
} catch (e) {
  MONITOR_CONFIG = {};
}

function cfg(key, fallback = '') {
  const fromEnv = process.env[key];
  const fromFile = MONITOR_CONFIG[key];
  if (fromEnv !== undefined && fromEnv !== null && String(fromEnv).trim() !== '') return fromEnv;
  if (fromFile !== undefined && fromFile !== null && String(fromFile).trim() !== '') return fromFile;
  return fallback;
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function initFirestore() {
  if (admin.apps.length) return admin.firestore();

  let serviceAccount = null;
  const b64 = cfg('FIREBASE_SERVICE_ACCOUNT_BASE64');
  if (b64) {
    const raw = Buffer.from(String(b64), 'base64').toString('utf8');
    serviceAccount = JSON.parse(raw);
  } else {
    const projectId = cfg('FIREBASE_PROJECT_ID');
    const clientEmail = cfg('FIREBASE_CLIENT_EMAIL');
    const privateKey = cfg('FIREBASE_PRIVATE_KEY');
    if (projectId && clientEmail && privateKey) {
      serviceAccount = {
        project_id: projectId,
        client_email: clientEmail,
        private_key: String(privateKey).replace(/\\n/g, '\n')
      };
    }
  }

  if (!serviceAccount) {
    throw new Error('Firebase Admin não configurado. Configure FIREBASE_SERVICE_ACCOUNT_BASE64 ou FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY na Vercel.');
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  return admin.firestore();
}

function isAtivo(value) {
  return !(value === false || value === 'false' || value === 0 || value === '0' || value === 'inativo' || value === 'Inativo');
}

function normalizeMonitorTarget(raw) {
  return String(raw || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '');
}

function finalStatusFromPayload(payload) {
  if (payload?.status === 'online') return 'Online';
  if (payload?.status === 'degraded') return 'Instável';
  if (payload?.status === 'offline') return 'Offline';
  return 'Sem teste';
}

function providerDetail(providerPayload) {
  if (!providerPayload) return '';
  if (providerPayload.error) return String(providerPayload.error).slice(0, 180);
  if (providerPayload.endpoint) return String(providerPayload.endpoint).slice(0, 180);
  if (providerPayload.http_status) return 'HTTP ' + providerPayload.http_status;
  return '';
}

function getAvailableProviders() {
  const providers = ['openstatus_lite'];
  if (cfg('GATUS_BASE_URL')) providers.push('gatus');
  if (cfg('UPTIME_KUMA_BASE_URL')) providers.push('uptime_kuma');
  if (cfg('BLACKBOX_BASE_URL')) providers.push('blackbox');
  if (String(cfg('ENABLE_GLOBALPING_CRON', 'true')).toLowerCase() !== 'false') providers.push('globalping');
  return providers;
}

function chooseProvider(providers, minuteIndex, domainIndex) {
  if (!providers.length) return 'openstatus_lite';
  let provider = providers[(minuteIndex + domainIndex) % providers.length];

  // Segurança: Globalping fica mais conservador no cron para não gastar limite em excesso.
  // Por padrão, cada domínio usa Globalping em média 1 vez a cada 5 minutos.
  if (provider === 'globalping') {
    const every = Math.max(1, Number(cfg('GLOBALPING_CRON_EVERY_N_MINUTES', '5')) || 5);
    if (((minuteIndex + domainIndex) % every) !== 0) provider = 'openstatus_lite';
  }
  return provider;
}

async function callCheckDomain(req, target, provider) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim() || 'https';
  const host = req.headers.host;
  if (!host) throw new Error('Host não encontrado na requisição do cron.');

  const url = `${proto}://${host}/api/check-domain?target=${encodeURIComponent(target)}&providers=${encodeURIComponent(provider)}`;
  const timeoutMs = Math.max(3000, Number(cfg('CRON_CHECK_TIMEOUT_MS', '12000')) || 12000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'GestorFlexDNSCron/1.0' },
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) throw new Error(payload.error || `check-domain HTTP ${response.status}`);
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function loadDominios(db) {
  const snap = await db.collection('dominios_monitoramento').get();
  return snap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(d => isAtivo(d.ativo))
    .filter(d => String(d.target || d.dominio || d.url || '').trim());
}

async function salvarResultado(db, dominio, payload, provider) {
  const checkedAt = new Date().toISOString();
  const p = payload.providers || {};
  const target = dominio.target || dominio.dominio || dominio.url;
  const monitorKey = 'monitor:' + String(dominio.id);
  const finalStatus = finalStatusFromPayload(payload);

  const resultSave = {
    servidor_id: monitorKey,
    servidor_nome: dominio.nome || '',
    dominio_id: String(dominio.id),
    dominio_nome: dominio.nome || '',
    dominio_tipo: dominio.tipo || 'Monitoramento',
    tipo_dns: 'monitor',
    target: normalizeMonitorTarget(target),
    url_testada: payload.url || target,
    status: finalStatus,
    provider_status: payload.status || '',
    latency_ms: payload.latency_ms || null,
    providers_usados: provider,
    checked_count: payload.checked_count || 0,
    globalping_status: p.globalping?.status || '',
    globalping_latency_ms: p.globalping?.latency_ms || null,
    globalping_probes_ok: p.globalping?.ok_probes || 0,
    globalping_probes_total: p.globalping?.total_probes || 0,
    globalping_detalhe: providerDetail(p.globalping),
    openstatus_status: p.openstatus_lite?.status || '',
    openstatus_latency_ms: p.openstatus_lite?.latency_ms || null,
    openstatus_detalhe: providerDetail(p.openstatus_lite),
    gatus_status: p.gatus?.status || '',
    gatus_latency_ms: p.gatus?.latency_ms || null,
    gatus_detalhe: providerDetail(p.gatus),
    uptime_kuma_status: p.uptime_kuma?.status || '',
    uptime_kuma_latency_ms: p.uptime_kuma?.latency_ms || null,
    uptime_kuma_detalhe: providerDetail(p.uptime_kuma),
    blackbox_status: p.blackbox?.status || '',
    blackbox_latency_ms: p.blackbox?.latency_ms || null,
    blackbox_detalhe: providerDetail(p.blackbox),
    http_status: p.openstatus_lite?.http_status || null,
    detalhe: payload.summary || '',
    raw_result: JSON.stringify(payload).slice(0, 9000),
    origem: 'cron_24_7',
    checked_at: checkedAt,
    created_at: checkedAt
  };

  await db.collection('monitoramentos_dns').add(resultSave);

  if (Number(payload.checked_count || 0) > 0 && finalStatus !== 'Sem teste') {
    await db.collection('dominios_monitoramento').doc(String(dominio.id)).set({
      monitor_status: finalStatus,
      monitor_ultima_verificacao: checkedAt,
      monitor_latency_ms: payload.latency_ms || null,
      monitor_provider: provider,
      monitor_cron_ativo: true,
      updated_at: checkedAt
    }, { merge: true });
  }

  return resultSave;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return send(res, 405, { error: 'Método não permitido.' });

  const secret = cfg('CRON_SECRET');
  if (secret) {
    const querySecret = req.query?.secret;
    const auth = req.headers.authorization || '';
    const valid = querySecret === secret || auth === `Bearer ${secret}`;
    if (!valid) return send(res, 401, { error: 'Não autorizado.' });
  }

  const started = Date.now();
  try {
    const db = initFirestore();
    let dominios = await loadDominios(db);

    const maxPerRun = Number(cfg('CRON_MAX_DOMAINS_PER_RUN', '0')) || 0;
    const offset = Number(req.query?.offset || cfg('CRON_DOMAIN_OFFSET', '0')) || 0;
    if (maxPerRun > 0 && dominios.length > maxPerRun) {
      const rotated = dominios.slice(offset).concat(dominios.slice(0, offset));
      dominios = rotated.slice(0, maxPerRun);
    }

    const providers = getAvailableProviders();
    const minuteIndex = Math.floor(Date.now() / 60000);
    const delayMs = Math.max(0, Number(cfg('CRON_DOMAIN_DELAY_MS', '1200')) || 1200);
    const results = [];

    for (let i = 0; i < dominios.length; i++) {
      const dominio = dominios[i];
      const target = dominio.target || dominio.dominio || dominio.url;
      const provider = chooseProvider(providers, minuteIndex, i);

      try {
        const payload = await callCheckDomain(req, target, provider);
        const saved = await salvarResultado(db, dominio, payload, provider);
        results.push({
          dominio_id: String(dominio.id),
          nome: dominio.nome || target,
          target,
          provider,
          status: saved.status,
          checked_count: saved.checked_count,
          latency_ms: saved.latency_ms
        });
      } catch (err) {
        const checkedAt = new Date().toISOString();
        const monitorKey = 'monitor:' + String(dominio.id);
        await db.collection('monitoramentos_dns').add({
          servidor_id: monitorKey,
          servidor_nome: dominio.nome || '',
          dominio_id: String(dominio.id),
          dominio_nome: dominio.nome || '',
          dominio_tipo: dominio.tipo || 'Monitoramento',
          tipo_dns: 'monitor',
          target: normalizeMonitorTarget(target),
          status: 'Erro',
          provider_status: 'error',
          providers_usados: provider,
          checked_count: 0,
          detalhe: err.message || 'Erro no cron 24/7.',
          origem: 'cron_24_7',
          checked_at: checkedAt,
          created_at: checkedAt
        });
        results.push({ dominio_id: String(dominio.id), nome: dominio.nome || target, target, provider, status: 'Erro', error: err.message });
      }

      if (delayMs && i < dominios.length - 1) await sleep(delayMs);
    }

    return send(res, 200, {
      ok: true,
      mode: '24/7_cron',
      source_collection: 'dominios_monitoramento',
      history_collection: 'monitoramentos_dns',
      total_domains_found: dominios.length,
      providers_rotation: providers,
      duration_ms: Date.now() - started,
      checked_at: new Date().toISOString(),
      results
    });
  } catch (err) {
    return send(res, 500, { ok: false, error: err.message || 'Erro no cron de monitoramento DNS.' });
  }
};
