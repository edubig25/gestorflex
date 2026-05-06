console.log('App JS Loading...');
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
          enterApp();
        }
        return;
      }
    }

    show('login-screen');
  } catch (err) {
    console.error('Boot error:', err);
    hide('splash');
    show('login-screen');
    toast('Erro ao iniciar. Verifique sua conexão.', 'error');
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
  try {
    const email = $('login-email').value.trim();
    const senha = $('login-senha').value;
    const err = $('login-error');
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
    toast('Erro fatal no login: ' + error.message, 'error');
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

function finishLogin(user) {
  currentUser = user;
  hide('login-screen');
  hide('twofa-screen');
  enterApp();
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
function enterApp() {
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
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
  const titles = { dashboard: 'Dashboard', clientes: 'Clientes', financeiro: 'Financeiro', captacao: 'Captação', planos: 'Planos', whatsapp: 'WhatsApp', configuracoes: 'Configurações' };
  $('topbar-title').textContent = titles[page] || '';
  if (page === 'clientes') loadClientes();
  if (page === 'financeiro') loadFinanceiro();
  if (page === 'captacao') loadCaptacao();
  if (page === 'planos') loadPlanosPage();
  if (page === 'whatsapp') loadWhatsApp();
  if (page === 'configuracoes') populateConfig();
}

$('menu-toggle').addEventListener('click', () => $('sidebar').classList.toggle('open'));

// === DASHBOARD ===
async function loadDashboard() {
  const { data } = await db.from('clientes').select('*');
  allClientes = data || [];
  renderCaixaAtual(allClientes);
  renderDashMetrics(allClientes);
  renderChartReceita(allClientes);
  renderListaVencendo(allClientes);
  checkNotifVencendo(allClientes);
}

function renderCaixaAtual(clientes) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const mes = hoje.getMonth();
  const ano = hoje.getFullYear();

  // Recebido: clientes Ativos com vencimento no mês atual
  const recebido = clientes
    .filter(c => c.status === 'Ativo' && c.vencimento)
    .filter(c => {
      const v = new Date(c.vencimento + 'T00:00:00');
      return v.getMonth() === mes && v.getFullYear() === ano;
    })
    .reduce((acc, c) => acc + parseFloat(c.valor || 0), 0);

  // A Receber: clientes Pendentes
  const pendente = clientes
    .filter(c => c.status === 'Pendente')
    .reduce((acc, c) => acc + parseFloat(c.valor || 0), 0);

  // Inadimplente: clientes Vencidos
  const vencido = clientes
    .filter(c => c.status === 'Vencido')
    .reduce((acc, c) => acc + parseFloat(c.valor || 0), 0);

  const totalPotencial = recebido + pendente + vencido;
  const pct = totalPotencial > 0 ? Math.round((recebido / totalPotencial) * 100) : 0;

  $('caixa-valor').textContent = fmt(recebido);
  $('caixa-recebido').textContent = fmt(recebido);
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
  const vencendo7 = clientes.filter(c => {
    const d = diasAteVencimento(c.vencimento);
    return d >= 0 && d <= 7;
  }).length;

  const mes = hoje.getMonth();
  const ano = hoje.getFullYear();
  const receita = clientes
    .filter(c => c.status === 'Ativo' && c.vencimento)
    .reduce((acc, c) => {
      const v = new Date(c.vencimento + 'T00:00:00');
      if (v.getMonth() === mes && v.getFullYear() === ano) return acc + parseFloat(c.valor || 0);
      return acc;
    }, 0);

  $('m-total').textContent = total;
  $('m-ativos').textContent = ativos;
  $('m-vencendo').textContent = vencendo7;
  $('m-receita').textContent = fmt(receita);
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
    data: {
      labels: meses.map(m => m.label),
      datasets: [{
        label: 'Receita (R$)',
        data: valores,
        backgroundColor: 'rgba(124,58,237,.5)',
        borderColor: '#7C3AED',
        borderWidth: 2,
        borderRadius: 8,
        hoverBackgroundColor: 'rgba(167,139,250,.7)'
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => fmt(ctx.parsed.y) } }
      },
      scales: {
        x: { grid: { color: 'rgba(124,58,237,.08)' }, ticks: { color: '#9B93C5' } },
        y: { grid: { color: 'rgba(124,58,237,.08)' }, ticks: { color: '#9B93C5', callback: v => 'R$' + v } }
      }
    }
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

function applyFilters() {
  const busca = $('search-cliente').value.toLowerCase();
  const status = $('filter-status').value;
  const origem = $('filter-origem').value;
  let list = allClientes;
  if (busca) list = list.filter(c => c.nome.toLowerCase().includes(busca));
  if (status) list = list.filter(c => c.status === status);
  if (origem) list = list.filter(c => c.origem === origem);
  renderTabela(list);
}

$('search-cliente').addEventListener('input', applyFilters);
$('filter-status').addEventListener('change', applyFilters);
$('filter-origem').addEventListener('change', applyFilters);

$('btn-add-cliente').addEventListener('click', openAddModal);
$('modal-close').addEventListener('click', closeModal);
$('btn-cancelar-modal').addEventListener('click', closeModal);

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
  let error;
  if (id) { ({ error } = await db.from('clientes').update(payload).eq('id', id)); }
  else { ({ error } = await db.from('clientes').insert(payload)); }
  if (error) { $('form-error').textContent = 'Erro: ' + error.message; show('form-error'); return; }
  closeModal();
  toast(id ? 'Cliente atualizado!' : 'Cliente adicionado!', 'success');
  loadClientes(); loadDashboard();
});

async function renovar(id) {
  const c = allClientes.find(x => x.id === id);
  if (!c) return;
  const base = c.vencimento || new Date().toISOString().split('T')[0];
  const novaData = addMeses(base, planoMeses(c.plano));
  const { error } = await db.from('clientes').update({ vencimento: novaData, status: 'Ativo' }).eq('id', id);
  if (error) { toast('Erro ao renovar: ' + error.message, 'error'); return; }
  toast('Plano renovado até ' + new Date(novaData + 'T00:00:00').toLocaleDateString('pt-BR'), 'success');
  loadClientes();
  loadDashboard();
}

// === FINANCEIRO ===

async function loadFinanceiro() {
  const { data } = await db.from('clientes').select('*');
  const clientes = data || [];
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const mes = hoje.getMonth(); const ano = hoje.getFullYear();
  const periodo = parseInt($('fin-period')?.value || 6);

  const ativos = clientes.filter(c => c.status === 'Ativo');
  const vencidos = clientes.filter(c => c.status === 'Vencido' || diasAteVencimento(c.vencimento) < 0);
  const pendentes = clientes.filter(c => c.status === 'Pendente');

  const receitaMes = ativos.filter(c => {
    if (!c.vencimento) return false;
    const v = new Date(c.vencimento + 'T00:00:00');
    return v.getMonth() === mes && v.getFullYear() === ano;
  }).reduce((acc, c) => acc + parseFloat(c.valor || 0), 0);

  const emAberto = clientes.filter(c => c.status !== 'Ativo').reduce((acc, c) => acc + parseFloat(c.valor || 0), 0);

  $('fin-receita-mes').textContent = fmt(receitaMes);
  $('fin-ativos-count').textContent = ativos.length;
  $('fin-em-aberto').textContent = fmt(emAberto);
  $('fin-vencidos-count').textContent = vencidos.length;

  // CHART 1: Line - Receita vs Inadimplência por mês
  const meses = getUltimos6Meses();
  const valReceita = meses.map(m => clientes.filter(c => c.status === 'Ativo' && c.vencimento && new Date(c.vencimento + 'T00:00:00').getMonth() === m.mes && new Date(c.vencimento + 'T00:00:00').getFullYear() === m.ano).reduce((a, c) => a + parseFloat(c.valor || 0), 0));
  const valVencidos = meses.map(m => clientes.filter(c => c.status !== 'Ativo' && c.vencimento && new Date(c.vencimento + 'T00:00:00').getMonth() === m.mes && new Date(c.vencimento + 'T00:00:00').getFullYear() === m.ano).reduce((a, c) => a + parseFloat(c.valor || 0), 0));

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

  // Legend for donut
  const total = clientes.length || 1;
  $('fin-status-legend').innerHTML = [
    { label: 'Ativos', val: ativos.length, color: '#10B981' },
    { label: 'Vencidos', val: vencidos.length, color: '#EF4444' },
    { label: 'Pendentes', val: pendentes.length, color: '#F59E0B' }
  ].map(i => `<div class="fin-legend-item"><span class="fin-legend-dot" style="background:${i.color}"></span><span class="fin-legend-label">${i.label}</span><span class="fin-legend-val">${i.val} (${Math.round(i.val / total * 100)}%)</span></div>`).join('');

  // CHART 3: Bar - Receita por Plano
  const porPlano = {};
  clientes.filter(c => c.status === 'Ativo').forEach(c => { const p = c.plano || 'Sem Plano'; porPlano[p] = (porPlano[p] || 0) + parseFloat(c.valor || 0); });
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
  if (vencidos.length === 0) { tbody.innerHTML = ''; show('fin-vencidos-empty'); return; }
  hide('fin-vencidos-empty');
  tbody.innerHTML = vencidos.sort((a, b) => diasAteVencimento(a.vencimento) - diasAteVencimento(b.vencimento)).slice(0, 30).map(c => `<tr><td><strong>${c.nome}</strong></td><td>${c.whatsapp || '—'}</td><td>${c.plano || '—'}</td><td>${fmt(c.valor)}</td><td>${c.vencimento ? new Date(c.vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td><td style="color:#f87171;font-weight:700">${Math.abs(diasAteVencimento(c.vencimento))} dias</td></tr>`).join('');
}
$('fin-period')?.addEventListener('change', loadFinanceiro);

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
});

window.openEdit = openEdit;
window.renovar = renovar;
window.confirmDeleteCliente = confirmDeleteCliente;
window.confirmDeletePlano = confirmDeletePlano;
window.openEditPlano = openEditPlano;

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
  const { data, error } = await db.from('wa_config').select('*').limit(1);
  if (!error && data && data.length > 0) {
    waConfigData = data[0];
    $('wa-msg-antes').value = waConfigData.msg_antes || '';
    $('wa-msg-apos').value = waConfigData.msg_apos || '';
    $('wa-msg-image').value = waConfigData.msg_image || '';
    $('wa-msg-audio').value = waConfigData.msg_audio || '';
    $('wa-auto-time').value = waConfigData.auto_time || '';
    $('wa-auto-interval').value = waConfigData.auto_interval || '1';
    $('wa-auto-active').checked = waConfigData.auto_active || false;

    const dAntes = (waConfigData.dias_antes || '').split(',');
    document.querySelectorAll('.wa-cb-antes').forEach(cb => cb.checked = dAntes.includes(cb.value));

    const dDepois = (waConfigData.dias_depois || '').split(',');
    document.querySelectorAll('.wa-cb-depois').forEach(cb => cb.checked = dDepois.includes(cb.value));
  } else if (error && error.code === '42P01') {
    toast('Tabela wa_config não existe. Execute o SQL de configuração.', 'error');
  }
}

$('btn-wa-save-msg').addEventListener('click', async () => {
  const payload = {
    msg_antes: $('wa-msg-antes').value,
    msg_apos: $('wa-msg-apos').value,
    msg_image: $('wa-msg-image').value,
    msg_audio: $('wa-msg-audio').value,
  };
  await saveWaConfig(payload);
  toast('Textos salvos com sucesso!', 'success');
});

$('btn-wa-save-auto').addEventListener('click', async () => {
  const diasAntes = Array.from(document.querySelectorAll('.wa-cb-antes:checked')).map(cb => cb.value).join(',');
  const diasDepois = Array.from(document.querySelectorAll('.wa-cb-depois:checked')).map(cb => cb.value).join(',');

  const payload = {
    auto_time: $('wa-auto-time').value,
    auto_interval: $('wa-auto-interval').value,
    auto_active: $('wa-auto-active').checked,
    dias_antes: diasAntes,
    dias_depois: diasDepois
  };
  await saveWaConfig(payload);
  toast('Configurações de disparo salvas!', 'success');
});

async function saveWaConfig(payload) {
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

// Inicia o app ao final de todos os scripts
// Inicia o app assim que o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
  // Garantia extra: esconde o splash se algo der muito errado após 3 segundos
  setTimeout(() => hide('splash'), 3000);
  // boot() já é chamado no window.onload
});
