// api/check-domain.js
// Monitoramento DNS/Domínio para Vercel Serverless.
// Verificadores: Globalping + OpenStatus Lite + Gatus + Uptime Kuma + Prometheus Blackbox Exporter.
// Segurança contra limites: Globalping usa apenas 1 probe por verificação; provedores self-hosted só rodam se configurados em variáveis de ambiente.

const dns = require('dns').promises;

// Configuração por arquivo + fallback por variáveis da Vercel.
// Assim você pode simplesmente subir api/monitor-config.js junto com esta API.
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

const GLOBALPING_PROBE_LIMIT = Number(cfg('GLOBALPING_PROBE_LIMIT', 1));
const GLOBALPING_PACKETS = Number(cfg('GLOBALPING_PACKETS', 2));
const PROVIDER_TIMEOUT_MS = Number(cfg('DNS_PROVIDER_TIMEOUT_MS', 4500));

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function normalizeTarget(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;

  let hostname = value;
  let url = value;

  try {
    const parsed = new URL(value.match(/^https?:\/\//i) ? value : `http://${value}`);
    hostname = parsed.hostname;
    url = parsed.href;
  } catch (e) {
    hostname = value.replace(/^https?:\/\//i, '').split('/')[0].trim();
    url = `http://${hostname}`;
  }

  hostname = hostname.trim();
  if (!hostname || hostname.includes(' ')) return null;

  return {
    hostname,
    url: url.match(/^https?:\/\//i) ? url : `http://${hostname}`
  };
}

function avg(values) {
  const nums = values.map(Number).filter(n => Number.isFinite(n) && n > 0);
  if (!nums.length) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function withTimeout(ms = PROVIDER_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

function providerSkipped(provider, reason = 'Não configurado') {
  return { status: 'skipped', provider, latency_ms: null, configured: false, error: reason };
}

function parsePingLatency(result) {
  const candidates = [];
  function walk(obj) {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj)) {
      const k = key.toLowerCase();
      if ((k === 'avg' || k === 'mean' || k === 'average' || k === 'rtt') && Number.isFinite(Number(value))) candidates.push(Number(value));
      else if (typeof value === 'object') walk(value);
      else if (typeof value === 'string' && value.includes('min/avg/max')) {
        const m = value.match(/=\s*([\d.]+)\/([\d.]+)\/([\d.]+)/);
        if (m) candidates.push(Number(m[2]));
      }
    }
  }
  walk(result);
  return avg(candidates);
}

async function runGlobalping(hostname) {
  const started = Date.now();
  try {
    const createRes = await fetch('https://api.globalping.io/v1/measurements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'GestorFlexDNSMonitor/2.0' },
      body: JSON.stringify({
        type: 'ping',
        target: hostname,
        limit: Math.max(1, Math.min(3, GLOBALPING_PROBE_LIMIT)),
        locations: [],
        measurementOptions: { packets: Math.max(1, Math.min(3, GLOBALPING_PACKETS)) }
      })
    });

    const createText = await createRes.text();
    let createJson = {};
    try { createJson = createText ? JSON.parse(createText) : {}; } catch (e) {}

    if (!createRes.ok) {
      return { status: 'error', provider: 'globalping', configured: true, latency_ms: null, total_probes: 0, ok_probes: 0, error: createJson.message || createJson.error || createText || `HTTP ${createRes.status}` };
    }

    const locationHeader = createRes.headers.get('location') || '';
    const id = createJson.id || locationHeader.split('/').filter(Boolean).pop();
    if (!id) return { status: 'error', provider: 'globalping', configured: true, latency_ms: null, total_probes: 0, ok_probes: 0, error: 'Globalping não retornou ID da medição.' };

    let measurement = null;
    for (let i = 0; i < 5; i++) {
      await sleep(i === 0 ? 450 : 700);
      const pollRes = await fetch(`https://api.globalping.io/v1/measurements/${encodeURIComponent(id)}`, { headers: { 'User-Agent': 'GestorFlexDNSMonitor/2.0' } });
      const pollText = await pollRes.text();
      try { measurement = pollText ? JSON.parse(pollText) : {}; } catch (e) { measurement = {}; }
      if (measurement.status === 'finished' || measurement.status === 'done') break;
    }

    const results = Array.isArray(measurement?.results) ? measurement.results : [];
    const total = results.length || measurement?.probesCount || 0;
    let ok = 0;
    const latencies = [];
    for (const item of results) {
      const hasError = item.error || item.result?.error || item.result?.status === 'failed';
      const latency = parsePingLatency(item.result || item);
      if (!hasError) ok++;
      if (latency) latencies.push(latency);
    }
    const latencyMs = avg(latencies);
    const status = total ? (ok === total ? 'online' : ok > 0 ? 'degraded' : 'offline') : 'error';
    return { status, provider: 'globalping', configured: true, latency_ms: latencyMs, total_probes: total, ok_probes: ok, measurement_id: id, duration_ms: Date.now() - started };
  } catch (err) {
    return { status: 'error', provider: 'globalping', configured: true, latency_ms: null, total_probes: 0, ok_probes: 0, error: err.message || 'Erro desconhecido no Globalping.' };
  }
}

async function runOpenStatusLite(url, hostname) {
  const started = Date.now();
  const timeout = withTimeout(5200);
  let dnsOk = false;
  let dnsError = null;
  try {
    const records = await Promise.any([dns.resolve4(hostname), dns.resolve6(hostname)]);
    dnsOk = Array.isArray(records) && records.length > 0;
  } catch (err) { dnsError = err.message; }

  let httpStatus = null;
  let httpOk = false;
  let finalUrl = url;
  try {
    let res;
    try { res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: timeout.signal }); }
    catch (headErr) { res = await fetch(url, { method: 'GET', redirect: 'follow', signal: timeout.signal }); }
    httpStatus = res.status;
    httpOk = res.status >= 200 && res.status < 500;
    finalUrl = res.url || url;
  } catch (err) {
    if (url.startsWith('http://')) {
      try {
        const httpsUrl = 'https://' + url.replace(/^http:\/\//i, '');
        const res2 = await fetch(httpsUrl, { method: 'GET', redirect: 'follow', signal: timeout.signal });
        httpStatus = res2.status;
        httpOk = res2.status >= 200 && res2.status < 500;
        finalUrl = res2.url || httpsUrl;
      } catch (err2) {}
    }
  } finally { timeout.cancel(); }

  const elapsed = Date.now() - started;
  let status = 'offline';
  if (dnsOk && httpOk) status = 'online';
  else if (dnsOk && !httpOk) status = 'degraded';
  return { status, provider: 'openstatus_lite', configured: true, latency_ms: elapsed, dns_ok: dnsOk, dns_error: dnsError, http_status: httpStatus, http_ok: httpOk, final_url: finalUrl };
}

function providerHeaders(token) {
  const headers = { 'Accept': 'application/json', 'User-Agent': 'GestorFlexDNSMonitor/2.0' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function itemText(item) {
  try { return JSON.stringify(item).toLowerCase(); } catch (e) { return ''; }
}

function findMatchingItem(data, hostname, url) {
  const hay = [hostname, url].filter(Boolean).map(x => String(x).toLowerCase());
  const arr = [];
  function collect(obj) {
    if (Array.isArray(obj)) obj.forEach(collect);
    else if (obj && typeof obj === 'object') {
      if (obj.name || obj.group || obj.url || obj.endpoint || obj.monitor || obj.hostname) arr.push(obj);
      for (const v of Object.values(obj)) if (typeof v === 'object') collect(v);
    }
  }
  collect(data);
  return arr.find(item => hay.some(token => token && itemText(item).includes(token.replace(/^https?:\/\//, '')))) || null;
}

async function runGatus(url, hostname) {
  const base = String(cfg('GATUS_BASE_URL') || '').replace(/\/$/, '');
  if (!base) return providerSkipped('gatus', 'Configure GATUS_BASE_URL na Vercel para ativar o Gatus.');
  const started = Date.now();
  const timeout = withTimeout();
  try {
    const res = await fetch(`${base}/api/v1/endpoints/statuses`, { headers: providerHeaders(cfg('GATUS_API_TOKEN')), signal: timeout.signal });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) {}
    if (!res.ok) return { status: 'error', provider: 'gatus', configured: true, latency_ms: Date.now() - started, error: text || `HTTP ${res.status}` };
    const match = findMatchingItem(json, hostname, url);
    if (!match) return { status: 'unknown', provider: 'gatus', configured: true, latency_ms: Date.now() - started, error: 'Gatus respondeu, mas não achei endpoint com esse domínio.' };
    const stText = itemText(match);
    let status = 'degraded';
    if (stText.includes('passing') || stText.includes('healthy') || stText.includes('operational') || stText.includes('up') || stText.includes('online') || stText.includes('true')) status = 'online';
    if (stText.includes('failing') || stText.includes('unhealthy') || stText.includes('down') || stText.includes('offline') || stText.includes('false')) status = 'offline';
    return { status, provider: 'gatus', configured: true, latency_ms: Date.now() - started, endpoint: match.name || match.key || match.url || hostname };
  } catch (err) {
    return { status: 'error', provider: 'gatus', configured: true, latency_ms: Date.now() - started, error: err.message };
  } finally { timeout.cancel(); }
}

async function runUptimeKuma(url, hostname) {
  const base = String(cfg('UPTIME_KUMA_BASE_URL') || '').replace(/\/$/, '');
  const slug = String(cfg('UPTIME_KUMA_STATUS_SLUG', 'default') || 'default').replace(/^\//, '');
  if (!base) return providerSkipped('uptime_kuma', 'Configure UPTIME_KUMA_BASE_URL na Vercel para ativar o Uptime Kuma.');
  const started = Date.now();
  const timeout = withTimeout();
  try {
    const headers = providerHeaders();
    const urls = [`${base}/api/status-page/${encodeURIComponent(slug)}`, `${base}/api/status-page/heartbeat/${encodeURIComponent(slug)}`];
    const responses = [];
    for (const apiUrl of urls) {
      try {
        const res = await fetch(apiUrl, { headers, signal: timeout.signal });
        const text = await res.text();
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch (e) {}
        responses.push({ ok: res.ok, status: res.status, json, text });
      } catch (e) {}
    }
    const okJson = responses.find(r => r.ok && r.json)?.json;
    if (!okJson) return { status: 'unknown', provider: 'uptime_kuma', configured: true, latency_ms: Date.now() - started, error: 'Status page pública não retornou JSON acessível.' };
    const match = findMatchingItem(okJson, hostname, url);
    const stText = itemText(match || okJson);
    let status = 'degraded';
    if (stText.includes('up') || stText.includes('operational') || stText.includes('online') || stText.includes('true')) status = 'online';
    if (stText.includes('down') || stText.includes('offline') || stText.includes('false')) status = 'offline';
    return { status, provider: 'uptime_kuma', configured: true, latency_ms: Date.now() - started, endpoint: match?.name || match?.url || hostname };
  } catch (err) {
    return { status: 'error', provider: 'uptime_kuma', configured: true, latency_ms: Date.now() - started, error: err.message };
  } finally { timeout.cancel(); }
}

function parsePrometheusMetric(text, name) {
  const lines = String(text || '').split('\n');
  for (const line of lines) {
    if (line.startsWith('#')) continue;
    if (line.startsWith(name + ' ')) {
      const n = Number(line.split(/\s+/).pop());
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

async function runBlackbox(url, hostname) {
  const base = String(cfg('BLACKBOX_BASE_URL') || '').replace(/\/$/, '');
  const moduleName = String(cfg('BLACKBOX_MODULE', 'http_2xx') || 'http_2xx');
  if (!base) return providerSkipped('blackbox', 'Configure BLACKBOX_BASE_URL na Vercel para ativar o Blackbox Exporter.');
  const started = Date.now();
  const timeout = withTimeout();
  try {
    const probeUrl = `${base}/probe?module=${encodeURIComponent(moduleName)}&target=${encodeURIComponent(url)}`;
    const res = await fetch(probeUrl, { headers: { 'User-Agent': 'GestorFlexDNSMonitor/2.0' }, signal: timeout.signal });
    const text = await res.text();
    if (!res.ok) return { status: 'error', provider: 'blackbox', configured: true, latency_ms: Date.now() - started, error: text.slice(0, 300) || `HTTP ${res.status}` };
    const success = parsePrometheusMetric(text, 'probe_success');
    const duration = parsePrometheusMetric(text, 'probe_duration_seconds');
    return { status: success === 1 ? 'online' : 'offline', provider: 'blackbox', configured: true, latency_ms: duration ? Math.round(duration * 1000) : Date.now() - started, module: moduleName };
  } catch (err) {
    return { status: 'error', provider: 'blackbox', configured: true, latency_ms: Date.now() - started, error: err.message };
  } finally { timeout.cancel(); }
}

function normalizeStatusForVote(status) {
  const st = String(status || '').toLowerCase();
  if (st === 'online') return 'online';
  if (st === 'offline') return 'offline';
  if (st === 'degraded' || st === 'instável' || st === 'lento' || st === 'unknown') return 'degraded';
  if (st === 'error') return 'degraded';
  return 'skip';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return send(res, 405, { error: 'Método não permitido.' });

  const query = req.method === 'POST' ? req.body || {} : req.query || {};
  const parsed = normalizeTarget(query.target || query.url || query.domain);
  if (!parsed) return send(res, 400, { error: 'Informe um domínio/DNS válido em target.' });

  const providersParam = String(query.providers || 'globalping,openstatus_lite,gatus,uptime_kuma,blackbox');
  const enabled = new Set(providersParam.split(',').map(p => p.trim()).filter(Boolean));
  const jobs = {
    globalping: enabled.has('globalping') ? runGlobalping(parsed.hostname) : providerSkipped('globalping', 'Desativado nesta chamada.'),
    openstatus_lite: enabled.has('openstatus_lite') ? runOpenStatusLite(parsed.url, parsed.hostname) : providerSkipped('openstatus_lite', 'Desativado nesta chamada.'),
    gatus: enabled.has('gatus') ? runGatus(parsed.url, parsed.hostname) : providerSkipped('gatus', 'Desativado nesta chamada.'),
    uptime_kuma: enabled.has('uptime_kuma') ? runUptimeKuma(parsed.url, parsed.hostname) : providerSkipped('uptime_kuma', 'Desativado nesta chamada.'),
    blackbox: enabled.has('blackbox') ? runBlackbox(parsed.url, parsed.hostname) : providerSkipped('blackbox', 'Desativado nesta chamada.')
  };

  const settled = await Promise.allSettled(Object.values(jobs));
  const names = Object.keys(jobs);
  const providers = {};
  settled.forEach((r, idx) => { providers[names[idx]] = r.status === 'fulfilled' ? r.value : { status: 'error', provider: names[idx], error: r.reason?.message || 'Erro desconhecido.' }; });

  const checkedProviders = Object.values(providers).filter(p => p && p.configured !== false && normalizeStatusForVote(p.status) !== 'skip');
  const votes = checkedProviders.map(p => normalizeStatusForVote(p.status)).filter(v => v !== 'skip');
  const online = votes.filter(v => v === 'online').length;
  const offline = votes.filter(v => v === 'offline').length;
  const degraded = votes.filter(v => v === 'degraded').length;
  let status = 'unknown';
  if (!votes.length) status = 'unknown';
  else if (online >= Math.ceil(votes.length / 2) && offline === 0) status = degraded ? 'degraded' : 'online';
  else if (online > 0) status = 'degraded';
  else status = 'offline';

  const latency = avg(checkedProviders.map(p => p.latency_ms));
  const summary = Object.values(providers).map(p => `${p.provider || 'provider'}: ${p.status}${p.configured === false ? ' (não configurado)' : ''}`).join(' • ');

  return send(res, 200, {
    target: parsed.hostname,
    url: parsed.url,
    status,
    latency_ms: latency,
    checked_count: checkedProviders.length,
    enabled_providers: Array.from(enabled),
    checked_at: new Date().toISOString(),
    safe_mode: {
      globalping_probe_limit: Math.max(1, Math.min(3, GLOBALPING_PROBE_LIMIT)),
      globalping_packets: Math.max(1, Math.min(3, GLOBALPING_PACKETS)),
      provider_timeout_ms: PROVIDER_TIMEOUT_MS
    },
    summary,
    providers
  });
};
