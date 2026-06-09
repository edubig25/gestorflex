// api/monitor-config.js
// Configuração opcional do monitoramento. Deixe vazio se não usar serviços próprios.

module.exports = {
  GLOBALPING_PROBE_LIMIT: '1',
  GLOBALPING_PACKETS: '2',
  DNS_PROVIDER_TIMEOUT_MS: '7000',

  // Use estes campos só se um dia configurar esses serviços:
  GATUS_BASE_URL: '',
  GATUS_API_TOKEN: '',
  UPTIME_KUMA_BASE_URL: '',
  UPTIME_KUMA_STATUS_SLUG: '',
  BLACKBOX_BASE_URL: '',

  // Segurança para não gastar Globalping demais no cron:
  ENABLE_GLOBALPING_CRON: 'true',
  GLOBALPING_CRON_EVERY_N_MINUTES: '5',
  CRON_CHECK_TIMEOUT_MS: '12000'
};
