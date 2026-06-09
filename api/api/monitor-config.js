// api/monitor-config.js
// Configuração opcional do monitoramento sem precisar cadastrar variáveis na Vercel.
// Globalping e OpenStatus Lite funcionam mesmo deixando tudo vazio.
//
// ATENÇÃO:
// - Gatus, Uptime Kuma e Blackbox só funcionam se você tiver esses serviços rodando em algum servidor/domínio.
// - Evite colocar token aqui se seu GitHub for público. Nesse caso, use variável na Vercel.

module.exports = {
  // Modo seguro para não extrapolar limite
  GLOBALPING_PROBE_LIMIT: '1',
  GLOBALPING_PACKETS: '2',
  DNS_PROVIDER_TIMEOUT_MS: '4500',

  // Gatus self-hosted, opcional
  // Exemplo: 'https://status.seudominio.com'
  GATUS_BASE_URL: '',
  GATUS_API_TOKEN: '',

  // Uptime Kuma status page pública, opcional
  // Exemplo: 'https://status.seudominio.com'
  UPTIME_KUMA_BASE_URL: '',
  UPTIME_KUMA_STATUS_SLUG: 'default',

  // Prometheus Blackbox Exporter, opcional
  // Exemplo: 'https://blackbox.seudominio.com'
  BLACKBOX_BASE_URL: '',
  BLACKBOX_MODULE: 'http_2xx',

  // Cron 24/7 do Vercel — opcional
  // Para segurança, prefira colocar esses valores nas variáveis da Vercel.
  // CRON_SECRET: '',
  ENABLE_GLOBALPING_CRON: 'true',
  GLOBALPING_CRON_EVERY_N_MINUTES: '5',
  CRON_DOMAIN_DELAY_MS: '1200',
  CRON_MAX_DOMAINS_PER_RUN: '0',
  CRON_CHECK_TIMEOUT_MS: '12000',

  // Firebase Admin para o cron 24/7.
  // NÃO coloque chaves privadas aqui se seu GitHub for público.
  // Use variável FIREBASE_SERVICE_ACCOUNT_BASE64 na Vercel.
  FIREBASE_SERVICE_ACCOUNT_BASE64: '',
};
