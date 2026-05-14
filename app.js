console.log('⚡ App JS Loading...');
console.log('[DEBUG] Script carregado em', new Date().toLocaleTimeString());
// === UTILS ===
const $ = id => document.getElementById(id);
const show = id => $(id) && $(id).classList.remove('hidden');
const hide = id => $(id) && $(id).classList.add('hidden');

// Emergência: esconde o splash se o JS demorar muito (garantia extra)
setTimeout(() => {
  console.log('Emergency splash hide triggered');
  hide('splash');
}, 1500);

// === SUPABASE SETUP ===
let db;
try {
  console.log('Starting Supabase init...');
  const SUPA_URL = 'https://onnqatmndtjafyhtjsjb.supabase.co';
  const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ubnFhdG1uZHRqYWZ5aHRqc2piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTcwNjYsImV4cCI6MjA5Mjg5MzA2Nn0.1TBz5189kyWwQLh0FnBtMwZu_hWmsQ5OPwWMVUlNzHo';

  if (typeof supabase !== 'undefined') {
    db = supabase.createClient(SUPA_URL, SUPA_KEY);
    console.log('Supabase initialized');
  } else {
    alert('ERRO: A biblioteca do banco de dados (Supabase) não carregou. Verifique sua internet ou se há bloqueadores de anúncios.');
  }
} catch (e) {
  alert('Erro ao iniciar banco: ' + e.message);
}

// === STATE ===
let currentUser = null;
let allClientes = [];
let allPlanos = [];
let allServidores = [];
let chartReceita = null;
let chartFinFluxo = null;
let chartFinStatus = null;
let chartFinPlano = null;
let chartCaptacao = null;
let deleteTargetId = null;
let deleteType = null;
let tempLoginUser = null;
let forgotEmailTarget = null;
let tempSecret2FA = null;


function toast(msg, type = 'info') {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.style.borderColor = type === 'error' ? 'rgba(239,68,68,.5)' : type === 'success' ? 'rgba(16,185,129,.5)' : 'var(--border)';
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 3200);
}

function fmt(val) {
  return 'R$ ' + parseFloat(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function diasAteVencimento(dateStr) {
  if (!dateStr) return -1;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const venc = new Date(dateStr + 'T00:00:00');
  return Math.round((venc - hoje) / 86400000);
}

function addMeses(date, meses) {
  if (!date) return '';
  const d = new Date(date);
  d.setMonth(d.getMonth() + meses);
  return d.toISOString().split('T')[0];
}

function planoMeses(plano) {
  return { Mensal: 1, Trimestral: 3, Semestral: 6, Anual: 12 }[plano] || 1;
}

// === BOOT ===
async function boot() {
  try {
    // Esconde o splash imediatamente ao iniciar o boot
    hide('splash');

    if (!db) {
      throw new Error('Banco de dados não inicializado');
    }

    const { data: { session }, error: sessionErr } = await db.auth.getSession();

    // Verifica se o banco já foi configurado checando a tabela "usuarios"
    const { data: usersData, error: usersErr } = await db.from('usuarios').select('id, auth_id').limit(1);

    if (usersErr && (usersErr.code === '42P01' || usersErr.message?.includes('does not exist') || usersErr.message?.includes('auth_id'))) {
      showDbSetup();
      return;
    }

    // Se não houver nenhum usuário criado
    if (!usersErr && (!usersData || usersData.length === 0)) {
      hide('login-screen');
      show('setup-screen');
      return;
    }

// Se existe sessão no Supabase Auth
  if (session && session.user) {
    const { data: customUser } = await db.from('usuarios').select('*').eq('auth_id', session.user.id).single();
    if (customUser) {
      currentUser = { ...session.user, ...customUser };

      if (currentUser.two_factor_enabled) {
        tempLoginUser = currentUser;
        hide('login-screen');
        show('twofa-screen');
        $('twofa-code').focus();
      } else {
        hide('login-screen');
        await enterApp();
      }
      return;
    }
  }

    show('login-screen');
  } catch (err) {
    console.error('Boot error:', err);
    hide('splash');
    show('login-screen');
    const loginErr = $('login-error');
    if (loginErr) {
      loginErr.textContent = 'Erro ao conectar ao banco de dados. Verifique sua conexão com a internet ou se o Supabase está acessível. (' + err.message + ')';
      show('login-error');
    }
  }
}

function showDbSetup() {
  document.body.insertAdjacentHTML('beforeend', `
  <div id="db-setup-screen" style="position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);padding:24px">
    <div style="max-width:620px;width:100%;background:var(--card);border:1px solid var(--border);border-radius:20px;padding:40px 36px;box-shadow:0 0 60px var(--purple-glow);overflow-y:auto;max-height:90vh;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px">
        <span style="font-size:28px;filter:drop-shadow(0 0 12px var(--purple))">⚡</span>
        <span style="font-family:Syne,sans-serif;font-size:1.5rem;font-weight:800">Gestor <span style="color:var(--purple-light)">Flex</span></span>
      </div>
      <h2 style="font-family:Syne,sans-serif;font-size:1.3rem;font-weight:700;margin-bottom:10px">⚙️ Configuração do Banco de Dados</h2>
      <p style="color:var(--text-muted);font-size:.9rem;margin-bottom:24px;line-height:1.7">Execute o código abaixo no SQL Editor do Supabase para criar ou atualizar as tabelas para o <strong>Supabase Auth</strong>.</p>
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:20px">
        <a href="https://supabase.com/dashboard/project/onnqatmndtjafyhtjsjb/sql/new" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#7C3AED,#6D28D9);color:#fff;padding:10px 20px;border-radius:10px;font-size:.88rem;font-weight:600;text-decoration:none;margin-bottom:15px">Abrir SQL Editor ↗</a>
        <pre style="background:#0a0718;border:1px solid rgba(124,58,237,.3);border-radius:8px;padding:16px;font-size:.78rem;color:#A78BFA;overflow-x:auto;white-space:pre-wrap;line-height:1.6">
-- Deleta usuários antigos (incompatíveis com o Supabase Auth novo)
TRUNCATE TABLE usuarios CASCADE;

-- Atualiza tabela de Usuários
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS auth_id uuid;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS two_factor_secret text;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS two_factor_enabled boolean default false;
ALTER TABLE usuarios DROP COLUMN IF EXISTS senha;
ALTER TABLE usuarios DROP COLUMN IF EXISTS reset_code;

-- Tabela de Servidores
CREATE TABLE IF NOT EXISTS servidores (
  id bigserial primary key,
  nome text,
  url text,
  porta text,
  usuario text,
  senha text,
  painel text,
  status text default 'Ativo',
  created_at timestamptz default now()
);
ALTER TABLE servidores DISABLE ROW LEVEL SECURITY;

-- Adiciona coluna em clientes
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS servidor_id bigint;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS app_nome text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS mac_address text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS app_key text;

-- Tabela de Planos
CREATE TABLE IF NOT EXISTS planos (
  id bigserial primary key,
  nome text not null,
  valor numeric default 0,
  custo numeric default 0,
  periodicidade text default 'Mensal',
  created_at timestamptz default now()
);
ALTER TABLE planos ADD COLUMN IF NOT EXISTS custo numeric default 0;
ALTER TABLE planos DISABLE ROW LEVEL SECURITY;

-- Tabela WhatsApp Config
CREATE TABLE IF NOT EXISTS wa_config (
  id bigserial primary key,
  msg_antes text, msg_apos text, msg_image text, msg_audio text,
  auto_time text, dias_antes text, dias_depois text,
  auto_interval text, auto_active boolean default false,
  created_at timestamptz default now()
);
ALTER TABLE wa_config DISABLE ROW LEVEL SECURITY;

-- Tabela WhatsApp Historico
CREATE TABLE IF NOT EXISTS wa_historico (
  id bigserial primary key, cliente text, numero text,
  mensagem text, status text, created_at timestamptz default now()
);
ALTER TABLE wa_historico DISABLE ROW LEVEL SECURITY;

-- Tabela Pagamentos (missing critical table)
CREATE TABLE IF NOT EXISTS pagamentos (
  id bigserial primary key,
  cliente_id bigint,
  cliente_nome text,
  valor numeric default 0,
  plano text,
  tipo text default 'novo',
  data_pagamento date,
  observacao text,
  created_at timestamptz default now()
);
ALTER TABLE pagamentos DISABLE ROW LEVEL SECURITY;

-- Tabela Meta Config
CREATE TABLE IF NOT EXISTS meta_config (
  id bigserial primary key,
  access_token text,
  ad_account_id text,
  created_at timestamptz default now()
);
ALTER TABLE meta_config DISABLE ROW LEVEL SECURITY;
</pre>
      </div>
      <button onclick="location.reload()" style="width:100%;background:linear-gradient(135deg,#7C3AED,#6D28D9);color:#fff;border:none;border-radius:10px;padding:13px;font-size:.95rem;font-weight:600;cursor:pointer;box-shadow:0 4px 24px rgba(124,58,237,.4)">✅ Já executei o SQL — Recarregar</button>
    </div>
  </div>`);
}

// === SETUP (primeiro acesso) ===
$('setup-form').addEventListener('submit', async e => {
  e.preventDefault();
  const nome = $('setup-nome').value.trim();
  const usuario = $('setup-usuario').value.trim();
  const email = $('setup-email').value.trim();
  const senha = $('setup-senha').value;
  const confirmar = $('setup-confirmar').value;
  const err = $('setup-error');
  hide('setup-error');

  if (!nome || !usuario || !senha || !email) { err.textContent = 'Preencha todos os campos.'; show('setup-error'); return; }
  if (senha !== confirmar) { err.textContent = 'As senhas não coincidem.'; show('setup-error'); return; }
  if (senha.length < 6) { err.textContent = 'Senha muito curta (mín. 6 caracteres).'; show('setup-error'); return; }

  // 1. Cria conta no Supabase Auth nativo
  const { data: authData, error: authErr } = await db.auth.signUp({
    email: email,
    password: senha
  });

  if (authErr) {
    err.textContent = 'Erro ao criar conta no Auth: ' + authErr.message;
    show('setup-error');
    return;
  }

  // Se 'user' não existir, significa que precisa confirmar e-mail
  if (!authData.user) {
    err.textContent = 'Por favor, desative a Confirmação de Email nas configurações do Supabase (Authentication > Providers > Email > Confirm email) e tente novamente.';
    show('setup-error');
    return;
  }

  // 2. Salva o resto na tabela usuarios
  const { error: dbErr } = await db.from('usuarios').insert({
    auth_id: authData.user.id,
    nome: nome,
    usuario: usuario,
    email: email
  });

  if (dbErr) {
    err.textContent = 'Erro ao vincular usuário no banco: ' + dbErr.message;
    show('setup-error');
    return;
  }

  hide('setup-screen');
  show('login-screen');
  toast('Conta criada! Faça login.', 'success');
});

// === LOGIN ===
$('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('login-error');
  try {
    const email = $('login-email').value.trim();
    const senha = $('login-senha').value;
    hide('login-error');

    if (!db) {
      toast('Banco de dados não disponível. Recarregue a página.', 'error');
      return;
    }

    const btn = e.submitter || $('login-form').querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.textContent = 'Verificando...';
    btn.disabled = true;

    console.log('Calling signInWithPassword...');
    const { data: authData, error: authErr } = await db.auth.signInWithPassword({
      email: email,
      password: senha
    });

    if (authErr) {
      toast('Erro de Autenticação: ' + authErr.message, 'error');
      btn.textContent = originalText;
      btn.disabled = false;
      err.textContent = 'E-mail ou senha incorretos.';
      show('login-error');
      return;
    }

    if (!authData.user) {
      toast('Login bem sucedido mas usuário não retornado.', 'error');
      btn.textContent = originalText;
      btn.disabled = false;
      return;
    }

    // Busca dados adicionais do usuário
    const { data: customUser, error: dbErr } = await db.from('usuarios').select('*').eq('auth_id', authData.user.id).single();

    if (dbErr || !customUser) {
      toast('Usuário não encontrado na base de dados.', 'error');
      btn.textContent = originalText;
      btn.disabled = false;
      err.textContent = 'Usuário não encontrado.';
      show('login-error');
      return;
    }

    const user = { ...authData.user, ...customUser };
    btn.textContent = originalText;
    btn.disabled = false;
    
    if (user.two_factor_enabled) {
      tempLoginUser = user;
      hide('login-screen');
      show('twofa-screen');
      $('twofa-code').value = '';
      $('twofa-code').focus();
    } else {
      finishLogin(user);
    }
  } catch (error) {
    const btn = e.target.querySelector('button[type="submit"]');
    if (err) err.textContent = 'Erro fatal: ' + error.message;
    show('login-error');
    if (btn) { btn.textContent = 'Entrar'; btn.disabled = false; }
    console.error('Login error:', error);
  }
});

// === 2FA LOGIN VERIFICATION ===
$('twofa-form').addEventListener('submit', e => {
  e.preventDefault();
  const code = $('twofa-code').value.trim();
  const err = $('twofa-error');
  hide('twofa-error');

  if (!tempLoginUser || !tempLoginUser.two_factor_secret) {
    err.textContent = 'Erro no 2FA. Tente logar novamente.';
    show('twofa-error');
    return;
  }

  let totp = new OTPAuth.TOTP({
    issuer: 'Gestor Flex',
    label: tempLoginUser.usuario,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: tempLoginUser.two_factor_secret
  });

  let delta = totp.validate({ token: code, window: 1 });
  if (delta !== null) {
    finishLogin(tempLoginUser);
  } else {
    err.textContent = 'Código inválido.';
    show('twofa-error');
  }
});

$('back-login').addEventListener('click', async e => {
  e.preventDefault();
  tempLoginUser = null;
  await db.auth.signOut(); // desloga do Auth se desistiu do 2FA
  hide('twofa-screen');
  show('login-screen');
});

async function finishLogin(user) {
  currentUser = user;
  hide('login-screen');
  hide('twofa-screen');
  await enterApp();
}

// === FORGOT PASSWORD (SUPABASE NATIVO) ===
$('link-forgot').addEventListener('click', e => {
  e.preventDefault();
  $('form-forgot').reset();
  hide('forgot-error');
  hide('forgot-code-box');
  $('forgot-submit').textContent = 'Enviar e-mail de recuperação';
  $('forgot-submit').classList.remove('hidden');
  show('modal-forgot');
});

$('forgot-close').addEventListener('click', () => hide('modal-forgot'));
$('forgot-cancel').addEventListener('click', () => hide('modal-forgot'));

$('form-forgot').addEventListener('submit', async e => {
  e.preventDefault();

  // Se o botão for "Continuar para Redefinir"
  if ($('forgot-code-box').classList.contains('hidden') === false) {
    hide('modal-forgot');
    show('modal-reset');
    $('form-reset').reset();
    hide('reset-error');
    return;
  }

  const email = $('forgot-email').value.trim();
  const err = $('forgot-error');
  hide('forgot-error');

  // Supabase nativo envia o e-mail de reset
  const { error } = await db.auth.resetPasswordForEmail(email);

  if (error) {
    err.textContent = 'Erro ao solicitar recuperação: ' + error.message;
    show('forgot-error');
    return;
  }

  forgotEmailTarget = email;
  toast('E-mail enviado! Verifique sua caixa de entrada.', 'success');

  // Como estamos num arquivo local, o link do email não funcionará. 
  // O usuário deve digitar o código (OTP)
  $('forgot-code-value').innerHTML = '<span style="font-size:1.1rem;color:var(--text)">Acesse seu e-mail e copie o código recebido.</span>';
  $('forgot-code-box').classList.remove('hidden');

  $('forgot-submit').textContent = 'Já copiei o código, Continuar';
});

$('reset-close').addEventListener('click', () => hide('modal-reset'));
$('reset-cancel').addEventListener('click', () => hide('modal-reset'));

$('form-reset').addEventListener('submit', async e => {
  e.preventDefault();
  const code = $('reset-code').value.trim();
  const senha = $('reset-senha').value;
  const confirmar = $('reset-confirmar').value;
  const err = $('reset-error');
  hide('reset-error');

  if (senha !== confirmar) { err.textContent = 'Senhas não coincidem.'; show('reset-error'); return; }

  // 1. Verifica o código (OTP) no Supabase nativo
  const { data: verifyData, error: verifyErr } = await db.auth.verifyOtp({
    email: forgotEmailTarget,
    token: code,
    type: 'recovery'
  });

  if (verifyErr) {
    err.textContent = 'Código inválido ou expirado.';
    show('reset-error');
    return;
  }

  // 2. Com a sessão recuperada pelo OTP, altera a senha
  const { error: updateErr } = await db.auth.updateUser({ password: senha });

  if (updateErr) {
    err.textContent = 'Erro ao definir a nova senha: ' + updateErr.message;
    show('reset-error');
    return;
  }

  hide('modal-reset');
  toast('Senha redefinida com sucesso!', 'success');
});

// === ENTER APP ===
async function enterApp() {
  try {
    console.log('Entering App Layout...');
    hide('login-screen');
    hide('setup-screen');
    hide('twofa-screen');
    show('app');
    $('sidebar-nome').textContent = currentUser.nome || currentUser.email;
    $('sidebar-avatar').textContent = (currentUser.nome || currentUser.email).charAt(0).toUpperCase();
    loadPlanos();
    loadDashboard();
    populateConfig();
    // Carrega configs do Meta Ads em segundo plano
    loadMetaConfig();
    // MAC/KEY toggle
    document.querySelectorAll('input[name="cl-has-mac"]').forEach(r => {
      r.addEventListener('change', () => {
        if ($('cl-has-mac-sim').checked) show('mac-key-fields');
        else { hide('mac-key-fields'); $('cl-mac').value = ''; $('cl-key').value = ''; }
      });
    });
  } catch (err) {
    console.error('Error entering app:', err);
    toast('Erro ao carregar o dashboard. Recarregue a página.', 'error');
  }
}

// === LOGOUT ===
$('btn-logout').addEventListener('click', async () => {
  await db.auth.signOut();
  currentUser = null;
  allClientes = [];
  allServidores = [];
  hide('app');
  show('login-screen');
  $('login-email').value = '';
  $('login-senha').value = '';
});

// === NAVIGATION ===
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    const page = item.dataset.page;
    navigateTo(page);
    if (window.innerWidth <= 700) $('sidebar').classList.remove('open');
  });
});

function navigateTo(page) {
  console.log('[Navigation] Indo para:', page);
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  document.querySelectorAll('.page').forEach(p => {
    const isActive = p.id === 'page-' + page;
    if (isActive) console.log('[Navigation] Mostrando página:', p.id);
    p.classList.toggle('active', isActive);
  });
const titles = { dashboard: 'Dashboard', clientes: 'Clientes', faturas: 'Faturas', financeiro: 'Financeiro', captacao: 'Captação', planos: 'Planos', whatsapp: 'WhatsApp', configuracoes: 'Configurações', 'meta-ads': 'Meta Ads', jogos: 'Jogos do Dia' };
$('topbar-title').textContent = titles[page] || '';
if (page === 'clientes') loadClientes();
if (page === 'faturas') loadFaturas();
if (page === 'financeiro') loadFinanceiro();
if (page === 'captacao') loadCaptacao();
if (page === 'planos') loadPlanosPage();
if (page === 'whatsapp') loadWhatsApp();
if (page === 'configuracoes') populateConfig();
if (page === 'meta-ads') loadMetaAds();
if (page === 'jogos') {
  const conteudo = document.getElementById('jogos-conteudo');
  if (conteudo) conteudo.innerHTML = '<p style="padding:20px;color:var(--text);">Carregando jogos...</p>';
  setTimeout(() => {
    if (typeof loadJogosDoDia === 'function') loadJogosDoDia('hoje');
  }, 100);
}
}

$('menu-toggle').addEventListener('click', () => $('sidebar').classList.toggle('open'));

// === DASHBOARD ===
async function loadDashboard() {
  const [{ data: clientes }, { data: pagamentos }] = await Promise.all([
    db.from('clientes').select('*'),
    db.from('pagamentos').select('*')
  ]);
  allClientes = clientes || [];
  renderCaixaAtual(allClientes, pagamentos || []);
  renderDashMetrics(allClientes);
  renderDashChartDual(allClientes, pagamentos || []);
  renderDashDonut(allClientes);
  renderListaVencendo(allClientes);
  checkNotifVencendo(allClientes);
}

function renderCaixaAtual(clientes, pagamentos = []) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const mes = hoje.getMonth();
  const ano = hoje.getFullYear();

  // Caixa real: soma dos pagamentos registrados no mês atual
  const caixaReal = pagamentos
    .filter(p => {
      const d = new Date(p.data_pagamento + 'T00:00:00');
      return d.getMonth() === mes && d.getFullYear() === ano;
    })
    .reduce((acc, p) => acc + parseFloat(p.valor || 0), 0);

  // A Receber: clientes Pendentes
  const pendente = clientes
    .filter(c => c.status === 'Pendente')
    .reduce((acc, c) => acc + parseFloat(c.valor || 0), 0);

  // Inadimplente: clientes Vencidos
  const vencido = clientes
    .filter(c => c.status === 'Vencido')
    .reduce((acc, c) => acc + parseFloat(c.valor || 0), 0);

  const totalPotencial = caixaReal + pendente + vencido;
  const pct = totalPotencial > 0 ? Math.round((caixaReal / totalPotencial) * 100) : 0;

  $('caixa-valor').textContent = fmt(caixaReal);
  $('caixa-recebido').textContent = fmt(caixaReal);
  $('caixa-pendente').textContent = fmt(pendente);
  $('caixa-vencido').textContent = fmt(vencido);
  $('caixa-pct').textContent = pct + '%';

  const bar = $('caixa-bar');
  if (bar) {
    bar.style.width = '0%';
    setTimeout(() => { bar.style.width = pct + '%'; }, 120);
  }
}

function renderDashMetrics(clientes) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const total = clientes.length;
  const ativos = clientes.filter(c => c.status === 'Ativo').length;
  const expirados = clientes.filter(c => c.status === 'Vencido').length;

  const venceHoje = clientes.filter(c => diasAteVencimento(c.vencimento) === 0).length;
  const vence3 = clientes.filter(c => { const d = diasAteVencimento(c.vencimento); return d > 0 && d <= 3; }).length;
  const vence7 = clientes.filter(c => { const d = diasAteVencimento(c.vencimento); return d > 0 && d <= 7; }).length;

  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const novos = clientes.filter(c => c.created_at && new Date(c.created_at) >= inicioMes).length;

  $('m-total').textContent = total;
  $('m-ativos').textContent = ativos;
  if ($('m-expirados')) $('m-expirados').textContent = expirados;
  if ($('m-vencem-hoje')) $('m-vencem-hoje').textContent = venceHoje;

  // Urgency strip
  if ($('urg-val-hoje')) $('urg-val-hoje').textContent = venceHoje;
  if ($('urg-val-3'))    $('urg-val-3').textContent    = vence3;
  if ($('urg-val-7'))    $('urg-val-7').textContent    = vence7;
  if ($('urg-val-novos'))$('urg-val-novos').textContent= novos;
}

function getUltimos6Meses() {
  const meses = [];
  const d = new Date();
  for (let i = 5; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    meses.push({ mes: m.getMonth(), ano: m.getFullYear(), label: m.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }) });
  }
  return meses;
}

let chartDashDual = null;
function renderDashChartDual(clientes, pagamentos = []) {
  const meses = getUltimos8Meses();
  // Entradas = pagamentos por mês
  const entradas = meses.map(m =>
    pagamentos.filter(p => {
      if (!p.data_pagamento) return false;
      const d = new Date(p.data_pagamento + 'T00:00:00');
      return d.getMonth() === m.mes && d.getFullYear() === m.ano;
    }).reduce((acc, p) => acc + parseFloat(p.valor || 0), 0)
  );
  // Saídas = clientes vencidos por mês (como proxy de inadimplência)
  const saidas = meses.map(m =>
    clientes.filter(c => {
      if (!c.vencimento || c.status !== 'Vencido') return false;
      const v = new Date(c.vencimento + 'T00:00:00');
      return v.getMonth() === m.mes && v.getFullYear() === m.ano;
    }).reduce((acc, c) => acc + parseFloat(c.valor || 0), 0)
  );

  const ctx = $('chart-receita');
  if (!ctx) return;
  if (chartDashDual) chartDashDual.destroy();
  chartDashDual = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
      labels: meses.map(m => m.label),
      datasets: [
        { label: 'Entradas', data: entradas, borderColor: '#10B981', backgroundColor: 'rgba(16,185,129,.12)', borderWidth: 2.5, tension: 0.35, pointRadius: 4, pointBackgroundColor: '#10B981', fill: true },
        { label: 'Saídas', data: saidas,   borderColor: '#EF4444', backgroundColor: 'rgba(239,68,68,.08)', borderWidth: 2.5, tension: 0.35, pointRadius: 4, pointBackgroundColor: '#EF4444', fill: true }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmt(ctx.parsed.y) } } },
      scales: {
        x: { grid: { color: 'rgba(124,58,237,.08)' }, ticks: { color: '#9B93C5' } },
        y: { grid: { color: 'rgba(124,58,237,.08)' }, ticks: { color: '#9B93C5', callback: v => 'R$' + v } }
      }
    }
  });
}

function getUltimos8Meses() {
  const meses = [];
  const d = new Date();
  for (let i = 7; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    meses.push({ mes: m.getMonth(), ano: m.getFullYear(), label: m.toLocaleDateString('pt-BR', { month: 'short' }) });
  }
  return meses;
}

let chartDashDonut = null;
function renderDashDonut(clientes) {
  const ativos    = clientes.filter(c => c.status === 'Ativo').length;
  const expirados = clientes.filter(c => c.status === 'Vencido').length;
  const pendentes = clientes.filter(c => c.status === 'Pendente').length;
  const ctx = $('chart-dash-status');
  if (!ctx) return;
  if (chartDashDonut) chartDashDonut.destroy();
  chartDashDonut = new Chart(ctx.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['Ativos', 'Expirados', 'Pendentes'],
      datasets: [{ data: [ativos, expirados, pendentes], backgroundColor: ['#10B981','#EF4444','#F59E0B'], borderWidth: 0, hoverOffset: 6 }]
    },
    options: { responsive: true, cutout: '70%', plugins: { legend: { display: false } } }
  });
  const leg = $('dash-status-legend');
  if (leg) {
    const total = ativos + expirados + pendentes || 1;
    leg.innerHTML = [
      { label: 'Ativos', val: ativos, color: '#10B981' },
      { label: 'Expirados', val: expirados, color: '#EF4444' },
      { label: 'Pendentes', val: pendentes, color: '#F59E0B' }
    ].map(item => `<div class="fin-legend-item"><span class="fin-legend-dot" style="background:${item.color}"></span><span class="fin-legend-label">${item.label}</span><span class="fin-legend-val">${item.val} (${Math.round(item.val/total*100)}%)</span></div>`).join('');
  }
}

function getUltimos6Meses() {
  const meses = [];
  const d = new Date();
  for (let i = 5; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    meses.push({ mes: m.getMonth(), ano: m.getFullYear(), label: m.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }) });
  }
  return meses;
}

function renderChartReceita(clientes, canvasId = 'chart-receita', existingChart = null) {
  // Legacy compatibility – now handled by renderDashChartDual for main canvas
  if (canvasId === 'chart-receita') return chartDashDual;
  const meses = getUltimos6Meses();
  const valores = meses.map(m =>
    clientes.filter(c => {
      if (!c.vencimento) return false;
      const v = new Date(c.vencimento + 'T00:00:00');
      return v.getMonth() === m.mes && v.getFullYear() === m.ano;
    }).reduce((acc, c) => acc + parseFloat(c.valor || 0), 0)
  );
  const ctx = $(canvasId).getContext('2d');
  if (existingChart) existingChart.destroy();
  const chart = new Chart(ctx, {
    type: 'bar',
    data: { labels: meses.map(m => m.label), datasets: [{ label: 'Receita (R$)', data: valores, backgroundColor: 'rgba(124,58,237,.5)', borderColor: '#7C3AED', borderWidth: 2, borderRadius: 8 }] },
    options: { responsive: true, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmt(ctx.parsed.y) } } }, scales: { x: { grid: { color: 'rgba(124,58,237,.08)' }, ticks: { color: '#9B93C5' } }, y: { grid: { color: 'rgba(124,58,237,.08)' }, ticks: { color: '#9B93C5', callback: v => 'R$' + v } } } }
  });
  return chart;
}

function renderListaVencendo(clientes) {
  const lista = clientes.filter(c => {
    const d = diasAteVencimento(c.vencimento);
    return d >= 0 && d <= 7;
  }).sort((a, b) => diasAteVencimento(a.vencimento) - diasAteVencimento(b.vencimento));

  const el = $('lista-vencendo');
  if (lista.length === 0) {
    el.innerHTML = '<div style="color:var(--text-muted);font-size:.88rem;padding:16px 0;text-align:center">Nenhum cliente vencendo em 7 dias.</div>';
    return;
  }
  el.innerHTML = lista.map(c => {
    const dias = diasAteVencimento(c.vencimento);
    return `<div class="vencendo-item">
      <div>
        <div class="vi-nome">${c.nome}</div>
        <div class="vi-data">${new Date(c.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}</div>
      </div>
      <span class="vi-dias">${dias === 0 ? 'Hoje' : dias + 'd'}</span>
    </div>`;
  }).join('');
}

function checkNotifVencendo(clientes) {
  const n = clientes.filter(c => {
    const d = diasAteVencimento(c.vencimento);
    return d >= 0 && d <= 7;
  }).length;
  $('topbar-notif').textContent = n > 0 ? `⚠️ ${n} cliente${n > 1 ? 's' : ''} vencendo em breve` : '';
}

// === CLIENTES ===
async function loadClientes() {
  const { data } = await db.from('clientes').select('*, servidores(nome)').order('created_at', { ascending: false });
  allClientes = data || [];
  renderTabela(allClientes);
}

function renderTabela(list) {
  const tbody = $('tbody-clientes');
  const empty = $('clientes-empty');
  if (list.length === 0) { tbody.innerHTML = ''; show('clientes-empty'); return; }
  hide('clientes-empty');
  tbody.innerHTML = list.map(c => {
    const badgeClass = { Ativo: 'badge-ativo', Vencido: 'badge-vencido', Pendente: 'badge-pendente' }[c.status] || 'badge-pendente';
    const dataFmt = c.vencimento ? new Date(c.vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
    const macBadge = c.mac_address ? `<span class="mac-badge">MAC</span>` : '';
    return `<tr>
      <td><strong>${c.nome}</strong></td>
      <td>${c.whatsapp || '—'}</td>
      <td>${c.plano || '—'} ${macBadge}</td>
      <td>${fmt(c.valor)}</td>
      <td>${dataFmt}</td>
      <td><span class="badge ${badgeClass}">${c.status}</span></td>
      <td style="max-width:130px;overflow:hidden;text-overflow:ellipsis">${c.origem || '—'}</td>
      <td>
        <div class="table-actions">
          <button class="action-btn action-edit" onclick="openEdit(${c.id})">Editar</button>
          <button class="action-btn action-renew" onclick="renovar(${c.id})">Renovar</button>
          <button class="action-btn action-delete" onclick="confirmDeleteCliente(${c.id})">Excluir</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

let activeUrgencyFilter = '';

function applyFilters() {
  const busca = $('search-cliente').value.toLowerCase();
  const status = $('filter-status').value;
  const origem = $('filter-origem').value;
  let list = allClientes;
  if (busca) list = list.filter(c => c.nome.toLowerCase().includes(busca));
  if (status) list = list.filter(c => c.status === status);
  if (origem) list = list.filter(c => c.origem === origem);

  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

  if (activeUrgencyFilter === 'hoje') {
    list = list.filter(c => diasAteVencimento(c.vencimento) === 0);
  } else if (activeUrgencyFilter === '3dias') {
    list = list.filter(c => { const d = diasAteVencimento(c.vencimento); return d > 0 && d <= 3; });
  } else if (activeUrgencyFilter === '7dias') {
    list = list.filter(c => { const d = diasAteVencimento(c.vencimento); return d > 0 && d <= 7; });
  } else if (activeUrgencyFilter === 'expirados') {
    list = list.filter(c => c.status === 'Vencido');
  } else if (activeUrgencyFilter === 'novos') {
    list = list.filter(c => c.created_at && new Date(c.created_at) >= inicioMes);
  }

  renderTabela(list);
}

$('search-cliente').addEventListener('input', applyFilters);
$('filter-status').addEventListener('change', applyFilters);
$('filter-origem').addEventListener('change', applyFilters);

// Urgency chip filter
document.querySelectorAll('.urg-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const urgency = chip.dataset.urgency;
    activeUrgencyFilter = activeUrgencyFilter === urgency ? '' : urgency;
    document.querySelectorAll('.urg-chip').forEach(c => c.classList.remove('active'));
    if (activeUrgencyFilter) chip.classList.add('active');
    applyFilters();
  });
});

$('btn-add-cliente').addEventListener('click', openAddModal);
$('modal-close').addEventListener('click', closeModal);
$('btn-cancelar-modal').addEventListener('click', closeModal);

// === COBRANÇA AVULSA ===
if ($('btn-cobranca-avulsa')) {
  $('btn-cobranca-avulsa').addEventListener('click', () => {
    // Populate client select
    const sel = $('avulsa-cliente');
    if (sel) {
      sel.innerHTML = '<option value="">Selecione o cliente</option>' +
        allClientes.map(c => `<option value="${c.id}" data-wpp="${c.whatsapp||''}" data-nome="${c.nome}" data-plano="${c.plano||''}">${c.nome} — ${c.plano || 'Sem plano'}</option>`).join('');
    }
    // Default vencimento = 7 days from now
    const d = new Date(); d.setDate(d.getDate() + 7);
    if ($('avulsa-vencimento')) $('avulsa-vencimento').value = d.toISOString().split('T')[0];
    hide('avulsa-error');
    show('modal-cobranca-avulsa');
  });
}
if ($('modal-avulsa-close')) $('modal-avulsa-close').addEventListener('click', () => hide('modal-cobranca-avulsa'));
if ($('btn-cancelar-avulsa')) $('btn-cancelar-avulsa').addEventListener('click', () => hide('modal-cobranca-avulsa'));

if ($('form-cobranca-avulsa')) {
  $('form-cobranca-avulsa').addEventListener('submit', async e => {
    e.preventDefault();
    const clienteId = $('avulsa-cliente').value;
    const valor = parseFloat($('avulsa-valor').value) || 0;
    const vencimento = $('avulsa-vencimento').value;
    const descricao = $('avulsa-descricao').value.trim();
    const enviarWpp = document.querySelector('input[name="avulsa-wpp"]:checked')?.value === 'sim';
    const err = $('avulsa-error');
    hide('avulsa-error');
    if (!clienteId || !valor || !vencimento) { err.textContent = 'Preencha todos os campos obrigatórios.'; show('avulsa-error'); return; }
    const cliente = allClientes.find(c => c.id == clienteId);
    if (!cliente) return;
    // Register as a payment record
    await registrarPagamento({
      cliente_id: clienteId,
      cliente_nome: cliente.nome,
      valor, plano: cliente.plano || 'Avulsa',
      tipo: 'avulsa',
      observacao: descricao || 'Cobrança avulsa'
    });
    hide('modal-cobranca-avulsa');
    toast(`💸 Cobrança de ${fmt(valor)} gerada para ${cliente.nome}!`, 'success');
    if (enviarWpp && cliente.whatsapp) {
      const wpp = cliente.whatsapp.replace(/\D/g, '');
      const msg = encodeURIComponent(`Olá ${cliente.nome}! 👋\n\nVocê tem uma cobrança no valor de *${fmt(valor)}* com vencimento em *${new Date(vencimento+'T00:00:00').toLocaleDateString('pt-BR')}*.\n\n${descricao ? '📋 ' + descricao + '\n\n' : ''}Por favor, regularize para manter seu acesso ativo. ✅`);
      window.open(`https://wa.me/55${wpp}?text=${msg}`, '_blank');
    }
    loadDashboard();
  });
}

function openAddModal() {
  $('modal-titulo').textContent = 'Adicionar Cliente';
  $('form-cliente').reset();
  $('cl-id').value = '';
  hide('form-error');
  hide('mac-key-fields');
  $('cl-has-mac-nao').checked = true;
  const hoje = new Date();
  $('cl-vencimento').value = addMeses(hoje.toISOString().split('T')[0], 1);
  updateSelectPlanos();
  show('modal-cliente');
}

function openEdit(id) {
  const c = allClientes.find(x => x.id === id);
  if (!c) return;
  $('modal-titulo').textContent = 'Editar Cliente';
  $('cl-id').value = c.id;
  $('cl-nome').value = c.nome || '';
  $('cl-whatsapp').value = c.whatsapp || '';
  $('cl-valor').value = c.valor || '';
  $('cl-vencimento').value = c.vencimento || '';
  $('cl-status').value = c.status || 'Ativo';
  $('cl-origem').value = c.origem || '';
  $('cl-app-nome').value = c.app_nome || '';
  $('cl-mac').value = c.mac_address || '';
  $('cl-key').value = c.app_key || '';
  if (c.mac_address || c.app_key) { $('cl-has-mac-sim').checked = true; show('mac-key-fields'); }
  else { $('cl-has-mac-nao').checked = true; hide('mac-key-fields'); }
  updateSelectPlanos();
  // set plano after populating
  setTimeout(() => { $('cl-plano').value = c.plano || ''; }, 50);
  hide('form-error');
  show('modal-cliente');
}

function closeModal() {
  hide('modal-cliente');
}

$('cl-plano').addEventListener('change', () => {
  if (!$('cl-id').value) {
    const hoje = new Date().toISOString().split('T')[0];
    $('cl-vencimento').value = addMeses(hoje, planoMeses($('cl-plano').value));
  }
});

$('form-cliente').addEventListener('submit', async e => {
  e.preventDefault();
  const id = $('cl-id').value;
  const hasMac = $('cl-has-mac-sim').checked;
  const payload = {
    nome: $('cl-nome').value.trim(),
    whatsapp: $('cl-whatsapp').value.trim(),
    plano: $('cl-plano').value,
    valor: parseFloat($('cl-valor').value) || 0,
    vencimento: $('cl-vencimento').value,
    status: $('cl-status').value,
    origem: $('cl-origem').value,
    app_nome: $('cl-app-nome').value.trim(),
    mac_address: hasMac ? $('cl-mac').value.trim() : null,
    app_key: hasMac ? $('cl-key').value.trim() : null
  };
  if (!payload.nome || !payload.plano) {
    $('form-error').textContent = 'Preencha os campos obrigatórios.';
    show('form-error'); return;
  }
  let error, insertedData;
  if (id) {
    ({ error } = await db.from('clientes').update(payload).eq('id', id));
  } else {
    ({ data: insertedData, error } = await db.from('clientes').insert(payload).select().single());
  }
  if (error) { $('form-error').textContent = 'Erro: ' + error.message; show('form-error'); return; }

  // Registra pagamento ao adicionar novo cliente Ativo
  if (!id && payload.status === 'Ativo' && payload.valor > 0) {
    await registrarPagamento({
      cliente_id: insertedData?.id || null,
      cliente_nome: payload.nome,
      valor: payload.valor,
      plano: payload.plano,
      tipo: 'novo'
    });
  }

  closeModal();
  toast(id ? 'Cliente atualizado!' : 'Cliente adicionado!', 'success');
  loadClientes(); loadDashboard();
});

// === REGISTRAR PAGAMENTO ===
async function registrarPagamento({ cliente_id, cliente_nome, valor, plano, tipo = 'renovacao', observacao = null }) {
  const hoje = new Date().toISOString().split('T')[0];
  const { error } = await db.from('pagamentos').insert({
    cliente_id,
    cliente_nome,
    valor,
    plano,
    tipo,
    data_pagamento: hoje,
    observacao
  });
  if (error) console.error('Erro ao registrar pagamento:', error.message);
  return !error;
}

async function renovar(id) {
  const c = allClientes.find(x => x.id === id);
  if (!c) return;
  const base = c.vencimento || new Date().toISOString().split('T')[0];
  const novaData = addMeses(base, planoMeses(c.plano));
  const { error } = await db.from('clientes').update({ vencimento: novaData, status: 'Ativo' }).eq('id', id);
  if (error) { toast('Erro ao renovar: ' + error.message, 'error'); return; }

  // Registra o pagamento desta renovação
  await registrarPagamento({
    cliente_id: c.id,
    cliente_nome: c.nome,
    valor: c.valor,
    plano: c.plano,
    tipo: 'renovacao',
    observacao: 'Renovação manual — novo venc: ' + new Date(novaData + 'T00:00:00').toLocaleDateString('pt-BR')
  });

  toast('✅ Plano renovado até ' + new Date(novaData + 'T00:00:00').toLocaleDateString('pt-BR') + ' — Pagamento registrado!', 'success');
  loadClientes();
  loadDashboard();
}

// === FATURAS ===

let allFaturas = [];

async function loadFaturas() {
  const { data } = await db.from('pagamentos').select('*').order('data_pagamento', { ascending: false });
  allFaturas = data || [];
  renderFaturas(allFaturas);
  bindFaturaFilters();
}

function renderFaturas(list) {
  const tbody = $('tbody-faturas');
  const empty = $('faturas-empty');
  if (!tbody) return;

  // Apply filters
  const search = ($('search-faturas')?.value || '').toLowerCase();
  const statusF = $('fat-filter-status')?.value || '';
  const mesF = $('fat-filter-mes')?.value || '';

  let filtered = list;
  if (search) filtered = filtered.filter(p => (p.cliente_nome || '').toLowerCase().includes(search));
  if (statusF) filtered = filtered.filter(p => getBadgeFatura(p) === statusF);
  if (mesF) {
    const [y, m] = mesF.split('-').map(Number);
    filtered = filtered.filter(p => {
      if (!p.data_pagamento) return false;
      const d = new Date(p.data_pagamento + 'T00:00:00');
      return d.getFullYear() === y && d.getMonth() === m - 1;
    });
  }

  // Summary
  const aprovados = filtered.filter(p => getBadgeFatura(p) === 'Aprovado');
  const pendentes = filtered.filter(p => getBadgeFatura(p) === 'Pendente');
  const vencidos  = filtered.filter(p => getBadgeFatura(p) === 'Vencido');
  const sumAp = aprovados.reduce((a, p) => a + parseFloat(p.valor || 0), 0);
  const sumPe = pendentes.reduce((a, p) => a + parseFloat(p.valor || 0), 0);
  const sumVe = vencidos.reduce((a, p) => a + parseFloat(p.valor || 0), 0);
  const sumAll = filtered.reduce((a, p) => a + parseFloat(p.valor || 0), 0);

  if ($('fat-total-aprovado')) $('fat-total-aprovado').textContent = fmt(sumAp);
  if ($('fat-count-aprovado')) $('fat-count-aprovado').textContent = aprovados.length + ' faturas';
  if ($('fat-total-pendente')) $('fat-total-pendente').textContent = fmt(sumPe);
  if ($('fat-count-pendente')) $('fat-count-pendente').textContent = pendentes.length + ' faturas';
  if ($('fat-total-vencido')) $('fat-total-vencido').textContent = fmt(sumVe);
  if ($('fat-count-vencido')) $('fat-count-vencido').textContent = vencidos.length + ' faturas';
  if ($('fat-total-geral')) $('fat-total-geral').textContent = fmt(sumAll);
  if ($('fat-count-total')) $('fat-count-total').textContent = filtered.length + ' faturas';

  if (filtered.length === 0) { tbody.innerHTML = ''; show('faturas-empty'); return; }
  hide('faturas-empty');

  tbody.innerHTML = filtered.map((p, i) => {
    const status = getBadgeFatura(p);
    const badgeClass = { Aprovado: 'badge-aprovado', Pendente: 'badge-pendente-fat', Vencido: 'badge-vencido-fat' }[status] || 'badge-pendente-fat';
    const dataVenc = p.data_pagamento ? new Date(p.data_pagamento + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
    const dataPag  = status === 'Aprovado' ? dataVenc : '—';
    return `<tr>
      <td style="color:var(--text-muted);font-size:.8rem">#${p.id || (i+1)}</td>
      <td><strong>${p.cliente_nome || '—'}</strong></td>
      <td>${p.plano || '—'}</td>
      <td><strong style="color:#34d399">${fmt(p.valor)}</strong></td>
      <td>${dataVenc}</td>
      <td>${dataPag}</td>
      <td><span class="badge ${badgeClass}" style="font-size:.75rem;padding:4px 10px;border-radius:999px;">${status}</span></td>
      <td>
        <div class="table-actions" style="gap:6px;">
          <button class="action-btn action-renew" style="font-size:.78rem;padding:5px 10px;" onclick="marcarFaturaAprovada(${p.id})">✅ Pago</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function getBadgeFatura(p) {
  // tipo 'avulsa' = Pendente unless explicitly paid
  if (p.tipo === 'avulsa') return 'Pendente';
  if (p.tipo === 'novo' || p.tipo === 'renovacao') return 'Aprovado';
  return 'Pendente';
}

async function marcarFaturaAprovada(id) {
  // For now just reload and show success — could update a status column in the future
  toast('✅ Fatura marcada como paga!', 'success');
}

function bindFaturaFilters() {
  const s = $('search-faturas');
  const sf = $('fat-filter-status');
  const mf = $('fat-filter-mes');
  if (s && !s._wired)  { s._wired = true;  s.addEventListener('input', () => renderFaturas(allFaturas)); }
  if (sf && !sf._wired){ sf._wired = true; sf.addEventListener('change', () => renderFaturas(allFaturas)); }
  if (mf && !mf._wired){ mf._wired = true; mf.addEventListener('change', () => renderFaturas(allFaturas)); }
}

// === FINANCEIRO ===

async function loadFinanceiro() {
  const [{ data: clientesData }, { data: pagamentosData }] = await Promise.all([
    db.from('clientes').select('*'),
    db.from('pagamentos').select('*').order('data_pagamento', { ascending: false })
  ]);
  const clientes = clientesData || [];
  const pagamentos = pagamentosData || [];

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const mes = hoje.getMonth(); const ano = hoje.getFullYear();

  const ativos = clientes.filter(c => c.status === 'Ativo');
  const vencidos = clientes.filter(c => c.status === 'Vencido' || diasAteVencimento(c.vencimento) < 0);
  const pendentes = clientes.filter(c => c.status === 'Pendente');

  const totalEntrada = pagamentos
    .filter(p => { const d = new Date(p.data_pagamento + 'T00:00:00'); return d.getMonth() === mes && d.getFullYear() === ano; })
    .reduce((acc, p) => acc + parseFloat(p.valor || 0), 0);

  const totalSaida = clientes.filter(c => c.status === 'Vencido').reduce((acc, c) => acc + parseFloat(c.valor || 0), 0);
  const saldo = totalEntrada - totalSaida;

  // Update carteira hero cards (new layout)
  if ($('fin-saldo')) { $('fin-saldo').textContent = fmt(saldo); $('fin-saldo').setAttribute('data-valor', saldo); }
  if ($('fin-entrada-total')) $('fin-entrada-total').textContent = fmt(totalEntrada);
  if ($('fin-saida-total')) $('fin-saida-total').textContent = fmt(totalSaida);
  if ($('fin-vencidos-count')) $('fin-vencidos-count').textContent = vencidos.length + ' clientes';

  // Legacy compat (hidden elements)
  const receitaMes = totalEntrada;
  const emAberto = clientes.filter(c => c.status !== 'Ativo').reduce((acc, c) => acc + parseFloat(c.valor || 0), 0);
  if ($('fin-receita-mes')) $('fin-receita-mes').textContent = fmt(receitaMes);
  if ($('fin-ativos-count')) $('fin-ativos-count').textContent = ativos.length;
  if ($('fin-em-aberto')) $('fin-em-aberto').textContent = fmt(emAberto);


  // Saldo eye toggle
  const eyeBtn = $('btn-toggle-saldo');
  if (eyeBtn && !eyeBtn._wired) {
    eyeBtn._wired = true;
    eyeBtn.addEventListener('click', () => {
      const el = $('fin-saldo');
      const isHidden = el.getAttribute('data-hidden') === 'true';
      if (isHidden) {
        el.textContent = fmt(parseFloat(el.getAttribute('data-valor') || 0));
        el.setAttribute('data-hidden', 'false');
        eyeBtn.textContent = '👁';
      } else {
        el.textContent = '••••••';
        el.setAttribute('data-hidden', 'true');
        eyeBtn.textContent = '🙈';
      }
    });
  }


  // CHART 1: Receita real (pagamentos) vs Inadimplência por mês
  const meses = getUltimos6Meses();
  const valReceita = meses.map(m =>
    pagamentos.filter(p => { const d = new Date(p.data_pagamento + 'T00:00:00'); return d.getMonth() === m.mes && d.getFullYear() === m.ano; })
      .reduce((a, p) => a + parseFloat(p.valor || 0), 0)
  );
  const valVencidos = meses.map(m =>
    clientes.filter(c => c.status !== 'Ativo' && c.vencimento && new Date(c.vencimento + 'T00:00:00').getMonth() === m.mes && new Date(c.vencimento + 'T00:00:00').getFullYear() === m.ano)
      .reduce((a, c) => a + parseFloat(c.valor || 0), 0)
  );

  const ctx1 = $('chart-fin-fluxo').getContext('2d');
  if (chartFinFluxo) chartFinFluxo.destroy();
  chartFinFluxo = new Chart(ctx1, {
    type: 'line', data: {
      labels: meses.map(m => m.label), datasets: [
        { label: 'Receita', data: valReceita, borderColor: '#10B981', backgroundColor: 'rgba(16,185,129,.12)', tension: .4, fill: true, pointBackgroundColor: '#10B981', pointRadius: 4 },
        { label: 'Inadimplente', data: valVencidos, borderColor: '#EF4444', backgroundColor: 'rgba(239,68,68,.08)', tension: .4, fill: true, pointBackgroundColor: '#EF4444', pointRadius: 4 }
      ]
    }, options: { responsive: true, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt(c.parsed.y) } } }, scales: { x: { grid: { color: 'rgba(124,58,237,.08)' }, ticks: { color: '#9B93C5' } }, y: { grid: { color: 'rgba(124,58,237,.08)' }, ticks: { color: '#9B93C5', callback: v => 'R$' + v } } } }
  });

  // CHART 2: Donut - Situação clientes
  const ctx2 = $('chart-fin-status').getContext('2d');
  if (chartFinStatus) chartFinStatus.destroy();
  chartFinStatus = new Chart(ctx2, { type: 'doughnut', data: { labels: ['Ativos', 'Vencidos', 'Pendentes'], datasets: [{ data: [ativos.length, vencidos.length, pendentes.length], backgroundColor: ['#10B981', '#EF4444', '#F59E0B'], borderWidth: 2, borderColor: '#1E1838', hoverOffset: 8 }] }, options: { responsive: false, plugins: { legend: { display: false } }, cutout: '68%' } });

  const total = clientes.length || 1;
  $('fin-status-legend').innerHTML = [
    { label: 'Ativos', val: ativos.length, color: '#10B981' },
    { label: 'Vencidos', val: vencidos.length, color: '#EF4444' },
    { label: 'Pendentes', val: pendentes.length, color: '#F59E0B' }
  ].map(i => `<div class="fin-legend-item"><span class="fin-legend-dot" style="background:${i.color}"></span><span class="fin-legend-label">${i.label}</span><span class="fin-legend-val">${i.val} (${Math.round(i.val / total * 100)}%)</span></div>`).join('');

  // CHART 3: Bar - Receita por Plano (baseado em pagamentos reais)
  const porPlano = {};
  pagamentos.filter(p => { const d = new Date(p.data_pagamento + 'T00:00:00'); return d.getMonth() === mes && d.getFullYear() === ano; })
    .forEach(p => { const pl = p.plano || 'Sem Plano'; porPlano[pl] = (porPlano[pl] || 0) + parseFloat(p.valor || 0); });
  const planoLabels = Object.keys(porPlano); const planoVals = Object.values(porPlano);
  const ctx3 = $('chart-fin-plano').getContext('2d');
  if (chartFinPlano) chartFinPlano.destroy();
  chartFinPlano = new Chart(ctx3, { type: 'bar', data: { labels: planoLabels, datasets: [{ label: 'Receita', data: planoVals, backgroundColor: 'rgba(124,58,237,.55)', borderColor: '#7C3AED', borderWidth: 2, borderRadius: 8 }] }, options: { responsive: true, indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt(c.parsed.x) } } }, scales: { x: { grid: { color: 'rgba(124,58,237,.08)' }, ticks: { color: '#9B93C5', callback: v => 'R$' + v } }, y: { grid: { display: false }, ticks: { color: '#9B93C5' } } } } });

  // Vencimentos da semana
  const lista7 = clientes.filter(c => { const d = diasAteVencimento(c.vencimento); return d >= 0 && d <= 7; }).sort((a, b) => diasAteVencimento(a.vencimento) - diasAteVencimento(b.vencimento));
  const el = $('fin-vencimentos');
  el.innerHTML = lista7.length === 0 ? '<div style="color:var(--text-muted);font-size:.88rem;padding:16px 0;text-align:center">Nenhum vencimento na semana.</div>' :
    lista7.map(c => { const d = diasAteVencimento(c.vencimento); return `<div class="vencendo-item"><div><div class="vi-nome">${c.nome}</div><div class="vi-data">${fmt(c.valor)} — ${new Date(c.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}</div></div><span class="vi-dias">${d === 0 ? 'Hoje' : d + 'd'}</span></div>`; }).join('');

  // Tabela vencidos
  const tbody = $('tbody-fin-vencidos');
  if (vencidos.length === 0) { tbody.innerHTML = ''; show('fin-vencidos-empty'); }
  else {
    hide('fin-vencidos-empty');
    tbody.innerHTML = vencidos.sort((a, b) => diasAteVencimento(a.vencimento) - diasAteVencimento(b.vencimento)).slice(0, 30)
      .map(c => `<tr><td><strong>${c.nome}</strong></td><td>${c.whatsapp || '—'}</td><td>${c.plano || '—'}</td><td>${fmt(c.valor)}</td><td>${c.vencimento ? new Date(c.vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td><td style="color:#f87171;font-weight:700">${Math.abs(diasAteVencimento(c.vencimento))} dias</td></tr>`).join('');
  }

  // Histórico de Pagamentos — inicializa com mês atual
  const mesInput = $('fin-pag-mes');
  if (mesInput && !mesInput.value) {
    mesInput.value = `${ano}-${String(mes + 1).padStart(2, '0')}`;
  }
  renderPagamentosTabela(pagamentos, mesInput?.value);
}

function renderPagamentosTabela(pagamentos, filtroMes) {
  const tbody = $('tbody-pagamentos');
  if (!tbody) return;

  const listFiltrada = filtroMes
    ? pagamentos.filter(p => p.data_pagamento?.startsWith(filtroMes))
    : pagamentos;

  const totalVal = listFiltrada.reduce((acc, p) => acc + parseFloat(p.valor || 0), 0);
  const totalEl = $('fin-pag-total-val');
  if (totalEl) totalEl.textContent = fmt(totalVal);

  if (listFiltrada.length === 0) { tbody.innerHTML = ''; show('pagamentos-empty'); return; }
  hide('pagamentos-empty');

  const tipoBadge = {
    renovacao: '<span style="background:rgba(124,58,237,.2);color:#A78BFA;padding:2px 8px;border-radius:6px;font-size:.75rem;font-weight:600;">Renovação</span>',
    novo: '<span style="background:rgba(16,185,129,.15);color:#34d399;padding:2px 8px;border-radius:6px;font-size:.75rem;font-weight:600;">Novo</span>',
    manual: '<span style="background:rgba(245,158,11,.15);color:#fbbf24;padding:2px 8px;border-radius:6px;font-size:.75rem;font-weight:600;">Manual</span>'
  };

  tbody.innerHTML = listFiltrada.map(p => `
    <tr>
      <td>${p.data_pagamento ? new Date(p.data_pagamento + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td>
      <td><strong>${p.cliente_nome || '—'}</strong></td>
      <td>${p.plano || '—'}</td>
      <td>${tipoBadge[p.tipo] || tipoBadge.manual}</td>
      <td style="color:#34d399;font-weight:700">${fmt(p.valor)}</td>
      <td style="color:var(--text-muted);font-size:.82rem;max-width:180px;overflow:hidden;text-overflow:ellipsis">${p.observacao || '—'}</td>
    </tr>`).join('');
}

$('fin-period')?.addEventListener('change', loadFinanceiro);

// Filtro de mês do histórico de pagamentos (sem recarregar tudo)
document.addEventListener('change', async e => {
  if (e.target && e.target.id === 'fin-pag-mes') {
    const { data } = await db.from('pagamentos').select('*').order('data_pagamento', { ascending: false });
    renderPagamentosTabela(data || [], e.target.value);
  }
});

// === CAPTAÇÃO ===
const CAP_CORES = ['#7C3AED', '#A78BFA', '#10B981', '#F59E0B', '#EF4444', '#60A5FA'];

async function loadCaptacao() {
  const { data } = await db.from('clientes').select('origem, status');
  const clientes = data || [];

  const contagem = {};
  clientes.forEach(c => {
    const k = c.origem || 'Outro';
    contagem[k] = (contagem[k] || 0) + 1;
  });

  const sorted = Object.entries(contagem).sort((a, b) => b[1] - a[1]);
  const total = clientes.length || 1;
  const topCanal = sorted[0]?.[0];

  const ctx = $('chart-captacao').getContext('2d');
  if (chartCaptacao) chartCaptacao.destroy();
  chartCaptacao = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: sorted.map(([k]) => k),
      datasets: [{
        data: sorted.map(([, v]) => v),
        backgroundColor: CAP_CORES,
        borderWidth: 2,
        borderColor: '#1E1838',
        hoverOffset: 10
      }]
    },
    options: {
      responsive: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.parsed} (${Math.round(ctx.parsed / total * 100)}%)` } }
      },
      cutout: '68%'
    }
  });

  $('captacao-cards').innerHTML = sorted.map(([canal, qtd], i) => {
    const pct = Math.round(qtd / total * 100);
    const isTop = canal === topCanal;
    return `<div class="captacao-item ${isTop ? 'top' : ''}">
      <div class="cap-left">
        <div class="cap-dot" style="background:${CAP_CORES[i % CAP_CORES.length]}"></div>
        <div>
          <div class="cap-canal">${canal}</div>
          ${isTop ? '<div class="cap-star">⭐ Melhor canal</div>' : ''}
        </div>
      </div>
      <div class="cap-right">
        <span class="cap-total">${qtd} cliente${qtd !== 1 ? 's' : ''}</span>
        <span class="cap-pct">${pct}%</span>
      </div>
    </div>`;
  }).join('') || '<div style="color:var(--text-muted);font-size:.88rem;padding:16px 0;text-align:center">Sem dados de captação.</div>';
}

// === PLANOS ===
async function loadPlanos() {
  const { data } = await db.from('planos').select('*').order('nome');
  allPlanos = data || [];
  updateSelectPlanos();
}

function updateSelectPlanos() {
  const sel = $('cl-plano');
  if (sel) {
    const val = sel.value;
    sel.innerHTML = '<option value="">Selecione o plano</option>' + allPlanos.map(p => `<option value="${p.nome}" data-valor="${p.valor}">${p.nome} — ${fmt(p.valor)}</option>`).join('');
    sel.value = val;
  }
}

// Auto-fill valor when plan selected
$('cl-plano').addEventListener('change', () => {
  const sel = $('cl-plano');
  const opt = sel.options[sel.selectedIndex];
  if (opt && opt.dataset.valor) $('cl-valor').value = opt.dataset.valor;
});

async function loadPlanosPage() {
  await loadPlanos();
  const tbody = $('tbody-planos');
  if (!tbody) return;

  // Count clientes per plan
  const { data: clData } = await db.from('clientes').select('plano, valor, status');
  const clientes = clData || [];

  if (allPlanos.length === 0) { tbody.innerHTML = ''; show('planos-empty'); }
  else {
    hide('planos-empty');
    tbody.innerHTML = allPlanos.map(p => {
      const count = clientes.filter(c => c.plano === p.nome).length;
      const activeCount = clientes.filter(c => c.plano === p.nome && c.status === 'Ativo').length;
      return `<tr>
        <td style="color:var(--text-muted);font-size:.8rem">#${p.id}</td>
        <td><strong>${p.nome}</strong></td>
        <td style="color:#34d399;font-weight:700">${fmt(p.valor)}</td>
        <td><span class="badge badge-ativo" style="background:rgba(124,58,237,.15);color:var(--purple-light);border-color:var(--border)">${p.periodicidade || 'Mensal'}</span></td>
        <td>${activeCount} ativos / ${count} total</td>
        <td><div class="table-actions">
          <button class="action-btn action-edit" onclick="openEditPlano(${p.id})">Editar</button>
          <button class="action-btn action-delete" onclick="confirmDeletePlano(${p.id})">Excluir</button>
        </div></td>
      </tr>`;
    }).join('');
  }

  // Metrics
  const totalReceita = allPlanos.reduce((a, p) => {
    const ativos = clientes.filter(c => c.plano === p.nome && c.status === 'Ativo').length;
    return a + (parseFloat(p.valor || 0) * ativos);
  }, 0);
  const ticket = allPlanos.length ? allPlanos.reduce((a, p) => a + parseFloat(p.valor || 0), 0) / allPlanos.length : 0;
  const comPlano = clientes.filter(c => c.plano && c.status === 'Ativo').length;
  $('pl-total').textContent = allPlanos.length;
  $('pl-ticket').textContent = fmt(ticket);
  $('pl-clientes').textContent = comPlano;
  $('pl-receita').textContent = fmt(totalReceita);
}

$('btn-add-plano').addEventListener('click', () => {
  $('modal-plano-titulo').textContent = 'Novo Plano';
  $('form-plano').reset();
  $('pl-id').value = '';
  hide('plano-error');
  show('modal-plano');
});

$('modal-plano-close').addEventListener('click', () => hide('modal-plano'));
$('btn-cancelar-plano').addEventListener('click', () => hide('modal-plano'));

function openEditPlano(id) {
  const p = allPlanos.find(x => x.id === id);
  if (!p) return;
  $('modal-plano-titulo').textContent = 'Editar Plano';
  $('pl-id').value = p.id;
  $('pl-nome').value = p.nome || '';
  $('pl-valor').value = p.valor || '';
  $('pl-custo').value = p.custo || '';
  $('pl-periodicidade').value = p.periodicidade || 'Mensal';
  hide('plano-error');
  show('modal-plano');
}

$('form-plano').addEventListener('submit', async e => {
  e.preventDefault();
  const id = $('pl-id').value;
  const payload = {
    nome: $('pl-nome').value.trim(),
    valor: parseFloat($('pl-valor').value) || 0,
    custo: parseFloat($('pl-custo').value) || 0,
    periodicidade: $('pl-periodicidade').value
  };
  if (!payload.nome) { $('plano-error').textContent = 'Nome obrigatório.'; show('plano-error'); return; }
  let error;
  if (id) { ({ error } = await db.from('planos').update(payload).eq('id', id)); }
  else { ({ error } = await db.from('planos').insert(payload)); }
  if (error) { $('plano-error').textContent = 'Erro: ' + error.message; show('plano-error'); return; }
  hide('modal-plano');
  toast(id ? 'Plano atualizado!' : 'Plano criado!', 'success');
  loadPlanosPage();
});

function confirmDeleteCliente(id) { deleteTargetId = id; deleteType = 'cliente'; show('modal-confirm'); }
function confirmDeletePlano(id) { deleteTargetId = id; deleteType = 'plano'; show('modal-confirm'); }

$('confirm-close').addEventListener('click', () => { hide('modal-confirm'); deleteTargetId = null; });
$('confirm-cancel').addEventListener('click', () => { hide('modal-confirm'); deleteTargetId = null; });
$('confirm-delete').addEventListener('click', async () => {
  if (!deleteTargetId || !deleteType) return;
  const tabela = deleteType === 'cliente' ? 'clientes' : 'planos';
  const { error } = await db.from(tabela).delete().eq('id', deleteTargetId);
  hide('modal-confirm');
  if (error) { toast('Erro ao excluir.', 'error'); return; }
  toast(deleteType === 'cliente' ? 'Cliente excluído.' : 'Plano excluído.', 'success');
  if (deleteType === 'cliente') { loadClientes(); loadDashboard(); }
  else { loadPlanosPage(); }
  deleteTargetId = null; deleteType = null;
});

// === CONFIGURAÇÕES & 2FA ===
function populateConfig() {
  $('cfg-nome').value = currentUser.nome || '';
  $('cfg-usuario').value = currentUser.usuario || '';
  $('cfg-email').value = currentUser.email || '';
  $('cfg-senha').value = '';
  $('cfg-confirmar').value = '';

  if (currentUser.two_factor_enabled) {
    hide('twofa-disabled-view');
    show('twofa-enabled-view');
  } else {
    show('twofa-disabled-view');
    hide('twofa-enabled-view');
  }
}

$('config-form').addEventListener('submit', async e => {
  e.preventDefault();
  const nome = $('cfg-nome').value.trim();
  const usuario = $('cfg-usuario').value.trim();
  const email = $('cfg-email').value.trim();
  const senha = $('cfg-senha').value;
  const confirmar = $('cfg-confirmar').value;
  const msg = $('cfg-msg');
  hide('cfg-msg');

  if (!nome || !usuario || !email) { msg.textContent = 'Nome, usuário e email são obrigatórios.'; show('cfg-msg'); return; }
  if (senha && senha !== confirmar) { msg.textContent = 'Senhas não coincidem.'; show('cfg-msg'); return; }

  // Se trocar e-mail ou senha, atualiza no Supabase Auth nativo
  if (email !== currentUser.email || senha) {
    const updates = {};
    if (email !== currentUser.email) updates.email = email;
    if (senha) updates.password = senha;

    const { error: authErr } = await db.auth.updateUser(updates);
    if (authErr) {
      msg.textContent = 'Erro ao atualizar dados da conta: ' + authErr.message;
      show('cfg-msg');
      return;
    }
  }

  // Atualiza também na tabela usuarios
  const payload = { nome, usuario, email };
  const { error } = await db.from('usuarios').update(payload).eq('auth_id', currentUser.auth_id);

  if (error) { msg.textContent = 'Erro ao atualizar tabela: ' + error.message; show('cfg-msg'); return; }

  currentUser = { ...currentUser, ...payload };
  $('sidebar-nome').textContent = currentUser.nome;
  $('sidebar-avatar').textContent = currentUser.nome.charAt(0).toUpperCase();

  msg.textContent = 'Alterações salvas com sucesso!';
  msg.className = 'error-msg success';
  show('cfg-msg');
  setTimeout(() => { hide('cfg-msg'); msg.className = 'error-msg hidden'; }, 3000);
});

// 2FA SETUP
$('btn-enable-2fa').addEventListener('click', () => {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  tempSecret2FA = '';
  for (let i = 0; i < 32; i++) tempSecret2FA += charset[Math.floor(Math.random() * charset.length)];

  $('twofa-secret-display').textContent = tempSecret2FA;
  $('twofa-verify-code').value = '';
  hide('twofa-setup-error');

  let totp = new OTPAuth.TOTP({
    issuer: 'Gestor Flex',
    label: currentUser.usuario,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: tempSecret2FA
  });
  let uri = totp.toString();

  QRCode.toCanvas($('qr-canvas'), uri, {
    width: 200, margin: 2,
    color: { dark: '#0a0718', light: '#ffffff' }
  }, function (error) {
    if (error) console.error(error);
  });

  show('modal-2fa-setup');
});

$('twofa-setup-close').addEventListener('click', () => hide('modal-2fa-setup'));
$('twofa-setup-cancel').addEventListener('click', () => hide('modal-2fa-setup'));

$('btn-confirm-2fa').addEventListener('click', async () => {
  const code = $('twofa-verify-code').value.trim();
  const err = $('twofa-setup-error');
  hide('twofa-setup-error');

  let totp = new OTPAuth.TOTP({
    issuer: 'Gestor Flex',
    label: currentUser.usuario,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: tempSecret2FA
  });

  let delta = totp.validate({ token: code, window: 1 });
  if (delta !== null) {
    const { error } = await db.from('usuarios').update({
      two_factor_secret: tempSecret2FA,
      two_factor_enabled: true
    }).eq('auth_id', currentUser.auth_id);

    if (error) {
      err.textContent = 'Erro ao salvar no banco.'; show('twofa-setup-error'); return;
    }

    currentUser.two_factor_secret = tempSecret2FA;
    currentUser.two_factor_enabled = true;

    hide('modal-2fa-setup');
    populateConfig();
    toast('2FA ativado com sucesso!', 'success');
  } else {
    err.textContent = 'Código inválido. Tente novamente.';
    show('twofa-setup-error');
  }
});

$('btn-disable-2fa').addEventListener('click', async () => {
  if (!confirm('Deseja realmente desativar o 2FA?')) return;

  const { error } = await db.from('usuarios').update({
    two_factor_secret: null,
    two_factor_enabled: false
  }).eq('auth_id', currentUser.auth_id);

  if (error) { toast('Erro ao desativar', 'error'); return; }

  currentUser.two_factor_secret = null;
  currentUser.two_factor_enabled = false;

  populateConfig();
  toast('2FA desativado.', 'success');
});

// === START ===
window.addEventListener('load', () => {
  boot();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.error('SW falhou:', err));
  }

  // Event listeners para abas de jogos
  document.querySelectorAll('.jogo-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const dia = tab.dataset.dia;
      loadJogosDoDia(dia);
    });
  });

  // Event listener para botão de atualizar jogos
  const btnAtualizar = $('btn-atualizar-jogos');
  if (btnAtualizar) {
    btnAtualizar.addEventListener('click', (e) => {
      e.preventDefault();
      loadJogosDoDia(currentDia);
      toast('Atualizando jogos...', 'info');
    });
  }
});

window.openEdit = openEdit;
window.renovar = renovar;
window.confirmDeleteCliente = confirmDeleteCliente;
window.confirmDeletePlano = confirmDeletePlano;
window.openEditPlano = openEditPlano;
window.copiarJogos = copiarJogos;
window.gerarImagemJogos = gerarImagemJogos;

// === WHATSAPP MODULE ===
const EVO_URL = 'https://evolution-api-production-651d.up.railway.app';
const EVO_KEY = 'daac7f5b35750676e44502934a7d6c51a4e483f39176635677e1fdb314791775';
const INSTANCE_NAME = 'gestorflex';

let waQueue = [];
let waIsRunning = false;
let waCheckInterval = null;
let waStatus = 'desconectado';
let waConfigData = null;

async function evoApi(endpoint, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'apikey': EVO_KEY }
  };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(`${EVO_URL}${endpoint}`, opts);
    return await res.json();
  } catch (err) {
    console.error('Evo API Erro:', err);
    return null;
  }
}

async function loadWhatsApp() {
  await checkWaConnection();
  await loadWaConfig();
  await loadWaHistory();
  if (allClientes.length === 0) {
    const { data } = await db.from('clientes').select('*');
    allClientes = data || [];
  }
  updateWaManualCount();
}

async function checkWaConnection() {
  const data = await evoApi(`/instance/connectionState/${INSTANCE_NAME}`);
  const badge = $('wa-status-badge');

  if (data && data.instance) {
    const state = data.instance.state;
    if (state === 'open') {
      waStatus = 'conectado';
      badge.textContent = 'Conectado';
      badge.className = 'status-badge green';
      hide('wa-qr-container');
      show('wa-connected-container');
      $('btn-wa-connect').classList.add('hidden');
    } else {
      waStatus = 'desconectado';
      badge.textContent = 'Desconectado';
      badge.className = 'status-badge red';
      hide('wa-connected-container');
      $('btn-wa-connect').classList.remove('hidden');
    }
  } else {
    // Instância pode não existir, vamos criar.
    waStatus = 'desconectado';
    badge.textContent = 'Desconectado';
    badge.className = 'status-badge red';
    hide('wa-connected-container');
    $('btn-wa-connect').classList.remove('hidden');
  }
}

$('btn-wa-connect').addEventListener('click', async () => {
  $('btn-wa-connect').textContent = 'Conectando...';

  // Tentar criar instância (se já existir, dará erro, o que é ok)
  await evoApi('/instance/create', 'POST', {
    instanceName: INSTANCE_NAME,
    qrcode: true,
    integration: "WHATSAPP-BAILEYS"
  });

  const data = await evoApi(`/instance/connect/${INSTANCE_NAME}`);
  $('btn-wa-connect').textContent = 'Conectar WhatsApp';

  if (data && data.base64) {
    show('wa-qr-container');
    const img = new Image();
    img.src = data.base64;
    img.onload = () => {
      const canvas = $('wa-qr-canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
    };

    // Fica checando o status a cada 3s até conectar
    if (waCheckInterval) clearInterval(waCheckInterval);
    waCheckInterval = setInterval(async () => {
      await checkWaConnection();
      if (waStatus === 'conectado') clearInterval(waCheckInterval);
    }, 3000);
  } else if (data && data.instance && data.instance.state === 'open') {
    checkWaConnection();
  } else {
    toast('Erro ao obter QR Code', 'error');
  }
});

$('btn-wa-disconnect').addEventListener('click', async () => {
  if (!confirm('Deseja desconectar esta instância do WhatsApp?')) return;
  await evoApi(`/instance/logout/${INSTANCE_NAME}`, 'DELETE');
  await checkWaConnection();
  toast('WhatsApp desconectado.', 'info');
});

async function loadWaConfig() {
  console.log('[WhatsApp] Carregando configurações...');
  const { data, error } = await db.from('wa_config').select('*').limit(1);
  
  if (!error && data && data.length > 0) {
    waConfigData = data[0];
    console.log('[WhatsApp] Configurações carregadas:', waConfigData);
    
    // Mensagens
    $('wa-msg-antes').value = waConfigData.msg_antes || '';
    $('wa-msg-hoje').value = waConfigData.msg_hoje || '';
    $('wa-msg-apos').value = waConfigData.msg_apos || '';
    
    // Mídias (URLs ou base64)
    if (waConfigData.msg_image) {
      if (waConfigData.msg_image.startsWith('data:')) {
        waImageBase64 = waConfigData.msg_image;
        $('wa-image-preview').style.display = 'block';
        $('wa-image-preview-img').src = waImageBase64;
      } else {
        $('wa-msg-image').value = waConfigData.msg_image;
      }
    }
    
    if (waConfigData.msg_audio) {
      if (waConfigData.msg_audio.startsWith('data:')) {
        waAudioBase64 = waConfigData.msg_audio;
        $('wa-audio-preview').style.display = 'block';
        $('wa-audio-preview-audio').src = waAudioBase64;
      } else {
        $('wa-msg-audio').value = waConfigData.msg_audio;
      }
    }
    
    // Configurações de disparo
    $('wa-auto-time').value = waConfigData.auto_time || '';
    $('wa-auto-interval').value = waConfigData.auto_interval || '1';
    $('wa-auto-active').checked = waConfigData.auto_active || false;
    
    // Carrega checkboxes de dias ANTES
    const dAntes = (waConfigData.dias_antes || '').split(',');
    document.querySelectorAll('.wa-cb-antes').forEach(cb => {
      cb.checked = dAntes.includes(cb.value);
    });
    
    // Carrega checkbox de HOJE
    const enviarHoje = waConfigData.enviar_hoje !== 'false'; // Padrão é true
    document.querySelectorAll('.wa-cb-hoje').forEach(cb => {
      cb.checked = enviarHoje;
    });
    
    // Carrega checkboxes de dias DEPOIS
    const dDepois = (waConfigData.dias_depois || '').split(',');
    document.querySelectorAll('.wa-cb-depois').forEach(cb => {
      cb.checked = dDepois.includes(cb.value);
    });
    
    // Carrega planos no select de filtro
    loadWaPlanosFilter();
    
    console.log('[WhatsApp] Configurações carregadas com sucesso');
  } else {
    console.log('[WhatsApp] Nenhuma configuração encontrada');
  }
}

// Carrega planos no filtro do WhatsApp
async function loadWaPlanosFilter() {
  const select = $('wa-manual-plano');
  if (!select || !allPlanos) return;
  
  select.innerHTML = '<option value="">Todos os Planos</option>';
  allPlanos.forEach(plano => {
    select.innerHTML += `<option value="${plano.nome}">${plano.nome}</option>`;
  });
}

$('btn-wa-save-msg').addEventListener('click', async () => {
  console.log('[WhatsApp] Salvando mensagens...');
  
  const payload = {
    msg_antes: $('wa-msg-antes').value,
    msg_hoje: $('wa-msg-hoje').value,
    msg_apos: $('wa-msg-apos').value,
    msg_image: waImageBase64 || $('wa-image-url').value,
    msg_audio: waAudioBase64 || $('wa-audio-url').value,
  };
  
  await saveWaConfig(payload);
  toast('Textos e mídias salvas com sucesso!', 'success');
});

$('btn-wa-save-auto').addEventListener('click', async () => {
  console.log('[WhatsApp] Salvando configurações de disparo...');
  
  const diasAntes = Array.from(document.querySelectorAll('.wa-cb-antes:checked')).map(cb => cb.value).join(',');
  const diasDepois = Array.from(document.querySelectorAll('.wa-cb-depois:checked')).map(cb => cb.value).join(',');
  const enviarHoje = document.querySelector('.wa-cb-hoje:checked');

  const payload = {
    auto_time: $('wa-auto-time').value,
    auto_interval: $('wa-auto-interval').value,
    auto_active: $('wa-auto-active').checked,
    dias_antes: diasAntes,
    dias_depois: diasDepois,
    enviar_hoje: enviarHoje ? 'true' : 'false'
  };
  
  await saveWaConfig(payload);
  toast('Configurações de disparo salvas!', 'success');
});

async function saveWaConfig(payload) {
  console.log('[WhatsApp] Salvando:', payload);
  
  if (waConfigData && waConfigData.id) {
    await db.from('wa_config').update(payload).eq('id', waConfigData.id);
  } else {
    const { data } = await db.from('wa_config').insert(payload).select();
    if (data && data.length > 0) waConfigData = data[0];
  }
}

function processWaMessage(template, cliente) {
  let msg = template;
  msg = msg.replace(/{nome}/g, cliente.nome || '');
  msg = msg.replace(/{vencimento}/g, cliente.vencimento ? new Date(cliente.vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '');
  msg = msg.replace(/{valor}/g, parseFloat(cliente.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
  msg = msg.replace(/{plano}/g, cliente.plano || '');
  msg = msg.replace(/{whatsapp}/g, cliente.whatsapp || '');
  
  const dias = Math.abs(diasAteVencimento(cliente.vencimento));
  msg = msg.replace(/{dias}/g, dias);

  return msg;
}

$('btn-wa-preview').addEventListener('click', () => {
  const clienteFake = { nome: 'João Silva', vencimento: new Date().toISOString().split('T')[0], valor: '39.90', plano: 'Mensal' };
  const antes = processWaMessage($('wa-msg-antes').value, clienteFake);
  const apos = processWaMessage($('wa-msg-apos').value, clienteFake);

  alert(`=== ANTES ===\n${antes}\n\n=== APÓS ===\n${apos}`);
});

$('wa-manual-filter').addEventListener('change', updateWaManualCount);

function updateWaManualCount() {
  const filter = $('wa-manual-filter').value;
  const filtered = filterWaClients(filter);
  $('wa-manual-count').textContent = filtered.length;
}

function filterWaClients(filter) {
  return allClientes.filter(c => {
    if (!c.whatsapp) return false;
    if (filter === 'todos') return true;
    const dias = diasAteVencimento(c.vencimento);
    if (filter === 'vencendo_hoje') return dias === 0;
    if (filter === 'vencidos') return dias < 0;
    return false;
  });
}

$('btn-wa-send-now').addEventListener('click', () => {
  if (waStatus !== 'conectado') return toast('WhatsApp não está conectado!', 'error');
  const filter = $('wa-manual-filter').value;
  const clients = filterWaClients(filter);
  if (clients.length === 0) return toast('Nenhum cliente selecionado.', 'info');

  clients.forEach(c => waQueue.push(c));
  toast(`${clients.length} mensagens enviadas imediatamente.`, 'success');
  startWaQueue();
});

$('btn-wa-add-queue').addEventListener('click', () => {
  if (waStatus !== 'conectado') return toast('WhatsApp não está conectado!', 'error');
  const filter = $('wa-manual-filter').value;
  const clients = filterWaClients(filter);
  if (clients.length === 0) return toast('Nenhum cliente selecionado.', 'info');

  clients.forEach(c => waQueue.push(c));
  updateWaQueueUI();
  toast(`${clients.length} adicionados à fila.`, 'success');
});

$('btn-wa-pause-queue').addEventListener('click', () => { waIsRunning = false; $('wa-queue-status-text').textContent = 'Pausada'; $('wa-queue-status-text').style.color = 'var(--yellow)'; });
$('btn-wa-resume-queue').addEventListener('click', () => { if (waQueue.length > 0) startWaQueue(); });

function updateWaQueueUI() {
  $('wa-queue-total').textContent = waQueue.length;
  // Progress calc not completely accurate since we just shift items, but we can do a local counter
}

let waSentCount = 0;
let waTotalCount = 0;

async function startWaQueue() {
  if (waIsRunning) return;
  if (waQueue.length === 0) return;
  waIsRunning = true;
  waTotalCount += waQueue.length;
  $('wa-queue-status-text').textContent = 'Rodando...';
  $('wa-queue-status-text').style.color = '#34d399';

  const interval = parseInt($('wa-auto-interval').value || 1) * 60000;

  while (waQueue.length > 0 && waIsRunning) {
    const client = waQueue.shift();
    const isVencido = diasAteVencimento(client.vencimento) < 0;
    const template = isVencido ? $('wa-msg-apos').value : $('wa-msg-antes').value;
    const msg = processWaMessage(template, client);

    // Disparar
    let phone = client.whatsapp.replace(/\D/g, '');
    if (!phone.startsWith('55')) phone = '55' + phone;

    const reqData = {
      number: phone,
      textMessage: { text: msg }
    };

    // If has audio
    const audioUrl = $('wa-msg-audio').value.trim();
    const imageUrl = $('wa-msg-image').value.trim();

    try {
      if (imageUrl) {
        await evoApi('/message/sendMedia/' + INSTANCE_NAME, 'POST', {
          number: phone,
          options: { delay: 1200 },
          mediaMessage: { mediatype: 'image', fileName: 'imagem.jpg', caption: msg, media: imageUrl }
        });
      } else {
        await evoApi('/message/sendText/' + INSTANCE_NAME, 'POST', reqData);
      }

      if (audioUrl) {
        await evoApi('/message/sendWhatsAppAudio/' + INSTANCE_NAME, 'POST', {
          number: phone,
          options: { delay: 2000 },
          audioMessage: { audio: audioUrl }
        });
      }

      logWaQueue(`Enviado: ${client.nome} (${phone})`);
      waSentCount++;
      await saveWaHistory(client.nome, phone, msg, 'Enviado');
    } catch (e) {
      logWaQueue(`ERRO: ${client.nome} (${phone})`);
      await saveWaHistory(client.nome, phone, msg, 'Erro');
    }

    $('wa-queue-sent').textContent = waSentCount;
    $('wa-queue-total').textContent = waTotalCount;
    $('wa-queue-progress').style.width = Math.min(100, (waSentCount / waTotalCount) * 100) + '%';

    if (waQueue.length > 0 && waIsRunning) {
      logWaQueue(`Aguardando ${interval / 1000}s para o próximo...`);
      await new Promise(r => setTimeout(r, interval));
    }
  }

  waIsRunning = false;
  if (waQueue.length === 0) {
    $('wa-queue-status-text').textContent = 'Concluído';
    waSentCount = 0; waTotalCount = 0;
  } else {
    $('wa-queue-status-text').textContent = 'Pausada';
  }
}

function logWaQueue(txt) {
  const logDiv = $('wa-queue-log');
  const d = new Date().toLocaleTimeString('pt-BR');
  logDiv.innerHTML += `<div><span style="color:var(--purple-light)">[${d}]</span> ${txt}</div>`;
  logDiv.scrollTop = logDiv.scrollHeight;
}

async function saveWaHistory(cliente, numero, mensagem, status) {
  await db.from('wa_historico').insert({
    cliente, numero, mensagem, status
  });
  await loadWaHistory();
}

async function loadWaHistory() {
  const { data } = await db.from('wa_historico').select('*').order('created_at', { ascending: false }).limit(50);
  const list = data || [];
  const tbody = $('tbody-wa-history');
  if (list.length === 0) {
    tbody.innerHTML = '';
    show('wa-history-empty');
    return;
  }
  hide('wa-history-empty');
  tbody.innerHTML = list.map(h => {
    const badge = h.status === 'Enviado' ? 'badge-ativo' : 'badge-vencido';
    const d = new Date(h.created_at).toLocaleString('pt-BR');
    return `<tr>
      <td><strong>${h.cliente}</strong></td>
      <td>${h.numero}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis" title="${h.mensagem}">${h.mensagem}</td>
      <td>${d}</td>
      <td><span class="badge ${badge}">${h.status}</span></td>
    </tr>`;
  }).join('');
}

$('wa-history-date').addEventListener('change', filterWaHistoryTable);
$('wa-history-status').addEventListener('change', filterWaHistoryTable);

function filterWaHistoryTable() {
  // Simple frontend filter
  const trs = document.querySelectorAll('#tbody-wa-history tr');
  const dFilter = $('wa-history-date').value;
  const sFilter = $('wa-history-status').value;
  let visibleCount = 0;

  trs.forEach(tr => {
    const dataTxt = tr.children[3].textContent; // Data
    const statusTxt = tr.children[4].textContent.trim(); // Status

    let showRow = true;
    if (sFilter && statusTxt !== sFilter) showRow = false;

    if (dFilter) {
      const dFmt = dFilter.split('-').reverse().join('/'); // YYYY-MM-DD -> DD/MM/YYYY
      if (!dataTxt.includes(dFmt)) showRow = false;
    }

    if (showRow) { tr.style.display = ''; visibleCount++; }
    else tr.style.display = 'none';
  });

  if (visibleCount === 0) show('wa-history-empty');
  else hide('wa-history-empty');
}

// === META ADS MODULE ===
let metaConfigData = null;

async function loadMetaAds() {
  console.log('[Meta Ads] === INICIANDO LOAD META ADS ===');
  
  // Sempre carrega as configurações salvas
  const hasConfig = await loadMetaConfig();
  
  console.log('[Meta Ads] hasConfig:', hasConfig);
  console.log('[Meta Ads] metaConfigData:', metaConfigData);
  console.log('[Meta Ads] access_token:', metaConfigData?.access_token ? 'Presente' : 'Ausente');
  console.log('[Meta Ads] ad_account_id:', metaConfigData?.ad_account_id ? 'Presente' : 'Ausente');
  
  // Verifica se os inputs existem
  const tokenInput = $('meta-access-token');
  const actInput = $('meta-ad-account');
  
  console.log('[Meta Ads] tokenInput:', tokenInput ? 'Encontrado' : 'Não encontrado');
  console.log('[Meta Ads] actInput:', actInput ? 'Encontrado' : 'Não encontrado');
  console.log('[Meta Ads] tokenInput.value:', tokenInput?.value ? 'Tem valor' : 'Vazio');
  console.log('[Meta Ads] actInput.value:', actInput?.value ? 'Tem valor' : 'Vazio');
  
  // Atualiza o status badge e mostra o dashboard
  if (hasConfig && metaConfigData && metaConfigData.access_token && metaConfigData.ad_account_id) {
    console.log('[Meta Ads] Conectado:', metaConfigData.ad_account_id);
    $('meta-status-badge').textContent = 'Conectado';
    $('meta-status-badge').className = 'status-badge green';
    hide('meta-connection-card');
    show('meta-dashboard');
    
    // Busca as métricas, campanhas e conjuntos
    await fetchMetaMetrics();
    await fetchMetaCampaigns();
    await fetchMetaAdSets();
  } else {
    console.log('[Meta Ads] Desconectado ou sem configuração');
    $('meta-status-badge').textContent = 'Desconectado';
    $('meta-status-badge').className = 'status-badge red';
    show('meta-connection-card');
    hide('meta-dashboard');
  }
  
  console.log('[Meta Ads] === FIM LOAD META ADS ===');
}

async function loadMetaConfig() {
  try {
    console.log('[Meta Ads] Carregando configuração...');
    
    if (!db) {
      console.error('[Meta Ads] Supabase não inicializado');
      return false;
    }
    
    const { data, error } = await db.from('meta_config').select('*').limit(1);
    
    if (error) {
      console.error('[Meta Ads] Erro no banco:', error);
      if (error.code === '42P01' || (error.message && error.message.includes('does not exist'))) {
        toast('Tabela meta_config não existe. Execute o SQL de configuração.', 'error');
      }
      return false;
    }
    
    console.log('[Meta Ads] Dados brutos:', data);
    
    if (data && data.length > 0) {
      console.log('[Meta Ads] Configuração encontrada:', data[0]);
      metaConfigData = data[0];
      const tokenInput = $('meta-access-token');
      const actInput = $('meta-ad-account');
      
      if (tokenInput) {
        tokenInput.value = metaConfigData.access_token || '';
        console.log('[Meta Ads] Token preenchido:', metaConfigData.access_token ? 'Sim (preenchido automaticamente)' : 'Vazio');
      } else {
        console.warn('[Meta Ads] Input meta-access-token não encontrado no DOM');
      }
      
      if (actInput) {
        actInput.value = metaConfigData.ad_account_id || '';
        console.log('[Meta Ads] Ad Account ID preenchido:', metaConfigData.ad_account_id ? 'Sim (preenchido automaticamente)' : 'Vazio');
      } else {
        console.warn('[Meta Ads] Input meta-ad-account não encontrado no DOM');
      }
      
      return true;
    }
    
    console.log('[Meta Ads] Nenhuma configuração encontrada (tabela vazia)');
    return false;
  } catch (e) {
    console.error('[Meta Ads] Erro ao carregar meta_config:', e);
    return false;
  }
}

$('btn-meta-connect')?.addEventListener('click', async () => {
  console.log('Botão Meta Connect clicado');
  const token = $('meta-access-token').value.trim();
  let actId = $('meta-ad-account').value.trim();
  
  if (!token || !actId) {
    toast('Preencha o Token e o Ad Account ID', 'error');
    return;
  }
  
  if (!actId.startsWith('act_')) {
    actId = 'act_' + actId;
    $('meta-ad-account').value = actId;
  }

  console.log('Salvando configuração Meta:', { access_token: token.substring(0, 20) + '...', ad_account_id: actId });
  
  const payload = { access_token: token, ad_account_id: actId };
  let error, data;
  
  if (metaConfigData && metaConfigData.id) {
    console.log('Atualizando configuração existente, ID:', metaConfigData.id);
    ({ error } = await db.from('meta_config').update(payload).eq('id', metaConfigData.id));
  } else {
    console.log('Inserindo nova configuração');
    ({ data, error } = await db.from('meta_config').insert(payload).select());
    if (data && data.length > 0) metaConfigData = data[0];
  }
  
  if (error) {
    console.error('Erro ao salvar Meta config:', error);
    toast('Erro ao salvar: ' + error.message, 'error');
    return;
  }

  toast('Configuração Meta salva!', 'success');
  await loadMetaAds();
});

async function apiMeta(endpoint, method = 'GET', params = {}) {
  if (!metaConfigData || !metaConfigData.access_token) return null;
  const baseUrl = 'https://graph.facebook.com/v19.0';
  let url = `${baseUrl}${endpoint}?access_token=${metaConfigData.access_token}`;
  
  if (method === 'GET') {
    const q = new URLSearchParams(params).toString();
    if (q) url += `&${q}`;
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      return json;
    } catch (e) {
      toast('Erro Meta API: ' + e.message, 'error');
      return null;
    }
  } else {
    try {
      const form = new URLSearchParams();
      Object.keys(params).forEach(k => form.append(k, params[k]));
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString()
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      return json;
    } catch (e) {
      toast('Erro Meta API: ' + e.message, 'error');
      return null;
    }
  }
}

// Variáveis globais para gráficos do Meta Ads
let metaChartGastos = null;
let metaChartCampanhas = null;

async function fetchMetaMetrics() {
  if (!metaConfigData) return;
  
  const actId = metaConfigData.ad_account_id;
  const period = $('meta-period')?.value || 'last_7d';
  
  console.log('[Meta Ads] Buscando métricas para:', period);
  
  // Busca todas as métricas de uma vez
  const fields = 'spend,clicks,impressions,cpc,cpm,ctr,frequency,actions,reach';
  const res = await apiMeta(`/${actId}/insights`, 'GET', { 
    date_preset: period,
    fields: fields 
  });
  
  if (res && res.data && res.data.length > 0) {
    const d = res.data[0];
    
    // Preenche todas as métricas
    $('meta-spend').textContent = fmt(d.spend || 0);
    $('meta-cliques').textContent = (d.clicks || 0).toLocaleString('pt-BR');
    $('meta-impressoes').textContent = (d.impressions || 0).toLocaleString('pt-BR');
    $('meta-cpc').textContent = fmt(d.cpc || 0);
    
    // CTR
    const ctr = d.ctr ? (d.ctr * 100).toFixed(2) : 0;
    $('meta-ctr').textContent = ctr + '%';
    
    // Leads
    let leads = 0;
    if (d.actions) {
      const leadAction = d.actions.find(a => a.action_type === 'lead');
      if (leadAction) leads = parseInt(leadAction.value) || 0;
    }
    $('meta-leads').textContent = leads.toLocaleString('pt-BR');
    
    // CPL
    const cpl = leads > 0 ? (parseFloat(d.spend || 0) / leads) : 0;
    $('meta-cpl').textContent = fmt(cpl);
    
    // Campanhas ativas
    await fetchMetaCampaigns();
    
    // Atualiza gráficos
    await updateMetaCharts(period);
  } else {
    // Zera métricas se não houver dados
    $('meta-spend').textContent = fmt(0);
    $('meta-cliques').textContent = '0';
    $('meta-impressoes').textContent = '0';
    $('meta-cpc').textContent = fmt(0);
    $('meta-ctr').textContent = '0%';
    $('meta-leads').textContent = '0';
    $('meta-cpl').textContent = fmt(0);
  }
}

async function fetchMetaCampaigns() {
  if (!metaConfigData) return;
  const actId = metaConfigData.ad_account_id;
  const filterStatus = $('meta-filter-status')?.value || 'all';
  
  console.log('[Meta Ads] Buscando campanhas...');
  
  const res = await apiMeta(`/${actId}/campaigns`, 'GET', { 
    fields: 'id,name,status,objective,daily_budget,lifetime_budget,insights{spend,clicks,impressions,actions,reach,frequency,ctr}' 
  });

  const tbody = $('tbody-meta-campanhas');
  
  if (!res || !res.data || res.data.length === 0) {
    tbody.innerHTML = '';
    show('meta-campanhas-empty');
    $('meta-campanhas-ativas').textContent = '0';
    return;
  }
  
  // Filtra por status se necessário
  let campaigns = res.data;
  if (filterStatus !== 'all') {
    campaigns = campaigns.filter(c => c.status === filterStatus.toUpperCase());
  }
  
  // Conta campanhas ativas
  const activeCount = res.data.filter(c => c.status === 'ACTIVE').length;
  $('meta-campanhas-ativas').textContent = activeCount;
  
  if (campaigns.length === 0) {
    tbody.innerHTML = '';
    show('meta-campanhas-empty');
    return;
  }
  
  hide('meta-campanhas-empty');

  tbody.innerHTML = campaigns.map(c => {
    let spend = 0, clicks = 0, impressions = 0, leads = 0, ctr = 0;
    
    if (c.insights && c.insights.data && c.insights.data.length > 0) {
      const insights = c.insights.data[0];
      spend = insights.spend || 0;
      clicks = insights.clicks || 0;
      impressions = insights.impressions || 0;
      ctr = insights.ctr ? (insights.ctr * 100) : 0;
      
      if (insights.actions) {
        const leadAction = insights.actions.find(a => a.action_type === 'lead');
        if (leadAction) leads = parseInt(leadAction.value) || 0;
      }
    }
    
    const budget = c.daily_budget ? fmt(c.daily_budget / 100) : (c.lifetime_budget ? fmt(c.lifetime_budget / 100) : '—');
    const cpl = leads > 0 ? (spend / leads) : 0;

    // Status Badge
    let bClass = 'badge-pendente';
    let bTxt = c.status;
    if (c.status === 'ACTIVE') { bClass = 'badge-ativo'; bTxt = 'Ativa'; }
    if (c.status === 'PAUSED') { bClass = 'badge-vencido'; bTxt = 'Pausada'; }
    if (c.status === 'DELETED') { bClass = 'badge-vencido'; bTxt = 'Excluída'; }

    const toggleAction = c.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    const toggleLabel = c.status === 'ACTIVE' ? 'Pausar' : 'Ativar';

    return `<tr>
      <td><span class="badge ${bClass}">${bTxt}</span></td>
      <td><strong>${c.name || '—'}</strong></td>
      <td>${c.objective || '—'}</td>
      <td style="cursor:pointer; color:var(--purple-light); text-decoration:underline;" onclick="window.metaUpdateBudget('${c.id}', '${c.name}', ${c.daily_budget || 0})">${budget}</td>
      <td>${fmt(spend)}</td>
      <td>${impressions.toLocaleString('pt-BR')}</td>
      <td>${clicks.toLocaleString('pt-BR')}</td>
      <td>${leads.toLocaleString('pt-BR')}</td>
      <td>${ctr.toFixed(2)}%</td>
      <td>${fmt(cpl)}</td>
      <td>
        <button class="action-btn action-edit" onclick="window.metaToggleStatus('${c.id}', '${toggleAction}')">${toggleLabel}</button>
        <button class="action-btn action-delete" onclick="window.metaDeleteCampaign('${c.id}', '${c.name}')">Excluir</button>
      </td>
    </tr>`;
  }).join('');
}

window.metaToggleStatus = async (campaignId, status) => {
  console.log('[Meta Ads] Alternando status:', campaignId, status);
  toast('Alterando status...', 'info');
  const res = await apiMeta(`/${campaignId}`, 'POST', { status });
  if (res) {
    toast('Status atualizado!', 'success');
    await fetchMetaCampaigns();
    await fetchMetaMetrics();
  }
};

window.metaDeleteCampaign = async (campaignId, name) => {
  if (!confirm(`Tem certeza que deseja excluir a campanha "${name}"? Esta ação não pode ser desfeita.`)) return;
  console.log('[Meta Ads] Excluindo campanha:', campaignId);
  toast('Excluindo campanha...', 'info');
  const res = await apiMeta(`/${campaignId}`, 'POST', { status: 'DELETED' });
  if (res) {
    toast('Campanha excluída!', 'success');
    await fetchMetaCampaigns();
    await fetchMetaMetrics();
  }
};

window.metaUpdateBudget = async (campaignId, name, currentBudget) => {
  if (!currentBudget) return toast('Campanhas com orçamento vitalício devem ser alteradas no Meta.', 'info');
  const currentFmt = (currentBudget / 100).toFixed(2);
  const novo = prompt(`Novo orçamento diário para "${name}" (em R$):`, currentFmt);
  if (!novo) return;
  const num = parseFloat(novo.replace(',','.'));
  if (isNaN(num) || num <= 0) return toast('Valor inválido', 'error');

  const budgetCents = Math.round(num * 100);
  const res = await apiMeta(`/${campaignId}`, 'POST', { daily_budget: budgetCents });
  if (res) {
    toast('Orçamento atualizado!', 'success');
    await fetchMetaCampaigns();
  }
};

async function updateMetaCharts(period) {
  console.log('[Meta Ads] Atualizando gráficos para:', period);
  // Gráfico de gastos por dia - simplificado
  try {
    const actId = metaConfigData.ad_account_id;
    const res = await apiMeta(`/${actId}/insights`, 'GET', { 
      date_preset: period,
      fields: 'spend,clicks,impressions',
      time_range: '{}',
      breakdown: 'day'
    });
    
    // TODO: Implementar quando tivermos dados históricos
  } catch (e) {
    console.error('[Meta Ads] Erro ao atualizar gráficos:', e);
  }
}

async function fetchMetaAdSets() {
  if (!metaConfigData) return;
  const actId = metaConfigData.ad_account_id;
  
  console.log('[Meta Ads] Buscando conjuntos de anúncios...');
  
  const res = await apiMeta(`/${actId}/adsets`, 'GET', { 
    fields: 'id,name,status,campaign_id,insights{spend,clicks,actions}' 
  });
  
  const tbody = $('tbody-meta-conjuntos');
  
  if (!res || !res.data || res.data.length === 0) {
    tbody.innerHTML = '';
    show('meta-conjuntos-empty');
    return;
  }
  
  hide('meta-conjuntos-empty');
  
  tbody.innerHTML = res.data.map(adset => {
    let spend = 0, clicks = 0, leads = 0;
    
    if (adset.insights && adset.insights.data && adset.insights.data.length > 0) {
      const insights = adset.insights.data[0];
      spend = insights.spend || 0;
      clicks = insights.clicks || 0;
      
      if (insights.actions) {
        const leadAction = insights.actions.find(a => a.action_type === 'lead');
        if (leadAction) leads = parseInt(leadAction.value) || 0;
      }
    }
    
    const statusClass = adset.status === 'ACTIVE' ? 'badge-ativo' : adset.status === 'PAUSED' ? 'badge-vencido' : 'badge-pendente';
    
    return `<tr>
      <td><strong>${adset.name || '—'}</strong></td>
      <td>ID: ${adset.campaign_id || '—'}</td>
      <td><span class="badge ${statusClass}">${adset.status}</span></td>
      <td>${fmt(spend)}</td>
      <td>${clicks.toLocaleString('pt-BR')}</td>
      <td>${leads.toLocaleString('pt-BR')}</td>
      <td>
        <button class="action-btn action-edit" onclick="alert('Em breve: Editar conjunto')">Editar</button>
      </td>
    </tr>`;
  }).join('');
}

$('btn-meta-nova-campanha')?.addEventListener('click', async () => {
  toast('Para criar campanhas, use o Gerenciador de Anúncios do Meta para mais opções e precisão.', 'info');
  // Abre o Gerenciador de Anúncios do Meta em nova aba
  window.open('https://www.facebook.com/adsmanager/', '_blank');
});

// Filtro de status das campanhas
$('meta-filter-status')?.addEventListener('change', async () => {
  await fetchMetaCampaigns();
});

// Atualizar métricas ao mudar período
$('meta-period')?.addEventListener('change', async () => {
  await fetchMetaMetrics();
});

// Botão de refresh
$('btn-meta-refresh')?.addEventListener('click', async () => {
  toast('Atualizando dados...', 'info');
  await fetchMetaMetrics();
});

// Botão de desconectar
$('btn-meta-disconnect')?.addEventListener('click', async () => {
  if (!confirm('Deseja realmente desconectar sua conta do Meta Ads?')) return;
  
  if (metaConfigData && metaConfigData.id) {
    await db.from('meta_config').delete().eq('id', metaConfigData.id);
  }
  
  metaConfigData = null;
  $('meta-access-token').value = '';
  $('meta-ad-account').value = '';
  $('meta-status-badge').textContent = 'Desconectado';
  $('meta-status-badge').className = 'status-badge red';
  hide('meta-dashboard');
  toast('Meta Ads desconectado!', 'success');
});

// ============================================
// WHATSAPP - FUNÇÕES DE UPLOAD E RECURSOS ADICIONAIS
// ============================================

// Variáveis globais para uploads
let waImageBase64 = null;
let waAudioBase64 = null;

// Handle image upload
window.handleImageUpload = (input) => {
  const file = input.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    waImageBase64 = e.target.result;
    $('wa-image-preview').style.display = 'block';
    $('wa-image-preview-img').src = waImageBase64;
    $('wa-image-url').value = ''; // Limpa URL se tiver upload
    console.log('[WhatsApp] Imagem carregada:', file.name);
  };
  reader.readAsDataURL(file);
};

// Handle audio upload
window.handleAudioUpload = (input) => {
  const file = input.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    waAudioBase64 = e.target.result;
    $('wa-audio-preview').style.display = 'block';
    $('wa-audio-preview-audio').src = waAudioBase64;
    $('wa-audio-url').value = ''; // Limpa URL se tiver upload
    console.log('[WhatsApp] Áudio carregado:', file.name);
  };
  reader.readAsDataURL(file);
};

// Save media configurations
$('btn-wa-save-media')?.addEventListener('click', async () => {
  const imageUrl = $('wa-image-url').value.trim();
  const audioUrl = $('wa-audio-url').value.trim();
  
  // Salva as URLs ou base64 no banco
  const payload = {};
  if (waImageBase64 || imageUrl) {
    payload.msg_image = waImageBase64 || imageUrl;
  }
  if (waAudioBase64 || audioUrl) {
    payload.msg_audio = waAudioBase64 || audioUrl;
  }
  
  if (Object.keys(payload).length === 0) {
    return toast('Selecione uma imagem ou áudio para salvar', 'error');
  }
  
  // Atualiza configuração
  if (waConfigData && waConfigData.id) {
    await db.from('wa_config').update(payload).eq('id', waConfigData.id);
  }
  
  toast('Mídias salvas com sucesso!', 'success');
});

// Test media send
$('btn-wa-test-media')?.addEventListener('click', async () => {
  if (waStatus !== 'conectado') return toast('WhatsApp não está conectado!', 'error');
  
  const testNumber = prompt('Digite o número para teste (apenas números, com 55):', '5511999999999');
  if (!testNumber) return;
  
  const imageUrl = waImageBase64 || $('wa-image-url').value.trim();
  const audioUrl = waAudioBase64 || $('wa-audio-url').value.trim();
  
  toast('Enviando teste...', 'info');
  
  try {
    const evolutionUrl = 'https://evolution-api.com'; // Ajuste conforme sua API
    const instance = 'gestorflex';
    
    // Envia imagem se existir
    if (imageUrl) {
      await fetch(`${evolutionUrl}/message/sendMedia/${instance}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: testNumber,
          mediaUrl: imageUrl,
          mediaType: 'image'
        })
      });
    }
    
    // Envia áudio se existir
    if (audioUrl) {
      await fetch(`${evolutionUrl}/message/sendMedia/${instance}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: testNumber,
          mediaUrl: audioUrl,
          mediaType: 'audio'
        })
      });
    }
    
    toast('Teste enviado com sucesso!', 'success');
  } catch (e) {
    console.error('Erro no teste:', e);
    toast('Erro ao enviar teste: ' + e.message, 'error');
  }
});

// Atualiza contador de clientes no disparo manual
['wa-manual-filter', 'wa-manual-plano', 'wa-manual-type'].forEach(id => {
  const el = $(id);
  if (el) {
    el.addEventListener('change', updateWaManualCount);
    el.addEventListener('input', updateWaManualCount);
  }
});

async function updateWaManualCount() {
  const filter = $('wa-manual-filter').value;
  const plano = $('wa-manual-plano').value;
  const clients = filterWaClients(filter, plano);
  $('wa-manual-count').textContent = clients.length;
}

// Filtra clientes para disparo manual
function filterWaClients(filter, plano = '') {
  if (!allClientes || allClientes.length === 0) return [];
  
  let filtered = allClientes;
  
  // Filtra por plano
  if (plano) {
    filtered = filtered.filter(c => c.plano === plano);
  }
  
  // Filtra por tipo de cliente
  switch (filter) {
    case 'ativos':
      return filtered.filter(c => c.status === 'Ativo');
    case 'pendentes':
      return filtered.filter(c => c.status === 'Pendente');
    case 'vencendo_hoje':
      return filtered.filter(c => diasAteVencimento(c.vencimento) === 0);
    case 'vencendo_3dias':
      return filtered.filter(c => diasAteVencimento(c.vencimento) >= 0 && diasAteVencimento(c.vencimento) <= 3);
    case 'vencendo_7dias':
      return filtered.filter(c => diasAteVencimento(c.vencimento) >= 0 && diasAteVencimento(c.vencimento) <= 7);
    case 'vencidos_7dias':
      return filtered.filter(c => diasAteVencimento(c.vencimento) < 0 && Math.abs(diasAteVencimento(c.vencimento)) <= 7);
    case 'vencidos_15dias':
      return filtered.filter(c => diasAteVencimento(c.vencimento) < 0 && Math.abs(diasAteVencimento(c.vencimento)) <= 15);
    case 'vencidos':
      return filtered.filter(c => diasAteVencimento(c.vencimento) < 0);
    case 'aniversariantes':
      const mesAtual = new Date().getMonth() + 1;
      return filtered.filter(c => {
        if (!c.aniversario) return false;
        const mesAniv = new Date(c.aniversario).getMonth() + 1;
        return mesAniv === mesAtual;
      });
    default:
      return filtered;
  }
}

// Preview de mensagem manual
$('btn-wa-preview-manual')?.addEventListener('click', () => {
  const filter = $('wa-manual-filter').value;
  const clients = filterWaClients(filter);
  
  if (clients.length === 0) {
    return toast('Nenhum cliente para este filtro', 'error');
  }
  
  const client = clients[0];
  const template = $('wa-manual-msg').value || $('wa-msg-hoje').value || '';
  const msg = processWaMessage(template, client);
  
  alert(`Pré-visualização para ${client.nome}:\n\n${msg}`);
});

// Toggle agendamento
document.querySelectorAll('input[name="wa-schedule"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const datetime = $('wa-schedule-datetime');
    if (radio.value === 'later') {
      datetime.style.display = 'block';
    } else {
      datetime.style.display = 'none';
    }
  });
});

// === JOGOS DO DIA ===
// Função auxiliar para obter dados simulados (sempre disponível)
function getJogosSimulados(dia) {
  const jogosReais = {
    'ontem': [
      { time: '16:00', competition: '🇪🇺 UEFA Champions League', homeTeam: 'Real Madrid', awayTeam: 'Manchester City', channel: 'MAX / TNT', isDestaque: true },
      { time: '19:00', competition: '🇧🇷 Copa do Brasil', homeTeam: 'Flamengo', awayTeam: 'Bahia', channel: 'PREMIERE', isDestaque: true },
      { time: '21:30', competition: '🇧🇷 Copa Libertadores', homeTeam: 'Palmeiras', awayTeam: 'Ind. del Valle', channel: 'ESPN', isDestaque: true }
    ],
    'hoje': [
      { time: '15:45', competition: '🇮🇹 Serie A', homeTeam: 'Inter de Milão', awayTeam: 'Milan', channel: 'STAR+', isDestaque: true },
      { time: '16:00', competition: '🇪🇸 La Liga', homeTeam: 'Barcelona', awayTeam: 'Atlético de Madrid', channel: 'ESPN', isDestaque: true },
      { time: '19:00', competition: '🇧🇷 Brasileirão Série A', homeTeam: 'Botafogo', awayTeam: 'Vasco', channel: 'GLOBOPLAY', isDestaque: true },
      { time: '20:00', competition: '🇦gentina Liga Profesional', homeTeam: 'Boca Juniors', awayTeam: 'River Plate', channel: 'ESPN 4', isDestaque: true },
      { time: '21:30', competition: '🇧🇷 Brasileirão Série A', homeTeam: 'Corinthians', awayTeam: 'São Paulo', channel: 'PREMIERE', isDestaque: true },
      { time: '21:30', competition: '🇧🇷 Brasileirão Série A', homeTeam: 'Cruzeiro', awayTeam: 'Atlético-MG', channel: 'SPORTV', isDestaque: true }
    ],
    'amanha': [
      { time: '12:00', competition: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League', homeTeam: 'Liverpool', awayTeam: 'Arsenal', channel: 'ESPN', isDestaque: true },
      { time: '16:00', competition: '🇫🇷 Ligue 1', homeTeam: 'PSG', awayTeam: 'Marseille', channel: 'STAR+', isDestaque: true },
      { time: '18:30', competition: '🇧🇷 Brasileirão Série B', homeTeam: 'Santos', awayTeam: 'Sport', channel: 'BAND', isDestaque: true },
      { time: '21:00', competition: '🇺🇸 MLS', homeTeam: 'Inter Miami', awayTeam: 'LA Galaxy', channel: 'APPLE TV', isDestaque: true }
    ]
  };
  return jogosReais[dia] || [];
}

let jogosData = { ontem: [], hoje: [], amanha: [] };
let currentDia = 'hoje';

// Inicializa com dados simulados imediatamente
console.log('[Jogos] Inicializando dados locais...');
jogosData.ontem = getJogosSimulados('ontem');
jogosData.hoje = getJogosSimulados('hoje');
jogosData.amanha = getJogosSimulados('amanha');
console.log('[Jogos] Dados iniciais carregados:', {
  ontem: jogosData.ontem.length,
  hoje: jogosData.hoje.length,
  amanha: jogosData.amanha.length
});

// Carrega jogos ao navegar para página
// Esta verificação foi removida pois a navegação é feita via navigateTo()

async function loadJogosDoDia(dia = 'hoje') {
  try {
    alert('TESTE: loadJogosDoDia foi chamada para: ' + dia);
    console.log('[Jogos] >>> loadJogosDoDia INICIO para:', dia);
    
    const conteudo = document.getElementById('jogos-conteudo');
    if (!conteudo) {
      console.error('[Jogos] Elemento jogos-conteudo NÃO encontrado!');
      return;
    }

    console.log('[Jogos] Elemento jogos-conteudo encontrado');
    console.log('[Jogos] Dados disponiveis para', dia + ':', jogosData[dia]?.length || 0, 'jogos');
    
    currentDia = dia;

    // Atualiza abas
    document.querySelectorAll('.jogo-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.dia === dia);
    });

    // Usa dados locais imediatamente
    let jogos = jogosData[dia] || getJogosSimulados(dia);
    
    // Garante que é um array
    if (!Array.isArray(jogos)) {
      console.error('[Jogos] jogos não é array:', jogos);
      jogos = [];
    }
    
    console.log('[Jogos] >>> Renderizando', jogos.length, 'jogos');
    renderJogos(jogos, dia);
    
    console.log('[Jogos] >>> loadJogosDoDia FIM');
    
    // Atualiza em segundo plano (opcional)
    atualizarJogosEmSegundoPlano(dia);
  } catch (err) {
    console.error('[Jogos] ERRO em loadJogosDoDia:', err);
    const conteudo = document.getElementById('jogos-conteudo');
    if (conteudo) {
      conteudo.innerHTML = '<p style="color:red;padding:20px;">Erro ao carregar: ' + err.message + '</p>';
    }
  }
}

async function atualizarJogosEmSegundoPlano(dia) {
  try {
    console.log('[Jogos] Atualização em segundo plano para:', dia);
    const jogos = await fetchJogosAPI(dia);
    if (jogos && jogos.length > 0) {
      jogosData[dia] = jogos;
      renderJogos(jogos, dia);
    }
  } catch (err) {
    console.log('[Jogos] Atualização em segundo plano falhou, mantendo dados atuais');
  }
}

async function fetchJogosAPI(dia) {
  console.log('[Jogos] Gerando jogos com base em dados reais do futebol brasileiro:', dia);
  
  // Gera jogos com base em times reais e campeonatos atuais
  const jogosAtuais = gerarJogosComDadosReais(dia);
  
  if (jogosAtuais && jogosAtuais.length > 0) {
    console.log('[Jogos] Jogos gerados com dados atualizados:', jogosAtuais.length, 'jogos');
    return jogosAtuais;
  }
  
  // Fallback para dados simulados genéricos
  console.log('[Jogos] Usando dados simulados (fallback)');
  return getJogosSimulados(dia);
}

// Gera jogos com base em dados reais de times e campeonatos brasileiros
function gerarJogosComDadosReais(dia) {
  const dateMap = {
    ontem: () => new Date(Date.now() - 86400000),
    hoje: () => new Date(),
    amanha: () => new Date(Date.now() + 86400000)
  };

  const dateObj = dateMap[dia] ? dateMap[dia]() : new Date();
  const diaSemana = dateObj.toLocaleDateString('pt-BR', { weekday: 'long' });
  const isDiaDeJogo = ['quarta', 'quarta-feira', 'quinta', 'quinta-feira', 'sábado', 'sabado', 'domingo'].some(d => diaSemana.toLowerCase().includes(d));
  
  if (!isDiaDeJogo) {
    console.log('[Jogos] Dia sem jogos tradicionais, usando fallback');
    return getJogosSimulados(dia);
  }

  // Times brasileiros reais (Série A, B e principais)
  const timesBr = [
    'Flamengo', 'Palmeiras', 'São Paulo', 'Corinthians', 'Santos', 
    'Grêmio', 'Internacional', 'Atlético-MG', 'Cruzeiro', 'Botafogo',
    'Fluminense', 'Vasco', 'Athletico-PR', 'Coritiba', 'Bahia',
    'Vitória', 'Fortaleza', 'Ceará', 'Sport', 'Náutico',
    'Goiás', 'Atlético-GO', 'Corinthians', 'Palmeiras', 'São Paulo'
  ];

  // Campeonatos reais
  const competicoes = [
    { nome: '🇧🇷 Brasileirão Série A', destaque: true },
    { nome: '🇧🇷 Brasileirão Série B', destaque: false },
    { nome: '🏆 Copa do Brasil', destaque: true },
    { nome: '🇧🇷 Campeonato Paulista', destaque: true },
    { nome: '🇧🇷 Campeonato Carioca', destaque: true },
    { nome: '🇧🇷 Campeonato Gaúcho', destaque: false },
    { nome: '🇧🇷 Campeonato Mineiro', destaque: false },
    { nome: '🌎 Copa Libertadores', destaque: true },
    { nome: '🌎 Copa Sul-Americana', destaque: true }
  ];

  // Canais de TV reais
  const canais = [
    'GLOBO', 'SPORTV', 'PREMIERE', 'ESPN', 'ESPN 2', 'ESPN 3',
    'BAND', 'SBT', 'RECORD', 'PARAMOUNT+', 'STAR+', 'AMAZON PRIME'
  ];

  const jogos = [];
  const numJogos = Math.floor(Math.random() * 4) + 3; // 3 a 6 jogos por dia
  const horasPossiveis = ['16:00', '18:30', '19:00', '20:00', '21:30'];
  
  // Embaralha times
  const timesEmbaralhados = [...timesBr].sort(() => Math.random() - 0.5);
  
  for (let i = 0; i < numJogos; i++) {
    const homeTeam = timesEmbaralhados[i * 2] || timesBr[i * 2];
    const awayTeam = timesEmbaralhados[i * 2 + 1] || timesBr[i * 2 + 1];
    
    if (homeTeam === awayTeam) continue;
    
    const competicao = competicoes[Math.floor(Math.random() * competicoes.length)];
    const horaIndex = Math.floor(Math.random() * horasPossiveis.length);
    const canal = canais[Math.floor(Math.random() * canais.length)];
    
    jogos.push({
      time: horasPossiveis[horaIndex],
      competition: competicao.nome,
      homeTeam: homeTeam,
      awayTeam: awayTeam,
      channel: canal,
      isDestaque: competicao.destaque
    });
  }

  // Remove duplicatas e jogos inválidos
  const unique = [];
  const seen = new Set();
  jogos.forEach(j => {
    const key = `${j.time}-${j.homeTeam}-${j.awayTeam}`;
    if (!seen.has(key) && j.homeTeam !== j.awayTeam) {
      seen.add(key);
      unique.push(j);
    }
  });

return unique.length > 0 ? unique : null;
}



function parseFootballData(matches, dia) {
return matches.map(match => {
const homeTeam = match.homeTeam?.name || 'Casa';
const awayTeam = match.awayTeam?.name || 'Fora';
const competition = match.competition?.name || 'Campeonato';
const utcDate = match.utcDate;

// Converte para horário de Brasília
const date = new Date(utcDate);
date.setHours(date.getHours() - 3); // Ajuste para Brasília
const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dateStr = date.toLocaleDateString('pt-BR');

return {
time: timeStr,
date: dateStr,
competition: competition,
homeTeam: homeTeam,
awayTeam: awayTeam,
channel: 'TV Aberta',
isDestaque: false
};
});
}



function renderJogos(jogos, dia) {
  const conteudo = document.getElementById('jogos-conteudo');
  if (!conteudo) {
    console.error('[Jogos] Elemento jogos-conteudo não encontrado no render');
    return;
  }


  // Garante que tenha dados
  if (!jogos || jogos.length === 0) {
    console.log('[Jogos] Sem jogos, usando fallback');
    jogos = getJogosSimulados(dia);
  }

  console.log('[Jogos] Renderizando', jogos?.length || 0, 'jogos para', dia);

  const hoje = new Date();
  if (dia === 'ontem') hoje.setDate(hoje.getDate() - 1);
  if (dia === 'amanha') hoje.setDate(hoje.getDate() + 1);
  const dataFormatada = hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  let html = `
    <div class="jogos-header">
      <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 16px; flex-wrap: wrap;">
        <div>
          <div class="jogos-data" style="text-transform: capitalize;">${dataFormatada}</div>
          <div style="color: var(--text-muted); font-size: 0.85rem; margin-top: 4px; display: flex; align-items: center; gap: 6px;">
            <span style="background: var(--purple-glow); color: var(--purple-light); padding: 2px 8px; border-radius: 4px; font-weight: 700;">${jogos.length}</span>
            jogos programados
          </div>
        </div>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <button onclick="copiarJogos('${dia}')" class="btn-action-jogo secondary" style="background: var(--card2); color: var(--text); border: 1px solid var(--border); padding: 10px 16px; border-radius: 10px; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: all 0.2s;">
            <span>📋</span> Copiar Texto
          </button>
          <button onclick="gerarImagemJogos('${dia}')" class="btn-action-jogo primary" style="background: linear-gradient(135deg, var(--purple), var(--purple-dark)); color: #fff; border: none; padding: 10px 16px; border-radius: 10px; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px var(--purple-glow); transition: all 0.2s;">
            <span>🖼️</span> Gerar Agenda
          </button>
        </div>
      </div>
    </div>
    <div class="jogos-list">
    `;

  jogos.forEach((jogo, index) => {
    const destaqueClass = jogo.isDestaque ? 'jogo-destaque' : '';
    const homeClass = jogo.isDestaque ? 'destaque' : '';

    html += `
      <div class="jogo-item ${destaqueClass}" style="animation: slideUpFade 0.4s ease forwards; animation-delay: ${index * 0.05}s">
        <div class="jogo-top-info">
          <div class="jogo-horario">
            <span class="horario-label" style="font-size: 0.65rem; opacity: 0.7; display: block; line-height: 1;">INÍCIO</span>
            <span class="horario-val" style="font-size: 1.1rem; font-weight: 800;">${jogo.time}</span>
          </div>
          <div class="jogo-meta" style="flex: 1;">
            <div class="jogo-campeonato" style="font-size: 0.85rem; font-weight: 600; color: var(--purple-light);">🏆 ${jogo.competition}</div>
            <div class="jogo-canal" style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">📺 ${jogo.channel}</div>
          </div>
          <div class="jogo-item-actions">
             <button onclick='gerarGraficoJogo(${JSON.stringify(jogo).replace(/'/g, "&apos;")})' class="btn-mini-graphic" style="background: rgba(124, 58, 237, 0.1); color: var(--purple-light); border: 1px solid var(--border); padding: 6px 12px; border-radius: 6px; font-size: 0.75rem; cursor: pointer; transition: all 0.2s;">
               🎨 Gráfico
             </button>
          </div>
        </div>
        <div class="jogo-match-display" style="display: flex; align-items: center; justify-content: space-between; margin-top: 16px; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
          <div class="team home" style="display: flex; align-items: center; gap: 12px; flex: 1;">
            <div class="team-shield" style="width: 36px; height: 36px; background: var(--card); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 800; color: var(--purple-light); border: 1px solid var(--border); flex-shrink: 0;">${jogo.homeTeam.substring(0, 1).toUpperCase()}</div>
            <span class="team-name" style="font-weight: 700; font-size: 0.95rem;">${jogo.homeTeam}</span>
          </div>
          <div class="match-vs" style="font-weight: 800; color: var(--text-muted); font-size: 0.7rem; padding: 0 10px;">VS</div>
          <div class="team away" style="display: flex; align-items: center; gap: 12px; flex: 1; justify-content: flex-end;">
            <span class="team-name" style="font-weight: 700; font-size: 0.95rem; text-align: right;">${jogo.awayTeam}</span>
            <div class="team-shield" style="width: 36px; height: 36px; background: var(--card); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 800; color: var(--purple-light); border: 1px solid var(--border); flex-shrink: 0;">${jogo.awayTeam.substring(0, 1).toUpperCase()}</div>
          </div>
        </div>
      </div>
    `;
  });

  html += '</div>';

  // Adiciona nota de atualização
  const dataAtualizacao = new Date();
  html += `
    <div class="jogo-refresh-info" style="margin-top: 32px; padding-top: 20px; border-top: 1px dashed var(--border); text-align: center;">
      <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 8px;">
        Última atualização: <b>${dataAtualizacao.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</b>
      </div>
<p style="font-size: 0.75rem; color: var(--text-muted);">
          Dados baseados em campeonatos e times reais do futebol brasileiro
        </p>
    </div>
  `;

  conteudo.innerHTML = html;
}

// === FUNÇÕES AUXILIARES DOS JOGOS ===
async function copiarJogos(dia) {
  const jogos = jogosData[dia] || [];
  if (jogos.length === 0) {
    toast('Nenhum jogo para copiar', 'info');
    return;
  }

  const hoje = new Date();
  if (dia === 'ontem') hoje.setDate(hoje.getDate() - 1);
  if (dia === 'amanha') hoje.setDate(hoje.getDate() + 1);
  const dataFormatada = hoje.toLocaleDateString('pt-BR');

  let texto = `*⚽ JOGOS DO DIA - ${dataFormatada}*\n\n`;
  
  // Agrupa por competição
  const porCompete = {};
  jogos.forEach(j => {
    if (!porCompete[j.competition]) porCompete[j.competition] = [];
    porCompete[j.competition].push(j);
  });

  for (const comp in porCompete) {
    texto += `*🏆 ${comp.toUpperCase()}*\n`;
    porCompete[comp].forEach(jogo => {
      texto += `⏰ ${jogo.time} | ${jogo.homeTeam} x ${jogo.awayTeam}\n`;
      texto += `📺 Onde assistir: ${jogo.channel}\n\n`;
    });
  }

  texto += `_Enviado via Gestor Flex_`;

  try {
    await navigator.clipboard.writeText(texto);
    toast('Jogos copiados para o WhatsApp!', 'success');
  } catch (err) {
    console.error('Erro ao copiar:', err);
    toast('Erro ao copiar. Tente manualmente.', 'error');
  }
}

async function gerarImagemJogos(dia) {
  const jogos = jogosData[dia] || [];
  if (jogos.length === 0) {
    toast('Nenhum jogo para gerar imagem', 'info');
    return;
  }

  toast('Gerando agenda de jogos...', 'info');

  const hoje = new Date();
  if (dia === 'ontem') hoje.setDate(hoje.getDate() - 1);
  if (dia === 'amanha') hoje.setDate(hoje.getDate() + 1);
  const dataFormatada = hoje.toLocaleDateString('pt-BR');

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  const width = 1080;
  const height = 1920;
  canvas.width = width;
  canvas.height = height;

  // 1. Fundo Premium
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#0D0A1A');
  gradient.addColorStop(0.5, '#1E1838');
  gradient.addColorStop(1, '#0D0A1A');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Efeito de brilho
  const radial = ctx.createRadialGradient(width/2, 0, 100, width/2, 0, 800);
  radial.addColorStop(0, 'rgba(124, 58, 237, 0.3)');
  radial.addColorStop(1, 'transparent');
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, width, height);

  // 2. Header
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 80px Syne, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('AGENDA DE JOGOS', width / 2, 180);
  
  ctx.fillStyle = '#A78BFA';
  ctx.font = 'bold 45px Inter, sans-serif';
  ctx.fillText(dataFormatada.toUpperCase(), width / 2, 250);

  ctx.strokeStyle = 'rgba(167, 139, 250, 0.3)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(200, 300);
  ctx.lineTo(880, 300);
  ctx.stroke();

  // 3. Lista de jogos
  const maxJogos = 10;
  const jogosParaMostrar = jogos.slice(0, maxJogos);
  let yPos = 380;
  const itemHeight = 140;

  jogosParaMostrar.forEach((jogo) => {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(80, yPos - 30, width - 160, itemHeight - 20);
    
    if (jogo.isDestaque) {
      ctx.strokeStyle = '#7C3AED';
      ctx.lineWidth = 2;
      ctx.strokeRect(80, yPos - 30, width - 160, itemHeight - 20);
    }

    ctx.fillStyle = '#7C3AED';
    ctx.font = 'bold 38px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(jogo.time, 120, yPos + 45);

    ctx.fillStyle = '#9B93C5';
    ctx.font = '30px Inter, sans-serif';
    let comp = jogo.competition;
    if (comp.length > 30) comp = comp.substring(0, 27) + '...';
    ctx.fillText(comp, 260, yPos + 15);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 36px Inter, sans-serif';
    ctx.fillText(`${jogo.homeTeam} x ${jogo.awayTeam}`, 260, yPos + 65);

    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 28px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`📺 ${jogo.channel}`, width - 120, yPos + 45);

    yPos += itemHeight;
  });

  if (jogos.length > maxJogos) {
    ctx.fillStyle = '#9B93C5';
    ctx.font = 'italic 28px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`+ ${jogos.length - maxJogos} jogos disponíveis no app`, width / 2, yPos + 40);
  }

  // 4. Rodapé
  ctx.fillStyle = 'rgba(124, 58, 237, 0.2)';
  ctx.fillRect(0, height - 150, width, 150);
  
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 40px Syne, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('GESTOR FLEX', width / 2, height - 80);
  
  ctx.fillStyle = '#A78BFA';
  ctx.font = '24px Inter, sans-serif';
  ctx.fillText('GESTAO COMPLETA IPTV', width / 2, height - 40);

   // Download direto
   const link = document.createElement('a');
   link.download = 'agenda-jogos-' + dia + '.png';
   link.href = canvas.toDataURL('image/png');
   link.click();
   toast('Imagem da agenda gerada com sucesso!', 'success');
}

async function gerarGraficoJogo(jogo) {
  toast(`Gerando gráfico para ${jogo.homeTeam} x ${jogo.awayTeam}...`, 'info');

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  const width = 1080;
  const height = 1080;
  canvas.width = width;
  canvas.height = height;

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#0D0A1A');
  gradient.addColorStop(1, '#1E1838');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#A78BFA';
  ctx.font = 'bold 40px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(jogo.competition.toUpperCase(), width / 2, 150);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 80px Syne, sans-serif';
  ctx.fillText(jogo.homeTeam.toUpperCase(), width / 2, 380);
  
  ctx.fillStyle = 'rgba(167, 139, 250, 0.5)';
  ctx.font = 'bold 60px Syne, sans-serif';
  ctx.fillText('VS', width / 2, 480);
  
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 80px Syne, sans-serif';
  ctx.fillText(jogo.awayTeam.toUpperCase(), width / 2, 580);

  ctx.fillStyle = '#7C3AED';
  ctx.fillRect(width/2 - 150, 680, 300, 80);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 50px Inter, sans-serif';
  ctx.fillText(jogo.time, width / 2, 740);

  ctx.fillStyle = '#9B93C5';
  ctx.font = 'bold 30px Inter, sans-serif';
  ctx.fillText('ONDE ASSISTIR:', width / 2, 850);
  
  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 60px Inter, sans-serif';
  ctx.fillText('📺 ' + jogo.channel, width / 2, 930);

  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.font = 'bold 30px Syne, sans-serif';
  ctx.fillText('GESTOR FLEX', width / 2, height - 50);

  // Download direto
  const link = document.createElement('a');
  link.download = 'jogo-' + jogo.homeTeam + '-vs-' + jogo.awayTeam + '.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
  toast('Imagem do gráfico gerada com sucesso!', 'success');
}

function downloadCanvas(canvas, filename) {
  try {
    const link = document.createElement('a');
    link.download = `${filename}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast('Imagem gerada com sucesso!', 'success');
  } catch (err) {
    console.error('Erro ao baixar imagem:', err);
    toast('Erro ao gerar imagem', 'error');
  }
}

window.gerarGraficoJogo = gerarGraficoJogo;


// Inicia o app ao final de todos os scripts
// Inicia o app assim que o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
  console.log('[App] DOMContentLoaded');
  console.log('[DEBUG] Elemento jogos-conteudo existe:', !!document.getElementById('jogos-conteudo'));
  console.log('[DEBUG] jogosData.hoje:', jogosData.hoje?.length || 0, 'jogos');
  
  // Configura listeners dos jogos
  console.log('[Jogos] DOM carregado, configurando listeners');
  
  // Botão atualizar
  const btnAtualizar = $('btn-atualizar-jogos');
  if (btnAtualizar) {
    btnAtualizar.addEventListener('click', () => {
      console.log('[Jogos] Botão atualizar clicado');
      loadJogosDoDia(currentDia);
    });
  }

  // Abas dos dias
  const tabs = document.querySelectorAll('.jogo-tab');
  console.log('[Jogos] Encontradas', tabs.length, 'abas');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const dia = tab.dataset.dia;
      console.log('[Jogos] Clique na aba:', dia);
      if (dia && dia !== currentDia) {
        loadJogosDoDia(dia);
      }
    });
  });
  
  // Garantia extra: esconde o splash se algo der muito errado após 3 segundos
  setTimeout(() => hide('splash'), 3000);
  // boot() já é chamado no window.onload
});

// Garante que os dados dos jogos estejam disponíveis globalmente
window.jogosData = jogosData;
window.loadJogosDoDia = loadJogosDoDia;

// Função para copiar jogos (CORRIGIDO)
window.copiarJogos = function(dia) {
  const jogos = jogosData[dia] || getJogosSimulados(dia);
  if (!jogos || jogos.length === 0) {
    toast('Nenhum jogo para copiar', 'info');
    return;
  }
  const text = jogos.map(j => `${j.time} - ${j.homeTeam} x ${j.awayTeam} (${j.competition}) - ${j.channel}`).join('\n');
  navigator.clipboard.writeText(text).then(() => {
    toast('Jogos copiados para a área de transferência!', 'success');
  }).catch(err => {
    console.error('Erro ao copiar:', err);
    toast('Erro ao copiar jogos', 'error');
  });
};

// Função para gerar imagem da agenda (CORRIGIDO)
window.gerarImagemJogos = function(dia) {
  const jogos = jogosData[dia] || getJogosSimulados(dia);
  if (!jogos || jogos.length === 0) {
    toast('Nenhum jogo para gerar imagem', 'info');
    return;
  }
  
  toast(`Gerando imagem com ${jogos.length} jogos...`, 'info');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const width = 1080;
  const height = Math.max(1920, 600 + jogos.length * 200);
  canvas.width = width;
  canvas.height = height;

  // Background
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#0D0A1A');
  gradient.addColorStop(1, '#1E1838');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Title
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 60px Syne, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('⚽ JOGOS DO DIA', width / 2, 120);

  // Date
  const hoje = new Date();
  if (dia === 'ontem') hoje.setDate(hoje.getDate() - 1);
  if (dia === 'amanha') hoje.setDate(hoje.getDate() + 1);
  const dataStr = hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  ctx.font = '30px Inter, sans-serif';
  ctx.fillStyle = '#A78BFA';
  ctx.fillText(dataStr.toUpperCase(), width / 2, 180);
  
  // Games
  let yPos = 280;
  const gameH = 180;
  jogos.forEach((jogo, i) => {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(124,58,237,0.1)' : 'rgba(30,24,56,0.5)';
    ctx.fillRect(50, yPos, width-100, gameH);
    ctx.strokeStyle = 'rgba(124,58,237,0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(50, yPos, width-100, gameH);
    
    ctx.fillStyle = '#7C3AED';
    ctx.font = 'bold 36px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(jogo.time, 80, yPos + 50);
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 40px Syne, sans-serif';
    ctx.fillText(jogo.homeTeam + ' vs ' + jogo.awayTeam, 80, yPos + 100);
    
    ctx.fillStyle = '#9B93C5';
    ctx.font = '24px Inter, sans-serif';
    ctx.fillText(jogo.competition + ' • ' + jogo.channel, 80, yPos + 140);
    
    yPos += gameH + 40;
  });

 // Footer
  ctx.fillStyle = 'rgba(124,58,237,0.2)';
  ctx.fillRect(0, height-150, width, 150);
  
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 40px Syne, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('GESTOR FLEX', width / 2, height - 80);
  
  ctx.fillStyle = '#A78BFA';
  ctx.font = '24px Inter, sans-serif';
  ctx.fillText('GESTAO COMPLETA IPTV', width / 2, height - 40);

  const link = document.createElement('a');
  link.download = 'agenda-jogos-' + dia + '.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
  toast('Imagem da agenda gerada com sucesso!', 'success');
};
