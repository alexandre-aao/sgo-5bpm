// State Management
let state = {
  eventos: [],
  operacoes: [],
  alocacoes: [],
  escalas: [],
  currentEventId: null,
  currentOperacaoId: null,
  calendarDiariasMonth: new Date().getMonth(),
  calendarDiariasYear: new Date().getFullYear(),
  user: null, // Dados do usuário logado
  config: { cota_mensal_diarias: 0 }, // Configurações globais (cota de diárias)
  cartaoAtual: null, // Cartão Programa carregado na aba
  pessoal: [] // Cadastro de Pessoal (Adjunto/Fiscal/Oficial de Operações/Oficial de Sobreaviso)
};

// -------------------------------------------------------------
// TEMA DE COR (Claro / Escuro) — aplicado o mais cedo possível no boot,
// antes de qualquer outra coisa, pra minimizar flash do tema errado.
// O redesign é light-first: 'claro' é o padrão (sem classe no body).
// 'padrao' é valor legado no localStorage (era o dark antigo) e cai em 'claro'.
// -------------------------------------------------------------
const TEMA_PREFS_KEY = 'sgo_tema';

function carregarPrefsTema() {
  const salvo = localStorage.getItem(TEMA_PREFS_KEY);
  return salvo === 'escuro' ? 'escuro' : 'claro';
}

function aplicarTema(tema) {
  document.body.classList.toggle('tema-escuro', tema === 'escuro');
}

// Marca qual das duas opções do toggle segmentado está ativa (visual + aria).
function sincronizarToggleTema(tema) {
  document.querySelectorAll('.tema-opcao').forEach(btn => {
    const ativo = btn.dataset.tema === tema;
    btn.classList.toggle('ativo', ativo);
    btn.setAttribute('aria-checked', String(ativo));
  });
}

aplicarTema(carregarPrefsTema());

// Configuração do Servidor API
const API_BASE_URL = window.location.origin;

// Data local no formato YYYY-MM-DD (toISOString usa UTC e vira o dia errado à noite)
function getLocalDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Escapa HTML de dados do usuário antes de renderizar (proteção contra XSS)
function esc(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Wrapper de fetch: anexa o token de sessão e trata expiração (401) automaticamente
async function apiFetch(url, options = {}) {
  const opts = { ...options, headers: { ...(options.headers || {}) } };
  if (state.user && state.user.token) {
    opts.headers['Authorization'] = `Bearer ${state.user.token}`;
  }

  const res = await fetch(url, opts);

  if (res.status === 401 && state.user) {
    encerrarSessaoLocal();
    showToast('Sessão expirada. Faça login novamente.', 'warning');
  }

  return res;
}

// Desabilita o botão de submit durante uma operação async, troca o conteúdo por um
// spinner (classe .btn-carregando) e reabilita ao final — evita duplo envio em
// conexão lenta. Uso: comBotaoCarregando(e.submitter, async () => { ...lógica... }).
async function comBotaoCarregando(botao, fn) {
  if (!botao || botao.disabled) return;
  botao.disabled = true;
  botao.classList.add('btn-carregando');
  try {
    return await fn();
  } finally {
    botao.disabled = false;
    botao.classList.remove('btn-carregando');
  }
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  // Inicializa ícones do Lucide
  lucide.createIcons();
  
  // Define a data padrão de cadastro como hoje (horário local)
  document.getElementById('data_inicio').value = getLocalDateStr();

  // Cartão Programa: por padrão trabalha com o dia seguinte (montado na véspera)
  const amanhaCartao = new Date();
  amanhaCartao.setDate(amanhaCartao.getDate() + 1);
  document.getElementById('cartao-data').value = getLocalDateStr(amanhaCartao);

  initPeriodFilters();
  setupNavigation();
  setupEventListeners();
  checkAuth();
  
  // Atualiza dados automaticamente a cada 60 segundos para sincronização online.
  // Não busca com a aba em segundo plano (document.hidden): evita bater na API à toa
  // enquanto ninguém está olhando. Ao voltar o foco, dispara um refresh imediato para
  // recuperar o que mudou durante o período oculto.
  setInterval(() => {
    if (state.user && !document.hidden) {
      fetchData();
    }
  }, 60000);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.user) {
      fetchData();
    }
  });
});

// -------------------------------------------------------------
// VERIFICAÇÃO DE AUTENTICAÇÃO (SESSÃO)
// -------------------------------------------------------------
function checkAuth() {
  const session = localStorage.getItem('user');
  if (session) {
    const user = JSON.parse(session);

    // Sessão sem token (formato antigo) ou já expirada: exige novo login
    if (!user.token || !user.expira || user.expira <= Date.now()) {
      localStorage.removeItem('user');
      document.getElementById('login-container').classList.remove('hidden');
      return;
    }

    state.user = user;
    document.getElementById('login-container').classList.add('hidden');
    applyRolePermissions(state.user);
    fetchData();
  } else {
    document.getElementById('login-container').classList.remove('hidden');
  }
}

// Barra de abas inferior do celular (shell mobile do redesign). Os destinos
// dependem do perfil: P3 entra pelo Dashboard e tem Operações; Adjunto/Oficial
// entram por Meu Turno e não enxergam Operações nem Dashboard. O item "Mais"
// abre o drawer de navegação, que continua sendo o acesso ao resto das abas.
const BOTTOM_TABS_P3 = [
  { nav: 'nav-btn-dashboard', icone: 'layout-dashboard', rotulo: 'Início' },
  { nav: 'nav-btn-eventos', icone: 'calendar', rotulo: 'Eventos' },
  { nav: 'nav-btn-operacoes', icone: 'shield-alert', rotulo: 'Operações' },
  { nav: 'nav-btn-cartao', icone: 'clipboard-list', rotulo: 'Cartão' }
];

const BOTTOM_TABS_OPERACIONAL = [
  { nav: 'nav-btn-turno', icone: 'user-check', rotulo: 'Meu Turno' },
  { nav: 'nav-btn-cartao', icone: 'clipboard-list', rotulo: 'Cartão' },
  { nav: 'nav-btn-eventos', icone: 'calendar', rotulo: 'Eventos' },
  { nav: 'nav-btn-mapa', icone: 'map', rotulo: 'Mapa' }
];

function montarBottomTabs(role) {
  const barra = document.getElementById('bottom-tabs');
  if (!barra) return;

  const itens = role === 'P3' ? BOTTOM_TABS_P3 : BOTTOM_TABS_OPERACIONAL;
  barra.innerHTML = itens.map(t => `
    <button type="button" class="bottom-tab" data-action="bottom-tab" data-nav="${t.nav}" data-target-nav="${t.nav}">
      <i data-lucide="${t.icone}"></i><span>${esc(t.rotulo)}</span>
    </button>`).join('') + `
    <button type="button" class="bottom-tab" data-action="bottom-tab-mais">
      <i data-lucide="menu"></i><span>Mais</span>
    </button>`;

  lucide.createIcons();
  sincronizarBottomTabs();
}

// Marca como ativa a aba inferior correspondente à aba aberta (se houver).
function sincronizarBottomTabs() {
  const navAtivo = document.querySelector('.nav-btn.active');
  const idAtivo = navAtivo ? navAtivo.id : null;
  document.querySelectorAll('.bottom-tab').forEach(btn => {
    const ativo = !!idAtivo && btn.dataset.targetNav === idAtivo;
    btn.classList.toggle('ativo', ativo);
    btn.setAttribute('aria-current', ativo ? 'page' : 'false');
  });
}

function applyRolePermissions(user) {
  // Identidade do usuário: card de perfil no topo da sidebar + bloco da topbar
  const sigla = user.role === 'P3' ? 'P3' : user.role.substring(0, 2).toUpperCase();
  document.getElementById('perfil-card-nome').textContent = user.nome;
  document.getElementById('perfil-card-role').textContent = `Perfil: ${user.role}`;
  document.getElementById('perfil-card-avatar').textContent = sigla;
  document.getElementById('avatar-display').textContent = sigla;
  document.getElementById('profile-nome').textContent = user.nome;
  document.getElementById('profile-role').textContent = user.role === 'P3' ? 'P3 — Planejamento' : user.role;

  // Elementos do Menu
  const btnDashboard = document.getElementById('nav-btn-dashboard');
  const btnCadastro = document.getElementById('nav-btn-cadastro');
  const btnRelatorio = document.getElementById('nav-btn-relatorio');
  const btnOperacoes = document.getElementById('nav-btn-operacoes');
  const btnPlanejador = document.getElementById('nav-btn-planejador');
  const btnUsuarios = document.getElementById('nav-btn-usuarios');
  const btnPessoal = document.getElementById('nav-btn-pessoal');
  const btnViaturas = document.getElementById('nav-btn-viaturas');
  const btnTurno = document.getElementById('nav-btn-turno');
  const btnEventos = document.getElementById('nav-btn-eventos');

  // Rótulos de seção exclusivos do P3 (Diárias, Administração só têm itens administrativos;
  // Eventos e Patrulhamento sempre têm algo visível pra todo perfil)
  const secoesSomenteP3 = ['nav-section-diarias', 'nav-section-administracao']
    .map(id => document.getElementById(id));

  // Ajusta visibilidade com base no Role
  if (user.role === 'P3') {
    btnDashboard.classList.remove('hidden-role');
    btnCadastro.classList.remove('hidden-role');
    btnRelatorio.classList.remove('hidden-role');
    btnOperacoes.classList.remove('hidden-role');
    btnPlanejador.classList.remove('hidden-role');
    btnUsuarios.classList.remove('hidden-role');
    btnPessoal.classList.remove('hidden-role');
    btnViaturas.classList.remove('hidden-role');
    btnTurno.classList.add('hidden-role'); // P3 foca no Dashboard Geral
    secoesSomenteP3.forEach(el => el.classList.remove('hidden-role'));
    // Card de cota na sidebar: só P3, que é quem enxerga o Planejador de Diárias
    document.getElementById('cota-sidebar-card').classList.remove('hidden-role');

    // Mostra botões admin no drawer
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden-role'));

    // Abre por padrão o Dashboard
    btnDashboard.click();
  } else {
    // Oficial ou Adjunto
    btnDashboard.classList.add('hidden-role');
    btnCadastro.classList.add('hidden-role');
    btnRelatorio.classList.add('hidden-role');
    btnOperacoes.classList.add('hidden-role');
    btnPlanejador.classList.add('hidden-role');
    btnUsuarios.classList.add('hidden-role');
    btnPessoal.classList.add('hidden-role');
    btnTurno.classList.remove('hidden-role');
    secoesSomenteP3.forEach(el => el.classList.add('hidden-role'));
    document.getElementById('cota-sidebar-card').classList.add('hidden-role');

    // Cadastro de Viaturas é aberto a Adjunto/Oficial (cadastrar e editar; excluir segue P3-only,
    // ver renderViaturasTab e o DELETE no server). Reexibe o botão e o rótulo "Administração".
    btnViaturas.classList.remove('hidden-role');
    document.getElementById('nav-section-administracao').classList.remove('hidden-role');

    // Oculta botões admin no drawer (Modo Leitura)
    document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden-role'));

    // Abre por padrão a aba de Turno
    btnTurno.click();
  }

  // A barra inferior do celular depende do perfil — montar depois de definir
  // a visibilidade das abas e de abrir a aba padrão.
  montarBottomTabs(user.role);
}

// -------------------------------------------------------------
// NAVEGAÇÃO SPA
// -------------------------------------------------------------
function setupNavigation() {
  const navButtons = document.querySelectorAll('.nav-menu .nav-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const titleEl = document.getElementById('tab-title');
  const subtitleEl = document.getElementById('tab-subtitle');

  const titles = {
    'tab-dashboard': { title: 'Dashboard Operacional', subtitle: 'Visão geral do policiamento e pautas do batalhão.' },
    'tab-cadastro': { title: 'Novo Evento', subtitle: 'Cadastro de novos eventos e ordens de policiamento recebidas.' },
    'tab-relatorio': { title: 'Relatório Financeiro de Efetivo', subtitle: 'Consolidação de escalas e diárias acumuladas por militar.' },
    'tab-turno': { title: 'Escala de Turno (Serviço Diário)', subtitle: 'Pauta focada de policiamento para os Oficiais de Dia e Adjuntos.' },
    'tab-eventos': { title: 'Consulta Geral de Pautas', subtitle: 'Lista consolidada de eventos históricos e futuros com filtros de busca.' },
    'tab-mapa': { title: 'Mapa de Eventos da Semana', subtitle: 'Localização geográfica dos eventos da semana corrente por bairro.' },
    'tab-operacoes': { title: 'Operações (Diárias)', subtitle: 'Operações planejadas e executadas, com efetivo escalado e diárias.' },
    'tab-planejador': { title: 'Planejador Mensal de Diárias', subtitle: 'Controle da cota mensal e distribuição de diárias operacionais por operação.' },
    'tab-cartao': { title: 'Cartão Programa', subtitle: 'Roteiro diário de patrulhamento das viaturas: locais, horários e atividades.' },
    'tab-usuarios': { title: 'Usuários do Sistema', subtitle: 'Gestão de perfis de acesso e redefinição de senhas.' },
    'tab-pessoal': { title: 'Cadastro de Pessoal', subtitle: 'Adjuntos, Fiscais de Operações, Oficiais de Operações e Oficiais de Sobreaviso.' },
    'tab-viaturas': { title: 'Cadastro de Viaturas', subtitle: 'Registro central de viaturas, usado para sugerir o prefixo no Cartão Programa.' }
  };

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      
      navButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(tab => tab.classList.remove('active'));
      
      btn.classList.add('active');
      const targetTab = document.getElementById(targetId);
      if (targetTab) targetTab.classList.add('active');

      // Fecha o drawer de navegação mobile ao trocar de aba (sem efeito em desktop)
      fecharNavDrawer();
      sincronizarBottomTabs();

      // Atualiza cabeçalho
      if (titles[targetId]) {
        titleEl.textContent = titles[targetId].title;
        subtitleEl.textContent = titles[targetId].subtitle;
      }

      // Dispara renderizações sob demanda
      if (targetId === 'tab-relatorio') {
        renderRelatorioTable();
        renderRelatorioDiario();
      } else if (targetId === 'tab-turno') {
        renderTurnoTab();
      } else if (targetId === 'tab-eventos') {
        renderEventosTab();
      } else if (targetId === 'tab-mapa') {
        renderMapaTab();
      } else if (targetId === 'tab-operacoes') {
        renderOperacoesTab();
      } else if (targetId === 'tab-planejador') {
        renderPlanejadorTab();
      } else if (targetId === 'tab-cartao') {
        renderCartaoTab();
      } else if (targetId === 'tab-usuarios') {
        renderUsuariosTab();
      } else if (targetId === 'tab-pessoal') {
        renderPessoalTab();
      } else if (targetId === 'tab-viaturas') {
        renderViaturasTab();
      }
    });
  });
}

// -------------------------------------------------------------
// EVENT LISTENERS GERAIS
// -------------------------------------------------------------
function setupEventListeners() {
  // Drawer de navegação mobile: hambúrguer abre, overlay/Esc fecham
  document.getElementById('btn-abrir-nav-drawer').addEventListener('click', abrirNavDrawer);
  document.getElementById('nav-drawer-overlay').addEventListener('click', fecharNavDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharNavDrawer();
  });

  // Toggle segmentado de tema (o tema em si já foi aplicado ao body no boot;
  // aqui só sincroniza qual botão aparece ativo e liga a troca)
  sincronizarToggleTema(carregarPrefsTema());
  document.querySelectorAll('.tema-opcao').forEach(btn => {
    btn.addEventListener('click', () => {
      const tema = btn.dataset.tema;
      localStorage.setItem(TEMA_PREFS_KEY, tema);
      aplicarTema(tema);
      sincronizarToggleTema(tema);
    });
  });

  // Data de hoje na topbar
  const agora = new Date();
  const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  document.getElementById('topbar-data-dia').textContent = getLocalDateStr().split('-').reverse().join('/');
  document.getElementById('topbar-data-semana').textContent = DIAS_SEMANA[agora.getDay()];

  // Login Form Submit
  document.getElementById('form-login').addEventListener('submit', handleLogin);

  // Logout Button
  document.getElementById('btn-logout').addEventListener('click', handleLogout);

  // Modal de Alteração de Senha
  document.getElementById('btn-alterar-senha').addEventListener('click', () => {
    document.getElementById('modal-senha').classList.remove('hidden');
  });
  const fecharModalSenha = () => {
    document.getElementById('modal-senha').classList.add('hidden');
    document.getElementById('form-alterar-senha').reset();
  };
  document.getElementById('btn-fechar-modal-senha').addEventListener('click', fecharModalSenha);
  document.getElementById('btn-cancelar-modal-senha').addEventListener('click', fecharModalSenha);
  document.getElementById('form-alterar-senha').addEventListener('submit', handleAlterarSenha);

  // Gestão de Usuários (P3)
  document.getElementById('btn-novo-usuario').addEventListener('click', () => abrirModalUsuario());
  document.getElementById('btn-exportar-backup').addEventListener('click', handleExportarBackup);
  const fecharModalUsuario = () => document.getElementById('modal-usuario').classList.add('hidden');
  document.getElementById('btn-fechar-modal-usuario').addEventListener('click', fecharModalUsuario);
  document.getElementById('btn-cancelar-modal-usuario').addEventListener('click', fecharModalUsuario);
  document.getElementById('form-usuario').addEventListener('submit', handleSalvarUsuario);

  // Cadastro de Pessoal (P3)
  document.getElementById('btn-nova-pessoa').addEventListener('click', () => abrirModalPessoa());
  const fecharModalPessoa = () => document.getElementById('modal-pessoa').classList.add('hidden');
  document.getElementById('btn-fechar-modal-pessoa').addEventListener('click', fecharModalPessoa);
  document.getElementById('btn-cancelar-modal-pessoa').addEventListener('click', fecharModalPessoa);
  document.getElementById('form-pessoa').addEventListener('submit', handleSalvarPessoa);
  document.querySelectorAll('.pessoal-filtro-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pessoal-filtro-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      pessoalFiltroCategoria = btn.getAttribute('data-categoria');
      renderPessoalTab();
    });
  });

  // Cadastro de Viaturas (P3)
  document.getElementById('btn-nova-viatura').addEventListener('click', () => abrirModalViatura());
  const fecharModalViatura = () => document.getElementById('modal-viatura').classList.add('hidden');
  document.getElementById('btn-fechar-modal-viatura').addEventListener('click', fecharModalViatura);
  document.getElementById('btn-cancelar-modal-viatura').addEventListener('click', fecharModalViatura);
  document.getElementById('form-viatura').addEventListener('submit', handleSalvarViatura);
  document.querySelectorAll('.viaturas-filtro-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.viaturas-filtro-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      viaturasFiltroStatus = btn.getAttribute('data-status');
      renderViaturasTab();
    });
  });

  // Modal de confirmação forte de exclusão (reaproveitável)
  document.getElementById('confirmar-exclusao-input').addEventListener('input', (e) => {
    const normalizado = normalizarTexto(e.target.value);
    const esperado = normalizarTexto(confirmacaoExclusaoForteValorEsperado || '');
    document.getElementById('btn-confirmar-exclusao-forte').disabled = !esperado || normalizado !== esperado;
  });
  const fecharModalConfirmarExclusao = () => document.getElementById('modal-confirmar-exclusao-forte').classList.add('hidden');
  document.getElementById('btn-fechar-modal-confirmar-exclusao').addEventListener('click', fecharModalConfirmarExclusao);
  document.getElementById('btn-cancelar-modal-confirmar-exclusao').addEventListener('click', fecharModalConfirmarExclusao);
  document.getElementById('btn-confirmar-exclusao-forte').addEventListener('click', () => {
    const callback = confirmacaoExclusaoForteCallback;
    fecharModalConfirmarExclusao();
    if (callback) callback();
  });

  // Bairro em Novo Evento: alterna o campo de texto livre quando "Outro" é selecionado
  document.getElementById('bairro').addEventListener('change', (e) => {
    document.getElementById('bairro_outro').classList.toggle('hidden', e.target.value !== '__outro__');
  });

  // Cadastro de Bairros (P3)
  document.getElementById('btn-toggle-gerenciar-bairros').addEventListener('click', () => {
    const painel = document.getElementById('gerenciar-bairros-panel');
    painel.classList.toggle('hidden');
    if (!painel.classList.contains('hidden')) renderGerenciarBairrosTab();
  });

  // Painel de controle de camadas do Mapa (toggles + estilo de tile)
  document.getElementById('mapa-toggle-eventos').addEventListener('change', handleMudarPrefsMapa);
  document.getElementById('mapa-toggle-viaturas').addEventListener('change', handleMudarPrefsMapa);
  document.getElementById('mapa-select-estilo').addEventListener('change', handleMudarPrefsMapa);
  document.getElementById('form-bairro').addEventListener('submit', handleSalvarBairro);

  const fecharModalReset = () => document.getElementById('modal-reset-senha').classList.add('hidden');
  document.getElementById('btn-fechar-modal-reset').addEventListener('click', fecharModalReset);
  document.getElementById('btn-cancelar-modal-reset').addEventListener('click', fecharModalReset);
  document.getElementById('form-reset-senha').addEventListener('submit', handleResetarSenha);

  // Delegação de eventos: um único listener em document trata TODOS os botões
  // renderizados dinamicamente (data-action + data-*). Substitui os antigos
  // onclick="" inline, que a CSP (script-src sem 'unsafe-inline', server.js) bloqueia.
  // document é o pai estável — os containers têm innerHTML reescrito a cada render,
  // então um listener por container morreria junto. Ler os valores via el.dataset
  // devolve a string já decodificada, então nomes com aspas/apóstrofo funcionam.
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const d = el.dataset;
    switch (d.action) {
      // Autocomplete customizado de militar (form Escalar Militar)
      case 'selecionar-militar-escala': selecionarMilitarEscala(d.nome, d.id); break;
      // Item 2 — Usuários
      case 'editar-usuario': abrirModalUsuario(d.usuario, d.nome, d.role); break;
      case 'reset-senha': abrirModalResetSenha(d.usuario, d.nome); break;
      case 'excluir-usuario': handleExcluirUsuario(d.usuario); break;
      // Item 1 — Cartão Programa (templates, viaturas, itens do roteiro)
      case 'importar-template': handleImportarClonarTemplate(d.id); break;
      case 'abrir-template': handleAbrirTemplate(d.id); break;
      case 'excluir-template': handleExcluirTemplate(d.id); break;
      case 'abrir-cartao-historico': handleAbrirCartaoHistorico(d.data); break;
      case 'add-cartao-item': handleAddCartaoItem(d.vtrId); break;
      case 'editar-vtr': abrirModalEditarVtr(d.vtrId); break;
      case 'excluir-cartao-vtr': handleDeleteCartaoVtr(d.vtrId); break;
      case 'excluir-cartao-item': handleDeleteCartaoItem(d.vtrId, d.itemId); break;
      case 'mudar-atividade-item': iniciarEdicaoAtividade(d.vtrId, d.itemId); break;
      case 'salvar-atividade-item': salvarAtividadeItem(d.vtrId, d.itemId); break;
      case 'cancelar-atividade-item': cancelarEdicaoAtividade(); break;
      // Meu Turno
      case 'turno-dia': handleTurnoTrocarDia(d.dia); break;
      case 'abrir-evento': openDrawer(d.id); break;
      // Mapa
      case 'focar-no-mapa': handleFocarNoMapa(d.lat, d.lng, d.id); break;
      // Barra de abas do celular
      case 'bottom-tab': document.getElementById(d.nav).click(); break;
      case 'bottom-tab-mais': abrirNavDrawer(); break;
      // Abas Viaturas | Roteiro do Cartão Programa
      case 'cartao-aba': handleCartaoTrocarAba(d.aba); break;
      // Gaveta de evento / operação
      case 'excluir-alocacao': handleDeleteAlocacao(d.id); break;
      case 'excluir-escala': handleDeleteEscala(d.id); break;
      // Bairros / Pessoal / Viaturas
      case 'editar-bairro': abrirEdicaoBairro(d.id, d.nome, d.lat, d.lon); break;
      case 'excluir-bairro': handleExcluirBairro(d.id); break;
      case 'editar-pessoa': abrirModalPessoa(d.id); break;
      case 'excluir-pessoa': handleExcluirPessoa(d.id); break;
      case 'editar-viatura': abrirModalViatura(d.id); break;
      case 'excluir-viatura': handleExcluirViatura(d.id); break;
      // Dashboard (markup estático em index.html)
      case 'ir-cartao-hoje': handleIrParaCartaoHoje(); break;
      case 'dashboard-card': handleDashboardCardClick(d.nav); break;
    }
  });


  // Submissão do Formulário de Cadastro de Evento
  document.getElementById('form-evento').addEventListener('submit', handleCreateEvento);

  // Fechar Gaveta Lateral (Drawer)
  document.getElementById('btn-close-drawer').addEventListener('click', closeDrawer);
  document.getElementById('btn-close-drawer-footer').addEventListener('click', closeDrawer);
  document.getElementById('drawer-overlay').addEventListener('click', closeDrawer);

  // Abas internas do Drawer
  const drawerTabBtns = document.querySelectorAll('.drawer-tab-btn');
  drawerTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      drawerTabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.drawer-tab-content').forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      const tabId = btn.getAttribute('data-drawer-tab');
      document.getElementById(tabId).classList.add('active');
    });
  });

  // Formulário interno de Alocação de Policiamento
  document.getElementById('btn-add-alocacao').addEventListener('click', () => {
    document.getElementById('form-alocacao-container').classList.remove('hidden');
  });
  document.getElementById('btn-cancel-alocacao').addEventListener('click', () => {
    document.getElementById('form-alocacao-container').classList.add('hidden');
    document.getElementById('form-alocacao').reset();
  });
  document.getElementById('form-alocacao').addEventListener('submit', handleCreateAlocacao);

  // Formulário interno de Escala de Militares (Diárias)
  document.getElementById('btn-add-escala').addEventListener('click', () => {
    document.getElementById('form-escala-container').classList.remove('hidden');
    updateEscalaBudgetPreview();
  });
  document.getElementById('btn-cancel-escala').addEventListener('click', () => {
    document.getElementById('form-escala-container').classList.add('hidden');
    document.getElementById('form-escala').reset();
    document.getElementById('diarias-calc-preview').textContent = '2';
    limparAutocompleteEscala();
  });
  document.getElementById('form-escala').addEventListener('submit', handleCreateEscala);

  // Autocomplete customizado de militar (form Escalar Militar): dropdown próprio, busca por
  // nome / nome de guerra / matrícula, navegação por teclado. Lê state.pessoal ao vivo.
  const escNomeInput = document.getElementById('esc_militar_nome');
  escNomeInput.addEventListener('input', (e) => {
    escAcIdx = -1;
    renderAutocompleteEscala(e.target.value);
    if (!e.target.value.trim()) {
      document.getElementById('esc_militar_id').readOnly = false;
    }
  });
  escNomeInput.addEventListener('keydown', (e) => {
    const box = document.getElementById('escala-autocomplete-results');
    const aberto = box && !box.classList.contains('hidden');
    const itens = box ? Array.from(box.querySelectorAll('.autocomplete-item')) : [];
    if (e.key === 'ArrowDown') {
      if (!aberto || itens.length === 0) return;
      e.preventDefault();
      escAcIdx = Math.min(escAcIdx + 1, itens.length - 1);
      atualizarItemAtivoEscala(itens);
    } else if (e.key === 'ArrowUp') {
      if (!aberto || itens.length === 0) return;
      e.preventDefault();
      escAcIdx = Math.max(escAcIdx - 1, 0);
      atualizarItemAtivoEscala(itens);
    } else if (e.key === 'Enter') {
      if (aberto && escAcIdx >= 0 && itens[escAcIdx]) {
        e.preventDefault();
        const it = itens[escAcIdx];
        selecionarMilitarEscala(it.dataset.nome, it.dataset.id);
      }
    } else if (e.key === 'Escape') {
      if (box) { box.classList.add('hidden'); }
      escNomeInput.setAttribute('aria-expanded', 'false');
    }
  });
  // Fecha o dropdown ao clicar fora do wrapper do autocomplete
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.autocomplete-wrap')) {
      const box = document.getElementById('escala-autocomplete-results');
      if (box) box.classList.add('hidden');
      escNomeInput.setAttribute('aria-expanded', 'false');
    }
  });

  // Preview de diárias no sub-formulário de Escala
  const escQtdAparicoesInput = document.getElementById('esc_qtd_aparicoes');
  escQtdAparicoesInput.addEventListener('input', () => {
    const val = parseInt(escQtdAparicoesInput.value, 10) || 1;
    document.getElementById('diarias-calc-preview').textContent = val * 2;
    updateEscalaBudgetPreview();
  });

  // Filtros de Relatório
  document.getElementById('filter-mes').addEventListener('change', () => { renderRelatorioTable(); renderRelatorioDiario(); });
  document.getElementById('filter-ano').addEventListener('change', () => { renderRelatorioTable(); renderRelatorioDiario(); });
  document.getElementById('filter-search-input').addEventListener('input', renderRelatorioTable);

  // Exportar relatório
  document.getElementById('btn-export').addEventListener('click', exportRelatorioToCSV);
  document.getElementById('btn-relatorio-pdf-consolidado').addEventListener('click', gerarRelatorioPdfConsolidado);

  // Relatório Diário de Diárias (por data / por operação + copiar)
  document.getElementById('btn-rel-diario-data').addEventListener('click', () => { relDiarioModo = 'data'; renderRelatorioDiario(); });
  document.getElementById('btn-rel-diario-operacao').addEventListener('click', () => { relDiarioModo = 'operacao'; renderRelatorioDiario(); });
  document.getElementById('btn-relatorio-pdf-diario').addEventListener('click', gerarRelatorioPdfDiario);

  // Relatórios em PDF (estilo SGEPM) — Eventos + modal de pré-visualização/impressão
  document.getElementById('btn-relatorio-pdf-eventos').addEventListener('click', gerarRelatorioPdfEventos);
  document.getElementById('btn-imprimir-pdf').addEventListener('click', () => window.print());
  document.getElementById('btn-fechar-modal-pdf').addEventListener('click', () => document.getElementById('modal-relatorio-pdf').classList.add('hidden'));
  document.getElementById('btn-fechar-pdf-2').addEventListener('click', () => document.getElementById('modal-relatorio-pdf').classList.add('hidden'));

  // Excluir evento na Gaveta Lateral
  document.getElementById('btn-delete-evento').addEventListener('click', handleDeleteEvento);

  // Editar evento na Gaveta Lateral
  document.getElementById('btn-editar-evento').addEventListener('click', abrirModalEditarEvento);
  const fecharModalEditarEvento = () => document.getElementById('modal-editar-evento').classList.add('hidden');
  document.getElementById('btn-fechar-modal-editar-evento').addEventListener('click', fecharModalEditarEvento);
  document.getElementById('btn-cancelar-modal-editar-evento').addEventListener('click', fecharModalEditarEvento);
  document.getElementById('form-editar-evento').addEventListener('submit', handleSalvarEdicaoEvento);
  document.getElementById('edit-bairro').addEventListener('change', (e) => {
    document.getElementById('edit-bairro_outro').classList.toggle('hidden', e.target.value !== '__outro__');
  });

  // Filtros de data/texto da aba geral de Eventos
  document.getElementById('filter-eventos-inicio').addEventListener('change', renderEventosTab);
  document.getElementById('filter-eventos-fim').addEventListener('change', renderEventosTab);
  document.getElementById('filter-eventos-search').addEventListener('input', renderEventosTab);
  document.getElementById('btn-clear-date-filter').addEventListener('click', () => {
    document.getElementById('filter-eventos-inicio').value = '';
    document.getElementById('filter-eventos-fim').value = '';
    document.getElementById('filter-eventos-search').value = '';
    renderEventosTab();
    showToast('Filtros redefinidos.', 'info');
  });

  // Filtros e ações do Planejador de Diárias
  document.getElementById('plan-filter-mes').addEventListener('change', renderPlanejadorTab);
  document.getElementById('plan-filter-ano').addEventListener('change', renderPlanejadorTab);
  document.getElementById('btn-save-cota').addEventListener('click', handleSaveCota);
  document.getElementById('input-cota').addEventListener('input', (e) => {
    e.target.dataset.dirty = 'true';
  });

  // Calendário de Diárias (navegação por mês)
  document.getElementById('btn-prev-month-diarias').addEventListener('click', () => {
    state.calendarDiariasMonth--;
    if (state.calendarDiariasMonth < 0) {
      state.calendarDiariasMonth = 11;
      state.calendarDiariasYear--;
    }
    renderCalendarioDiarias();
  });
  document.getElementById('btn-next-month-diarias').addEventListener('click', () => {
    state.calendarDiariasMonth++;
    if (state.calendarDiariasMonth > 11) {
      state.calendarDiariasMonth = 0;
      state.calendarDiariasYear++;
    }
    renderCalendarioDiarias();
  });

  // Modal de Lançamento Rápido de Missão Avulsa
  const fecharModalMissao = () => document.getElementById('modal-missao-avulsa').classList.add('hidden');
  document.getElementById('btn-fechar-modal-missao').addEventListener('click', fecharModalMissao);
  document.getElementById('btn-cancelar-modal-missao').addEventListener('click', fecharModalMissao);
  document.getElementById('form-missao-avulsa').addEventListener('submit', handleCriarMissaoAvulsa);

  // Aba Operações: filtros + Nova Operação + modal + gaveta
  document.getElementById('filter-operacoes-situacao').addEventListener('change', renderOperacoesTab);
  document.getElementById('filter-operacoes-search').addEventListener('input', renderOperacoesTab);
  document.getElementById('btn-nova-operacao').addEventListener('click', () => abrirModalOperacao());
  const fecharModalOperacao = () => document.getElementById('modal-operacao').classList.add('hidden');
  document.getElementById('btn-fechar-modal-operacao').addEventListener('click', fecharModalOperacao);
  document.getElementById('btn-cancelar-modal-operacao').addEventListener('click', fecharModalOperacao);
  document.getElementById('form-operacao').addEventListener('submit', handleSalvarOperacao);

  // Gaveta de Operação
  document.getElementById('btn-close-drawer-op').addEventListener('click', closeDrawerOperacao);
  document.getElementById('btn-close-drawer-op-footer').addEventListener('click', closeDrawerOperacao);
  document.getElementById('drawer-op-overlay').addEventListener('click', closeDrawerOperacao);
  document.getElementById('btn-op-marcar-executada').addEventListener('click', handleMarcarOperacaoExecutada);
  document.getElementById('btn-op-delete').addEventListener('click', handleDeleteOperacao);
  document.getElementById('btn-op-editar').addEventListener('click', () => { if (state.currentOperacaoId) abrirModalOperacao(state.currentOperacaoId); });

  // Filtro de período do Dashboard (reprocessa os cards-resumo + donut de distribuição por tipo)
  document.getElementById('dashboard-filtro-mes').addEventListener('change', renderDashboardResumo);
  document.getElementById('dashboard-filtro-ano').addEventListener('change', renderDashboardResumo);

  // Cartão Programa
  document.getElementById('cartao-data').addEventListener('change', renderCartaoTab);

  // Setas de dia anterior/seguinte do navegador de data (protótipo do redesign)
  document.getElementById('btn-cartao-dia-anterior').addEventListener('click', () => deslocarDiaCartao(-1));
  document.getElementById('btn-cartao-dia-seguinte').addEventListener('click', () => deslocarDiaCartao(1));
  document.getElementById('btn-novo-cartao').addEventListener('click', () => handleCriarCartao(false));
  document.getElementById('btn-copiar-cartao').addEventListener('click', abrirModalCopiarCartao);
  document.getElementById('btn-fechar-modal-copiar').addEventListener('click', () => document.getElementById('modal-copiar-cartao').classList.add('hidden'));
  document.getElementById('btn-cancelar-copia-cartao').addEventListener('click', () => document.getElementById('modal-copiar-cartao').classList.add('hidden'));
  document.getElementById('btn-confirmar-copia-cartao').addEventListener('click', handleConfirmarCopiaCartao);
  document.getElementById('btn-imprimir-cartao').addEventListener('click', () => {
    if (!state.cartaoAtual) {
      showToast('Não há Cartão Programa nesta data para imprimir.', 'warning');
      return;
    }
    window.print();
  });
  document.getElementById('btn-excluir-cartao').addEventListener('click', handleExcluirCartao);

  // Menu overflow (⋯) do Cartão Programa — Cartões Padrão / Novo Cartão Padrão.
  // Posiciona o menu com position:fixed calculado do botão, pra escapar do clip dos
  // containers de scroll (.main-content overflow:hidden, .tab-content overflow-y:auto),
  // que não podem virar visible sem quebrar a rolagem do app.
  const overflowToggle = document.getElementById('btn-cartao-overflow-toggle');
  const overflowMenu = document.getElementById('cartao-overflow-menu');
  const posicionarOverflowCartao = () => {
    const rect = overflowToggle.getBoundingClientRect();
    overflowMenu.style.position = 'fixed';
    overflowMenu.style.top = `${rect.bottom + 6}px`;
    overflowMenu.style.right = `${window.innerWidth - rect.right}px`;
    overflowMenu.style.left = 'auto';
  };
  const fecharOverflowCartao = () => {
    overflowMenu.classList.add('hidden');
    overflowToggle.setAttribute('aria-expanded', 'false');
    window.removeEventListener('scroll', fecharOverflowCartao, true);
    window.removeEventListener('resize', fecharOverflowCartao);
  };
  overflowToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const abrindo = overflowMenu.classList.contains('hidden');
    if (abrindo) {
      posicionarOverflowCartao();
      overflowMenu.classList.remove('hidden');
      overflowToggle.setAttribute('aria-expanded', 'true');
      // Menu fixo não acompanha scroll — fecha ao rolar/redimensionar (capture pega o scroll do .tab-content)
      window.addEventListener('scroll', fecharOverflowCartao, true);
      window.addEventListener('resize', fecharOverflowCartao);
    } else {
      fecharOverflowCartao();
    }
  });
  document.addEventListener('click', (e) => {
    if (!overflowMenu.classList.contains('hidden') && !e.target.closest('#cartao-overflow-dropdown') && e.target !== overflowMenu && !overflowMenu.contains(e.target)) {
      fecharOverflowCartao();
    }
  });

  // Templates de Cartão Programa (P3)
  document.getElementById('btn-toggle-templates').addEventListener('click', () => {
    fecharOverflowCartao();
    const painel = document.getElementById('cartao-templates-panel');
    painel.classList.toggle('hidden');
    if (!painel.classList.contains('hidden')) renderTemplatesTab();
  });
  document.getElementById('btn-novo-template').addEventListener('click', () => {
    fecharOverflowCartao();
    document.getElementById('form-novo-template').reset();
    document.getElementById('modal-novo-template').classList.remove('hidden');
  });
  const fecharModalTemplate = () => document.getElementById('modal-novo-template').classList.add('hidden');
  document.getElementById('btn-fechar-modal-template').addEventListener('click', fecharModalTemplate);
  document.getElementById('btn-cancelar-modal-template').addEventListener('click', fecharModalTemplate);
  document.getElementById('form-novo-template').addEventListener('submit', handleCriarTemplate);
  document.getElementById('btn-buscar-template').addEventListener('click', handleBuscarTemplateSugerido);
  document.getElementById('form-cartao-vtr').addEventListener('submit', handleAddCartaoVtr);
  document.getElementById('cartao-fiscal').addEventListener('change', () => {
    atualizarCampoSobreavisoPrint();
    handleSalvarCabecalhoCartao();
  });
  document.getElementById('cartao-adjunto').addEventListener('change', handleSalvarCabecalhoCartao);
  document.getElementById('cartao-sobreaviso').addEventListener('change', () => {
    atualizarCampoSobreavisoPrint();
    handleSalvarCabecalhoCartao();
  });
  document.getElementById('cartao-tipo-periodo').addEventListener('change', handleSalvarCabecalhoCartao);

  // Modal de Edição de Viatura do Cartão Programa
  const fecharModalEditarVtr = () => document.getElementById('modal-editar-vtr').classList.add('hidden');
  document.getElementById('btn-fechar-modal-editar-vtr').addEventListener('click', fecharModalEditarVtr);
  document.getElementById('btn-cancelar-modal-editar-vtr').addEventListener('click', fecharModalEditarVtr);
  document.getElementById('form-editar-vtr').addEventListener('submit', handleSalvarEdicaoVtr);

}

// Popula os seletores de mês/ano com o período corrente selecionado
function initPeriodFilters() {
  const agora = new Date();
  const mesAtual = String(agora.getMonth() + 1).padStart(2, '0');
  const anoAtual = agora.getFullYear();

  ['filter-ano', 'plan-filter-ano', 'dashboard-filtro-ano'].forEach(id => {
    const sel = document.getElementById(id);
    sel.innerHTML = '';
    for (let ano = anoAtual - 1; ano <= anoAtual + 2; ano++) {
      const opt = document.createElement('option');
      opt.value = String(ano);
      opt.textContent = ano;
      if (ano === anoAtual) opt.selected = true;
      sel.appendChild(opt);
    }
  });

  document.getElementById('filter-mes').value = mesAtual;
  document.getElementById('plan-filter-mes').value = mesAtual;
  document.getElementById('dashboard-filtro-mes').value = mesAtual;
}

// -------------------------------------------------------------
// LOGIN / LOGOUT FLOWS
// -------------------------------------------------------------
async function handleLogin(e) {
  e.preventDefault();
  
  const usuario = document.getElementById('login-usuario').value;
  const senha = document.getElementById('login-senha').value;
  const errorEl = document.getElementById('login-error');

  errorEl.classList.add('hidden');

  try {
    const response = await apiFetch(`${API_BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, senha })
    });

    if (response.ok) {
      const userData = await response.json();
      localStorage.setItem('user', JSON.stringify(userData));
      state.user = userData;
      
      // Reseta form
      document.getElementById('form-login').reset();
      
      // Transiciona visualmente
      document.getElementById('login-container').classList.add('hidden');
      
      applyRolePermissions(userData);
      fetchData();
      showToast(`Bem-vindo, ${esc(userData.nome)}!`, 'success');
    } else {
      errorEl.classList.remove('hidden');
    }
  } catch (error) {
    console.error("Erro ao efetuar login:", error);
    showToast("Falha na comunicação com o servidor.", "danger");
  }
}

// Limpa apenas o estado local (usado no logout e na expiração de sessão)
function encerrarSessaoLocal() {
  localStorage.removeItem('user');
  state.user = null;
  state.eventos = [];
  state.operacoes = [];
  state.alocacoes = [];
  state.escalas = [];
  state.currentEventId = null;
  state.currentOperacaoId = null;
  state.cartaoAtual = null;

  closeDrawer();
  closeDrawerOperacao();
  document.getElementById('login-container').classList.remove('hidden');
}

async function handleLogout() {
  // Invalida o token no servidor antes de limpar o estado local
  try {
    await apiFetch(`${API_BASE_URL}/api/logout`, { method: 'POST' });
  } catch (error) {
    console.error("Erro ao encerrar sessão no servidor:", error);
  }

  encerrarSessaoLocal();
  showToast('Sessão encerrada com sucesso.', 'info');
}

// Alterar a própria senha (via modal)
async function handleAlterarSenha(e) {
  e.preventDefault();

  const senhaAtual = document.getElementById('senha-atual').value;
  const senhaNova = document.getElementById('senha-nova').value;
  const senhaConfirma = document.getElementById('senha-confirma').value;

  if (senhaNova !== senhaConfirma) {
    showToast('A confirmação não confere com a nova senha.', 'warning');
    return;
  }

  await comBotaoCarregando(e.submitter, async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/alterar-senha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha_atual: senhaAtual, senha_nova: senhaNova })
      });

      const dados = await res.json();

      if (res.ok) {
        document.getElementById('modal-senha').classList.add('hidden');
        document.getElementById('form-alterar-senha').reset();
        showToast('Senha alterada com sucesso!', 'success');
      } else {
        showToast(esc(dados.error) || 'Falha ao alterar a senha.', 'danger');
      }
    } catch (error) {
      console.error("Erro ao alterar senha:", error);
      showToast('Falha na comunicação com o servidor.', 'danger');
    }
  });
}

// -------------------------------------------------------------
// OBTENÇÃO DE DADOS DO SERVIDOR
// -------------------------------------------------------------
async function fetchData() {
  document.body.classList.add('sgo-sincronizando');
  try {
    // Guarda de resiliência compartilhada pelas duas ondas: uma resposta que não é array
    // indica falha da rota (ex.: o Supabase devolve erro/{error} 500, ou um 522 sob carga).
    // Não sobrescreve o estado bom com lixo — mantém o valor anterior (se já era array) ou
    // cai para [] — evitando o "state.eventos.filter is not a function" que quebrava a tela.
    let houveFalhaParcial = false;
    const usarLista = (novo, atual) => {
      if (Array.isArray(novo)) return novo;
      houveFalhaParcial = true;
      return Array.isArray(atual) ? atual : [];
    };

    // 1ª onda (núcleo): só o que Dashboard/Turno/Eventos/Planejador precisam para a primeira
    // pintura. pessoal (244 linhas — o payload mais pesado) e viaturas ficam de fora daqui:
    // não são usados na tela de entrada de nenhum perfil (só no Cartão, no autocomplete de
    // escala e no fallback de setor do Mapa), então não devem competir por banda no celular
    // durante o 1º paint — vão na 2ª onda logo abaixo, sem travar a pintura.
    // operacoes/escalas são P3-only no servidor (GET exige exigirP3, ver server.js) porque
    // nenhuma tela de Adjunto/Oficial usa state.operacoes/state.escalas — pedir mesmo assim
    // daria 403 a cada refresh (inicial + polling de 60s) e disparia o toast de "falha
    // parcial" incorretamente, já que a falha aqui é permanente (permissão), não transitória.
    const ehP3 = state.user && state.user.role === 'P3';
    const [eventos, operacoes, alocacoes, escalas, config] = await Promise.all([
      apiFetch(`${API_BASE_URL}/api/eventos`).then(r => r.json()),
      ehP3 ? apiFetch(`${API_BASE_URL}/api/operacoes`).then(r => r.json()) : Promise.resolve([]),
      apiFetch(`${API_BASE_URL}/api/alocacoes`).then(r => r.json()),
      ehP3 ? apiFetch(`${API_BASE_URL}/api/escalas`).then(r => r.json()) : Promise.resolve([]),
      apiFetch(`${API_BASE_URL}/api/config`).then(r => r.json()),
    ]);
    state.eventos = usarLista(eventos, state.eventos);
    state.operacoes = usarLista(operacoes, state.operacoes);
    state.alocacoes = usarLista(alocacoes, state.alocacoes);
    state.escalas = usarLista(escalas, state.escalas);
    // config é objeto (não lista): só aceita se veio com o campo esperado.
    if (config && typeof config === 'object' && !Array.isArray(config) && 'cota_mensal_diarias' in config) {
      state.config = config;
    } else {
      houveFalhaParcial = true;
      if (!state.config) state.config = { cota_mensal_diarias: 0 };
    }

    // Cadastro de Bairros (fetch próprio, independente) — alimenta o select de Bairro
    popularSelectBairros();

    updateStats();

    // 1ª pintura da aba ativa já com o núcleo carregado — não espera a 2ª onda. Nenhuma aba
    // de entrada padrão (Dashboard/Turno) depende de pessoal/viaturas; onde há uso (Mapa),
    // o fallback degrada sem quebrar.
    const activeTab = document.querySelector('.nav-btn.active').getAttribute('data-target');
    if (activeTab === 'tab-dashboard') {
      renderDashboardResumo();
      renderDashboardOperacional();
    } else if (activeTab === 'tab-turno') {
      renderTurnoTab();
    } else if (activeTab === 'tab-eventos') {
      renderEventosTab();
    } else if (activeTab === 'tab-mapa') {
      renderMapaTab();
    } else if (activeTab === 'tab-operacoes') {
      renderOperacoesTab();
    } else if (activeTab === 'tab-planejador') {
      renderPlanejadorTab();
    }

    // 2ª onda: pessoal + viaturas (seletores do Cartão, autocomplete de escala, fallback de
    // setor no Mapa). Carregam logo após o núcleo, sem travar a 1ª pintura, mas ainda dentro
    // do try p/ a mesma resiliência. As abas que os consomem (Cartão/Operações/Mapa/Pessoal/
    // Viaturas) leem state ao vivo no próprio render, então não é preciso re-renderizar aqui.
    const [pessoal, viaturas] = await Promise.all([
      apiFetch(`${API_BASE_URL}/api/pessoal`).then(r => r.json()),
      apiFetch(`${API_BASE_URL}/api/viaturas`).then(r => r.json()),
    ]);
    state.pessoal = usarLista(pessoal, state.pessoal);
    state.viaturas = usarLista(viaturas, state.viaturas);
    popularDatalistViaturas();

    if (houveFalhaParcial) {
      showToast('Parte dos dados não carregou (servidor lento). Recarregue se algo parecer incompleto.', 'warning');
    }

    // Se a gaveta lateral de detalhes do evento estiver aberta, recarrega
    if (state.currentEventId) {
      await fetchEventDetails(state.currentEventId);
    }
    // Idem para a gaveta de Operação
    if (state.currentOperacaoId) {
      await fetchOperacaoDetails(state.currentOperacaoId);
    }
  } catch (error) {
    // Falha total (ex.: Promise.all rejeitado porque uma rota devolveu HTML de erro 522
    // e o r.json() estourou). O estado anterior é preservado — a tela não quebra, só não
    // atualiza; avisa o usuário em vez de falhar em silêncio.
    console.error("Erro ao buscar dados do servidor:", error);
    showToast('Falha ao carregar dados do servidor. Verifique a conexão e recarregue.', 'danger');
  } finally {
    document.body.classList.remove('sgo-sincronizando');
  }
}

// -------------------------------------------------------------
// COMPONENTES DASHBOARD E CALENDÁRIO
// -------------------------------------------------------------
// Selo ▲/▼ de tendência vs. período anterior. `atual`/`anterior` já contam eventos/diárias
// do período correspondente — calculado 100% client-side a partir de state.eventos/state.escalas
// (já carregados por completo, sem filtro de data no fetch), sem chamada nova ao backend.
function renderTendencia(elementId, atual, anterior) {
  const el = document.getElementById(elementId);
  if (!el) return;

  if (anterior === 0) {
    if (atual === 0) {
      el.innerHTML = '';
      el.className = 'stat-tendencia';
      return;
    }
    el.innerHTML = '<i data-lucide="trending-up"></i> novo';
    el.className = 'stat-tendencia tendencia-alta';
    lucide.createIcons();
    return;
  }

  const variacao = ((atual - anterior) / anterior) * 100;
  const icone = variacao > 0 ? 'trending-up' : (variacao < 0 ? 'trending-down' : 'minus');
  const classe = variacao > 0 ? 'tendencia-alta' : (variacao < 0 ? 'tendencia-baixa' : 'tendencia-estavel');
  const sinal = variacao > 0 ? '+' : '';
  el.className = `stat-tendencia ${classe}`;
  el.innerHTML = `<i data-lucide="${icone}"></i> ${sinal}${variacao.toFixed(0)}% vs. período anterior`;
  lucide.createIcons();
}

function updateStats() {
  // 1. Calcular eventos na semana atual (segunda a domingo) e na semana anterior
  const hoje = new Date();
  const primeiroDiaSemana = new Date(hoje.setDate(hoje.getDate() - hoje.getDay() + (hoje.getDay() === 0 ? -6 : 1))); // Segunda
  primeiroDiaSemana.setHours(0,0,0,0);

  const ultimoDiaSemana = new Date(primeiroDiaSemana);
  ultimoDiaSemana.setDate(primeiroDiaSemana.getDate() + 6); // Domingo
  ultimoDiaSemana.setHours(23,59,59,999);

  const primeiroDiaSemanaAnterior = new Date(primeiroDiaSemana);
  primeiroDiaSemanaAnterior.setDate(primeiroDiaSemana.getDate() - 7);
  const ultimoDiaSemanaAnterior = new Date(ultimoDiaSemana);
  ultimoDiaSemanaAnterior.setDate(ultimoDiaSemana.getDate() - 7);

  const eventosSemana = state.eventos.filter(e => {
    const dataEvt = new Date(e.data_inicio + 'T00:00:00');
    return dataEvt >= primeiroDiaSemana && dataEvt <= ultimoDiaSemana;
  });
  const eventosSemanaAnterior = state.eventos.filter(e => {
    const dataEvt = new Date(e.data_inicio + 'T00:00:00');
    return dataEvt >= primeiroDiaSemanaAnterior && dataEvt <= ultimoDiaSemanaAnterior;
  });

  document.getElementById('stat-eventos-semana').textContent = eventosSemana.length;
  renderTendencia('stat-eventos-semana-tendencia', eventosSemana.length, eventosSemanaAnterior.length);

  // 2. Diárias consumidas no mês corrente vs. cota mensal, e vs. o mês anterior
  const prefixoMesAtual = getLocalDateStr().slice(0, 7); // "YYYY-MM"
  // Atenção: "hoje" já foi mutado acima por hoje.setDate(...) (agora é a segunda-feira
  // desta semana) — usar prefixoMesAtual (derivado de getLocalDateStr(), sempre "hoje" de
  // verdade) para calcular o mês anterior, não a variável "hoje".
  const [anoAtualNum, mesAtualNum] = prefixoMesAtual.split('-').map(Number);
  const dataMesAnterior = new Date(anoAtualNum, mesAtualNum - 2, 1);
  const prefixoMesAnterior = `${dataMesAnterior.getFullYear()}-${String(dataMesAnterior.getMonth() + 1).padStart(2, '0')}`;

  // Diárias consumidas agora vêm das OPERAÇÕES (não mais dos eventos).
  const idsOperacoesMes = new Set(
    (state.operacoes || []).filter(o => o.data_inicio.startsWith(prefixoMesAtual)).map(o => o.id)
  );
  const consumidoMes = state.escalas
    .filter(s => idsOperacoesMes.has(s.operacao_id))
    .reduce((sum, s) => sum + (s.total_diarias || 0), 0);

  const idsOperacoesMesAnterior = new Set(
    (state.operacoes || []).filter(o => o.data_inicio.startsWith(prefixoMesAnterior)).map(o => o.id)
  );
  const consumidoMesAnterior = state.escalas
    .filter(s => idsOperacoesMesAnterior.has(s.operacao_id))
    .reduce((sum, s) => sum + (s.total_diarias || 0), 0);

  const cota = state.config ? (state.config.cota_mensal_diarias || 0) : 0;

  // KPI de diárias: número grande = consumido, sufixo = "de <cota>", rodapé = barra + %
  const statDiarias = document.getElementById('stat-diarias-mes');
  statDiarias.textContent = consumidoMes;
  statDiarias.style.color = (cota > 0 && consumidoMes > cota) ? 'var(--danger-fg)' : '';
  document.getElementById('stat-diarias-mes-sufixo').textContent = `de ${cota}`;
  const pctCotaMes = cota > 0 ? Math.min(100, Math.round((consumidoMes / cota) * 100)) : 0;
  document.getElementById('stat-diarias-bar').style.width = `${pctCotaMes}%`;
  document.getElementById('stat-diarias-pct').textContent = `${pctCotaMes}%`;

  // KPI de operações do mês corrente (o protótipo tem esse card; o dado já estava no state)
  const operacoesMes = (state.operacoes || []).filter(o => o.data_inicio.startsWith(prefixoMesAtual));
  const executadas = operacoesMes.filter(o => o.situacao === 'Executada').length;
  document.getElementById('stat-operacoes-periodo').textContent = operacoesMes.length;
  document.getElementById('stat-operacoes-periodo-sub').textContent =
    operacoesMes.length ? `${executadas} executada(s) · ${operacoesMes.length - executadas} planejada(s)` : 'nenhuma no mês';

  renderDashboardOperacoesRecentes();
  renderDashboardEventosProximos();
}

// Operações mais recentes (as 5 últimas por data), montadas do state — sem chamada nova à API.
function renderDashboardOperacoesRecentes() {
  const tbody = document.getElementById('dash-operacoes-lista');
  if (!tbody) return;

  const recentes = [...(state.operacoes || [])]
    .sort((a, b) => (b.data_inicio || '').localeCompare(a.data_inicio || ''))
    .slice(0, 5);

  if (recentes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="color:var(--text-muted);padding:20px;">Nenhuma operação cadastrada.</td></tr>';
    return;
  }

  tbody.innerHTML = recentes.map(op => {
    const escalasOp = (state.escalas || []).filter(s => s.operacao_id === op.id);
    const temEscala = escalasOp.length > 0;
    const diarias = temEscala
      ? escalasOp.reduce((sum, s) => sum + (s.total_diarias || 0), 0)
      : (op.qtd_diarias_estimada || 0);
    return `
      <tr>
        <td data-label="Data">${esc((op.data_inicio || '').split('-').reverse().join('/'))}</td>
        <td class="card-title-cell"><strong>${esc(op.nome_operacao)}</strong></td>
        <td data-label="Tipo">${esc(op.tipo_operacao) || '-'}</td>
        <td data-label="Situação">${badgeSituacaoOperacao(op.situacao)}</td>
        <td class="text-center" data-label="Diárias" style="color:var(--warning-fg);font-weight:700;">${diarias}${temEscala ? '' : ' <span style="color:var(--text-muted);font-weight:400;font-size:0.72rem;">(est.)</span>'}</td>
        <td class="text-center" data-label="Escalados">${escalasOp.length}</td>
      </tr>`;
  }).join('');
}

// Próximos 5 eventos a partir de hoje — trilho lateral do Dashboard.
function renderDashboardEventosProximos() {
  const tbody = document.getElementById('dash-eventos-proximos-lista');
  if (!tbody) return;

  const hojeStr = getLocalDateStr();
  const proximos = (state.eventos || [])
    .filter(e => (e.data_inicio || '') >= hojeStr)
    .sort((a, b) => (a.data_inicio || '').localeCompare(b.data_inicio || ''))
    .slice(0, 5);

  if (proximos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center" style="color:var(--text-muted);padding:20px;">Nenhum evento futuro.</td></tr>';
    return;
  }

  const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  tbody.innerHTML = proximos.map(evt => {
    const [ano, mes, dia] = evt.data_inicio.split('-');
    const diaSemana = DIAS[new Date(evt.data_inicio + 'T00:00:00').getDay()];
    // title nas células estreitas: o texto sai com reticências quando não cabe
    return `
      <tr>
        <td>${esc(`${dia}/${mes} (${diaSemana})`)}</td>
        <td title="${esc(evt.nome_evento)}">
          <strong>${esc(evt.nome_evento)}</strong>
          <span class="celula-sub">${esc(evt.bairro) || 'Bairro não informado'}</span>
        </td>
        <td title="${esc(evt.num_os_manual) || ''}"><code style="color:var(--primary);">${esc(evt.num_os_manual) || '-'}</code></td>
      </tr>`;
  }).join('');
}

// -------------------------------------------------------------
// DASHBOARD: ALERTAS CONSOLIDADOS + PATRULHAMENTO DE HOJE
// -------------------------------------------------------------

// Eventos que já estão em andamento ou começam nos próximos 3 dias e ainda não têm Número da OS e/ou Número SEI
function calcularAlertasEventosUrgentes() {
  const hojeStr = getLocalDateStr();
  const hoje = new Date(hojeStr + 'T00:00:00');
  const alertas = [];

  state.eventos.forEach(evt => {
    const faltando = [];
    if (!evt.num_os_manual) faltando.push('Número da OS');
    if (!evt.num_sei) faltando.push('Número SEI');
    if (faltando.length === 0) return;

    const dataInicio = new Date(evt.data_inicio + 'T00:00:00');
    const dataFim = new Date((evt.data_termino || evt.data_inicio) + 'T00:00:00');
    const diffDias = Math.round((dataInicio - hoje) / (1000 * 60 * 60 * 24));
    const emAndamento = dataInicio <= hoje && hoje <= dataFim;

    if (!emAndamento && !(diffDias >= 0 && diffDias <= 3)) return;

    const dataBr = evt.data_inicio.split('-').reverse().join('/');
    let quando;
    if (emAndamento) quando = 'está em andamento';
    else if (diffDias === 0) quando = 'ocorre hoje';
    else if (diffDias === 1) quando = 'ocorre amanhã';
    else quando = `ocorre em ${diffDias} dias`;

    alertas.push({
      tipo: 'evento-sem-numeracao',
      mensagem: `Evento "${evt.nome_evento}" ${quando} (${dataBr}) e ainda está sem ${faltando.join(' e sem ')} informado.`
    });
  });

  return alertas;
}

// Busca o Cartão Programa de hoje (se existir) e atualiza card, alertas e painel de patrulhamento
async function renderDashboardOperacional() {
  const hojeStr = getLocalDateStr();
  let cartaoHoje = null;

  try {
    const res = await apiFetch(`${API_BASE_URL}/api/cartoes?data=${hojeStr}`);
    const lista = await res.json();
    if (lista.length > 0) {
      const resDetalhe = await apiFetch(`${API_BASE_URL}/api/cartoes/${lista[0].id}`);
      cartaoHoje = await resDetalhe.json();
    }
  } catch (error) {
    console.error("Erro ao verificar o Cartão Programa de hoje:", error);
  }

  // Card de módulo "Cartão Programa" — alimentado pela mesma consulta acima, sem fetch duplicado.
  const dashResumoCartao = document.getElementById('dash-resumo-cartao');
  if (dashResumoCartao) {
    dashResumoCartao.textContent = cartaoHoje
      ? `${cartaoHoje.viaturas.length} viatura(s) hoje`
      : 'Pendente — nada lançado hoje';
  }

  // Alertas consolidados: conflitos do cartão de hoje + eventos com OS pendente se aproximando
  const alertasCartao = cartaoHoje ? calcularAlertasCartao(cartaoHoje) : [];
  const alertasEventos = calcularAlertasEventosUrgentes();
  const todosAlertas = [...alertasCartao, ...alertasEventos];

  // KPI "Conflitos Hoje" — só os do cartão de hoje (os de evento não são conflito de turno).
  const statConflitos = document.getElementById('stat-conflitos');
  if (statConflitos) {
    statConflitos.textContent = alertasCartao.length;
    // sem conflito o card fica verde em vez de vermelho — evita alarme falso permanente
    const semConflito = alertasCartao.length === 0;
    const corFg = semConflito ? 'var(--success-fg)' : 'var(--danger-fg)';
    const corBg = semConflito ? 'var(--success-bg)' : 'var(--danger-bg)';
    document.getElementById('stat-conflitos-label').style.color = corFg;
    const icone = document.getElementById('stat-conflitos-icone');
    icone.style.background = corBg;
    icone.style.color = corFg;
    document.getElementById('stat-cartao-hoje').textContent = cartaoHoje
      ? `Cartão de hoje: ${cartaoHoje.viaturas.length} viatura(s)`
      : 'Cartão de hoje não lançado';
  }

  const listaAlertas = document.getElementById('dashboard-alertas-lista');
  if (todosAlertas.length === 0) {
    listaAlertas.innerHTML = `
      <div class="dash-alertas-vazio">
        <i data-lucide="check-circle"></i>
        <span>Nenhum alerta operacional no momento.</span>
      </div>`;
  } else {
    listaAlertas.innerHTML = todosAlertas.map(a => {
      // conflito de cartão = âmbar; evento sem numeração = vermelho
      const deCartao = a.tipo !== 'evento-sem-numeracao';
      const cor = deCartao ? 'var(--warning-fg)' : 'var(--danger-fg)';
      const bg = deCartao ? 'var(--warning-bg)' : 'var(--danger-bg)';
      const icone = deCartao ? 'alert-triangle' : 'alert-circle';
      const titulo = deCartao ? 'Conflito no Cartão Programa de hoje' : 'Evento próximo com pendência';
      return `
        <div class="dash-alerta-item">
          <span class="dash-alerta-icone" style="background:${bg};color:${cor};"><i data-lucide="${icone}"></i></span>
          <div class="dash-alerta-texto">
            <div class="dash-alerta-titulo">${esc(titulo)}</div>
            <div class="dash-alerta-sub">${esc(a.mensagem)}</div>
          </div>
        </div>`;
    }).join('');
  }

  // Painel "Patrulhamento de Hoje"
  const vazioEl = document.getElementById('dash-patrulhamento-vazio');
  const listaEl = document.getElementById('dash-patrulhamento-lista');

  if (!cartaoHoje || cartaoHoje.viaturas.length === 0) {
    vazioEl.classList.remove('hidden');
    listaEl.innerHTML = '';
  } else {
    vazioEl.classList.add('hidden');
    listaEl.innerHTML = cartaoHoje.viaturas.map(v => `
      <tr>
        <td class="card-title-cell"><strong>${esc(v.prefixo)}</strong></td>
        <td data-label="Setor">${esc(v.setor)}</td>
        <td data-label="Companhia">${esc(v.companhia) || '-'}</td>
        <td data-label="Comandante">${esc(v.comandante) || 'Não informado'}</td>
      </tr>
    `).join('');
  }

  lucide.createIcons();
}

// Atalho: navega para o Cartão Programa já com a data de hoje selecionada
window.handleIrParaCartaoHoje = function() {
  document.getElementById('cartao-data').value = getLocalDateStr();
  document.getElementById('nav-btn-cartao').click();
};

// Clique genérico nos cards-resumo do Dashboard: troca de aba reaproveitando o nav-btn já existente
window.handleDashboardCardClick = function(navBtnId) {
  document.getElementById(navBtnId).click();
};

// Cores da distribuição por tipo — reaproveita exatamente as mesmas variáveis já usadas nos
// badges de tipo_evento (Listar Eventos), pra consistência visual automática entre as telas.
const CORES_TIPO_EVENTO = {
  'Show': 'var(--badge-evento-1)',
  'Futebol': 'var(--badge-evento-2)',
  'Religioso': 'var(--badge-evento-3)',
  'Ato Público': 'var(--warning)',
  'Cultural': 'var(--badge-evento-4)',
  'Evento Junino': 'var(--badge-evento-6)',
  'Missão Avulsa': 'var(--badge-evento-5)',
  'Outros': 'var(--badge-neutro)'
};
function corTipoEvento(tipo) {
  return CORES_TIPO_EVENTO[tipo] || 'var(--badge-neutro)';
}

// Donut SVG feito à mão (sem lib nova), mesmo espírito de renderSparkline/renderSazonalidadeChart —
// cada fatia é um segmento de circle via stroke-dasharray/stroke-dashoffset.
function renderDashboardDonut(distribuicaoTipo) {
  const container = document.getElementById('dashboard-donut-tipo');
  if (!container) return;

  const total = (distribuicaoTipo || []).reduce((sum, t) => sum + t.total_eventos, 0);
  if (total === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:24px;">Sem eventos neste período.</p>';
    return;
  }

  const r = 40, cx = 50, cy = 50, larguraTraço = 16;
  const circunferencia = 2 * Math.PI * r;
  let acumulado = 0;
  const fatias = distribuicaoTipo.map(t => {
    const comprimento = (t.total_eventos / total) * circunferencia;
    const offset = -acumulado;
    acumulado += comprimento;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${corTipoEvento(t.tipo_evento)}" stroke-width="${larguraTraço}" stroke-dasharray="${comprimento} ${circunferencia - comprimento}" stroke-dashoffset="${offset}" transform="rotate(-90 ${cx} ${cy})"><title>${esc(t.tipo_evento)}: ${t.total_eventos} evento(s)</title></circle>`;
  }).join('');

  const legenda = distribuicaoTipo.map(t => `
    <span><i class="legenda-dot" style="background:${corTipoEvento(t.tipo_evento)};"></i> ${esc(t.tipo_evento)} (${t.total_eventos})</span>
  `).join('');

  container.innerHTML = `
    <svg viewBox="0 0 100 100" class="dashboard-donut-svg">
      ${fatias}
      <text x="50" y="55" text-anchor="middle" class="dashboard-donut-total">${total}</text>
    </svg>
    <div class="dashboard-donut-legenda">${legenda}</div>
  `;
}

async function renderDashboardResumo() {
  const mes = document.getElementById('dashboard-filtro-mes').value;
  const ano = document.getElementById('dashboard-filtro-ano').value;

  try {
    const res = await apiFetch(`${API_BASE_URL}/api/dashboard-resumo?mes=${mes}&ano=${ano}`);
    const resumo = await res.json();
    if (!res.ok) throw new Error(resumo.error || 'Falha ao carregar o resumo do Dashboard.');

    // Os cards de Módulo do protótipo têm uma descrição fixa; aqui essa mesma linha
    // carrega o número vivo do período, para não perder informação no redesign.
    const consumido = resumo.diarias.total_pago_periodo;
    const planejado = resumo.diarias.planejado_periodo || 0;
    const cota = resumo.diarias.cota_mensal || 0;

    document.getElementById('dash-resumo-eventos-sub').textContent =
      `${resumo.eventos.total_periodo} no período · ${resumo.eventos.proximos_7_dias} em 7 dias`;
    document.getElementById('dash-resumo-diarias').textContent = `${consumido} de ${cota} diárias`;
    document.getElementById('dash-resumo-efetivo').textContent =
      `${resumo.efetivo_total_periodo} militares empregados`;
    document.getElementById('dash-resumo-pessoal').textContent =
      `${resumo.pessoal.total} cadastrados · ${resumo.pessoal.pracas} praças / ${resumo.pessoal.oficiais} oficiais`;
    document.getElementById('dash-resumo-usuarios').textContent = `${resumo.usuarios.total} contas do sistema`;

    const rotuloPeriodo = document.getElementById('dash-diarias-periodo');
    if (rotuloPeriodo) rotuloPeriodo.textContent = `${mes}/${ano}`;

    atualizarCotaSidebar(consumido, planejado, cota, `${mes}/${ano}`);
    renderDashboardDonutDiarias(consumido, planejado, cota);
    renderDashboardDonut(resumo.distribuicao_tipo);
    renderTopMilitares(resumo.top_militares);
  } catch (error) {
    console.error('Erro ao carregar o resumo do Dashboard:', error);
    ['dash-resumo-eventos-sub', 'dash-resumo-diarias', 'dash-resumo-efetivo', 'dash-resumo-pessoal', 'dash-resumo-usuarios']
      .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = 'Falha ao carregar.'; });
  }
}

// Card "Cota Mensal de Diárias" da sidebar (protótipo do redesign): anel de progresso +
// Consumido/Disponível/Total. O anel é o mesmo truque de stroke-dasharray dos donuts —
// r=15.5 => circunferência ≈ 97, que é o valor de referência usado no dasharray.
function atualizarCotaSidebar(consumido, planejado, cota, periodo) {
  const card = document.getElementById('cota-sidebar-card');
  if (!card) return;

  const usado = consumido + planejado;
  const pct = cota > 0 ? Math.min(100, Math.round((usado / cota) * 100)) : 0;
  const CIRC = 97;

  document.getElementById('cota-sidebar-periodo').textContent = periodo;
  document.getElementById('cota-sidebar-pct').textContent = `${pct}%`;
  document.getElementById('cota-sidebar-arco').setAttribute('stroke-dasharray', `${(pct / 100) * CIRC} ${CIRC}`);
  document.getElementById('cota-sidebar-consumido').textContent = consumido;
  document.getElementById('cota-sidebar-disponivel').textContent = Math.max(0, cota - usado);
  document.getElementById('cota-sidebar-total').textContent = cota;
}

// Donut "Diárias — Visão Geral": consumido (escalas reais) x planejado (estimativa das
// operações sem escala) x disponível. Mesma técnica dos outros gráficos do projeto —
// SVG à mão, sem lib. Ver renderDashboardDonut logo acima.
function renderDashboardDonutDiarias(consumido, planejado, cota) {
  const container = document.getElementById('dashboard-donut-diarias');
  if (!container) return;

  const usado = consumido + planejado;
  if (cota <= 0 && usado === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:24px;">Sem cota nem diárias lançadas neste período.</p>';
    return;
  }

  // A escala do donut é a cota; se estourou, passa a ser o próprio total usado.
  const base = Math.max(cota, usado) || 1;
  const disponivel = Math.max(0, cota - usado);
  const r = 40, cx = 50, cy = 50, traco = 16;
  const circ = 2 * Math.PI * r;

  const fatias = [
    { valor: consumido, cor: 'var(--success)', rotulo: 'Consumido (escalas reais)' },
    { valor: planejado, cor: 'var(--primary-solid)', rotulo: 'Planejado (estimado)' },
    { valor: disponivel, cor: 'var(--border-color)', rotulo: 'Disponível' }
  ].filter(f => f.valor > 0);

  let acumulado = 0;
  const arcos = fatias.map(f => {
    const comprimento = (f.valor / base) * circ;
    const offset = -acumulado;
    acumulado += comprimento;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${f.cor}" stroke-width="${traco}" stroke-dasharray="${comprimento} ${circ - comprimento}" stroke-dashoffset="${offset}" transform="rotate(-90 ${cx} ${cy})"><title>${esc(f.rotulo)}: ${f.valor}</title></circle>`;
  }).join('');

  const legenda = fatias.map(f => {
    const pct = base > 0 ? Math.round((f.valor / base) * 100) : 0;
    return `<span><i class="legenda-dot" style="background:${f.cor}"></i>${esc(f.rotulo)} — <strong>${f.valor} (${pct}%)</strong></span>`;
  }).join('');

  container.innerHTML = `
    <svg viewBox="0 0 100 100" class="dashboard-donut-svg" role="img" aria-label="Diárias do período: ${consumido} consumidas, ${planejado} planejadas, cota ${cota}">
      ${arcos}
      <text x="50" y="49" text-anchor="middle" class="dashboard-donut-total">${consumido}</text>
      <text x="50" y="59" text-anchor="middle" class="dashboard-donut-sub">Consumidas</text>
    </svg>
    <div class="dashboard-donut-legenda">${legenda}</div>
  `;
}

// Top 10 — Ranking de Empenho (militares com mais diárias no período filtrado).
// Visível em desktop e mobile (usa o padrão table-cards-mobile já estabelecido).
function renderTopMilitares(topMilitares) {
  const tbody = document.getElementById('table-top-militares-body');
  if (!tbody) return;

  if (!topMilitares || topMilitares.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px;">Nenhuma escala lançada neste período.</td></tr>`;
    return;
  }

  tbody.innerHTML = topMilitares.map((m, i) => `
    <tr>
      <td data-label="Posição">${i + 1}º</td>
      <td class="card-title-cell">
        <strong>${esc(m.militar_nome)}</strong>${m.posto_graduacao ? `<span class="rank-posto">${esc(m.posto_graduacao)}</span>` : ''}
      </td>
      <td class="text-center" data-label="Escalas">${m.escalas_count}</td>
      <td class="text-center" data-label="Diárias">${m.total_diarias}</td>
    </tr>
  `).join('');
}

// -------------------------------------------------------------
// TELA 2: FORMULÁRIO DE CADASTRO (P3)
// -------------------------------------------------------------
async function handleCreateEvento(e) {
  e.preventDefault();
  
  const payload = {
    num_oficio: document.getElementById('num_oficio').value.trim(),
    num_os_manual: document.getElementById('num_os_manual').value.trim(),
    num_sei: document.getElementById('num_sei').value.trim(),
    tipo_evento: document.getElementById('tipo_evento').value,
    nome_evento: document.getElementById('nome_evento').value.trim(),
    demandante: document.getElementById('demandante').value.trim(),
    data_inicio: document.getElementById('data_inicio').value,
    data_termino: document.getElementById('data_termino').value,
    horario_inicio: document.getElementById('horario_inicio').value,
    local_itinerario: document.getElementById('local_itinerario').value.trim(),
    bairro: obterBairroSelecionado()
  };

  if (payload.data_termino && payload.data_termino < payload.data_inicio) {
    showToast('A data de término não pode ser anterior à data de início.', 'danger');
    return;
  }

  await comBotaoCarregando(e.submitter, async () => {
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/eventos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        showToast('Evento cadastrado com sucesso!', 'success');
        document.getElementById('form-evento').reset();

        document.getElementById('data_inicio').value = getLocalDateStr();

        fetchData();

        // Redireciona para o Dashboard
        document.getElementById('nav-btn-dashboard').click();
      }
    } catch (error) {
      console.error(error);
      showToast('Falha ao cadastrar evento no servidor.', 'danger');
    }
  });
}

// -------------------------------------------------------------
// TELA 3: MEU TURNO (HOJE & AMANHÃ)
// -------------------------------------------------------------
// Dia selecionado na aba Meu Turno ('hoje' | 'amanha') — trocado pelo seletor
// segmentado do topo, no padrão do protótipo.
let turnoDiaSelecionado = 'hoje';

window.handleTurnoTrocarDia = function(dia) {
  turnoDiaSelecionado = (dia === 'amanha') ? 'amanha' : 'hoje';
  document.querySelectorAll('.dia-opcao').forEach(btn => {
    const ativo = btn.dataset.dia === turnoDiaSelecionado;
    btn.classList.toggle('ativo', ativo);
    btn.setAttribute('aria-checked', String(ativo));
  });
  renderTurnoTab();
};

async function renderTurnoTab() {
  const hoje = new Date();
  const alvo = new Date(hoje);
  if (turnoDiaSelecionado === 'amanha') alvo.setDate(hoje.getDate() + 1);
  const dataStr = getLocalDateStr(alvo);

  const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const dataBr = dataStr.split('-').reverse().join('/');
  document.getElementById('turno-btn-hoje').textContent = `Hoje · ${getLocalDateStr(hoje).slice(8)}/${getLocalDateStr(hoje).slice(5, 7)}`;
  const amanhaData = new Date(hoje); amanhaData.setDate(hoje.getDate() + 1);
  const amanhaStr = getLocalDateStr(amanhaData);
  document.getElementById('turno-btn-amanha').textContent = `Amanhã · ${amanhaStr.slice(8)}/${amanhaStr.slice(5, 7)}`;

  // --- Eventos do dia
  const eventos = state.eventos
    .filter(e => e.data_inicio === dataStr)
    .sort((a, b) => (a.horario_inicio || '').localeCompare(b.horario_inicio || ''));

  document.getElementById('turno-kpi-eventos').textContent = eventos.length;
  document.getElementById('turno-eventos-contagem').textContent =
    `${dataBr} · ${DIAS[alvo.getDay()]}`;

  const listaEventos = document.getElementById('turno-eventos-lista');
  if (eventos.length === 0) {
    listaEventos.innerHTML = `<p class="turno-vazio">Nenhum evento agendado para ${turnoDiaSelecionado === 'hoje' ? 'hoje' : 'amanhã'}.</p>`;
  } else {
    listaEventos.innerHTML = eventos.map(evt => {
      const alocacoesEvt = state.alocacoes.filter(a => a.evento_id === evt.id);
      const modalidades = alocacoesEvt.map(a => a.modalidade).filter(Boolean).join(', ');
      return `
        <div class="turno-linha" data-action="abrir-evento" data-id="${esc(evt.id)}" role="button" tabindex="0">
          <div class="turno-linha-hora">${esc(evt.horario_inicio) || '--:--'}</div>
          <div class="turno-linha-info">
            <div class="turno-linha-nome">${esc(evt.nome_evento)}</div>
            <div class="turno-linha-sub">
              <i data-lucide="map-pin"></i>${esc(evt.bairro) || 'Sem bairro'}${modalidades ? ' · ' + esc(modalidades) : ''}
            </div>
          </div>
          <div class="turno-linha-fim">
            <div class="turno-linha-os">OS ${esc(evt.num_os_manual) || '—'}</div>
            <span class="badge ${slugBadge(evt.tipo_evento)}">${esc(evt.tipo_evento)}</span>
          </div>
        </div>`;
    }).join('');
  }

  const totalEfetivo = eventos.reduce((soma, evt) =>
    soma + state.alocacoes.filter(a => a.evento_id === evt.id).reduce((s, a) => s + (a.qtd_policiais || 0), 0), 0);
  document.getElementById('turno-kpi-efetivo').textContent = totalEfetivo;

  // --- Cartão Programa do dia (viaturas, equipe de serviço e avisos)
  let cartao = null;
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/cartoes?data=${dataStr}`);
    const lista = await res.json();
    if (res.ok && Array.isArray(lista) && lista.length > 0) {
      const resDetalhe = await apiFetch(`${API_BASE_URL}/api/cartoes/${lista[0].id}`);
      if (resDetalhe.ok) cartao = await resDetalhe.json();
    }
  } catch (error) {
    console.error('Erro ao carregar o cartão do turno:', error);
  }

  const pill = document.getElementById('turno-status-cartao');
  const pillTexto = document.getElementById('turno-status-texto');
  pill.classList.toggle('status-pill-ok', !!cartao);
  pill.classList.toggle('status-pill-pendente', !cartao);
  pillTexto.textContent = cartao ? 'Cartão Programa lançado' : 'Cartão Programa não lançado';

  const viaturas = cartao ? (cartao.viaturas || []) : [];
  document.getElementById('turno-kpi-viaturas').textContent = viaturas.length;

  const tbodyVtr = document.getElementById('turno-viaturas-lista');
  tbodyVtr.innerHTML = viaturas.length === 0
    ? `<tr><td colspan="5" class="text-center" style="color:var(--text-muted);padding:22px;">Nenhuma viatura lançada para este dia.</td></tr>`
    : viaturas.map(v => `
        <tr>
          <td class="card-title-cell"><strong>${esc(v.prefixo)}</strong></td>
          <td data-label="Setor">${esc(v.setor) || '-'}</td>
          <td data-label="Categoria">${v.categoria ? `<span class="badge ${slugBadge('cat-' + v.categoria)}">${esc(v.categoria)}</span>` : '-'}</td>
          <td data-label="Companhia">${esc(v.companhia) || '-'}</td>
          <td data-label="Comandante">${esc(v.comandante) || 'Não informado'}</td>
        </tr>`).join('');

  // Equipe de serviço: os três papéis do cabeçalho do cartão
  const equipe = [
    { papel: 'Fiscal de Operações', nome: cartao && cartao.fiscal, icone: 'shield-check', cor: 'var(--primary)', bg: 'var(--primary-soft)' },
    { papel: 'Adjunto', nome: cartao && cartao.adjunto, icone: 'user-check', cor: 'var(--success-fg)', bg: 'var(--success-bg)' },
    { papel: 'Oficial de Sobreaviso', nome: cartao && cartao.oficial_sobreaviso, icone: 'phone-call', cor: 'var(--roxo)', bg: 'var(--roxo-bg)' }
  ];
  document.getElementById('turno-equipe').innerHTML = equipe.map(p => `
    <div class="turno-equipe-item">
      <span class="turno-equipe-icone" style="background:${p.bg};color:${p.cor};"><i data-lucide="${p.icone}"></i></span>
      <div>
        <div class="turno-equipe-papel">${esc(p.papel)}</div>
        <div class="turno-equipe-nome${p.nome ? '' : ' turno-equipe-vazio'}">${esc(p.nome) || 'Não designado'}</div>
      </div>
    </div>`).join('');

  // Avisos: conflitos do cartão do dia + eventos do dia sem OS/SEI
  const avisos = cartao ? calcularAlertasCartao(cartao) : [];
  eventos.forEach(evt => {
    const faltando = [];
    if (!evt.num_os_manual) faltando.push('Número da OS');
    if (!evt.num_sei) faltando.push('Número SEI');
    if (faltando.length) {
      avisos.push({ tipo: 'evento-sem-numeracao', mensagem: `"${evt.nome_evento}" sem ${faltando.join(' e sem ')}.` });
    }
  });

  document.getElementById('turno-kpi-avisos').textContent = avisos.length;
  const iconeAvisos = document.getElementById('turno-kpi-avisos-icone');
  iconeAvisos.style.background = avisos.length ? 'var(--warning-bg)' : 'var(--success-bg)';
  iconeAvisos.style.color = avisos.length ? 'var(--warning-fg)' : 'var(--success-fg)';

  document.getElementById('turno-avisos').innerHTML = avisos.length === 0
    ? `<div class="dash-alertas-vazio"><i data-lucide="check-circle"></i><span>Nenhum aviso para este turno.</span></div>`
    : avisos.map(a => {
        const deCartao = a.tipo !== 'evento-sem-numeracao';
        const cor = deCartao ? 'var(--warning-fg)' : 'var(--danger-fg)';
        const bg = deCartao ? 'var(--warning-bg)' : 'var(--danger-bg)';
        return `
          <div class="dash-alerta-item">
            <span class="dash-alerta-icone" style="background:${bg};color:${cor};"><i data-lucide="${deCartao ? 'alert-triangle' : 'alert-circle'}"></i></span>
            <div class="dash-alerta-texto">
              <div class="dash-alerta-titulo">${esc(deCartao ? 'Conflito no Cartão Programa' : 'Evento com pendência')}</div>
              <div class="dash-alerta-sub">${esc(a.mensagem)}</div>
            </div>
          </div>`;
      }).join('');

  lucide.createIcons();
}

// -------------------------------------------------------------
// TELA 4: LISTAR EVENTOS (COM FILTRO DE DATAS POR PERÍODO)
// -------------------------------------------------------------
// Aplica os filtros ativos da aba Listar Eventos (data inicial/final/texto) sobre state.eventos.
// Usada tanto pela tabela quanto pela "Lista para SEI" — mesmo conjunto filtrado.
function getEventosFiltrados() {
  const dataInicioFiltro = document.getElementById('filter-eventos-inicio').value;
  const dataFimFiltro = document.getElementById('filter-eventos-fim').value;
  const searchText = document.getElementById('filter-eventos-search').value.toLowerCase().trim();
  let lista = [...state.eventos];
  if (dataInicioFiltro) lista = lista.filter(e => e.data_inicio >= dataInicioFiltro);
  if (dataFimFiltro) lista = lista.filter(e => e.data_inicio <= dataFimFiltro);
  if (searchText) {
    lista = lista.filter(e =>
      e.nome_evento.toLowerCase().includes(searchText) ||
      e.bairro.toLowerCase().includes(searchText) ||
      e.local_itinerario.toLowerCase().includes(searchText) ||
      e.demandante.toLowerCase().includes(searchText) ||
      (e.num_os_manual && e.num_os_manual.toLowerCase().includes(searchText)) ||
      (e.num_sei && e.num_sei.toLowerCase().includes(searchText))
    );
  }
  return lista;
}

// KPIs do topo de Listar Eventos: refletem o filtro ativo (exceto "próximos 7
// dias", que é sempre a partir de hoje, como no Dashboard).
function renderEventosKpis(eventosFiltrados) {
  const hojeStr = getLocalDateStr();
  const daqui7 = new Date();
  daqui7.setDate(daqui7.getDate() + 7);
  const daqui7Str = getLocalDateStr(daqui7);

  const semOs = eventosFiltrados.filter(e => !e.num_os_manual).length;
  const semSei = eventosFiltrados.filter(e => !e.num_sei).length;

  document.getElementById('ev-kpi-total').textContent = eventosFiltrados.length;
  document.getElementById('ev-kpi-proximos').textContent =
    state.eventos.filter(e => e.data_inicio >= hojeStr && e.data_inicio <= daqui7Str).length;
  document.getElementById('ev-kpi-sem-os').textContent = semOs;
  document.getElementById('ev-kpi-sem-sei').textContent = semSei;

  // sem pendência o card fica verde, em vez de âmbar permanente
  const pintar = (idIcone, temPendencia) => {
    const el = document.getElementById(idIcone);
    el.style.background = temPendencia ? 'var(--warning-bg)' : 'var(--success-bg)';
    el.style.color = temPendencia ? 'var(--warning-fg)' : 'var(--success-fg)';
  };
  pintar('ev-icone-os', semOs > 0);
  pintar('ev-icone-sei', semSei > 0);
}

function renderEventosTab() {
  const tableBody = document.getElementById('table-eventos-body');
  const rodape = document.getElementById('eventos-rodape-contagem');

  tableBody.innerHTML = '';

  // Filtra coleções de acordo com os inputs (mesmo filtro usado pelo relatório PDF)
  let eventosFiltrados = getEventosFiltrados();
  renderEventosKpis(eventosFiltrados);

  rodape.textContent = eventosFiltrados.length === state.eventos.length
    ? `${eventosFiltrados.length} evento(s) cadastrado(s).`
    : `Mostrando ${eventosFiltrados.length} de ${state.eventos.length} evento(s).`;

  if (eventosFiltrados.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:32px;">Nenhum evento localizado com os filtros aplicados.</td></tr>`;
    return;
  }

  // Ordena por data (mais recente primeiro)
  eventosFiltrados.sort((a, b) => b.data_inicio.localeCompare(a.data_inicio));

  eventosFiltrados.forEach(evt => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => openDrawer(evt.id));

    const typeClass = slugBadge(evt.tipo_evento);
    const dateBr = evt.data_inicio.split('-').reverse().join('/');

    tr.innerHTML = `
      <td data-label="Data"><strong>${dateBr}</strong></td>
      <td class="card-title-cell">${esc(evt.nome_evento)}</td>
      <td data-label="Tipo"><span class="badge ${typeClass}">${esc(evt.tipo_evento)}</span></td>
      <td data-label="Demandante">${esc(evt.demandante)}</td>
      <td data-label="Bairro/Local">${esc(evt.bairro) || 'Centro'}</td>
      <td data-label="Nº OS"><code style="color:var(--primary);">${esc(evt.num_os_manual) || '-'}</code></td>
      <td data-label="Nº SEI"><code style="color:var(--primary);">${esc(evt.num_sei) || '-'}</code></td>
    `;

    tableBody.appendChild(tr);
  });

  lucide.createIcons();
}

// -------------------------------------------------------------
// RELATÓRIO PARA O SEI
// -------------------------------------------------------------

// -------------------------------------------------------------
// MAPA DE EVENTOS DA SEMANA (LEAFLET, DARK MODE) + CAMADA DE VIATURAS
// -------------------------------------------------------------
let mapaLeafletInstancia = null;
let mapaLeafletTileLayer = null;
let mapaLeafletEstiloAtual = null; // estilo já aplicado ao tile layer atual — evita recriar à toa
let mapaLeafletMarkersEventos = [];
let mapaLeafletMarkersViaturas = [];

const MAPA_PREFS_KEY = 'sgo_mapa_prefs';
const MAPA_TILES = {
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  voyager: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
};

function carregarPrefsMapa() {
  // Sem preferência de mapa salva ainda: sugere o tile pelo tema global (claro -> colorido,
  // escuro/padrão -> escuro). Só influencia o padrão da primeira vez — depois que o usuário
  // mexe manualmente no seletor de estilo do mapa, essa escolha salva sempre prevalece.
  const semPrefsSalvas = localStorage.getItem(MAPA_PREFS_KEY) === null;
  const estiloPadrao = semPrefsSalvas && carregarPrefsTema() === 'claro' ? 'voyager' : 'dark';
  try {
    const salvo = JSON.parse(localStorage.getItem(MAPA_PREFS_KEY) || '{}');
    return {
      mostrarEventos: salvo.mostrarEventos !== false,
      mostrarViaturas: salvo.mostrarViaturas !== false,
      estilo: salvo.estilo === 'voyager' ? 'voyager' : (salvo.estilo === 'dark' ? 'dark' : estiloPadrao)
    };
  } catch {
    return { mostrarEventos: true, mostrarViaturas: true, estilo: estiloPadrao };
  }
}

function salvarPrefsMapa(prefs) {
  localStorage.setItem(MAPA_PREFS_KEY, JSON.stringify(prefs));
}

// Cor do marcador de viatura por categoria — reaproveita as mesmas cores dos badges do Cartão Programa
const CORES_CATEGORIA_VIATURA = {
  'Força Tática': '#ef4444',
  'Suplementar': '#f59e0b',
  'Ordinária': '#2563eb'
};

function criarIconeViatura(categoria) {
  const cor = CORES_CATEGORIA_VIATURA[categoria] || CORES_CATEGORIA_VIATURA['Ordinária'];
  return L.divIcon({
    className: 'mapa-icone-viatura',
    html: `<div style="background:${cor};width:16px;height:16px;border-radius:4px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8]
  });
}

// Acha o item de roteiro ativo de uma viatura no horário atual (mesma lógica de janela usada
// nos alertas de conflito do Cartão Programa), com fallback pro setor se nada estiver ativo agora
function itemAtivoAgora(vtr) {
  const agora = new Date();
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
  return (vtr.itens || []).find(item => {
    if (!item.fim) return false;
    const ini = horaParaMinutos(item.inicio);
    let fim = horaParaMinutos(item.fim);
    if (fim <= ini) fim += 24 * 60;
    let atual = minutosAgora;
    if (atual < ini) atual += 24 * 60;
    return atual >= ini && atual < fim;
  }) || null;
}

// Lista de ocorrências ao lado do mapa. Sem chamada nova: usa os eventos da
// semana já filtrados e as coordenadas já buscadas por renderMapaTab.
function renderMapaOcorrencias(eventosSemana, bairrosCoordenadas) {
  const lista = document.getElementById('mapa-ocorrencias-lista');
  const contagem = document.getElementById('mapa-ocorrencias-contagem');
  if (!lista) return;

  contagem.textContent = `${eventosSemana.length} ${eventosSemana.length === 1 ? 'ponto' : 'pontos'}`;

  if (eventosSemana.length === 0) {
    lista.innerHTML = `<p class="turno-vazio">Nenhum evento nesta semana.</p>`;
    return;
  }

  const ordenados = [...eventosSemana].sort((a, b) =>
    (a.data_inicio || '').localeCompare(b.data_inicio || '') ||
    (a.horario_inicio || '').localeCompare(b.horario_inicio || ''));

  lista.innerHTML = ordenados.map(evt => {
    const alocacoes = state.alocacoes.filter(a => a.evento_id === evt.id);
    const efetivo = alocacoes.reduce((s, a) => s + (a.qtd_policiais || 0), 0);
    const viaturas = alocacoes.reduce((s, a) => s + (a.qtd_viaturas || 0), 0);
    const bairroNorm = normalizarTexto(evt.bairro);
    const coord = bairroNorm ? bairrosCoordenadas.find(b => normalizarTexto(b.nome_bairro) === bairroNorm) : null;
    const [, mes, dia] = (evt.data_inicio || '--').split('-');

    return `
      <div class="mapa-ocorrencia${coord ? '' : ' mapa-ocorrencia-sem-coord'}"
           data-action="focar-no-mapa" data-lat="${coord ? coord.latitude : ''}" data-lng="${coord ? coord.longitude : ''}"
           data-id="${esc(evt.id)}" role="button" tabindex="0"
           title="${coord ? 'Centralizar o mapa neste bairro' : 'Bairro sem coordenada cadastrada'}">
        <span class="mapa-ocorrencia-icone badge ${slugBadge(evt.tipo_evento)}"><i data-lucide="map-pin"></i></span>
        <div class="mapa-ocorrencia-info">
          <div class="mapa-ocorrencia-topo">
            <span class="mapa-ocorrencia-nome">${esc(evt.nome_evento)}</span>
            <span class="badge ${slugBadge(evt.tipo_evento)}">${esc(evt.tipo_evento)}</span>
          </div>
          <div class="mapa-ocorrencia-sub">
            <i data-lucide="map-pin"></i>${esc(evt.bairro) || 'Sem bairro'} · ${dia}/${mes}${evt.horario_inicio ? ' ' + esc(evt.horario_inicio) : ''}
          </div>
          <div class="mapa-ocorrencia-nums">
            <span><i data-lucide="car"></i>${viaturas} vtr</span>
            <span><i data-lucide="users"></i>${efetivo} pol</span>
          </div>
        </div>
      </div>`;
  }).join('');

  lucide.createIcons();
}

// Centraliza o mapa numa ocorrência da lista lateral
window.handleFocarNoMapa = function(lat, lng, eventoId) {
  if (!lat || !lng || !mapaLeafletInstancia) {
    // sem coordenada não dá pra centralizar — abre a gaveta do evento
    if (eventoId) openDrawer(eventoId);
    return;
  }
  // animate:false de propósito — com animate:true o Leaflet descarta a transição
  // quando o salto de posição/zoom é grande (verificado: o mapa simplesmente não
  // se movia). Centralizar na hora também é melhor para "clicar e localizar".
  mapaLeafletInstancia.setView([Number(lat), Number(lng)], 15, { animate: false });
};

async function renderMapaTab() {
  const container = document.getElementById('mapa-eventos-semana');
  const avisoEl = document.getElementById('mapa-aviso-sem-coordenada');
  if (!container) return;

  const prefs = carregarPrefsMapa();
  document.getElementById('mapa-toggle-eventos').checked = prefs.mostrarEventos;
  document.getElementById('mapa-toggle-viaturas').checked = prefs.mostrarViaturas;
  document.getElementById('mapa-select-estilo').value = prefs.estilo;

  // Inicializa o mapa uma única vez (Leaflet não gosta de ser recriado sobre o mesmo elemento)
  if (!mapaLeafletInstancia) {
    mapaLeafletInstancia = L.map(container).setView([-5.85, -35.21], 12); // centro aproximado da Zona Sul de Natal
  }

  // A aba fica escondida (display:none) quando não está ativa, e desde que o mapa
  // divide espaço com o painel de ocorrências o container muda de tamanho. Sem
  // invalidateSize o Leaflet mantém dimensões defasadas e passa a ignorar
  // setView/cliques — sintoma observado ao clicar numa ocorrência da lista.
  mapaLeafletInstancia.invalidateSize();

  // Troca o tile conforme o estilo salvo (dark vs. colorido) — só recria a camada se o estilo
  // realmente mudou desde a última renderização (evita descartar/recarregar tiles a cada
  // sincronização de 15s enquanto a aba Mapa está ativa e o estilo continua o mesmo).
  if (prefs.estilo !== mapaLeafletEstiloAtual) {
    if (mapaLeafletTileLayer) mapaLeafletInstancia.removeLayer(mapaLeafletTileLayer);
    mapaLeafletTileLayer = L.tileLayer(MAPA_TILES[prefs.estilo], {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(mapaLeafletInstancia);
    mapaLeafletEstiloAtual = prefs.estilo;
  }

  // Limpa marcadores da renderização anterior
  mapaLeafletMarkersEventos.forEach(m => mapaLeafletInstancia.removeLayer(m));
  mapaLeafletMarkersEventos = [];
  mapaLeafletMarkersViaturas.forEach(m => mapaLeafletInstancia.removeLayer(m));
  mapaLeafletMarkersViaturas = [];

  try {
    const resCoords = await apiFetch(`${API_BASE_URL}/api/bairros-coordenadas`);
    const bairrosCoordenadas = await resCoords.json();
    if (!Array.isArray(bairrosCoordenadas)) return; // servidor lento: não renderiza marcadores de bairro desta vez

    // Semana corrente (segunda a domingo), mesmo critério do card "Eventos na Semana" do Dashboard
    const hoje = new Date();
    const primeiroDiaSemana = new Date(hoje);
    primeiroDiaSemana.setDate(hoje.getDate() - hoje.getDay() + (hoje.getDay() === 0 ? -6 : 1));
    primeiroDiaSemana.setHours(0, 0, 0, 0);
    const ultimoDiaSemana = new Date(primeiroDiaSemana);
    ultimoDiaSemana.setDate(primeiroDiaSemana.getDate() + 6);
    ultimoDiaSemana.setHours(23, 59, 59, 999);

    const eventosSemana = state.eventos.filter(e => {
      const dataEvt = new Date(e.data_inicio + 'T00:00:00');
      return dataEvt >= primeiroDiaSemana && dataEvt <= ultimoDiaSemana;
    });

    // Agrupa eventos por bairro cadastrado (mesma normalização usada no cruzamento do Cartão Programa)
    const semCoordenada = [];
    const gruposPorCoordenada = {};

    eventosSemana.forEach(evt => {
      const bairroNorm = normalizarTexto(evt.bairro);
      const coordenada = bairroNorm
        ? bairrosCoordenadas.find(b => normalizarTexto(b.nome_bairro) === bairroNorm)
        : null;

      if (!coordenada) {
        semCoordenada.push(evt);
        return;
      }

      if (!gruposPorCoordenada[coordenada.id]) {
        gruposPorCoordenada[coordenada.id] = { coordenada, eventos: [] };
      }
      gruposPorCoordenada[coordenada.id].eventos.push(evt);
    });

    // Painel lateral de ocorrências (protótipo): lista os eventos da semana, com
    // ou sem coordenada. Clicar centraliza o mapa quando há coordenada.
    renderMapaOcorrencias(eventosSemana, bairrosCoordenadas);

    // Aviso visível para bairros sem coordenada cadastrada — não quebra o mapa, só avisa
    if (semCoordenada.length > 0) {
      const nomesUnicos = [...new Set(semCoordenada.map(e => e.bairro || 'Sem bairro informado'))];
      avisoEl.innerHTML = `
        <i data-lucide="alert-triangle"></i>
        <span><strong>${semCoordenada.length}</strong> evento(s) desta semana em bairro(s) sem coordenada cadastrada: ${esc(nomesUnicos.join(', '))}.
        Não aparecem no mapa. Cadastre a coordenada em <code>bairros_coordenadas</code> para incluí-los.</span>
      `;
      avisoEl.classList.remove('hidden');
    } else {
      avisoEl.classList.add('hidden');
    }

    // Plota um marcador por bairro, com todos os eventos daquele bairro na semana no popup
    if (prefs.mostrarEventos) {
      Object.values(gruposPorCoordenada).forEach(grupo => {
        const marker = L.marker([grupo.coordenada.latitude, grupo.coordenada.longitude]).addTo(mapaLeafletInstancia);

        const popupHtml = grupo.eventos.map(evt => {
          const alocacoesEvt = state.alocacoes.filter(a => a.evento_id === evt.id);
          const efetivo = alocacoesEvt.reduce((sum, a) => sum + (a.qtd_policiais || 0), 0);
          const viaturas = alocacoesEvt.reduce((sum, a) => sum + (a.qtd_viaturas || 0), 0);
          const dataBr = evt.data_inicio.split('-').reverse().join('/');
          return `
            <div class="mapa-popup-evento">
              <strong>${esc(evt.nome_evento)}</strong> (${esc(evt.tipo_evento)})<br>
              ${dataBr}${evt.horario_inicio ? ' às ' + esc(evt.horario_inicio) : ''}<br>
              Efetivo: ${efetivo} PM(s) · Viaturas: ${viaturas}
            </div>`;
        }).join('<hr>');

        marker.bindPopup(`<div class="mapa-popup"><h4>${esc(grupo.coordenada.nome_bairro)}</h4>${popupHtml}</div>`);
        mapaLeafletMarkersEventos.push(marker);
      });
    }

    // Camada de viaturas: cartão de hoje, uma por viatura, na coordenada do bairro do item
    // de roteiro ativo agora. Fallback, em ordem: setor cadastrado no registro central da
    // viatura (Cadastro de Viaturas) > setor informado no cartão do dia.
    if (prefs.mostrarViaturas) {
      const hojeStr = getLocalDateStr();
      const resCartoes = await apiFetch(`${API_BASE_URL}/api/cartoes?data=${hojeStr}`);
      const listaCartoes = await resCartoes.json();

      if (listaCartoes.length > 0) {
        const resDetalhe = await apiFetch(`${API_BASE_URL}/api/cartoes/${listaCartoes[0].id}`);
        const cartaoHoje = await resDetalhe.json();

        (cartaoHoje.viaturas || []).forEach(vtr => {
          const itemAtivo = itemAtivoAgora(vtr);
          const viaturaCadastro = (state.viaturas || []).find(vc => normalizarTexto(vc.prefixo) === normalizarTexto(vtr.prefixo));
          const setorReferencia = (viaturaCadastro && viaturaCadastro.setor) || vtr.setor;
          const localReferencia = itemAtivo ? itemAtivo.local : setorReferencia;
          const localNorm = normalizarTexto(localReferencia);
          const setorNorm = normalizarTexto(setorReferencia);

          // Tenta casar pelo local do item ativo primeiro; se não achar, cai pro setor de referência
          const coordenada = bairrosCoordenadas.find(b => {
            const bNorm = normalizarTexto(b.nome_bairro);
            return bNorm === localNorm || localNorm.includes(bNorm) || bNorm.includes(localNorm);
          }) || bairrosCoordenadas.find(b => {
            const bNorm = normalizarTexto(b.nome_bairro);
            return bNorm === setorNorm || setorNorm.includes(bNorm) || bNorm.includes(setorNorm);
          });

          if (!coordenada) return; // viatura sem bairro correspondente cadastrado: fica fora do mapa, sem quebrar nada

          const marker = L.marker([coordenada.latitude, coordenada.longitude], {
            icon: criarIconeViatura(vtr.categoria)
          }).addTo(mapaLeafletInstancia);

          marker.bindPopup(`
            <div class="mapa-popup">
              <h4>VTR ${esc(vtr.prefixo)}</h4>
              <div class="mapa-popup-evento">
                <strong>Setor:</strong> ${esc(setorReferencia)}<br>
                <strong>Comandante:</strong> ${esc(vtr.comandante) || 'Não informado'}<br>
                ${itemAtivo
                  ? `<strong>Atividade agora:</strong> ${esc(itemAtivo.atividade)} — ${esc(itemAtivo.local)} (${esc(itemAtivo.inicio)} às ${esc(itemAtivo.fim)})`
                  : '<strong>Sem atividade ativa no momento.</strong>'}
              </div>
            </div>
          `);
          mapaLeafletMarkersViaturas.push(marker);
        });
      }
    }

    // Ajusta o enquadramento do mapa se houver marcadores; senão mantém a visão padrão da Zona Sul
    const todosMarcadores = [...mapaLeafletMarkersEventos, ...mapaLeafletMarkersViaturas];
    if (todosMarcadores.length > 0) {
      const grupo = L.featureGroup(todosMarcadores);
      mapaLeafletInstancia.fitBounds(grupo.getBounds().pad(0.3));
    }

    // Leaflet precisa recalcular o tamanho do container após a aba ficar visível
    setTimeout(() => mapaLeafletInstancia.invalidateSize(), 50);
    lucide.createIcons();
  } catch (error) {
    console.error('Erro ao carregar o Mapa de Eventos:', error);
    showToast('Falha ao carregar o Mapa de Eventos.', 'danger');
  }
}

function handleMudarPrefsMapa() {
  salvarPrefsMapa({
    mostrarEventos: document.getElementById('mapa-toggle-eventos').checked,
    mostrarViaturas: document.getElementById('mapa-toggle-viaturas').checked,
    estilo: document.getElementById('mapa-select-estilo').value
  });
  renderMapaTab();
}

// -------------------------------------------------------------
// CADASTRO DE BAIRROS (ALIMENTA O SELECT DE BAIRRO EM NOVO EVENTO E O MAPA)
// -------------------------------------------------------------
let bairroEmEdicao = null; // id do bairro sendo editado (null = criando novo)

// Preenche o <select id="bairro"> do formulário de Novo Evento com o cadastro atual, preservando a seleção
async function popularSelectBairros(selectId = 'bairro') {
  const select = document.getElementById(selectId);
  if (!select) return;

  const valorAtual = select.value;
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/bairros-coordenadas`);
    const bairros = await res.json();
    if (!Array.isArray(bairros)) return; // servidor lento devolveu não-array: mantém o select como está

    const opcoesFixas = `<option value="">Selecione...</option><option value="__outro__">Outro (não cadastrado)</option>`;
    const opcoesBairros = bairros
      .sort((a, b) => a.nome_bairro.localeCompare(b.nome_bairro))
      .map(b => `<option value="${esc(b.nome_bairro)}">${esc(b.nome_bairro)}</option>`)
      .join('');

    select.innerHTML = `<option value="">Selecione...</option>${opcoesBairros}<option value="__outro__">Outro (não cadastrado)</option>`;
    if ([...select.options].some(o => o.value === valorAtual)) select.value = valorAtual;
  } catch (error) {
    console.error('Erro ao carregar cadastro de bairros:', error);
  }
}

// Retorna o bairro efetivamente escolhido no formulário de Novo Evento (trata a opção "Outro")
function obterBairroSelecionado() {
  const select = document.getElementById('bairro');
  if (select.value === '__outro__') {
    return document.getElementById('bairro_outro').value.trim();
  }
  return select.value;
}

async function renderGerenciarBairrosTab() {
  const tbody = document.getElementById('table-bairros-body');
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/bairros-coordenadas`);
    const bairros = await res.json();
    if (!Array.isArray(bairros)) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--danger);padding:24px;">Falha ao carregar bairros (servidor lento). Recarregue.</td></tr>`;
      return;
    }

    if (bairros.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px;">Nenhum bairro cadastrado ainda.</td></tr>`;
      return;
    }

    tbody.innerHTML = bairros.sort((a, b) => a.nome_bairro.localeCompare(b.nome_bairro)).map(b => `
      <tr>
        <td><strong>${esc(b.nome_bairro)}</strong></td>
        <td>${b.latitude}</td>
        <td>${b.longitude}</td>
        <td class="text-right">
          <div style="display:flex;gap:6px;justify-content:flex-end;">
            <button class="btn-icon btn-sm" title="Editar" aria-label="Editar" data-action="editar-bairro" data-id="${b.id}" data-nome="${esc(b.nome_bairro)}" data-lat="${b.latitude}" data-lon="${b.longitude}">
              <i data-lucide="pencil" style="width:14px;height:14px;"></i>
            </button>
            <button class="btn-icon btn-danger btn-sm" title="Excluir" aria-label="Excluir" data-action="excluir-bairro" data-id="${b.id}">
              <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    lucide.createIcons();
  } catch (error) {
    console.error('Erro ao carregar bairros:', error);
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--danger);padding:24px;">Falha ao carregar bairros.</td></tr>`;
  }
}

window.abrirEdicaoBairro = function (id, nome, lat, lon) {
  bairroEmEdicao = id;
  document.getElementById('bairro-nome').value = nome;
  document.getElementById('bairro-lat').value = lat;
  document.getElementById('bairro-lon').value = lon;
  document.getElementById('btn-salvar-bairro').innerHTML = '<i data-lucide="check"></i>';
  lucide.createIcons();
  document.getElementById('bairro-nome').focus();
};

async function handleSalvarBairro(e) {
  e.preventDefault();
  const payload = {
    nome_bairro: document.getElementById('bairro-nome').value.trim(),
    latitude: document.getElementById('bairro-lat').value,
    longitude: document.getElementById('bairro-lon').value
  };

  await comBotaoCarregando(e.submitter, async () => {
    try {
      let res;
      if (bairroEmEdicao) {
        res = await apiFetch(`${API_BASE_URL}/api/bairros-coordenadas/${bairroEmEdicao}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await apiFetch(`${API_BASE_URL}/api/bairros-coordenadas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      const dados = await res.json();

      if (res.ok) {
        showToast(bairroEmEdicao ? 'Bairro atualizado.' : 'Bairro cadastrado.', 'success');
        bairroEmEdicao = null;
        document.getElementById('form-bairro').reset();
        document.getElementById('btn-salvar-bairro').innerHTML = '<i data-lucide="plus"></i>';
        lucide.createIcons();
        renderGerenciarBairrosTab();
        popularSelectBairros();
      } else {
        showToast(esc(dados.error) || 'Falha ao salvar o bairro.', 'danger');
      }
    } catch (error) {
      console.error('Erro ao salvar bairro:', error);
      showToast('Falha na comunicação com o servidor.', 'danger');
    }
  });
}

window.handleExcluirBairro = async function (id) {
  if (!confirm('Excluir este bairro do cadastro? Eventos que já usam esse nome não são afetados.')) return;
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/bairros-coordenadas/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Bairro excluído.', 'info');
      renderGerenciarBairrosTab();
      popularSelectBairros();
    } else {
      const dados = await res.json();
      showToast(esc(dados.error) || 'Falha ao excluir o bairro.', 'danger');
    }
  } catch (error) {
    console.error('Erro ao excluir bairro:', error);
    showToast('Falha na comunicação com o servidor.', 'danger');
  }
};

// -------------------------------------------------------------
// DRAWER DE NAVEGAÇÃO MOBILE (sidebar off-canvas, distinto da gaveta de
// detalhes de evento abaixo — mesma técnica visual, classes próprias)
// -------------------------------------------------------------
function abrirNavDrawer() {
  document.querySelector('.sidebar').classList.add('nav-drawer-open');
  document.getElementById('nav-drawer-overlay').classList.add('open');
}

function fecharNavDrawer() {
  document.querySelector('.sidebar').classList.remove('nav-drawer-open');
  document.getElementById('nav-drawer-overlay').classList.remove('open');
}

// -------------------------------------------------------------
// GAVETA LATERAL DE DETALHES (DRAWER)
// -------------------------------------------------------------
async function openDrawer(eventId) {
  state.currentEventId = eventId;
  document.getElementById('drawer').classList.add('open');
  await fetchEventDetails(eventId);
}

function closeDrawer() {
  document.getElementById('drawer').classList.remove('open');
  state.currentEventId = null;

  document.getElementById('form-alocacao-container').classList.add('hidden');
  document.getElementById('form-alocacao').reset();
}

async function fetchEventDetails(id) {
  try {
    const resEvt = await apiFetch(`${API_BASE_URL}/api/eventos`);
    const eventos = await resEvt.json();
    const evt = eventos.find(e => e.id === id);
    
    if (!evt) {
      closeDrawer();
      return;
    }

    // Preenche dados textuais
    document.getElementById('drawer-event-title').textContent = evt.nome_evento;
    document.getElementById('drawer-event-badge').textContent = evt.tipo_evento;
    
    const badgeClass = slugBadge(evt.tipo_evento);
    document.getElementById('drawer-event-badge').className = `badge ${badgeClass}`;

    document.getElementById('detail-oficio').textContent = evt.num_oficio || 'Sem ofício informado';
    document.getElementById('detail-os-manual').textContent = evt.num_os_manual || 'Não informado';
    document.getElementById('detail-sei').textContent = evt.num_sei || 'Não informado';
    document.getElementById('detail-demandante').textContent = evt.demandante || 'Não Informado';
    document.getElementById('detail-inicio').textContent = evt.data_inicio.split('-').reverse().join('/');
    document.getElementById('detail-termino').textContent = evt.data_termino ? evt.data_termino.split('-').reverse().join('/') : '-';
    document.getElementById('detail-hora').textContent = evt.horario_inicio || 'Não informada';
    document.getElementById('detail-local').textContent = evt.local_itinerario;
    document.getElementById('detail-bairro').textContent = evt.bairro || '-';

    // Carrega alocações da API (evento não tem mais escala nominal — isso é das operações)
    const resAloc = await apiFetch(`${API_BASE_URL}/api/alocacoes?evento_id=${id}`);
    const alocacoes = await resAloc.json();
    renderAlocacoesList(alocacoes);

  } catch (error) {
    console.error(error);
  }
}

// Abre o modal de edição do evento atualmente aberto na gaveta, pré-preenchido.
window.abrirModalEditarEvento = async function () {
  const evt = (state.eventos || []).find(e => e.id === state.currentEventId);
  if (!evt) { showToast('Evento não encontrado.', 'danger'); return; }

  document.getElementById('edit-num_oficio').value = evt.num_oficio || '';
  document.getElementById('edit-num_os_manual').value = evt.num_os_manual || '';
  document.getElementById('edit-num_sei').value = evt.num_sei || '';
  document.getElementById('edit-tipo_evento').value = evt.tipo_evento || 'Outros';
  document.getElementById('edit-nome_evento').value = evt.nome_evento || '';
  document.getElementById('edit-demandante').value = evt.demandante || '';
  document.getElementById('edit-data_inicio').value = evt.data_inicio || '';
  document.getElementById('edit-data_termino').value = evt.data_termino || '';
  document.getElementById('edit-horario_inicio').value = evt.horario_inicio || '';
  document.getElementById('edit-local_itinerario').value = evt.local_itinerario || '';

  // Mostra o modal já (feedback imediato); o select de bairro popula logo em seguida.
  document.getElementById('modal-editar-evento').classList.remove('hidden');
  lucide.createIcons();

  // Bairro: popula o select do cadastro; se o bairro do evento não estiver lá, usa "Outro" + texto livre
  await popularSelectBairros('edit-bairro');
  const selBairro = document.getElementById('edit-bairro');
  const inputOutro = document.getElementById('edit-bairro_outro');
  const bairroVal = evt.bairro || '';
  if (bairroVal && [...selBairro.options].some(o => o.value === bairroVal)) {
    selBairro.value = bairroVal;
    inputOutro.classList.add('hidden'); inputOutro.value = '';
  } else if (bairroVal) {
    selBairro.value = '__outro__';
    inputOutro.classList.remove('hidden'); inputOutro.value = bairroVal;
  } else {
    selBairro.value = '';
    inputOutro.classList.add('hidden'); inputOutro.value = '';
  }
};

async function handleSalvarEdicaoEvento(e) {
  e.preventDefault();
  const id = state.currentEventId;
  if (!id) return;

  const selBairro = document.getElementById('edit-bairro');
  const bairro = selBairro.value === '__outro__'
    ? document.getElementById('edit-bairro_outro').value.trim()
    : selBairro.value;

  const payload = {
    num_oficio: document.getElementById('edit-num_oficio').value.trim(),
    num_os_manual: document.getElementById('edit-num_os_manual').value.trim(),
    num_sei: document.getElementById('edit-num_sei').value.trim(),
    tipo_evento: document.getElementById('edit-tipo_evento').value,
    nome_evento: document.getElementById('edit-nome_evento').value.trim(),
    demandante: document.getElementById('edit-demandante').value.trim(),
    data_inicio: document.getElementById('edit-data_inicio').value,
    data_termino: document.getElementById('edit-data_termino').value,
    horario_inicio: document.getElementById('edit-horario_inicio').value,
    local_itinerario: document.getElementById('edit-local_itinerario').value.trim(),
    bairro: bairro
  };

  await comBotaoCarregando(e.submitter, async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/eventos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const dados = await res.json();
      if (res.ok) {
        document.getElementById('modal-editar-evento').classList.add('hidden');
        showToast('Evento atualizado com sucesso.', 'success');
        await fetchData();                 // atualiza listas/estado em memória
        if (state.currentEventId === id) await fetchEventDetails(id); // atualiza a gaveta aberta
      } else {
        showToast(esc(dados.error) || 'Falha ao salvar o evento.', 'danger');
      }
    } catch (error) {
      console.error('Erro ao salvar edição de evento:', error);
      showToast('Falha na comunicação com o servidor.', 'danger');
    }
  });
}

function renderAlocacoesList(list) {
  const container = document.getElementById('alocacoes-list');
  container.innerHTML = '';

  if (list.length === 0) {
    container.innerHTML = `<p style="font-size:0.75rem;color:var(--text-muted);text-align:center;padding:12px;">Nenhuma modalidade alocada.</p>`;
    return;
  }

  // Verifica se o usuário logado tem papel administrativo
  const isAdmin = state.user && state.user.role === 'P3';

  list.forEach(item => {
    const el = document.createElement('div');
    el.className = 'sub-list-item';
    el.innerHTML = `
      <div class="sub-list-item-info">
        <h5>${esc(item.modalidade)} (${item.qtd_policiais} Policiais / ${item.qtd_viaturas} VTRs)</h5>
        <p><strong>Comando:</strong> ${esc(item.comando_servico) || '-'} | <strong>Prefixos:</strong> ${esc(item.prefixos_vtr) || '-'}</p>
      </div>
      ${isAdmin ? `
      <button class="btn-icon btn-danger btn-sm" title="Remover alocação" aria-label="Remover alocação" data-action="excluir-alocacao" data-id="${item.id}">
        <i data-lucide="trash" style="width:12px;height:12px;"></i>
      </button>` : ''}
    `;
    container.appendChild(el);
  });
  
  lucide.createIcons();
}

// -------------------------------------------------------------
// AUTOCOMPLETE CUSTOMIZADO DE MILITAR (form Escalar Militar, gaveta de Operação)
// Substitui o <datalist> nativo por um dropdown estilizado no dark theme, com busca por
// nome / nome de guerra / matrícula e navegação por teclado. Lê state.pessoal ao vivo.
// -------------------------------------------------------------
let escAcIdx = -1; // índice do item ativo no dropdown (navegação por teclado)

function renderAutocompleteEscala(termo) {
  const box = document.getElementById('escala-autocomplete-results');
  if (!box) return;
  const nomeInput = document.getElementById('esc_militar_nome');
  if (!termo || !termo.trim()) {
    box.classList.add('hidden');
    box.innerHTML = '';
    if (nomeInput) nomeInput.setAttribute('aria-expanded', 'false');
    return;
  }
  const t = normalizarTexto(termo);
  const pessoal = Array.isArray(state.pessoal) ? state.pessoal : [];
  const resultados = pessoal.filter(p =>
    normalizarTexto(p.nome).includes(t) ||
    normalizarTexto(p.nome_guerra).includes(t) ||
    normalizarTexto(p.matricula).includes(t)
  ).slice(0, 8);
  if (resultados.length === 0) {
    box.classList.add('hidden');
    box.innerHTML = '';
    if (nomeInput) nomeInput.setAttribute('aria-expanded', 'false');
    return;
  }
  box.innerHTML = resultados.map((p, i) =>
    `<div class="autocomplete-item" role="option" data-action="selecionar-militar-escala" data-nome="${esc(p.nome)}" data-id="${esc(p.matricula || '')}" data-idx="${i}"><span class="ac-nome">${esc(p.nome)}</span><span class="ac-sub">${esc([p.nome_guerra, p.matricula].filter(Boolean).join(' — '))}</span></div>`
  ).join('');
  box.classList.remove('hidden');
  if (nomeInput) nomeInput.setAttribute('aria-expanded', 'true');
  escAcIdx = -1;
}

// Aplica a classe .active ao item de índice escAcIdx e rola para ele
function atualizarItemAtivoEscala(itens) {
  itens.forEach((it, i) => it.classList.toggle('active', i === escAcIdx));
  if (escAcIdx >= 0 && itens[escAcIdx]) {
    itens[escAcIdx].scrollIntoView({ block: 'nearest' });
  }
}

function selecionarMilitarEscala(nome, id) {
  document.getElementById('esc_militar_nome').value = nome;
  const mat = document.getElementById('esc_militar_id');
  mat.value = id;
  // Só trava a matrícula se o cadastro tiver uma — militar sem matrícula (campo
  // opcional no Cadastro de Pessoal) fica editável para digitar/completar à mão.
  mat.readOnly = !!id;
  const box = document.getElementById('escala-autocomplete-results');
  if (box) { box.classList.add('hidden'); box.innerHTML = ''; }
  const nomeInput = document.getElementById('esc_militar_nome');
  if (nomeInput) nomeInput.setAttribute('aria-expanded', 'false');
  escAcIdx = -1;
}

function limparAutocompleteEscala() {
  const box = document.getElementById('escala-autocomplete-results');
  if (box) { box.classList.add('hidden'); box.innerHTML = ''; }
  const mat = document.getElementById('esc_militar_id');
  if (mat) mat.readOnly = false;
  const nomeInput = document.getElementById('esc_militar_nome');
  if (nomeInput) nomeInput.setAttribute('aria-expanded', 'false');
  escAcIdx = -1;
}

function renderEscalasList(list) {
  const container = document.getElementById('escalas-list');
  container.innerHTML = '';

  if (list.length === 0) {
    container.innerHTML = `<p style="font-size:0.75rem;color:var(--text-muted);text-align:center;padding:12px;">Nenhum militar escalado para diárias.</p>`;
    return;
  }

  // Verifica se o usuário logado tem papel administrativo
  const isAdmin = state.user && state.user.role === 'P3';

  list.forEach(item => {
    const el = document.createElement('div');
    el.className = 'sub-list-item';
    el.innerHTML = `
      <div class="sub-list-item-info">
        <h5>${esc(item.militar_nome)} (${esc(item.militar_id)})</h5>
        <p><strong>Aparições:</strong> ${item.qtd_aparicoes} | <strong>Total de Diárias:</strong> <span style="color:var(--warning-fg);font-weight:700;">${item.total_diarias} un.</span></p>
      </div>
      ${isAdmin ? `
      <button class="btn-icon btn-danger btn-sm" title="Remover militar da escala" aria-label="Remover militar da escala" data-action="excluir-escala" data-id="${item.id}">
        <i data-lucide="trash" style="width:12px;height:12px;"></i>
      </button>` : ''}
    `;
    container.appendChild(el);
  });

  lucide.createIcons();
}

// Submissões internas da drawer
async function handleCreateAlocacao(e) {
  e.preventDefault();
  
  const payload = {
    evento_id: state.currentEventId,
    modalidade: document.getElementById('aloc_modalidade').value,
    qtd_policiais: document.getElementById('aloc_policiais').value,
    qtd_viaturas: document.getElementById('aloc_viaturas').value,
    prefixos_vtr: document.getElementById('aloc_prefixos').value.trim(),
    comando_servico: document.getElementById('aloc_comando').value.trim()
  };

  await comBotaoCarregando(e.submitter, async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/alocacoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showToast('Modalidade alocada com sucesso!', 'success');
        document.getElementById('form-alocacao').reset();
        document.getElementById('form-alocacao-container').classList.add('hidden');

        await fetchData(); // Atualiza alocações em cache
        fetchEventDetails(state.currentEventId);
      }
    } catch (error) {
      console.error(error);
    }
  });
}

async function handleCreateEscala(e) {
  e.preventDefault();
  if (!state.currentOperacaoId) return;

  const payload = {
    operacao_id: state.currentOperacaoId,
    militar_nome: document.getElementById('esc_militar_nome').value.trim(),
    militar_id: document.getElementById('esc_militar_id').value.trim(),
    qtd_aparicoes: document.getElementById('esc_qtd_aparicoes').value
  };

  await comBotaoCarregando(e.submitter, async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/escalas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showToast('Policial militar escalado com sucesso!', 'success');
        document.getElementById('form-escala').reset();
        document.getElementById('form-escala-container').classList.add('hidden');
        document.getElementById('diarias-calc-preview').textContent = '2';
        limparAutocompleteEscala();

        await fetchData(); // Atualiza escalas em cache
        fetchOperacaoDetails(state.currentOperacaoId);
      }
    } catch (error) {
      console.error(error);
    }
  });
}

// Ações globais de remoção
window.handleDeleteAlocacao = async function(id) {
  if (confirm("Deseja remover essa alocação de policiamento?")) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/alocacoes/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Alocação removida.', 'info');
        await fetchData();
        fetchEventDetails(state.currentEventId);
      }
    } catch (e) {
      console.error(e);
    }
  }
};

window.handleDeleteEscala = async function(id) {
  if (confirm("Deseja remover o militar desta escala?")) {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/escalas/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Militar removido da escala.', 'info');
        await fetchData();
        if (state.currentOperacaoId) fetchOperacaoDetails(state.currentOperacaoId);
      }
    } catch (e) {
      console.error(e);
    }
  }
};

async function handleDeleteEvento() {
  const evt = state.eventos.find(e => e.id === state.currentEventId);
  const nomeEvento = evt ? evt.nome_evento : '';
  abrirConfirmacaoExclusaoForte({
    titulo: 'Excluir Evento',
    aviso: 'Isso excluirá permanentemente o evento, todas as suas alocações de policiamento e as escalas de diárias associadas.',
    label: `Digite "${nomeEvento}" para confirmar`,
    valorEsperado: nomeEvento,
    onConfirmar: async () => {
      try {
        const res = await apiFetch(`${API_BASE_URL}/api/eventos/${state.currentEventId}`, { method: 'DELETE' });
        if (res.ok) {
          showToast('Evento excluído com sucesso.', 'success');
          closeDrawer();
          fetchData();
        }
      } catch (error) {
        console.error("Erro ao excluir evento:", error);
      }
    }
  });
}

// -------------------------------------------------------------
// TELA 5: RELATÓRIO DINÂMICO DE DIÁRIAS (P3)
// -------------------------------------------------------------
async function renderRelatorioTable() {
  const mes = document.getElementById('filter-mes').value;
  const ano = document.getElementById('filter-ano').value;
  const searchInput = document.getElementById('filter-search-input').value.toLowerCase().trim();
  const tableBody = document.getElementById('table-relatorio-body');
  
  tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">Buscando relatórios...</td></tr>`;

  try {
    const res = await apiFetch(`${API_BASE_URL}/api/relatorio-diarias?mes=${mes}&ano=${ano}`);
    const data = await res.json();

    tableBody.innerHTML = '';
    
    const filteredData = data.filter(item => {
      return item.militar_nome.toLowerCase().includes(searchInput) || 
             item.militar_id.toLowerCase().includes(searchInput);
    });

    // KPIs do topo: refletem o filtro de busca aplicado
    renderRelatorioKpis(filteredData);

    if (filteredData.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">Nenhum militar localizado para o período/filtro selecionado.</td></tr>`;
      return;
    }

    filteredData.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td data-label="Matrícula"><strong>${esc(item.militar_id)}</strong></td>
        <td class="card-title-cell">${esc(item.militar_nome)}</td>
        <td class="text-center" data-label="Qtd. Escalas">${item.escalas_count}</td>
        <td class="text-center" data-label="Total Aparições">${item.qtd_aparicoes}</td>
        <td class="text-right" data-label="Total Diárias" style="color:var(--warning-fg);font-weight:700;">${item.total_diarias}</td>
      `;
      tableBody.appendChild(tr);
    });

  } catch (error) {
    console.error("Erro ao gerar relatório:", error);
    renderRelatorioKpis([]);
    tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--danger-fg);">Falha ao carregar o relatório de diárias.</td></tr>`;
  }
}

// Faixa de KPIs do Relatório de Diárias (protótipo). Tudo derivado da mesma
// lista já carregada — nenhuma chamada extra à API.
function renderRelatorioKpis(lista) {
  const militares = lista.length;
  const diarias = lista.reduce((s, m) => s + (m.total_diarias || 0), 0);
  const escalas = lista.reduce((s, m) => s + (m.escalas_count || 0), 0);
  const media = militares > 0 ? (diarias / militares) : 0;

  document.getElementById('rel-kpi-militares').textContent = militares;
  document.getElementById('rel-kpi-diarias').textContent = diarias;
  document.getElementById('rel-kpi-escalas').textContent = escalas;
  // uma casa decimal só quando não é inteiro, pra não poluir
  document.getElementById('rel-kpi-media').textContent =
    Number.isInteger(media) ? media : media.toFixed(1);
}

function exportRelatorioToCSV() {
  const mes = document.getElementById('filter-mes').value;
  const ano = document.getElementById('filter-ano').value;
  const rows = document.querySelectorAll('#table-relatorio tr');
  
  let csv = [];
  rows.forEach(row => {
    const cols = row.querySelectorAll('td, th');
    let rowData = [];
    cols.forEach(col => {
      rowData.push(`"${col.textContent.replace(/"/g, '""').trim()}"`);
    });
    csv.push(rowData.join(';'));
  });

  const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + csv.join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `relatorio_diarias_${mes}_${ano}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  showToast('Planilha CSV gerada e baixada.', 'success');
}

// -------------------------------------------------------------
// RELATÓRIO DIÁRIO DE DIÁRIAS (por data / por operação)
// -------------------------------------------------------------
function abreviarPosto(posto) { return ABREV_POSTO[posto] || posto || ''; }
function dataBrHifen(iso) { return (iso || '').split('-').reverse().join('-'); } // 2026-07-01 -> 01-07-2026
function nomeMes(mm) { return MESES_NOMES[parseInt(mm, 10)] || ''; }

function nomeExibicaoMilitarDiario(m) {
  const nome = (m.nome_guerra || '').trim() || (m.militar_nome || '').trim() || 'Militar';
  const grad = abreviarPosto(m.posto_graduacao);
  return grad ? `${grad} ${nome}` : nome;
}

function montarTextoRelatorioDiario(dados) {
  const cabMes = `${nomeMes(dados.mes)}/${dados.ano}`;
  if (!dados || !Array.isArray(dados.grupos) || dados.grupos.length === 0) {
    return `RELATÓRIO DE DIÁRIAS — ${cabMes}\n\nNenhuma diária lançada no período.`;
  }
  const linhas = [`RELATÓRIO DE DIÁRIAS — ${cabMes} (${dados.agrupar === 'operacao' ? 'por operação' : 'por data'})`, ''];
  dados.grupos.forEach(g => {
    const militaresTxt = g.militares.map(m => `${nomeExibicaoMilitarDiario(m)} ${m.diarias} diárias`).join(', ');
    if (dados.agrupar === 'operacao') {
      linhas.push(`${g.operacao} — ${dataBrHifen(g.data)}${g.tipo ? ' (' + g.tipo + ')' : ''}: ${militaresTxt} — Total: ${g.total} diárias`);
    } else {
      linhas.push(`${dataBrHifen(g.data)}: ${militaresTxt} — Total do dia: ${g.total} diárias`);
    }
  });
  linhas.push('', `TOTAL DO MÊS: ${dados.total_mes} diárias`);
  return linhas.join('\n');
}

async function renderRelatorioDiario() {
  const pre = document.getElementById('rel-diario-texto');
  if (!pre) return;
  const mes = document.getElementById('filter-mes').value;
  const ano = document.getElementById('filter-ano').value;
  // estado visual do toggle
  const btnData = document.getElementById('btn-rel-diario-data');
  const btnOp = document.getElementById('btn-rel-diario-operacao');
  if (btnData && btnOp) {
    btnData.className = 'btn btn-sm ' + (relDiarioModo === 'data' ? 'btn-primary' : 'btn-secondary');
    btnOp.className = 'btn btn-sm ' + (relDiarioModo === 'operacao' ? 'btn-primary' : 'btn-secondary');
  }
  pre.textContent = 'Carregando...';
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/relatorio-diario?mes=${mes}&ano=${ano}&agrupar=${relDiarioModo}`);
    const dados = await res.json();
    if (!res.ok) { pre.textContent = (dados && dados.error) || 'Falha ao carregar o relatório diário.'; relDiarioTextoAtual = ''; return; }
    relDiarioTextoAtual = montarTextoRelatorioDiario(dados);
    pre.textContent = relDiarioTextoAtual;
  } catch (e) {
    console.error('Erro no relatório diário:', e);
    pre.textContent = 'Falha ao carregar o relatório diário.';
    relDiarioTextoAtual = '';
  }
}

async function handleCopiarRelatorioDiario() {
  if (!relDiarioTextoAtual) return;
  try {
    await navigator.clipboard.writeText(relDiarioTextoAtual);
    showToast('Relatório diário copiado para a área de transferência.', 'success');
  } catch (error) {
    console.error('Erro ao copiar relatório diário:', error);
    showToast('Não foi possível copiar automaticamente. Selecione o texto manualmente.', 'danger');
  }
}

// Cabeçalho oficial padrão dos relatórios PDF (estilo SGEPM).
function cabecalhoRelatorioPdf(titulo, subtitulo) {
  const a = new Date();
  const p2 = n => String(n).padStart(2, '0');
  const ger = `${p2(a.getDate())}/${p2(a.getMonth() + 1)}/${a.getFullYear()}, ${p2(a.getHours())}:${p2(a.getMinutes())}`;
  return `
    <div class="rel-pdf-cabecalho">
      <div class="rpc-brasao">POLÍCIA MILITAR DO RIO GRANDE DO NORTE</div>
      <div class="rpc-sub">5º BATALHÃO DE POLÍCIA MILITAR — SEÇÃO DE PLANEJAMENTO E OPERAÇÕES (P3)</div>
    </div>
    <div class="rel-pdf-titulobar">
      <div>
        <div class="rel-pdf-titulo">${esc(titulo)}</div>
        <div class="rel-pdf-gerado">${esc(subtitulo || '')}</div>
      </div>
      <div class="rel-pdf-gerado">Gerado em: ${ger}</div>
    </div>`;
}

function abrirRelatorioPdf(html) {
  document.getElementById('relatorio-pdf-area').innerHTML = html;
  document.getElementById('modal-relatorio-pdf').classList.remove('hidden');
  lucide.createIcons();
}

// Relatório PDF de Eventos (aba Listar Eventos) — respeita o filtro ativo; colunas Nº/Data/Nº OS/Nome/Local/Nº SEI.
function gerarRelatorioPdfEventos() {
  const eventos = getEventosFiltrados().sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));
  if (eventos.length === 0) {
    showToast('Nenhum evento no filtro ativo para gerar o relatório.', 'warning');
    return;
  }
  const ini = document.getElementById('filter-eventos-inicio').value;
  const fim = document.getElementById('filter-eventos-fim').value;
  const br = iso => iso ? iso.split('-').reverse().join('/') : '';
  let periodo = 'Todos os eventos cadastrados';
  if (ini && fim) periodo = `Período: ${br(ini)} a ${br(fim)}`;
  else if (ini) periodo = `A partir de ${br(ini)}`;
  else if (fim) periodo = `Até ${br(fim)}`;
  const linhas = eventos.map((e, i) => `
    <tr>
      <td>${String(i + 1).padStart(2, '0')}</td>
      <td>${esc(br(e.data_inicio))}</td>
      <td>${esc(e.num_os_manual) || '-'}</td>
      <td>${esc(e.nome_evento)}</td>
      <td>${esc(e.local_itinerario) || esc(e.bairro) || '-'}</td>
      <td>${esc(e.num_sei) || '-'}</td>
    </tr>`).join('');
  const html = `
    ${cabecalhoRelatorioPdf('Relatório de Eventos', periodo)}
    <table class="rel-pdf-tabela">
      <thead><tr>
        <th style="width:34px;">Nº</th><th style="width:78px;">Data</th><th style="width:150px;">Nº OS</th>
        <th>Nome do Evento</th><th>Endereço/Local</th><th style="width:150px;">Nº SEI</th>
      </tr></thead>
      <tbody>${linhas}</tbody>
    </table>
    <div class="rel-pdf-rodape">Total de eventos: ${eventos.length}</div>`;
  abrirRelatorioPdf(html);
}

// Relatório PDF Diário de Diárias (aba Relatório Diárias) — usa /api/relatorio-diario no modo atual (relDiarioModo).
async function gerarRelatorioPdfDiario() {
  const mes = document.getElementById('filter-mes').value;
  const ano = document.getElementById('filter-ano').value;
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/relatorio-diario?mes=${mes}&ano=${ano}&agrupar=${relDiarioModo}`);
    const dados = await res.json();
    if (!res.ok) { showToast((dados && dados.error) || 'Falha ao gerar o relatório.', 'danger'); return; }
    if (!dados.grupos || dados.grupos.length === 0) { showToast('Nenhuma diária no período selecionado.', 'warning'); return; }
    const sub = `${nomeMes(dados.mes)}/${dados.ano} — ${dados.agrupar === 'operacao' ? 'por operação' : 'por data'}`;
    let corpo = '';
    dados.grupos.forEach(g => {
      const cab = dados.agrupar === 'operacao'
        ? `${esc(g.operacao)} — ${esc(dataBrHifen(g.data))}${g.tipo ? ' (' + esc(g.tipo) + ')' : ''}`
        : esc(dataBrHifen(g.data));
      corpo += `<tr class="rel-pdf-grupo-linha"><td colspan="3">${cab}</td></tr>`;
      g.militares.forEach((m, i) => {
        corpo += `<tr><td>${String(i + 1).padStart(2, '0')}</td><td>${esc(nomeExibicaoMilitarDiario(m))}</td><td>${m.diarias} diárias</td></tr>`;
      });
      corpo += `<tr class="rel-pdf-total-linha"><td></td><td>${dados.agrupar === 'operacao' ? 'Total da operação' : 'Total do dia'}</td><td>${g.total} diárias</td></tr>`;
    });
    corpo += `<tr class="rel-pdf-total-linha rel-pdf-total-mes"><td></td><td>TOTAL DO MÊS</td><td>${dados.total_mes} diárias</td></tr>`;
    const html = `
      ${cabecalhoRelatorioPdf('Relatório Diário de Diárias', sub)}
      <table class="rel-pdf-tabela">
        <thead><tr><th style="width:40px;">Nº</th><th>Militar</th><th style="width:130px;">Diárias</th></tr></thead>
        <tbody>${corpo}</tbody>
      </table>`;
    abrirRelatorioPdf(html);
  } catch (e) {
    console.error('Erro no relatório PDF diário:', e);
    showToast('Falha ao gerar o relatório.', 'danger');
  }
}

// Relatório PDF Consolidado de Diárias por Militar (aba Relatório Diárias) — mesmo layout SGEPM
// dos demais relatórios (cabecalhoRelatorioPdf + .rel-pdf-tabela + .rel-pdf-rodape). Fonte:
// /api/relatorio-diarias, respeitando mês/ano e o filtro de busca de militar ativo na tela.
async function gerarRelatorioPdfConsolidado() {
  const mes = document.getElementById('filter-mes').value;
  const ano = document.getElementById('filter-ano').value;
  const busca = document.getElementById('filter-search-input').value.toLowerCase().trim();
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/relatorio-diarias?mes=${mes}&ano=${ano}`);
    const dados = await res.json();
    if (!res.ok) { showToast((dados && dados.error) || 'Falha ao gerar o relatório.', 'danger'); return; }
    const lista = (Array.isArray(dados) ? dados : []).filter(item =>
      item.militar_nome.toLowerCase().includes(busca) || item.militar_id.toLowerCase().includes(busca));
    if (lista.length === 0) { showToast('Nenhum militar no período/filtro selecionado.', 'warning'); return; }
    let sub = `${nomeMes(mes)}/${ano}`;
    if (busca) sub += ` — filtro: "${busca}"`;
    const totalDiarias = lista.reduce((s, m) => s + (Number(m.total_diarias) || 0), 0);
    const linhas = lista.map((m, i) => `
      <tr>
        <td>${String(i + 1).padStart(2, '0')}</td>
        <td>${esc(m.militar_id) || '-'}</td>
        <td>${esc(m.militar_nome)}</td>
        <td style="text-align:center;">${m.escalas_count}</td>
        <td style="text-align:center;">${m.qtd_aparicoes}</td>
        <td style="text-align:right;">${m.total_diarias}</td>
      </tr>`).join('');
    const html = `
      ${cabecalhoRelatorioPdf('Relatório Consolidado de Diárias por Militar', sub)}
      <table class="rel-pdf-tabela">
        <thead><tr>
          <th style="width:34px;">Nº</th><th style="width:110px;">Matrícula</th>
          <th>Nome do Militar</th>
          <th style="width:90px;text-align:center;">Escalas</th>
          <th style="width:90px;text-align:center;">Aparições</th>
          <th style="width:120px;text-align:right;">Total de Diárias</th>
        </tr></thead>
        <tbody>${linhas}</tbody>
      </table>
      <div class="rel-pdf-rodape">Total de militares: ${lista.length} — Total de diárias: ${totalDiarias}</div>`;
    abrirRelatorioPdf(html);
  } catch (e) {
    console.error('Erro no relatório PDF consolidado:', e);
    showToast('Falha ao gerar o relatório.', 'danger');
  }
}

// Baixa um backup JSON com todas as tabelas de negócio (não inclui a trilha de auditoria).
// Usa Blob + URL.createObjectURL em vez do esquema data: do CSV acima — mais robusto para
// payloads maiores, que têm limite de tamanho em alguns navegadores com data:.
async function handleExportarBackup() {
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/backup`);
    const dados = await res.json();

    if (!res.ok) {
      showToast(esc(dados.error) || 'Falha ao gerar o backup.', 'danger');
      return;
    }

    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sgo-backup-${getLocalDateStr()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('Backup gerado e baixado.', 'success');
  } catch (error) {
    console.error('Erro ao exportar backup:', error);
    showToast('Falha na comunicação com o servidor.', 'danger');
  }
}

// -------------------------------------------------------------
// TELA 6: PLANEJADOR MENSAL DE DIÁRIAS (COTA)
// -------------------------------------------------------------
async function renderPlanejadorTab() {
  const mes = document.getElementById('plan-filter-mes').value;
  const ano = document.getElementById('plan-filter-ano').value;
  const tableBody = document.getElementById('table-planejador-body');

  renderCalendarioDiarias();

  try {
    const res = await apiFetch(`${API_BASE_URL}/api/planejador-diarias?mes=${mes}&ano=${ano}`);
    const data = await res.json();

    state.config = { ...state.config, cota_mensal_diarias: data.cota_mensal };

    // KPIs: Cota / Consumido / Planejado / Disponível (+ % da cota)
    document.getElementById('plan-stat-cota').textContent = data.cota_mensal;
    document.getElementById('plan-stat-consumido').textContent = data.total_consumido;
    document.getElementById('plan-stat-planejado').textContent = data.total_planejado || 0;

    const saldoEl = document.getElementById('plan-stat-saldo');
    saldoEl.textContent = data.saldo;
    const estourou = data.saldo < 0;
    saldoEl.style.color = estourou ? 'var(--danger-fg)' : '';
    document.getElementById('plan-stat-saldo-pct').textContent = data.cota_mensal > 0
      ? `${Math.round((data.saldo / data.cota_mensal) * 100)}% da cota` : '';
    // o card vira vermelho quando a cota estourou
    document.getElementById('plan-label-saldo').style.color = estourou ? 'var(--danger-fg)' : 'var(--warning-fg)';
    const iconeSaldo = document.getElementById('plan-icone-saldo');
    iconeSaldo.style.background = estourou ? 'var(--danger-bg)' : 'var(--warning-bg)';
    iconeSaldo.style.color = estourou ? 'var(--danger-fg)' : 'var(--warning-fg)';

    // Input da cota (não sobrescreve enquanto o usuário edita — proteção contra o auto-sync)
    const cotaInput = document.getElementById('input-cota');
    if (document.activeElement !== cotaInput && cotaInput.dataset.dirty !== 'true') {
      cotaInput.value = data.cota_mensal;
    }

    // Barra de consumo: segmento sólido = consumido de fato (escalas reais), segmento
    // translúcido = planejado (missões planejadas ainda não convertidas/escaladas)
    const totalPlanejado = data.total_planejado || 0;
    const pctConsumido = data.cota_mensal > 0
      ? (data.total_consumido / data.cota_mensal) * 100
      : (data.total_consumido > 0 ? 101 : 0);
    const pctPlanejado = data.cota_mensal > 0
      ? (totalPlanejado / data.cota_mensal) * 100
      : (totalPlanejado > 0 ? 101 : 0);
    const pctTotal = pctConsumido + pctPlanejado;

    const fill = document.getElementById('budget-bar-fill');
    fill.style.width = `${Math.min(pctConsumido, 100)}%`;
    fill.classList.remove('warning', 'danger');
    if (pctTotal > 100) {
      fill.classList.add('danger');
    } else if (pctTotal >= 75) {
      fill.classList.add('warning');
    }

    const fillPlanejado = document.getElementById('budget-bar-fill-planejado');
    fillPlanejado.style.width = `${Math.max(0, Math.min(pctPlanejado, 100 - Math.min(pctConsumido, 100)))}%`;

    document.getElementById('budget-label-text').textContent =
      `${data.total_consumido + totalPlanejado} de ${data.cota_mensal} diárias · ${Math.round(pctTotal)}%`;
    document.getElementById('budget-legenda-consumido').textContent = data.total_consumido;
    document.getElementById('budget-legenda-planejado').textContent = totalPlanejado;
    document.getElementById('budget-legenda-disponivel').textContent = Math.max(0, data.saldo);

    // Alerta de estouro da cota (considera consumido + planejado)
    const alertEl = document.getElementById('budget-alert');
    if (data.saldo < 0) {
      document.getElementById('budget-alert-text').textContent =
        `Cota mensal excedida em ${Math.abs(data.saldo)} diária(s), somando consumido e planejado.`;
      alertEl.classList.remove('hidden');
    } else {
      alertEl.classList.add('hidden');
    }

    // Tabela de operações do mês
    tableBody.innerHTML = '';
    const operacoesMes = data.operacoes || [];
    document.getElementById('plan-operacoes-contagem').textContent =
      `${operacoesMes.length} ${operacoesMes.length === 1 ? 'operação' : 'operações'}`;

    if (operacoesMes.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:32px;">Nenhuma operação para este mês.</td></tr>`;
    } else {
      operacoesMes.forEach(op => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', () => openDrawerOperacao(op.id));

        const dateBr = op.data_inicio.split('-').reverse().join('/');
        // Coluna "Escala" do protótipo: com escala (verde) x sem escala (âmbar)
        const badgeEscala = op.tem_escala
          ? `<span class="badge-tint badge-tint-ok">Com escala</span>`
          : `<span class="badge-tint badge-tint-alerta">Sem escala</span>`;

        tr.innerHTML = `
          <td data-label="Data"><strong>${dateBr}</strong></td>
          <td class="card-title-cell">${esc(op.nome_operacao)}</td>
          <td data-label="Tipo">${esc(op.tipo_operacao)}</td>
          <td data-label="Situação">${badgeSituacaoOperacao(op.situacao)}</td>
          <td class="text-center" data-label="Escala">${badgeEscala}</td>
          <td class="text-right" data-label="Diárias" style="color:var(--warning-fg);font-weight:700;">${op.total_diarias}${op.tem_escala ? '' : ' <span style="color:var(--text-muted);font-weight:400;font-size:0.72rem;">(est.)</span>'}</td>
        `;
        tableBody.appendChild(tr);
      });
    }

    renderDiariasPorTipo(operacoesMes);
    lucide.createIcons();
  } catch (error) {
    console.error("Erro ao carregar planejador de diárias:", error);
    tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--danger-fg);">Falha ao carregar o planejador de diárias.</td></tr>`;
  }
}

// Barras "Diárias por Tipo de Operação" (trilho do Planejador). Agrega as
// operações do mês por tipo_operacao; a barra é proporcional ao maior tipo.
function renderDiariasPorTipo(operacoes) {
  const container = document.getElementById('plan-por-tipo');
  if (!container) return;

  const porTipo = {};
  (operacoes || []).forEach(op => {
    const tipo = op.tipo_operacao || 'Outras';
    porTipo[tipo] = (porTipo[tipo] || 0) + (op.total_diarias || 0);
  });

  const linhas = Object.entries(porTipo).filter(([, qtd]) => qtd > 0).sort((a, b) => b[1] - a[1]);
  if (linhas.length === 0) {
    container.innerHTML = `<p class="turno-vazio">Nenhuma diária lançada neste mês.</p>`;
    return;
  }

  const maior = linhas[0][1];
  // Reaproveita as cores de tipo de evento pra manter a paleta coerente entre telas
  const CORES = ['var(--primary)', 'var(--warning-fg)', 'var(--info-fg)', 'var(--roxo)', 'var(--success)', 'var(--badge-neutro)'];

  container.innerHTML = linhas.map(([tipo, qtd], i) => {
    const pct = Math.round((qtd / maior) * 100);
    const cor = CORES[i % CORES.length];
    return `
      <div class="categoria-linha">
        <div class="categoria-topo">
          <span style="font-weight:600;color:${cor};">${esc(tipo)}</span>
          <span style="color:var(--text-muted);">${qtd}</span>
        </div>
        <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${pct}%;background:${cor};"></div></div>
      </div>`;
  }).join('');
}

// -------------------------------------------------------------
// OPERAÇÕES (PLANEJAMENTO -> EXECUÇÃO, COM DIÁRIA)
// -------------------------------------------------------------
const ROTULOS_RECORRENCIA = {
  diaria: 'Diária',
  fim_de_semana: 'Fim de Semana',
  dia_unico: 'Dia Único'
};

// Badge de situação da operação (Planejada = amarelo/alerta; Executada = verde/sucesso).
function badgeSituacaoOperacao(situacao) {
  const cls = situacao === 'Executada' ? 'situacao-executada' : 'situacao-planejada';
  return `<span class="badge ${cls}">${esc(situacao || 'Planejada')}</span>`;
}

function renderOperacoesTab() {
  const tbody = document.getElementById('table-operacoes-body');
  if (!tbody) return;

  const filtroSituacao = document.getElementById('filter-operacoes-situacao').value;
  const termo = normalizarTexto(document.getElementById('filter-operacoes-search').value || '');

  // Diária de cada operação, calculada client-side a partir de state.escalas (real se há escala,
  // estimada se não) — mesma regra do backend (diariaDaOperacao).
  let lista = (state.operacoes || []).map(op => {
    const escalasOp = state.escalas.filter(s => s.operacao_id === op.id);
    const temEscala = escalasOp.length > 0;
    const totalDiarias = temEscala
      ? escalasOp.reduce((sum, s) => sum + (s.total_diarias || 0), 0)
      : (op.qtd_diarias_estimada || 0);
    return { ...op, militares_escalados: escalasOp.length, tem_escala: temEscala, total_diarias: totalDiarias };
  });

  if (filtroSituacao) lista = lista.filter(op => op.situacao === filtroSituacao);
  if (termo) {
    lista = lista.filter(op =>
      normalizarTexto(op.nome_operacao || '').includes(termo) ||
      normalizarTexto(op.demandante || '').includes(termo)
    );
  }

  lista.sort((a, b) => b.data_inicio.localeCompare(a.data_inicio));

  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:32px;">Nenhuma operação localizada.</td></tr>`;
    lucide.createIcons();
    return;
  }

  tbody.innerHTML = '';
  lista.forEach(op => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => openDrawerOperacao(op.id));
    const dateBr = op.data_inicio.split('-').reverse().join('/');
    tr.innerHTML = `
      <td data-label="Data"><strong>${dateBr}</strong></td>
      <td class="card-title-cell">${esc(op.nome_operacao)}</td>
      <td data-label="Tipo">${esc(op.tipo_operacao)}</td>
      <td data-label="Situação">${badgeSituacaoOperacao(op.situacao)}</td>
      <td data-label="Demandante">${esc(op.demandante) || '-'}</td>
      <td class="text-center" data-label="Militares">${op.militares_escalados}</td>
      <td class="text-right" data-label="Diária" style="color:var(--warning-fg);font-weight:700;">${op.total_diarias}${op.tem_escala ? '' : ' <span style="color:var(--text-muted);font-weight:400;font-size:0.72rem;">(est.)</span>'}</td>
    `;
    tbody.appendChild(tr);
  });

  lucide.createIcons();
}

// Abre o modal de Nova/Editar Operação. Sem id -> criação; com id -> edição pré-preenchida.
window.abrirModalOperacao = function(id) {
  const form = document.getElementById('form-operacao');
  form.reset();
  document.getElementById('op-id').value = id || '';

  if (id) {
    const op = (state.operacoes || []).find(o => o.id === id);
    if (!op) { showToast('Operação não encontrada.', 'danger'); return; }
    document.getElementById('modal-operacao-titulo').textContent = 'Editar Operação';
    document.getElementById('op-nome_operacao').value = op.nome_operacao || '';
    document.getElementById('op-tipo_operacao').value = op.tipo_operacao || 'Outras';
    document.getElementById('op-data_inicio').value = op.data_inicio || '';
    document.getElementById('op-data_termino').value = op.data_termino || '';
    document.getElementById('op-qtd_diarias_estimada').value = op.qtd_diarias_estimada != null ? op.qtd_diarias_estimada : 0;
    document.getElementById('op-horario_inicio').value = op.horario_inicio || '';
    document.getElementById('op-tipo_recorrencia').value = op.tipo_recorrencia || '';
    document.getElementById('op-bairro').value = op.bairro || '';
    document.getElementById('op-local_itinerario').value = op.local_itinerario || '';
    document.getElementById('op-num_oficio').value = op.num_oficio || '';
    document.getElementById('op-num_os_manual').value = op.num_os_manual || '';
    document.getElementById('op-num_sei').value = op.num_sei || '';
    document.getElementById('op-demandante').value = op.demandante || '';
  } else {
    document.getElementById('modal-operacao-titulo').textContent = 'Nova Operação';
    document.getElementById('op-tipo_operacao').value = 'Outras';
    document.getElementById('op-data_inicio').value = getLocalDateStr();
    document.getElementById('op-qtd_diarias_estimada').value = 0;
  }

  document.getElementById('modal-operacao').classList.remove('hidden');
  lucide.createIcons();
};

async function handleSalvarOperacao(e) {
  e.preventDefault();
  const id = document.getElementById('op-id').value;

  const payload = {
    nome_operacao: document.getElementById('op-nome_operacao').value.trim(),
    tipo_operacao: document.getElementById('op-tipo_operacao').value,
    data_inicio: document.getElementById('op-data_inicio').value,
    data_termino: document.getElementById('op-data_termino').value,
    qtd_diarias_estimada: document.getElementById('op-qtd_diarias_estimada').value,
    horario_inicio: document.getElementById('op-horario_inicio').value,
    tipo_recorrencia: document.getElementById('op-tipo_recorrencia').value,
    bairro: document.getElementById('op-bairro').value.trim(),
    local_itinerario: document.getElementById('op-local_itinerario').value.trim(),
    num_oficio: document.getElementById('op-num_oficio').value.trim(),
    num_os_manual: document.getElementById('op-num_os_manual').value.trim(),
    num_sei: document.getElementById('op-num_sei').value.trim(),
    demandante: document.getElementById('op-demandante').value.trim()
  };

  if (payload.data_termino && payload.data_termino < payload.data_inicio) {
    showToast('A data de término não pode ser anterior à data de início.', 'danger');
    return;
  }

  await comBotaoCarregando(e.submitter, async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/operacoes${id ? '/' + id : ''}`, {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const dados = await res.json();
      if (res.ok) {
        document.getElementById('modal-operacao').classList.add('hidden');
        showToast(id ? 'Operação atualizada.' : 'Operação criada.', 'success');
        await fetchData();
        renderOperacoesTab();
        if (!id) openDrawerOperacao(dados.id);
      } else {
        showToast(esc(dados.error) || 'Falha ao salvar a operação.', 'danger');
      }
    } catch (error) {
      console.error('Erro ao salvar operação:', error);
      showToast('Falha na comunicação com o servidor.', 'danger');
    }
  });
}

// Gaveta de detalhes da Operação (com efetivo escalado)
async function openDrawerOperacao(id) {
  state.currentOperacaoId = id;
  document.getElementById('drawer-op').classList.add('open');
  await fetchOperacaoDetails(id);
}

function closeDrawerOperacao() {
  document.getElementById('drawer-op').classList.remove('open');
  state.currentOperacaoId = null;
  document.getElementById('form-escala-container').classList.add('hidden');
  document.getElementById('form-escala').reset();
  document.getElementById('diarias-calc-preview').textContent = '2';
  limparAutocompleteEscala();
}

async function fetchOperacaoDetails(id) {
  try {
    const resOp = await apiFetch(`${API_BASE_URL}/api/operacoes`);
    const operacoes = await resOp.json();
    const op = operacoes.find(o => o.id === id);
    if (!op) { closeDrawerOperacao(); return; }

    document.getElementById('drawer-op-title').textContent = op.nome_operacao;
    document.getElementById('drawer-op-badge').outerHTML =
      `<span class="badge ${op.situacao === 'Executada' ? 'situacao-executada' : 'situacao-planejada'}" id="drawer-op-badge">${esc(op.situacao)}</span>`;

    document.getElementById('op-detail-tipo').textContent = op.tipo_operacao || '-';
    document.getElementById('op-detail-recorrencia').textContent = ROTULOS_RECORRENCIA[op.tipo_recorrencia] || '—';
    document.getElementById('op-detail-oficio').textContent = op.num_oficio || 'Sem ofício informado';
    document.getElementById('op-detail-os-manual').textContent = op.num_os_manual || 'Não informado';
    document.getElementById('op-detail-sei').textContent = op.num_sei || 'Não informado';
    document.getElementById('op-detail-demandante').textContent = op.demandante || 'Não Informado';
    document.getElementById('op-detail-inicio').textContent = op.data_inicio.split('-').reverse().join('/');
    document.getElementById('op-detail-termino').textContent = op.data_termino ? op.data_termino.split('-').reverse().join('/') : '-';
    document.getElementById('op-detail-hora').textContent = op.horario_inicio || 'Não informada';
    document.getElementById('op-detail-bairro').textContent = op.bairro || '-';
    document.getElementById('op-detail-estimada').textContent = `${op.qtd_diarias_estimada || 0} diária(s)`;
    document.getElementById('op-detail-local').textContent = op.local_itinerario || '-';

    // Botão "Marcar como Executada" só faz sentido enquanto está Planejada
    document.getElementById('btn-op-marcar-executada').style.display = op.situacao === 'Executada' ? 'none' : '';

    const resEscalas = await apiFetch(`${API_BASE_URL}/api/escalas?operacao_id=${id}`);
    const escalas = await resEscalas.json();
    renderEscalasList(escalas);
    lucide.createIcons();
  } catch (error) {
    console.error('Erro ao carregar detalhes da operação:', error);
  }
}

async function handleMarcarOperacaoExecutada() {
  const id = state.currentOperacaoId;
  if (!id) return;
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/operacoes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ situacao: 'Executada' })
    });
    if (res.ok) {
      showToast('Operação marcada como Executada.', 'success');
      await fetchData();
      if (state.currentOperacaoId === id) fetchOperacaoDetails(id);
      renderOperacoesTab();
    } else {
      const dados = await res.json();
      showToast(esc(dados.error) || 'Falha ao marcar como executada.', 'danger');
    }
  } catch (error) {
    console.error('Erro ao marcar operação como executada:', error);
    showToast('Falha na comunicação com o servidor.', 'danger');
  }
}

function handleDeleteOperacao() {
  const id = state.currentOperacaoId;
  if (!id) return;
  const escalasOp = state.escalas.filter(s => s.operacao_id === id);
  const totalDiarias = escalasOp.reduce((sum, s) => sum + (s.total_diarias || 0), 0);
  const op = (state.operacoes || []).find(o => o.id === id);
  const nomeOp = op ? op.nome_operacao : '';

  const avisoExtra = escalasOp.length > 0
    ? ` Há ${escalasOp.length} militar(es) escalado(s), somando ${totalDiarias} diária(s) — tudo isso será perdido.`
    : '';

  abrirConfirmacaoExclusaoForte({
    titulo: 'Excluir Operação',
    aviso: `Isso excluirá permanentemente a operação e todo o efetivo escalado nela.${avisoExtra}`,
    label: `Digite "${nomeOp}" para confirmar`,
    valorEsperado: nomeOp,
    onConfirmar: async () => {
      try {
        const res = await apiFetch(`${API_BASE_URL}/api/operacoes/${id}`, { method: 'DELETE' });
        if (res.ok) {
          showToast('Operação excluída com sucesso.', 'success');
          closeDrawerOperacao();
          await fetchData();
          renderOperacoesTab();
        }
      } catch (error) {
        console.error('Erro ao excluir operação:', error);
      }
    }
  });
}

// -------------------------------------------------------------
// CALENDÁRIO DE DIÁRIAS + LANÇAMENTO RÁPIDO DE MISSÃO AVULSA
// -------------------------------------------------------------
// Token de execução: se duas chamadas se sobrepõem (clique + polling de 60s), só a
// última escreve na grade. Antes o grid era limpo ANTES do await, então uma corrida
// (ou uma falha do Supabase) deixava o calendário vazio e sem explicação.
let calendarioDiariasToken = 0;

async function renderCalendarioDiarias() {
  const grid = document.getElementById('calendar-diarias-grid');
  const meuToken = ++calendarioDiariasToken;

  const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  document.getElementById('calendar-diarias-month-year').textContent = `${meses[state.calendarDiariasMonth]} ${state.calendarDiariasYear}`;

  const mesStr = String(state.calendarDiariasMonth + 1).padStart(2, '0');
  const anoStr = String(state.calendarDiariasYear);

  const diasComDiaria = {};
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/diarias-calendario?mes=${mesStr}&ano=${anoStr}`);
    const lista = await res.json();
    if (!res.ok || !Array.isArray(lista)) throw new Error('resposta inesperada da API');
    lista.forEach(d => { diasComDiaria[d.dia] = d; });
  } catch (error) {
    console.error('Erro ao carregar o calendário de diárias:', error);
    if (meuToken === calendarioDiariasToken) {
      grid.innerHTML = `<p class="turno-vazio" style="grid-column:1/-1;">Não foi possível carregar o calendário. Tente de novo em instantes.</p>`;
    }
    return;
  }

  // chegou tarde: outra chamada mais recente já assumiu a grade
  if (meuToken !== calendarioDiariasToken) return;

  const primeiroDiaSemana = new Date(state.calendarDiariasYear, state.calendarDiariasMonth, 1).getDay();
  const totalDiasMes = new Date(state.calendarDiariasYear, state.calendarDiariasMonth + 1, 0).getDate();

  // Monta fora da árvore e só troca no fim: a grade nunca fica vazia no meio do caminho
  const fragmento = document.createDocumentFragment();

  // Células vazias antes do dia 1 (o mês pode não começar no domingo)
  for (let i = 0; i < primeiroDiaSemana; i++) {
    const vazia = document.createElement('div');
    vazia.className = 'heat-cell heat-vazia';
    fragmento.appendChild(vazia);
  }

  const hoje = new Date();
  for (let dia = 1; dia <= totalDiasMes; dia++) {
    const celula = document.createElement('div');
    celula.className = 'heat-cell';

    if (hoje.getDate() === dia && hoje.getMonth() === state.calendarDiariasMonth && hoje.getFullYear() === state.calendarDiariasYear) {
      celula.classList.add('heat-hoje');
    }

    const diaFormatado = String(dia).padStart(2, '0');
    const dataStr = `${anoStr}-${mesStr}-${diaFormatado}`;
    const infoDia = diasComDiaria[dataStr];
    const qtd = infoDia ? infoDia.total_diarias : 0;

    // Faixas do protótipo: 0 = neutro, ≤12 leve, ≤24 médio, >24 alto
    if (qtd > 24) celula.classList.add('heat-alto');
    else if (qtd > 12) celula.classList.add('heat-medio');
    else if (qtd > 0) celula.classList.add('heat-leve');

    celula.innerHTML = `<span class="heat-dia">${dia}</span><span class="heat-qtd">${qtd || ''}</span>`;

    const detalhe = infoDia
      ? infoDia.eventos.map(e => `${e.nome_evento} (${e.total_diarias} diária(s))`).join('\n') + '\n'
      : '';
    celula.title = `${detalhe}Clique para lançar uma Missão Avulsa em ${diaFormatado}/${mesStr}`;
    celula.addEventListener('click', () => abrirModalMissaoAvulsa(dataStr));

    fragmento.appendChild(celula);
  }

  grid.replaceChildren(fragmento);
  lucide.createIcons();
}

// Abre o modal de lançamento rápido de missão avulsa, opcionalmente pré-preenchido com uma data
window.abrirModalMissaoAvulsa = function(dataPrefill) {
  document.getElementById('form-missao-avulsa').reset();
  document.getElementById('missao-data').value = dataPrefill || getLocalDateStr();
  document.getElementById('modal-missao-avulsa').classList.remove('hidden');
};

async function handleCriarMissaoAvulsa(e) {
  e.preventDefault();

  // A "missão avulsa" agora é uma OPERAÇÃO (Planejada). A diária vem do efetivo escalado depois,
  // por isso qtd_diarias_estimada nasce 0 (não é reserva de cota, é lançamento pra escalar já).
  const payload = {
    nome_operacao: document.getElementById('missao-nome').value.trim(),
    tipo_operacao: 'Outras',
    situacao: 'Planejada',
    qtd_diarias_estimada: 0,
    demandante: 'Interno / Diária Avulsa',
    data_inicio: document.getElementById('missao-data').value,
    horario_inicio: document.getElementById('missao-horario').value,
    local_itinerario: document.getElementById('missao-local').value.trim()
  };

  await comBotaoCarregando(e.submitter, async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/operacoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const criado = await res.json();

      if (res.ok) {
        document.getElementById('modal-missao-avulsa').classList.add('hidden');
        showToast('Operação avulsa criada! Agora escale o(s) militar(es) para gerar a diária.', 'success');
        await fetchData(); // já atualiza o Planejador/Calendário de Diárias, pois esta é a aba ativa
        openDrawerOperacao(criado.id);
      } else {
        showToast(esc(criado.error) || 'Falha ao criar a operação avulsa.', 'danger');
      }
    } catch (error) {
      console.error("Erro ao criar operação avulsa:", error);
      showToast('Falha na comunicação com o servidor.', 'danger');
    }
  });
}

async function handleSaveCota() {
  const input = document.getElementById('input-cota');
  const valor = parseInt(input.value, 10);

  if (isNaN(valor) || valor < 0) {
    showToast('Informe uma cota válida (número inteiro maior ou igual a 0).', 'warning');
    return;
  }

  try {
    const res = await apiFetch(`${API_BASE_URL}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cota_mensal_diarias: valor })
    });

    if (res.ok) {
      state.config = await res.json();
      input.dataset.dirty = 'false';
      showToast(`Cota mensal atualizada para <strong>${valor}</strong> diárias.`, 'success');
      renderPlanejadorTab();
      updateStats();
    } else {
      const err = await res.json();
      showToast(err.error || 'Falha ao salvar a cota.', 'danger');
    }
  } catch (error) {
    console.error("Erro ao salvar cota:", error);
    showToast('Falha na comunicação com o servidor.', 'danger');
  }
}

// Mostra o impacto da nova escala no saldo da cota do mês da operação
function updateEscalaBudgetPreview() {
  const textEl = document.getElementById('escala-budget-text');
  const wrap = document.getElementById('escala-budget-preview');
  const op = state.operacoes.find(o => o.id === state.currentOperacaoId);

  if (!op) {
    textEl.textContent = 'Saldo indisponível.';
    return;
  }

  const qtd = parseInt(document.getElementById('esc_qtd_aparicoes').value, 10) || 1;
  const novasDiarias = qtd * 2;

  const prefixoMes = op.data_inicio.slice(0, 7); // "YYYY-MM"
  const idsOperacoesMes = new Set(
    state.operacoes.filter(o => o.data_inicio.startsWith(prefixoMes)).map(o => o.id)
  );
  const consumido = state.escalas
    .filter(s => idsOperacoesMes.has(s.operacao_id))
    .reduce((sum, s) => sum + (s.total_diarias || 0), 0);

  const cota = state.config ? (state.config.cota_mensal_diarias || 0) : 0;
  const saldoApos = cota - consumido - novasDiarias;
  const [anoEvt, mesEvt] = op.data_inicio.split('-');

  wrap.classList.remove('exceeded');

  if (cota <= 0) {
    textEl.innerHTML = `Nenhuma cota mensal definida. Configure no <strong>Planejador Diárias</strong>.`;
  } else if (saldoApos < 0) {
    wrap.classList.add('exceeded');
    textEl.innerHTML = `Atenção: esta escala <strong>excede a cota de ${mesEvt}/${anoEvt} em ${Math.abs(saldoApos)} diária(s)</strong>.`;
  } else {
    textEl.innerHTML = `Saldo da cota de ${mesEvt}/${anoEvt} após esta escala: <strong>${saldoApos}</strong> diária(s) disponível(is).`;
  }
}

// -------------------------------------------------------------
// TELA 7: ESTATÍSTICAS (PAINEL ANALÍTICO PARA PLANEJAMENTO)
// -------------------------------------------------------------

// Gráfico de linha (SVG puro, sem lib externa) comparando eventos planejados x realizados por mês,
// com destaque para o(s) mês(es) de maior consumo de diárias no ano filtrado
function renderSazonalidadeChart(tendenciaMensal) {
  const container = document.getElementById('chart-sazonalidade');
  if (!container) return;

  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const W = 760, H = 220, padL = 30, padR = 16, padT = 16, padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = tendenciaMensal.length;

  const maxEventos = Math.max(1, ...tendenciaMensal.map(m => Math.max(m.eventos_planejados, m.eventos_realizados)));
  const picoDiarias = Math.max(0, ...tendenciaMensal.map(m => m.total_diarias));

  const x = (i) => padL + (plotW * i) / (n - 1 || 1);
  const y = (v) => padT + plotH - (plotH * v) / maxEventos;

  const picoMarkers = tendenciaMensal.map((m, i) => {
    if (picoDiarias === 0 || m.total_diarias !== picoDiarias) return '';
    return `<rect x="${x(i) - 16}" y="${padT}" width="32" height="${plotH}" style="fill:var(--warning);opacity:0.10;"></rect>`;
  }).join('');

  const gridY = [0, 0.5, 1].map(frac => {
    const val = Math.round(maxEventos * frac);
    const yy = y(val);
    return `
      <line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" style="stroke:var(--border-color);stroke-width:1;"></line>
      <text x="${padL - 6}" y="${yy + 3}" text-anchor="end" class="sazonalidade-label">${val}</text>
    `;
  }).join('');

  const linha = (chave) => tendenciaMensal.map((m, i) => `${x(i)},${y(m[chave])}`).join(' ');

  const circulos = (chave, cor) => tendenciaMensal.map((m, i) => `
    <circle cx="${x(i)}" cy="${y(m[chave])}" r="3.5" style="fill:${cor};">
      <title>${meses[i]}: ${m[chave]} evento(s) — ${m.total_diarias} diária(s) no mês</title>
    </circle>`).join('');

  const labelsX = tendenciaMensal.map((m, i) => `
    <text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="sazonalidade-label">${meses[i]}</text>`).join('');

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="sazonalidade-svg" preserveAspectRatio="xMidYMid meet">
      ${picoMarkers}
      ${gridY}
      <polyline points="${linha('eventos_planejados')}" style="fill:none;stroke:var(--primary);stroke-width:2;"></polyline>
      <polyline points="${linha('eventos_realizados')}" style="fill:none;stroke:var(--success);stroke-width:2;"></polyline>
      ${circulos('eventos_planejados', 'var(--primary)')}
      ${circulos('eventos_realizados', 'var(--success)')}
      ${labelsX}
    </svg>
  `;
}

// Mini-sparkline SVG (12 pontos, um por mês) sob os cards do Painel Analítico —
// mesma técnica de SVG à mão de renderSazonalidadeChart, só que sem eixos/labels.
function renderSparkline(elementId, valores) {
  const el = document.getElementById(elementId);
  if (!el) return;
  if (!valores || valores.length === 0) { el.innerHTML = ''; return; }

  const W = 100, H = 24, pad = 2;
  const max = Math.max(...valores);
  const min = Math.min(...valores);
  const n = valores.length;
  const x = (i) => pad + ((W - pad * 2) * i) / (n - 1 || 1);
  const y = (v) => {
    if (max === min) return H / 2;
    return pad + (H - pad * 2) * (1 - (v - min) / (max - min));
  };

  const pontos = valores.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const ultimo = valores[n - 1];
  const penultimo = n > 1 ? valores[n - 2] : ultimo;
  const cor = ultimo > penultimo ? 'var(--success)' : (ultimo < penultimo ? 'var(--danger)' : 'var(--text-muted)');

  el.setAttribute('viewBox', `0 0 ${W} ${H}`);
  el.innerHTML = `
    <polyline points="${pontos}" style="fill:none;stroke:${cor};stroke-width:1.5;"></polyline>
    <circle cx="${x(n - 1)}" cy="${y(ultimo)}" r="2" style="fill:${cor};"></circle>
  `;
}


// -------------------------------------------------------------
// TELA 8: CARTÃO PROGRAMA (PATRULHAMENTO DIÁRIO POR VIATURA)
// -------------------------------------------------------------
const ATIVIDADES_CARTAO = ['PB', 'Patrulhamento', 'QTL Almoço', 'QTL Jantar', 'Corredor Seguro', 'Barreira Itinerante', 'Outros'];

// Abreviação de posto/graduação para o Relatório Diário (estilo usado nos nomes de login do batalhão).
const ABREV_POSTO = {
  'Soldado PM': 'Sd', 'Cabo PM': 'Cb',
  '3º Sargento PM': '3º Sgt', '2º Sargento PM': '2º Sgt', '1º Sargento PM': '1º Sgt',
  'Subtenente PM': 'Subten', 'Aspirante a Oficial PM': 'Asp',
  '2º Tenente PM': '2º Ten', '1º Tenente PM': '1º Ten',
  'Capitão PM': 'Cap', 'Major PM': 'Maj', 'Tenente-Coronel PM': 'Ten Cel', 'Coronel PM': 'Cel'
};
const MESES_NOMES = ['', 'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
let relDiarioModo = 'data'; // 'data' | 'operacao'
let relDiarioTextoAtual = ''; // texto atual para o botão Copiar

// Item de roteiro em edição inline de atividade (Mudar atividade): { vtrId, itemId } ou null.
let editandoAtividadeItem = null;

// Sanitiza um valor livre para uso seguro como classe CSS de badge: min\u00fasculo, sem acento,
// espa\u00e7os viram h\u00edfen e QUALQUER caractere fora de [a-z0-9-] \u00e9 REMOVIDO. Sem essa whitelist,
// um valor com aspas/sinais (ex: tipo_evento vindo de dado legado) injetaria atributo no
// class="..." (XSS) \u2014 o esc() s\u00f3 protege o conte\u00fado de texto do badge, n\u00e3o o slug da classe.
// Para valores v\u00e1lidos (listas fechadas de espa\u00e7o \u00fanico) o resultado \u00e9 id\u00eantico ao slug antigo,
// ent\u00e3o as classes CSS j\u00e1 existentes em style.css continuam casando.
function slugBadge(valor) {
  return String(valor || '')
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, "");
}

function atividadeBadgeClass(atividade) {
  return `atv-${slugBadge(atividade || 'Outros')}`;
}

function categoriaBadgeClass(categoria) {
  return `cat-${slugBadge(categoria || 'Ordin\u00e1ria')}`;
}

// Mapa fixo (em vez de transformar a string) porque as 5 categorias têm preposições/acentos
// que não convertem de forma previsível pelo mesmo slug usado nos outros badges.
const CATEGORIA_PESSOAL_BADGE_MAP = {
  'Adjunto': 'pcat-adjunto',
  'Fiscal de Operações': 'pcat-fiscal-de-operacoes',
  'Oficial de Operações': 'pcat-oficial-de-operacoes',
  'Oficial de Sobreaviso': 'pcat-oficial-de-sobreaviso',
  'Executor': 'pcat-executor'
};
function categoriaPessoalBadgeClass(categoria) {
  return CATEGORIA_PESSOAL_BADGE_MAP[categoria] || 'outros';
}

function statusViaturaBadgeClass(status) {
  return `status-${slugBadge(status || 'Ativa')}`;
}

function formatHoraCartao(hora) {
  if (!hora) return '';
  return hora.replace(':', 'h');
}

// Normaliza texto para comparação (minúsculas, sem acentos)
function normalizarTexto(texto) {
  return (texto || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

// Eventos da pauta que ocorrem na data do cartão dentro do setor da viatura
function eventosNoSetorDaVtr(vtr, dataCartao) {
  const setorNorm = normalizarTexto(vtr.setor);
  if (!setorNorm) return [];

  return state.eventos.filter(evt => {
    const fim = evt.data_termino || evt.data_inicio;
    if (!(evt.data_inicio <= dataCartao && dataCartao <= fim)) return false;

    const bairroNorm = normalizarTexto(evt.bairro);
    if (!bairroNorm) return false;

    // Casa "PONTA NEGRA" com "Ponta Negra" e "CANDELÁRIA / PARQUE DAS COLINAS" com "Candelária"
    return setorNorm.includes(bairroNorm) || bairroNorm.includes(setorNorm);
  });
}

// -------------------------------------------------------------
// ALERTAS DE CONFLITO (SOBREPOSIÇÃO DE HORÁRIO E COBERTURA DE SETOR)
// -------------------------------------------------------------
function horaParaMinutos(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function minutosParaHora(min) {
  const m = ((min % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// Verifica se dois itens de roteiro (mesma viatura) se sobrepõem no tempo.
// Sem horário de fim em algum dos dois, não dá pra afirmar sobreposição com segurança.
function itensSobrepostos(itemA, itemB) {
  if (!itemA.fim || !itemB.fim) return false;

  const aIni = horaParaMinutos(itemA.inicio);
  let aFim = horaParaMinutos(itemA.fim);
  if (aFim <= aIni) aFim += 24 * 60; // roteiro que atravessa a meia-noite

  const bIni = horaParaMinutos(itemB.inicio);
  let bFim = horaParaMinutos(itemB.fim);
  if (bFim <= bIni) bFim += 24 * 60;

  return aIni < bFim && bIni < aFim;
}

// Calcula todos os alertas de conflito do cartão: sobreposição de horário por viatura
// e setores com 2+ viaturas que ficam simultaneamente sem cobertura (todas em QTL ao mesmo tempo)
function calcularAlertasCartao(cartao) {
  const alertas = [];

  // 0. Fiscal de Operações é uma Praça e não há Oficial de Sobreaviso vinculado a esta escala
  if (!cartao.is_template && cartao.fiscal) {
    const fiscalPessoa = (state.pessoal || []).find(p => p.nome === cartao.fiscal);
    if (fiscalPessoa && fiscalPessoa.tipo === 'Praça' && !cartao.oficial_sobreaviso) {
      alertas.push({
        tipo: 'sobreaviso-pendente',
        mensagem: `O Fiscal de Operações (${cartao.fiscal}) é uma Praça — é necessário vincular o Oficial de Sobreaviso desta escala.`
      });
    }
  }

  // 1. Sobreposição de horários dentro da mesma viatura
  (cartao.viaturas || []).forEach(vtr => {
    const itens = vtr.itens || [];
    for (let i = 0; i < itens.length; i++) {
      for (let j = i + 1; j < itens.length; j++) {
        if (itensSobrepostos(itens[i], itens[j])) {
          alertas.push({
            tipo: 'sobreposicao',
            mensagem: `VTR ${vtr.prefixo}: horários sobrepostos — "${formatHoraCartao(itens[i].inicio)} às ${formatHoraCartao(itens[i].fim)}" (${itens[i].atividade}) conflita com "${formatHoraCartao(itens[j].inicio)} às ${formatHoraCartao(itens[j].fim)}" (${itens[j].atividade}).`
          });
        }
      }
    }
  });

  // 2. Setor sem cobertura: 2+ viaturas do mesmo setor em QTL ao mesmo tempo
  const gruposSetor = {};
  (cartao.viaturas || []).forEach(vtr => {
    const chave = normalizarTexto(vtr.setor);
    if (!chave) return;
    if (!gruposSetor[chave]) gruposSetor[chave] = { nomeSetor: vtr.setor, viaturas: [] };
    gruposSetor[chave].viaturas.push(vtr);
  });

  Object.values(gruposSetor).forEach(grupo => {
    if (grupo.viaturas.length < 2) return; // setor com 1 só viatura: QTL dela é inevitável, não é "conflito"

    ['QTL Almoço', 'QTL Jantar'].forEach(tipoQtl => {
      const janelas = grupo.viaturas
        .map(v => (v.itens || []).find(i => i.atividade === tipoQtl))
        .filter(item => item && item.fim);

      if (janelas.length < grupo.viaturas.length) return; // nem todas lançaram esse QTL ainda

      let iniMax = -Infinity;
      let fimMin = Infinity;
      janelas.forEach(item => {
        const ini = horaParaMinutos(item.inicio);
        let fim = horaParaMinutos(item.fim);
        if (fim <= ini) fim += 24 * 60;
        if (ini > iniMax) iniMax = ini;
        if (fim < fimMin) fimMin = fim;
      });

      if (iniMax < fimMin) {
        alertas.push({
          tipo: 'cobertura',
          mensagem: `Setor ${grupo.nomeSetor}: todas as viaturas em ${tipoQtl} simultaneamente entre ${formatHoraCartao(minutosParaHora(iniMax))} e ${formatHoraCartao(minutosParaHora(fimMin))} — setor sem cobertura.`
        });
      }
    });
  });

  return alertas;
}

// Renderiza a faixa de conflito do topo + o painel detalhado do trilho.
function renderAlertasCartao() {
  const lista = document.getElementById('cartao-alertas-lista');
  const contador = document.getElementById('cartao-alertas-contador');
  const banner = document.getElementById('cartao-conflito-banner');
  const alertas = calcularAlertasCartao(state.cartaoAtual);

  contador.textContent = alertas.length;
  contador.classList.toggle('contador-pill-zero', alertas.length === 0);

  if (alertas.length === 0) {
    banner.classList.add('hidden');
    lista.innerHTML = `<div class="dash-alertas-vazio"><i data-lucide="check-circle"></i><span>Nenhum conflito neste cartão.</span></div>`;
  } else {
    banner.classList.remove('hidden');
    document.getElementById('cartao-conflito-titulo').textContent =
      `${alertas.length} ${alertas.length === 1 ? 'alerta de conflito' : 'alertas de conflito'} neste cartão.`;
    // resumo dos tipos presentes, sem repetir
    const tipos = [...new Set(alertas.map(a => ROTULO_CONFLITO[a.tipo] || 'Conflito'))];
    document.getElementById('cartao-conflito-sub').textContent = tipos.join(' · ');

    lista.innerHTML = alertas.map(a => `
      <div class="dash-alerta-item">
        <span class="dash-alerta-icone" style="background:var(--warning-bg);color:var(--warning-fg);"><i data-lucide="alert-triangle"></i></span>
        <div class="dash-alerta-texto">
          <div class="dash-alerta-titulo">${esc(ROTULO_CONFLITO[a.tipo] || 'Conflito')}</div>
          <div class="dash-alerta-sub">${esc(a.mensagem)}</div>
        </div>
      </div>`).join('');
  }
  lucide.createIcons();
}

// Rótulo curto por tipo de conflito — usado no título do item e no resumo da faixa
const ROTULO_CONFLITO = {
  'sobreposicao': 'Sobreposição de horário',
  'cobertura': 'Setor sem cobertura',
  'sobreaviso-pendente': 'Fiscal Praça sem Oficial de Sobreaviso'
};

// Mini-cards de resumo + barras de distribuição por categoria (trilho do cartão)
function renderResumoLateralCartao() {
  const viaturas = (state.cartaoAtual && state.cartaoAtual.viaturas) || [];
  const setores = new Set(viaturas.map(v => v.setor).filter(Boolean));
  const atividades = new Set();
  viaturas.forEach(v => (v.itens || []).forEach(i => { if (i.atividade) atividades.add(i.atividade); }));
  const conflitos = calcularAlertasCartao(state.cartaoAtual).length;

  const cards = [
    { valor: viaturas.length, rotulo: 'Viaturas', icone: 'car', cor: 'var(--primary)', bg: 'var(--primary-soft)' },
    // sempre `-fg` para cor de TEXTO/ícone sobre superfície — é o token legível
    // nos dois temas. `--info` sólido só serve de fundo com texto branco em cima.
    { valor: setores.size, rotulo: 'Setores', icone: 'map', cor: 'var(--info-fg)', bg: 'var(--info-bg)' },
    { valor: atividades.size, rotulo: 'Atividades', icone: 'activity', cor: 'var(--success-fg)', bg: 'var(--success-bg)' },
    {
      valor: conflitos, rotulo: 'Conflitos', icone: 'alert-triangle',
      cor: conflitos ? 'var(--danger-fg)' : 'var(--success-fg)',
      bg: conflitos ? 'var(--danger-bg)' : 'var(--success-bg)'
    }
  ];

  document.getElementById('cartao-resumo-mini').innerHTML = cards.map(c => `
    <div class="resumo-mini-card">
      <span class="resumo-mini-icone" style="background:${c.bg};color:${c.cor};"><i data-lucide="${c.icone}"></i></span>
      <div>
        <div class="resumo-mini-valor" style="color:${c.cor};">${c.valor}</div>
        <div class="resumo-mini-rotulo">${esc(c.rotulo)}</div>
      </div>
    </div>`).join('');

  // Distribuição por categoria de viatura — mesmas cores dos badges .cat-*
  const CORES_CAT = {
    'Ordinária': 'var(--primary)',
    'Força Tática': 'var(--danger-fg)',
    'Suplementar': 'var(--warning-fg)'
  };
  const contagem = {};
  viaturas.forEach(v => {
    const cat = v.categoria || 'Ordinária';
    contagem[cat] = (contagem[cat] || 0) + 1;
  });
  const total = viaturas.length;
  const linhas = Object.entries(contagem).sort((a, b) => b[1] - a[1]);

  document.getElementById('cartao-categorias').innerHTML = total === 0
    ? `<p class="turno-vazio">Nenhuma viatura no cartão.</p>`
    : linhas.map(([cat, qtd]) => {
        const pct = Math.round((qtd / total) * 100);
        const cor = CORES_CAT[cat] || 'var(--badge-neutro)';
        return `
          <div class="categoria-linha">
            <div class="categoria-topo">
              <span style="font-weight:600;color:${cor};">${esc(cat)}</span>
              <span style="color:var(--text-muted);">${qtd} (${pct}%)</span>
            </div>
            <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${pct}%;background:${cor};"></div></div>
          </div>`;
      }).join('');

  lucide.createIcons();
}

// Move a data do cartão N dias e recarrega — setas do navegador de data.
function deslocarDiaCartao(dias) {
  const campo = document.getElementById('cartao-data');
  const base = campo.value ? new Date(campo.value + 'T00:00:00') : new Date();
  base.setDate(base.getDate() + dias);
  campo.value = getLocalDateStr(base);
  renderCartaoTab();
}

// Dia da semana + pílula de status ao lado do navegador de data
function atualizarCabecalhoDataCartao(dataStr, temCartao) {
  const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const semana = document.getElementById('cartao-data-semana');
  const pill = document.getElementById('cartao-status-pill');
  const texto = document.getElementById('cartao-status-texto');

  semana.textContent = dataStr ? DIAS[new Date(dataStr + 'T00:00:00').getDay()] : '';
  pill.classList.toggle('status-pill-ok', temCartao === true);
  pill.classList.toggle('status-pill-pendente', temCartao === false);
  texto.textContent = temCartao === null ? 'Selecione uma data'
    : (temCartao ? 'Cartão lançado' : 'Cartão não lançado');
}

async function renderCartaoTab() {
  const dataSelecionada = document.getElementById('cartao-data').value;
  const vazioEl = document.getElementById('cartao-vazio');
  const conteudoEl = document.getElementById('cartao-conteudo');

  state.cartaoAtual = null;

  if (!dataSelecionada) {
    vazioEl.classList.remove('hidden');
    conteudoEl.classList.add('hidden');
    atualizarCabecalhoDataCartao('', null);
    atualizarSugestaoTemplateUI();
    return;
  }

  try {
    // Garante a pauta de eventos em memória para o cruzamento setor x bairro
    if (!state.eventos || state.eventos.length === 0) {
      const resEvt = await apiFetch(`${API_BASE_URL}/api/eventos`);
      state.eventos = await resEvt.json();
    }

    const res = await apiFetch(`${API_BASE_URL}/api/cartoes?data=${dataSelecionada}`);
    const lista = await res.json();

    if (lista.length === 0) {
      vazioEl.classList.remove('hidden');
      conteudoEl.classList.add('hidden');
      atualizarCabecalhoDataCartao(dataSelecionada, false);
      atualizarSugestaoTemplateUI();
      lucide.createIcons();
      renderHistoricoRecente();
      return;
    }

    atualizarCabecalhoDataCartao(dataSelecionada, true);
    const resDetalhe = await apiFetch(`${API_BASE_URL}/api/cartoes/${lista[0].id}`);
    const cartao = await resDetalhe.json();
    exibirCartaoNoEditor(cartao);
    renderHistoricoRecente();
  } catch (error) {
    console.error("Erro ao carregar Cartão Programa:", error);
    showToast('Falha ao carregar o Cartão Programa.', 'danger');
  }
}

// Carrega um cartão (do dia ou template) no editor compartilhado de viaturas/roteiros
// Preenche um <select> do Cartão Programa (Fiscal/Adjunto/Sobreaviso) com o Cadastro de Pessoal da
// categoria informada. Se o valor atual não estiver na lista (ex: texto livre de antes desta mudança
// ou pessoa desativada), mantém ele como opção extra para não perder o dado já gravado.
function popularSelectPessoal(selectId, categoria, valorAtual) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const pessoasDaCategoria = (state.pessoal || []).filter(p => (p.categorias || []).includes(categoria));
  let opcoesHtml = '<option value="">Selecione...</option>' +
    pessoasDaCategoria.map(p => `<option value="${esc(p.nome)}">${esc(p.nome)} (${esc(p.posto_graduacao)})</option>`).join('');

  if (valorAtual && !pessoasDaCategoria.some(p => p.nome === valorAtual)) {
    opcoesHtml += `<option value="${esc(valorAtual)}">${esc(valorAtual)} (não cadastrado)</option>`;
  }

  select.innerHTML = opcoesHtml;
  select.value = valorAtual || '';
}

function exibirCartaoNoEditor(cartao) {
  state.cartaoAtual = cartao;
  document.getElementById('cartao-vazio').classList.add('hidden');
  document.getElementById('cartao-conteudo').classList.remove('hidden');

  const headerFieldsEl = document.querySelector('#tab-cartao .cartao-header-fields');

  if (cartao.is_template) {
    document.getElementById('cartao-titulo-print').textContent = `CARTÃO PADRÃO: ${cartao.nome_template}`;
    document.getElementById('cartao-subtitulo-print').textContent =
      `${cartao.tipo_periodo === 'fim_de_semana' ? 'Fim de Semana' : 'Dia Útil'} · ${cartao.qtd_viaturas_base} viatura(s) base`;
    if (headerFieldsEl) headerFieldsEl.classList.add('hidden');
  } else {
    const dataBr = cartao.data.split('-').reverse().join('/');
    document.getElementById('cartao-titulo-print').textContent = `CARTÃO PROGRAMA ${dataBr} - 5º BPM`;
    document.getElementById('cartao-subtitulo-print').textContent = 'Policiamento Ostensivo Diário';
    popularSelectPessoal('cartao-fiscal', 'Fiscal de Operações', cartao.fiscal);
    popularSelectPessoal('cartao-adjunto', 'Adjunto', cartao.adjunto);
    popularSelectPessoal('cartao-sobreaviso', 'Oficial de Sobreaviso', cartao.oficial_sobreaviso);
    const selTipo = document.getElementById('cartao-tipo-periodo');
    if (selTipo) selTipo.value = cartao.tipo_periodo || '';
    if (headerFieldsEl) headerFieldsEl.classList.remove('hidden');
    atualizarCampoSobreavisoPrint();
  }

  renderCartaoVtrGrid();
  renderQuadroResumo();
  renderAlertasCartao();
  renderResumoLateralCartao();
  lucide.createIcons();
}

// Na impressão, o campo "Oficial de Sobreaviso" vira um único rótulo dinâmico: se o Fiscal do
// dia já é Oficial, imprime "Oficial de Serviço: [fiscal]" (o sobreaviso é redundante); se o
// Fiscal é Praça, imprime "Sobreaviso: [oficial de sobreaviso]" normalmente.
function atualizarCampoSobreavisoPrint() {
  const labelEl = document.getElementById('cartao-sobreaviso-print-label');
  const valorEl = document.getElementById('cartao-sobreaviso-print-valor');
  if (!labelEl || !valorEl) return;

  const fiscalNome = document.getElementById('cartao-fiscal').value;
  const sobreavisoNome = document.getElementById('cartao-sobreaviso').value;
  const fiscalPessoa = (state.pessoal || []).find(p => p.nome === fiscalNome);

  if (fiscalPessoa && fiscalPessoa.tipo === 'Oficial') {
    labelEl.textContent = 'Oficial de Serviço';
    valorEl.textContent = fiscalNome || '-';
  } else {
    labelEl.textContent = 'Sobreaviso';
    valorEl.textContent = sobreavisoNome || '-';
  }
}

// Limpa a sugestão de template anterior quando a data muda. O tipo (Dia Útil/Fim de Semana)
// é escolhido manualmente no select #sugestao-tipo-periodo — sem inferência por data.
function atualizarSugestaoTemplateUI() {
  const resultadoEl = document.getElementById('cartao-sugestao-resultado');
  if (resultadoEl) resultadoEl.innerHTML = '';
}

// Busca o template cadastrado para o período (dia útil/fim de semana) + quantidade de viaturas da data selecionada
async function handleBuscarTemplateSugerido() {
  const dataSelecionada = document.getElementById('cartao-data').value;
  if (!dataSelecionada) {
    showToast('Selecione a data do Cartão Programa.', 'warning');
    return;
  }

  const tipoPeriodo = document.getElementById('sugestao-tipo-periodo').value;
  const qtdViaturas = document.getElementById('sugestao-qtd-viaturas').value;
  const resultadoEl = document.getElementById('cartao-sugestao-resultado');

  try {
    const res = await apiFetch(`${API_BASE_URL}/api/cartoes/templates?tipo_periodo=${tipoPeriodo}&qtd_viaturas_base=${qtdViaturas}`);
    const templates = await res.json();

    if (templates.length === 0) {
      resultadoEl.innerHTML = `
        <div class="template-sugerido-box nao-encontrado">
          <span><i data-lucide="alert-triangle" style="width:14px;height:14px;vertical-align:middle;"></i>
          Nenhum cartão padrão cadastrado para <strong>${tipoPeriodo === 'fim_de_semana' ? 'Fim de Semana' : 'Dia Útil'}</strong> com <strong>${qtdViaturas}</strong> viaturas.
          Crie o cartão manualmente abaixo, ou cadastre um cartão padrão em "Novo Cartão Padrão".</span>
        </div>`;
    } else {
      const tpl = templates[0];
      resultadoEl.innerHTML = `
        <div class="template-sugerido-box encontrado">
          <span><i data-lucide="layout-template" style="width:14px;height:14px;vertical-align:middle;"></i>
          Cartão padrão sugerido: <strong>${esc(tpl.nome_template)}</strong> (${tpl.qtd_viaturas} viatura(s) cadastradas)</span>
          <button class="btn btn-primary btn-sm" data-action="importar-template" data-id="${tpl.id}">
            <i data-lucide="copy-plus"></i> Importar e Clonar
          </button>
        </div>`;
    }
    lucide.createIcons();
  } catch (error) {
    console.error('Erro ao buscar template sugerido:', error);
    resultadoEl.innerHTML = '';
    showToast('Falha ao buscar cartão padrão.', 'danger');
  }
}

// Clona o template para a data selecionada, criando o Cartão Programa do dia
window.handleImportarClonarTemplate = async function (templateId) {
  const dataSelecionada = document.getElementById('cartao-data').value;
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/cartoes/${templateId}/clonar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: dataSelecionada })
    });

    if (res.status === 409) {
      showToast('Já existe um Cartão Programa para esta data.', 'warning');
      renderCartaoTab();
      return;
    }
    if (res.ok) {
      const criado = await res.json();
      showToast(`Cartão criado a partir do cartão padrão, com <strong>${criado.viaturas.length}</strong> viatura(s). Preencha os comandantes.`, 'success');
      renderCartaoTab();
    } else {
      const err = await res.json();
      showToast(err.error || 'Falha ao importar o cartão padrão.', 'danger');
    }
  } catch (error) {
    console.error('Erro ao clonar template:', error);
    showToast('Falha na comunicação com o servidor.', 'danger');
  }
};

// -------------------------------------------------------------
// TEMPLATES DE CARTÃO PROGRAMA (GESTÃO — P3)
// -------------------------------------------------------------

async function renderTemplatesTab() {
  const tbody = document.getElementById('table-templates-body');
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/cartoes/templates`);
    const templates = await res.json();

    if (templates.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;">Nenhum cartão padrão cadastrado ainda.</td></tr>`;
      return;
    }

    tbody.innerHTML = templates.map(t => `
      <tr>
        <td><strong>${esc(t.nome_template)}</strong></td>
        <td>${t.tipo_periodo === 'fim_de_semana' ? 'Fim de Semana' : 'Dia Útil'}</td>
        <td class="text-center">${t.qtd_viaturas_base}</td>
        <td class="text-center">${t.qtd_viaturas}</td>
        <td class="text-right">
          <button class="btn btn-secondary btn-sm" data-action="abrir-template" data-id="${t.id}">
            <i data-lucide="folder-open" style="width:12px;height:12px;"></i> Abrir
          </button>
          <button class="btn btn-danger btn-sm" data-action="excluir-template" data-id="${t.id}">
            <i data-lucide="trash-2" style="width:12px;height:12px;"></i> Excluir
          </button>
        </td>
      </tr>
    `).join('');
    lucide.createIcons();
  } catch (error) {
    console.error('Erro ao carregar templates:', error);
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--danger);padding:24px;">Falha ao carregar cartões padrão.</td></tr>`;
  }
}

window.handleAbrirTemplate = async function (id) {
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/cartoes/${id}`);
    const cartao = await res.json();
    document.getElementById('cartao-data').value = '';
    exibirCartaoNoEditor(cartao);
    document.getElementById('cartao-templates-panel').classList.add('hidden');
  } catch (error) {
    console.error('Erro ao abrir template:', error);
    showToast('Falha ao abrir o cartão padrão.', 'danger');
  }
};

window.handleExcluirTemplate = async function (id) {
  if (!confirm('Excluir permanentemente este cartão padrão?')) return;
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/cartoes/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Cartão padrão excluído.', 'info');
      renderTemplatesTab();
      if (state.cartaoAtual && state.cartaoAtual.id === id) {
        state.cartaoAtual = null;
        document.getElementById('cartao-conteudo').classList.add('hidden');
        document.getElementById('cartao-vazio').classList.remove('hidden');
      }
    } else {
      const err = await res.json();
      showToast(err.error || 'Falha ao excluir o cartão padrão.', 'danger');
    }
  } catch (error) {
    console.error('Erro ao excluir template:', error);
    showToast('Falha na comunicação com o servidor.', 'danger');
  }
};

async function handleCriarTemplate(e) {
  e.preventDefault();
  const payload = {
    is_template: true,
    nome_template: document.getElementById('template-nome').value.trim(),
    tipo_periodo: document.getElementById('template-tipo-periodo').value,
    qtd_viaturas_base: document.getElementById('template-qtd-viaturas').value
  };

  await comBotaoCarregando(e.submitter, async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/cartoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const criado = await res.json();
        document.getElementById('modal-novo-template').classList.add('hidden');
        document.getElementById('form-novo-template').reset();
        showToast('Cartão padrão criado. Adicione as viaturas e roteiros abaixo.', 'success');
        document.getElementById('cartao-data').value = '';
        exibirCartaoNoEditor(criado);
      } else {
        const err = await res.json();
        showToast(err.error || 'Falha ao criar o cartão padrão.', 'danger');
      }
    } catch (error) {
      console.error('Erro ao criar template:', error);
      showToast('Falha na comunicação com o servidor.', 'danger');
    }
  });
}

// Lista os 5 cartões mais recentes anteriores à data selecionada (ou, se nenhuma data
// estiver selecionada, os 5 mais recentes no geral), com atalho para abrir cada um.
// Não há filtro/paginação aqui de propósito — datas mais antigas continuam acessíveis
// pelo seletor de data no topo da tela.
async function renderHistoricoRecente() {
  const tbody = document.getElementById('table-historico-recente-body');
  if (!tbody) return;
  const dataSelecionada = document.getElementById('cartao-data').value;

  try {
    const res = await apiFetch(`${API_BASE_URL}/api/cartoes`);
    const lista = await res.json();

    if (!res.ok) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--danger);padding:24px;">${esc(lista.error) || 'Falha ao carregar histórico.'}</td></tr>`;
      return;
    }

    const recentes = (dataSelecionada ? lista.filter(c => c.data < dataSelecionada) : lista).slice(0, 5);

    if (recentes.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;">Nenhum Cartão Programa anterior lançado.</td></tr>`;
      return;
    }

    tbody.innerHTML = recentes.map(c => {
      const dataBr = c.data.split('-').reverse().join('/');
      return `
        <tr>
          <td><strong>${dataBr}</strong></td>
          <td>${esc(c.fiscal) || '-'}</td>
          <td>${esc(c.adjunto) || '-'}</td>
          <td class="text-center">${c.qtd_viaturas}</td>
          <td class="text-right">
            <button class="btn btn-secondary btn-sm" data-action="abrir-cartao-historico" data-data="${c.data}">
              <i data-lucide="folder-open" style="width:12px;height:12px;"></i> Abrir
            </button>
          </td>
        </tr>
      `;
    }).join('');

    lucide.createIcons();
  } catch (error) {
    console.error("Erro ao carregar histórico de cartões:", error);
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--danger);padding:24px;">Falha ao carregar histórico.</td></tr>`;
  }
}

// Abre um cartão do histórico direto na visão principal
window.handleAbrirCartaoHistorico = function(data) {
  document.getElementById('cartao-data').value = data;
  renderCartaoTab();
};

// Tabela consolidada: Companhia x Viatura x QTL Almoço x QTL Jantar x Observação (Madrugada Segura)
function renderQuadroResumo() {
  const tbody = document.getElementById('table-cartao-resumo-body');
  const viaturas = state.cartaoAtual.viaturas || [];

  if (viaturas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:16px;">Nenhuma viatura no cartão.</td></tr>`;
    return;
  }

  const ordemCompanhia = { '1ª Companhia': 1, '2ª Companhia': 2, '3ª Companhia': 3 };
  const ordenadas = [...viaturas].sort((a, b) => {
    const oa = ordemCompanhia[a.companhia] || 99;
    const ob = ordemCompanhia[b.companhia] || 99;
    if (oa !== ob) return oa - ob;
    return (a.prefixo || '').localeCompare(b.prefixo || '');
  });

  const horarioQtl = (item) => item
    ? `${formatHoraCartao(item.inicio)}${item.fim ? ' às ' + formatHoraCartao(item.fim) : ''}`
    : '-';

  tbody.innerHTML = ordenadas.map(vtr => {
    const qtlAlmoco = (vtr.itens || []).find(i => i.atividade === 'QTL Almoço');
    const qtlJantar = (vtr.itens || []).find(i => i.atividade === 'QTL Jantar');

    return `
      <tr>
        <td data-label="Companhia">${esc(vtr.companhia) || '-'}</td>
        <td class="card-title-cell">${esc(vtr.prefixo)}</td>
        <td data-label="Setor">${esc(vtr.setor)}</td>
        <td data-label="QTL Almoço">${esc(horarioQtl(qtlAlmoco))}</td>
        <td data-label="QTL Jantar">${esc(horarioQtl(qtlJantar))}</td>
        <td data-label="Observação">${esc(vtr.observacao) || '-'}</td>
      </tr>
    `;
  }).join('');
}

// Troca entre as abas Viaturas | Roteiro do cartão (protótipo do redesign).
window.handleCartaoTrocarAba = function(aba) {
  const ehViaturas = aba !== 'roteiro';
  document.getElementById('cartao-painel-viaturas').classList.toggle('hidden', !ehViaturas);
  document.getElementById('cartao-painel-roteiro').classList.toggle('hidden', ehViaturas);
  document.querySelectorAll('.sub-aba').forEach(btn => {
    const ativo = (btn.dataset.aba === 'viaturas') === ehViaturas;
    btn.classList.toggle('ativo', ativo);
    btn.setAttribute('aria-selected', String(ativo));
  });
};

// Tabela da aba "Viaturas": mesma lista dos cards de roteiro, em formato enxuto.
// As ações reaproveitam os data-action já existentes (editar-vtr/excluir-cartao-vtr),
// então nada da fiação de edição muda.
function renderCartaoViaturasTabela() {
  const tbody = document.getElementById('table-cartao-viaturas-body');
  if (!tbody) return;

  const viaturas = (state.cartaoAtual && state.cartaoAtual.viaturas) || [];
  const isAdmin = state.user && (state.user.role === 'P3' || state.user.role === 'Adjunto');

  if (viaturas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px;">Nenhuma viatura adicionada. Use o formulário abaixo para montar o cartão.</td></tr>`;
    return;
  }

  tbody.innerHTML = viaturas.map(vtr => `
    <tr>
      <td class="card-title-cell"><strong>${esc(vtr.prefixo)}</strong></td>
      <td data-label="Setor">${esc(vtr.setor) || '-'}</td>
      <td data-label="Companhia">${esc(vtr.companhia) || '-'}</td>
      <td data-label="Categoria">${vtr.categoria ? `<span class="badge ${slugBadge('cat-' + vtr.categoria)}">${esc(vtr.categoria)}</span>` : '-'}</td>
      <td data-label="Comandante">${esc(vtr.comandante) || 'Não informado'}</td>
      <td data-label="Observação" style="color:var(--text-muted);">${esc(vtr.observacao) || '-'}</td>
      <td class="text-right" data-label="Ações">
        ${isAdmin ? `
          <div class="acoes-linha">
            <button class="btn-icon" data-action="editar-vtr" data-vtr-id="${esc(vtr.id)}" title="Editar viatura" aria-label="Editar viatura">
              <i data-lucide="pencil"></i>
            </button>
            <button class="btn-icon btn-icon-danger" data-action="excluir-cartao-vtr" data-vtr-id="${esc(vtr.id)}" title="Excluir viatura" aria-label="Excluir viatura">
              <i data-lucide="trash-2"></i>
            </button>
          </div>` : '—'}
      </td>
    </tr>`).join('');
}

function renderCartaoVtrGrid() {
  const grid = document.getElementById('cartao-vtr-grid');
  grid.innerHTML = '';

  renderCartaoViaturasTabela();

  const viaturas = state.cartaoAtual.viaturas || [];

  if (viaturas.length === 0) {
    grid.innerHTML = `<p style="font-size:0.8rem;color:var(--text-muted);text-align:center;padding:24px;grid-column:1/-1;">Nenhuma viatura adicionada. Use o formulário abaixo para montar o roteiro.</p>`;
    return;
  }

  viaturas.forEach(vtr => {
    const card = document.createElement('div');
    card.className = 'cartao-vtr-card';

    // Cruzamento automático: eventos da pauta no bairro/setor desta VTR na data do cartão
    const eventosSetor = eventosNoSetorDaVtr(vtr, state.cartaoAtual.data);
    const eventosHtml = eventosSetor.length > 0 ? `
      <div class="cartao-evento-alerta">
        <i data-lucide="calendar-check"></i>
        <div>
          <strong>OBSERVAÇÃO — EVENTO NO SETOR NESTA DATA:</strong>
          ${eventosSetor.map(evt => `
            <div class="cartao-evento-linha">• <strong>${esc(evt.nome_evento)}</strong> (${esc(evt.tipo_evento)})
              — ${evt.horario_inicio ? 'às ' + formatHoraCartao(esc(evt.horario_inicio)) : 'horário não informado'}
              — ${esc(evt.local_itinerario)}
              ${evt.num_os_manual ? `<br>&nbsp;&nbsp;${esc(evt.num_os_manual)}` : ''}</div>
          `).join('')}
        </div>
      </div>` : '';

    const itensHtml = (vtr.itens || []).map(item => {
      const emEdicao = editandoAtividadeItem && editandoAtividadeItem.vtrId === vtr.id && editandoAtividadeItem.itemId === item.id;
      const atividadeCell = emEdicao
        ? `<select id="edit-atividade-${esc(vtr.id)}-${esc(item.id)}" class="cartao-edit-atividade-select">${ATIVIDADES_CARTAO.map(a => `<option value="${esc(a)}"${a === item.atividade ? ' selected' : ''}>${esc(a)}</option>`).join('')}</select>`
        : `<span class="badge ${atividadeBadgeClass(item.atividade)}">${esc(item.atividade)}</span>`;
      const acoesCell = emEdicao
        ? `<button class="btn-icon btn-sm" title="Salvar atividade" aria-label="Salvar atividade" data-action="salvar-atividade-item" data-vtr-id="${esc(vtr.id)}" data-item-id="${esc(item.id)}"><i data-lucide="check" style="width:12px;height:12px;"></i></button>
           <button class="btn-icon btn-sm" title="Cancelar" aria-label="Cancelar" data-action="cancelar-atividade-item"><i data-lucide="x" style="width:12px;height:12px;"></i></button>`
        : `<button class="btn-icon btn-sm" title="Mudar atividade" aria-label="Mudar atividade" data-action="mudar-atividade-item" data-vtr-id="${esc(vtr.id)}" data-item-id="${esc(item.id)}"><i data-lucide="pencil" style="width:12px;height:12px;"></i></button>
           <button class="btn-icon btn-sm" title="Remover item" aria-label="Remover item" data-action="excluir-cartao-item" data-vtr-id="${esc(vtr.id)}" data-item-id="${esc(item.id)}"><i data-lucide="x" style="width:12px;height:12px;"></i></button>`;
      return `
      <tr>
        <td class="cartao-item-hora">${formatHoraCartao(esc(item.inicio))}${item.fim ? ' às ' + formatHoraCartao(esc(item.fim)) : ''}</td>
        <td>${esc(item.local)}</td>
        <td>${atividadeCell}</td>
        <td style="width:64px;white-space:nowrap;">${acoesCell}</td>
      </tr>`;
    }).join('');

    const opcoesAtividade = ATIVIDADES_CARTAO.map(a => `<option value="${a}">${a}</option>`).join('');

    const categoria = vtr.categoria || 'Ordinária';

    card.innerHTML = `
      <div class="cartao-vtr-header">
        <div>
          <h3>VTR ${esc(vtr.prefixo)} — ${esc(vtr.setor)}
            ${categoria !== 'Ordinária' ? `<span class="badge cartao-badge-categoria ${categoriaBadgeClass(categoria)}">${esc(categoria)}</span>` : ''}
          </h3>
          <div class="vtr-meta">
            <span><strong>Companhia:</strong> ${esc(vtr.companhia) || 'Não informada'}</span>
            <span><strong>Comandante:</strong> ${esc(vtr.comandante) || 'Não informado'}</span>
            ${vtr.observacao ? `<span><strong>Obs:</strong> ${esc(vtr.observacao)}</span>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn-icon btn-sm" title="Editar viatura" aria-label="Editar viatura" data-action="editar-vtr" data-vtr-id="${vtr.id}">
            <i data-lucide="pencil" style="width:14px;height:14px;"></i>
          </button>
          <button class="btn-icon btn-sm" title="Remover viatura" aria-label="Remover viatura" data-action="excluir-cartao-vtr" data-vtr-id="${vtr.id}">
            <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
          </button>
        </div>
      </div>
      <div class="cartao-vtr-body">
        ${eventosHtml}
        <table class="cartao-itens-table">
          <thead>
            <tr><th>Horário</th><th>Local / Itinerário</th><th>Atividade</th><th></th></tr>
          </thead>
          <tbody>
            ${itensHtml || `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:16px;">Sem itens de roteiro.</td></tr>`}
          </tbody>
        </table>
        <div class="cartao-item-form">
          <div class="form-group">
            <label>Início *</label>
            <input type="time" id="item-inicio-${vtr.id}">
          </div>
          <div class="form-group">
            <label>Fim</label>
            <input type="time" id="item-fim-${vtr.id}">
          </div>
          <div class="form-group" style="flex-grow:1;">
            <label>Local / Itinerário *</label>
            <input type="text" id="item-local-${vtr.id}" placeholder="Ex: Rot. Eng. Roberto Freire c/ Via Costeira">
          </div>
          <div class="form-group">
            <label>Atividade</label>
            <select id="item-atividade-${vtr.id}">${opcoesAtividade}</select>
          </div>
          <button class="btn btn-primary btn-sm" data-action="add-cartao-item" data-vtr-id="${vtr.id}">
            <i data-lucide="plus" style="width:12px;height:12px;"></i> Incluir
          </button>
        </div>
      </div>
    `;

    grid.appendChild(card);
  });
}

// Abre o modal "Copiar": lista todos os cartões do dia existentes (exceto o da data-alvo) para
// o operador escolher a origem da cópia. A data-alvo é a selecionada em #cartao-data.
async function abrirModalCopiarCartao() {
  const alvo = document.getElementById('cartao-data').value;
  if (!alvo) {
    showToast('Selecione a data do Cartão Programa (destino da cópia).', 'warning');
    return;
  }
  const select = document.getElementById('copiar-origem-select');
  document.getElementById('copiar-data-alvo').textContent = alvo.split('-').reverse().join('/');
  select.innerHTML = '<option value="">Carregando...</option>';
  document.getElementById('modal-copiar-cartao').classList.remove('hidden');
  lucide.createIcons();
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/cartoes`);
    const lista = await res.json();
    if (!res.ok || !Array.isArray(lista)) {
      select.innerHTML = '<option value="">Falha ao carregar cartões.</option>';
      return;
    }
    const origens = lista.filter(c => c.data && c.data !== alvo).sort((a, b) => b.data.localeCompare(a.data));
    if (origens.length === 0) {
      select.innerHTML = '<option value="">Nenhum outro cartão disponível para copiar.</option>';
      return;
    }
    select.innerHTML = origens.map(c => {
      const dataBr = c.data.split('-').reverse().join('/');
      const qtd = (c.qtd_viaturas != null ? c.qtd_viaturas : (c.viaturas ? c.viaturas.length : 0));
      return `<option value="${esc(c.id)}">${dataBr} — ${qtd} viatura(s)</option>`;
    }).join('');
  } catch (error) {
    console.error('Erro ao listar cartões para cópia:', error);
    select.innerHTML = '<option value="">Falha ao carregar cartões.</option>';
  }
}

async function handleConfirmarCopiaCartao() {
  const alvo = document.getElementById('cartao-data').value;
  const origemId = document.getElementById('copiar-origem-select').value;
  if (!origemId) {
    showToast('Escolha um cartão de origem para copiar.', 'warning');
    return;
  }
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/cartoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: alvo, copiar_de: origemId })
    });
    if (res.status === 409) {
      showToast('Já existe um Cartão Programa para esta data.', 'warning');
      return;
    }
    if (res.ok) {
      const criado = await res.json();
      document.getElementById('modal-copiar-cartao').classList.add('hidden');
      showToast(`Cópia criada com <strong>${(criado.viaturas || []).length}</strong> viatura(s).`, 'success');
      renderCartaoTab();
    }
  } catch (error) {
    console.error('Erro ao copiar cartão:', error);
    showToast('Falha ao criar a cópia do Cartão Programa.', 'danger');
  }
}

async function handleCriarCartao(copiarAnterior) {
  const dataSelecionada = document.getElementById('cartao-data').value;
  if (!dataSelecionada) {
    showToast('Selecione a data do Cartão Programa.', 'warning');
    return;
  }

  try {
    const res = await apiFetch(`${API_BASE_URL}/api/cartoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: dataSelecionada,
        copiar_de: copiarAnterior ? 'ultimo' : undefined,
        tipo_periodo: (document.getElementById('sugestao-tipo-periodo') || {}).value || ''
      })
    });

    if (res.status === 409) {
      showToast('Já existe um Cartão Programa para esta data.', 'warning');
      renderCartaoTab();
      return;
    }

    if (res.ok) {
      const criado = await res.json();
      const msg = copiarAnterior && criado.viaturas.length > 0
        ? `Cartão criado copiando <strong>${criado.viaturas.length}</strong> viatura(s) do dia anterior.`
        : 'Cartão Programa criado. Adicione as viaturas e roteiros.';
      showToast(msg, 'success');
      renderCartaoTab();
    }
  } catch (error) {
    console.error("Erro ao criar Cartão Programa:", error);
    showToast('Falha ao criar o Cartão Programa.', 'danger');
  }
}

async function handleExcluirCartao() {
  if (!state.cartaoAtual) {
    showToast('Não há Cartão Programa nesta data para excluir.', 'warning');
    return;
  }
  const dataBr = state.cartaoAtual.data.split('-').reverse().join('/');
  abrirConfirmacaoExclusaoForte({
    titulo: 'Excluir Cartão Programa',
    aviso: 'Isso excluirá permanentemente o Cartão Programa desta data, com todas as viaturas e roteiros associados.',
    label: `Digite "${dataBr}" para confirmar`,
    valorEsperado: dataBr,
    onConfirmar: async () => {
      try {
        const res = await apiFetch(`${API_BASE_URL}/api/cartoes/${state.cartaoAtual.id}`, { method: 'DELETE' });
        if (res.ok) {
          showToast('Cartão Programa excluído.', 'info');
          renderCartaoTab();
        }
      } catch (error) {
        console.error(error);
      }
    }
  });
}

// Recarrega o cartão (do dia ou template) atualmente aberto no editor pelo próprio id — ao
// contrário de renderCartaoTab(), não depende do campo #cartao-data (que fica vazio em modo template)
async function recarregarCartaoAtual() {
  if (!state.cartaoAtual) return;
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/cartoes/${state.cartaoAtual.id}`);
    const cartao = await res.json();
    exibirCartaoNoEditor(cartao);
  } catch (error) {
    console.error('Erro ao recarregar o Cartão Programa:', error);
  }
}

async function handleSalvarCabecalhoCartao() {
  if (!state.cartaoAtual) return;

  try {
    const res = await apiFetch(`${API_BASE_URL}/api/cartoes/${state.cartaoAtual.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fiscal: document.getElementById('cartao-fiscal').value,
        adjunto: document.getElementById('cartao-adjunto').value,
        oficial_sobreaviso: document.getElementById('cartao-sobreaviso').value,
        tipo_periodo: (document.getElementById('cartao-tipo-periodo') || {}).value || ''
      })
    });
    if (res.ok) {
      state.cartaoAtual = { ...state.cartaoAtual, ...(await res.json()) };
      showToast('Cabeçalho do cartão atualizado.', 'success');
      renderAlertasCartao();
      renderResumoLateralCartao();
    }
  } catch (error) {
    console.error(error);
  }
}

async function handleAddCartaoVtr(e) {
  e.preventDefault();
  if (!state.cartaoAtual) {
    showToast('Crie o Cartão Programa desta data antes de adicionar viaturas.', 'warning');
    return;
  }

  const payload = {
    prefixo: document.getElementById('vtr_prefixo').value.trim(),
    setor: document.getElementById('vtr_setor').value.trim().toUpperCase(),
    companhia: document.getElementById('vtr_companhia').value,
    categoria: document.getElementById('vtr_categoria').value,
    comandante: document.getElementById('vtr_comandante').value.trim(),
    observacao: document.getElementById('vtr_observacao').value.trim()
  };

  await comBotaoCarregando(e.submitter, async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/cartoes/${state.cartaoAtual.id}/viaturas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showToast(`VTR ${esc(payload.prefixo)} adicionada ao cartão.`, 'success');
        document.getElementById('form-cartao-vtr').reset();
        recarregarCartaoAtual();
      }
    } catch (error) {
      console.error(error);
    }
  });
}

let vtrEmEdicaoId = null;

// Abre o modal de edição de viatura, pré-preenchido com os dados atuais
window.abrirModalEditarVtr = function(vtrId) {
  const vtr = (state.cartaoAtual.viaturas || []).find(v => v.id === vtrId);
  if (!vtr) return;

  vtrEmEdicaoId = vtrId;
  document.getElementById('edit-vtr-prefixo').value = vtr.prefixo || '';
  document.getElementById('edit-vtr-setor').value = vtr.setor || '';
  document.getElementById('edit-vtr-companhia').value = vtr.companhia || '';
  document.getElementById('edit-vtr-categoria').value = vtr.categoria || 'Ordinária';
  document.getElementById('edit-vtr-comandante').value = vtr.comandante || '';
  document.getElementById('edit-vtr-observacao').value = vtr.observacao || '';

  document.getElementById('modal-editar-vtr').classList.remove('hidden');
};

async function handleSalvarEdicaoVtr(e) {
  e.preventDefault();

  const payload = {
    prefixo: document.getElementById('edit-vtr-prefixo').value.trim(),
    setor: document.getElementById('edit-vtr-setor').value.trim().toUpperCase(),
    companhia: document.getElementById('edit-vtr-companhia').value,
    categoria: document.getElementById('edit-vtr-categoria').value,
    comandante: document.getElementById('edit-vtr-comandante').value.trim(),
    observacao: document.getElementById('edit-vtr-observacao').value.trim()
  };

  await comBotaoCarregando(e.submitter, async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/cartoes/${state.cartaoAtual.id}/viaturas/${vtrEmEdicaoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const dados = await res.json();

      if (res.ok) {
        document.getElementById('modal-editar-vtr').classList.add('hidden');
        showToast('Viatura atualizada com sucesso.', 'success');
        recarregarCartaoAtual();
      } else {
        showToast(esc(dados.error) || 'Falha ao atualizar a viatura.', 'danger');
      }
    } catch (error) {
      console.error("Erro ao atualizar viatura:", error);
      showToast('Falha na comunicação com o servidor.', 'danger');
    }
  });
}

window.handleAddCartaoItem = async function(vtrId) {
  const inicio = document.getElementById(`item-inicio-${vtrId}`).value;
  const fim = document.getElementById(`item-fim-${vtrId}`).value;
  const local = document.getElementById(`item-local-${vtrId}`).value.trim();
  const atividade = document.getElementById(`item-atividade-${vtrId}`).value;

  if (!inicio || !local) {
    showToast('Informe pelo menos o horário de início e o local.', 'warning');
    return;
  }

  // Verifica sobreposição de horário com os itens já lançados nesta mesma viatura
  const vtr = state.cartaoAtual.viaturas.find(v => v.id === vtrId);
  if (fim && vtr) {
    const novoItem = { inicio, fim };
    const conflito = (vtr.itens || []).find(item => itensSobrepostos(item, novoItem));
    if (conflito) {
      const confirmar = confirm(
        `Atenção: este horário (${formatHoraCartao(inicio)} às ${formatHoraCartao(fim)}) sobrepõe o item já lançado ` +
        `"${formatHoraCartao(conflito.inicio)} às ${formatHoraCartao(conflito.fim)}" (${conflito.atividade}) nesta viatura.\n\n` +
        `Deseja incluir mesmo assim?`
      );
      if (!confirmar) return;
    }
  }

  try {
    const res = await apiFetch(`${API_BASE_URL}/api/cartoes/${state.cartaoAtual.id}/viaturas/${vtrId}/itens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inicio, fim, local, atividade })
    });
    if (res.ok) {
      showToast('Item incluído no roteiro.', 'success');
      recarregarCartaoAtual();
    }
  } catch (error) {
    console.error(error);
  }
};

window.handleDeleteCartaoItem = async function(vtrId, itemId) {
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/cartoes/${state.cartaoAtual.id}/viaturas/${vtrId}/itens/${itemId}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Item removido do roteiro.', 'info');
      recarregarCartaoAtual();
    }
  } catch (error) {
    console.error(error);
  }
};

// Edição inline rápida só da Atividade de um item de roteiro (sem abrir o form completo).
function iniciarEdicaoAtividade(vtrId, itemId) {
  editandoAtividadeItem = { vtrId, itemId };
  renderCartaoVtrGrid();
  lucide.createIcons();
}

function cancelarEdicaoAtividade() {
  editandoAtividadeItem = null;
  renderCartaoVtrGrid();
  lucide.createIcons();
}

async function salvarAtividadeItem(vtrId, itemId) {
  const sel = document.getElementById(`edit-atividade-${vtrId}-${itemId}`);
  if (!sel) return;
  const atividade = sel.value;
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/cartoes/${state.cartaoAtual.id}/viaturas/${vtrId}/itens/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ atividade })
    });
    if (res.ok) {
      showToast('Atividade atualizada.', 'success');
      editandoAtividadeItem = null;
      recarregarCartaoAtual();
    }
  } catch (error) {
    console.error(error);
  }
}

window.handleDeleteCartaoVtr = async function(vtrId) {
  if (!confirm('Remover esta viatura e todo o seu roteiro do cartão?')) return;

  try {
    const res = await apiFetch(`${API_BASE_URL}/api/cartoes/${state.cartaoAtual.id}/viaturas/${vtrId}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Viatura removida do cartão.', 'info');
      recarregarCartaoAtual();
    }
  } catch (error) {
    console.error(error);
  }
};

// -------------------------------------------------------------
// TELA 9: GESTÃO DE USUÁRIOS (APENAS P3)
// -------------------------------------------------------------
let usuarioEmEdicao = null; // login do usuário sendo editado (null = criando novo)
let usuarioParaReset = null; // login do usuário alvo do reset de senha

function roleBadgeClass(role) {
  return `perfil-${role.toLowerCase()}`;
}

async function renderUsuariosTab() {
  const tableBody = document.getElementById('table-usuarios-body');
  tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px;">Carregando usuários...</td></tr>`;

  try {
    const res = await apiFetch(`${API_BASE_URL}/api/usuarios`);
    const usuarios = await res.json();

    if (!res.ok) {
      tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--danger);padding:24px;">${esc(usuarios.error) || 'Falha ao carregar usuários.'}</td></tr>`;
      return;
    }

    tableBody.innerHTML = usuarios.map(u => `
      <tr>
        <td><strong>${esc(u.usuario)}</strong></td>
        <td>${esc(u.nome)}</td>
        <td><span class="badge ${roleBadgeClass(u.role)}">${esc(u.role)}</span></td>
        <td class="text-right">
          <div style="display:flex;gap:6px;justify-content:flex-end;">
            <button class="btn-icon btn-sm" title="Editar" aria-label="Editar" data-action="editar-usuario" data-usuario="${esc(u.usuario)}" data-nome="${esc(u.nome)}" data-role="${esc(u.role)}">
              <i data-lucide="pencil" style="width:14px;height:14px;"></i>
            </button>
            <button class="btn-icon btn-sm" title="Resetar Senha" aria-label="Resetar Senha" data-action="reset-senha" data-usuario="${esc(u.usuario)}" data-nome="${esc(u.nome)}">
              <i data-lucide="key-round" style="width:14px;height:14px;"></i>
            </button>
            <button class="btn-icon btn-danger btn-sm" title="Excluir" aria-label="Excluir" data-action="excluir-usuario" data-usuario="${esc(u.usuario)}">
              <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    lucide.createIcons();
  } catch (error) {
    console.error("Erro ao carregar usuários:", error);
    tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--danger);padding:24px;">Falha ao carregar usuários.</td></tr>`;
  }
}

// Abre o modal para criar (sem argumentos) ou editar (dados do usuário) um usuário
window.abrirModalUsuario = function(usuario, nome, role) {
  usuarioEmEdicao = usuario || null;

  const titulo = document.getElementById('modal-usuario-titulo');
  const loginInput = document.getElementById('usr-login');
  const senhaGroup = document.getElementById('usr-senha-group');
  const senhaInput = document.getElementById('usr-senha');

  document.getElementById('form-usuario').reset();

  if (usuarioEmEdicao) {
    titulo.innerHTML = `<i data-lucide="pencil"></i> Editar Usuário`;
    loginInput.value = usuario;
    loginInput.disabled = true;
    document.getElementById('usr-nome').value = nome;
    document.getElementById('usr-role').value = role;
    senhaGroup.classList.add('hidden');
    senhaInput.required = false;
  } else {
    titulo.innerHTML = `<i data-lucide="user-plus"></i> Novo Usuário`;
    loginInput.disabled = false;
    senhaGroup.classList.remove('hidden');
    senhaInput.required = true;
  }

  document.getElementById('modal-usuario').classList.remove('hidden');
  lucide.createIcons();
};

async function handleSalvarUsuario(e) {
  e.preventDefault();

  const login = document.getElementById('usr-login').value.trim();
  const nome = document.getElementById('usr-nome').value.trim();
  const role = document.getElementById('usr-role').value;
  const senha = document.getElementById('usr-senha').value;

  await comBotaoCarregando(e.submitter, async () => {
    try {
      let res;
      if (usuarioEmEdicao) {
        res = await apiFetch(`${API_BASE_URL}/api/usuarios/${encodeURIComponent(usuarioEmEdicao)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome, role })
        });
      } else {
        res = await apiFetch(`${API_BASE_URL}/api/usuarios`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usuario: login, senha, nome, role })
        });
      }

      const dados = await res.json();

      if (res.ok) {
        document.getElementById('modal-usuario').classList.add('hidden');
        showToast(usuarioEmEdicao ? 'Usuário atualizado com sucesso.' : 'Usuário criado com sucesso.', 'success');
        renderUsuariosTab();
      } else {
        showToast(esc(dados.error) || 'Falha ao salvar o usuário.', 'danger');
      }
    } catch (error) {
      console.error("Erro ao salvar usuário:", error);
      showToast('Falha na comunicação com o servidor.', 'danger');
    }
  });
}

window.abrirModalResetSenha = function(usuario, nome) {
  usuarioParaReset = usuario;
  document.getElementById('reset-senha-usuario-nome').textContent = nome;
  document.getElementById('form-reset-senha').reset();
  document.getElementById('modal-reset-senha').classList.remove('hidden');
};

async function handleResetarSenha(e) {
  e.preventDefault();
  const novaSenha = document.getElementById('reset-senha-nova').value;

  await comBotaoCarregando(e.submitter, async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/usuarios/${encodeURIComponent(usuarioParaReset)}/resetar-senha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha_nova: novaSenha })
      });
      const dados = await res.json();

      if (res.ok) {
        document.getElementById('modal-reset-senha').classList.add('hidden');
        showToast(esc(dados.message) || 'Senha redefinida com sucesso.', 'success');
      } else {
        showToast(esc(dados.error) || 'Falha ao redefinir a senha.', 'danger');
      }
    } catch (error) {
      console.error("Erro ao resetar senha:", error);
      showToast('Falha na comunicação com o servidor.', 'danger');
    }
  });
}

window.handleExcluirUsuario = async function(usuario) {
  if (!confirm(`Excluir permanentemente o usuário "${usuario}"? Esta ação não pode ser desfeita.`)) return;

  try {
    const res = await apiFetch(`${API_BASE_URL}/api/usuarios/${encodeURIComponent(usuario)}`, { method: 'DELETE' });
    const dados = await res.json();

    if (res.ok) {
      showToast('Usuário excluído.', 'info');
      renderUsuariosTab();
    } else {
      showToast(esc(dados.error) || 'Falha ao excluir o usuário.', 'danger');
    }
  } catch (error) {
    console.error("Erro ao excluir usuário:", error);
    showToast('Falha na comunicação com o servidor.', 'danger');
  }
};

// -------------------------------------------------------------
// TELA 10: CADASTRO DE PESSOAL (ADJUNTO / FISCAL / OFICIAL DE OPERAÇÕES / OFICIAL DE SOBREAVISO)
// -------------------------------------------------------------
let pessoaEmEdicao = null; // id da pessoa sendo editada (null = criando nova)
let pessoalFiltroCategoria = ''; // categoria selecionada no filtro ('' = Todos)
let pessoalListaAtual = []; // última lista carregada na tela, usada para abrir o modal de edição pelo id

async function renderPessoalTab() {
  const tableBody = document.getElementById('table-pessoal-body');
  tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px;">Carregando...</td></tr>`;

  try {
    // "__sem_categoria__" é um filtro só do frontend (pessoas com categorias=[]) — a API não sabe filtrar por
    // ausência de categoria, então nesse caso busca tudo e filtra aqui.
    const filtroSemCategoria = pessoalFiltroCategoria === '__sem_categoria__';
    const params = (pessoalFiltroCategoria && !filtroSemCategoria) ? `?categoria=${encodeURIComponent(pessoalFiltroCategoria)}` : '';
    const res = await apiFetch(`${API_BASE_URL}/api/pessoal${params}`);
    let pessoal = await res.json();

    if (!res.ok) {
      tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--danger);padding:24px;">${esc(pessoal.error) || 'Falha ao carregar o cadastro de pessoal.'}</td></tr>`;
      return;
    }

    // Mantém a lista completa em memória para alimentar os seletores de Fiscal/Adjunto/Sobreaviso no Cartão Programa
    if (!pessoalFiltroCategoria) {
      state.pessoal = pessoal;
    }

    if (filtroSemCategoria) pessoal = pessoal.filter(p => !p.categorias || p.categorias.length === 0);
    pessoalListaAtual = pessoal;

    if (pessoal.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px;">Nenhuma pessoa cadastrada${pessoalFiltroCategoria ? ' nesta categoria' : ''}.</td></tr>`;
      return;
    }

    tableBody.innerHTML = pessoal.map(p => `
      <tr>
        <td>${esc(p.matricula) || '<span style="color:var(--text-muted);">—</span>'}</td>
        <td><strong>${esc(p.nome)}</strong></td>
        <td>${esc(p.subunidade) || '<span style="color:var(--text-muted);">—</span>'}</td>
        <td>${esc(p.posto_graduacao)}</td>
        <td><span class="badge tipo-${p.tipo === 'Praça' ? 'praca' : 'oficial'}">${esc(p.tipo)}</span></td>
        <td>${p.categorias.length > 0 ? p.categorias.map(c => `<span class="badge ${categoriaPessoalBadgeClass(c)}" style="margin:2px;">${esc(c)}</span>`).join('') : '<span style="color:var(--text-muted);">Sem categoria</span>'}</td>
        <td class="text-right">
          <div style="display:flex;gap:6px;justify-content:flex-end;">
            <button class="btn-icon btn-sm" title="Editar" aria-label="Editar" data-action="editar-pessoa" data-id="${p.id}">
              <i data-lucide="pencil" style="width:14px;height:14px;"></i>
            </button>
            <button class="btn-icon btn-danger btn-sm" title="Excluir" aria-label="Excluir" data-action="excluir-pessoa" data-id="${p.id}">
              <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    lucide.createIcons();
  } catch (error) {
    console.error('Erro ao carregar o cadastro de pessoal:', error);
    tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--danger);padding:24px;">Falha ao carregar o cadastro de pessoal.</td></tr>`;
  }
}

// Abre o modal para criar (sem argumentos) ou editar (passando o id, buscado na última lista carregada) um cadastro
window.abrirModalPessoa = function(id) {
  const pessoa = id ? pessoalListaAtual.find(p => p.id === id) : null;
  pessoaEmEdicao = pessoa ? pessoa.id : null;

  const titulo = document.getElementById('modal-pessoa-titulo');
  document.getElementById('form-pessoa').reset();
  document.querySelectorAll('.pessoal-categorias-checkboxes input').forEach(cb => cb.checked = false);

  if (pessoa) {
    titulo.innerHTML = `<i data-lucide="pencil"></i> Editar Pessoa`;
    document.getElementById('pes-nome').value = pessoa.nome;
    document.getElementById('pes-matricula').value = pessoa.matricula || '';
    document.getElementById('pes-subunidade').value = pessoa.subunidade || '';
    document.getElementById('pes-posto').value = pessoa.posto_graduacao;
    document.querySelectorAll('.pessoal-categorias-checkboxes input').forEach(cb => {
      cb.checked = pessoa.categorias.includes(cb.value);
    });
  } else {
    titulo.innerHTML = `<i data-lucide="user-plus"></i> Nova Pessoa`;
  }

  document.getElementById('modal-pessoa').classList.remove('hidden');
  lucide.createIcons();
};

async function handleSalvarPessoa(e) {
  e.preventDefault();

  const nome = document.getElementById('pes-nome').value.trim();
  const matricula = document.getElementById('pes-matricula').value.trim();
  const subunidade = document.getElementById('pes-subunidade').value;
  const posto_graduacao = document.getElementById('pes-posto').value;
  const categorias = Array.from(document.querySelectorAll('.pessoal-categorias-checkboxes input:checked')).map(cb => cb.value);

  await comBotaoCarregando(e.submitter, async () => {
    try {
      let res;
      if (pessoaEmEdicao) {
        res = await apiFetch(`${API_BASE_URL}/api/pessoal/${pessoaEmEdicao}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome, matricula, subunidade, posto_graduacao, categorias })
        });
      } else {
        res = await apiFetch(`${API_BASE_URL}/api/pessoal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome, matricula, subunidade, posto_graduacao, categorias })
        });
      }

      const dados = await res.json();

      if (res.ok) {
        document.getElementById('modal-pessoa').classList.add('hidden');
        showToast(pessoaEmEdicao ? 'Cadastro atualizado com sucesso.' : 'Pessoa cadastrada com sucesso.', 'success');
        pessoalFiltroCategoria = ''; // força recarregar a lista completa em memória
        renderPessoalTab();
      } else {
        showToast(esc(dados.error) || 'Falha ao salvar o cadastro.', 'danger');
      }
    } catch (error) {
      console.error('Erro ao salvar cadastro de pessoal:', error);
      showToast('Falha na comunicação com o servidor.', 'danger');
    }
  });
}

window.handleExcluirPessoa = async function(id) {
  if (!confirm('Excluir permanentemente este cadastro?')) return;

  try {
    const res = await apiFetch(`${API_BASE_URL}/api/pessoal/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Cadastro excluído.', 'info');
      renderPessoalTab();
    } else {
      const dados = await res.json();
      showToast(esc(dados.error) || 'Falha ao excluir o cadastro.', 'danger');
    }
  } catch (error) {
    console.error('Erro ao excluir cadastro de pessoal:', error);
    showToast('Falha na comunicação com o servidor.', 'danger');
  }
};

// -------------------------------------------------------------
// CADASTRO DE VIATURAS (P3) — registro central que alimenta a sugestão de prefixo
// no Cartão Programa; o campo de prefixo lá continua aceitando texto livre.
// -------------------------------------------------------------
let viaturaEmEdicao = null; // id da viatura sendo editada (null = criando nova)
let viaturasFiltroStatus = ''; // status selecionado no filtro ('' = Todas)
let viaturasListaAtual = []; // última lista carregada na tela, usada para abrir o modal de edição pelo id

async function renderViaturasTab() {
  const tableBody = document.getElementById('table-viaturas-body');
  tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">Carregando...</td></tr>`;

  try {
    const res = await apiFetch(`${API_BASE_URL}/api/viaturas`);
    let viaturas = await res.json();

    if (!res.ok) {
      tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--danger);padding:24px;">${esc(viaturas.error) || 'Falha ao carregar o cadastro de viaturas.'}</td></tr>`;
      return;
    }

    // Mantém a lista completa em memória (sem filtro) para alimentar o datalist do Cartão Programa
    state.viaturas = viaturas;
    popularDatalistViaturas();

    if (viaturasFiltroStatus) viaturas = viaturas.filter(v => v.status === viaturasFiltroStatus);
    viaturasListaAtual = viaturas;

    if (viaturas.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">Nenhuma viatura cadastrada${viaturasFiltroStatus ? ' com este status' : ''}.</td></tr>`;
      return;
    }

    tableBody.innerHTML = viaturas.map(v => `
      <tr>
        <td><strong>${esc(v.prefixo)}</strong></td>
        <td>${esc(v.companhia) || '-'}</td>
        <td>${esc(v.categoria)}</td>
        <td><span class="badge ${statusViaturaBadgeClass(v.status)}">${esc(v.status)}</span></td>
        <td>${esc(v.observacao) || '-'}</td>
        <td class="text-right">
          <div style="display:flex;gap:6px;justify-content:flex-end;">
            <button class="btn-icon btn-sm" title="Editar" aria-label="Editar" data-action="editar-viatura" data-id="${v.id}">
              <i data-lucide="pencil" style="width:14px;height:14px;"></i>
            </button>
            ${state.user && state.user.role === 'P3' ? `
            <button class="btn-icon btn-danger btn-sm" title="Excluir" aria-label="Excluir" data-action="excluir-viatura" data-id="${v.id}">
              <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
            </button>` : ''}
          </div>
        </td>
      </tr>
    `).join('');

    lucide.createIcons();
  } catch (error) {
    console.error('Erro ao carregar o cadastro de viaturas:', error);
    tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--danger);padding:24px;">Falha ao carregar o cadastro de viaturas.</td></tr>`;
  }
}

// Abre o modal para criar (sem argumentos) ou editar (passando o id, buscado na última lista carregada) uma viatura
window.abrirModalViatura = function(id) {
  const viatura = id ? viaturasListaAtual.find(v => v.id === id) : null;
  viaturaEmEdicao = viatura ? viatura.id : null;

  const titulo = document.getElementById('modal-viatura-titulo');
  document.getElementById('form-viatura').reset();

  if (viatura) {
    titulo.innerHTML = `<i data-lucide="pencil"></i> Editar Viatura`;
    document.getElementById('vtrcad-prefixo').value = viatura.prefixo;
    document.getElementById('vtrcad-companhia').value = viatura.companhia || '';
    document.getElementById('vtrcad-categoria').value = viatura.categoria;
    document.getElementById('vtrcad-status').value = viatura.status;
    document.getElementById('vtrcad-setor').value = viatura.setor || '';
    document.getElementById('vtrcad-observacao').value = viatura.observacao || '';
  } else {
    titulo.innerHTML = `<i data-lucide="plus"></i> Nova Viatura`;
  }

  document.getElementById('modal-viatura').classList.remove('hidden');
  lucide.createIcons();
};

async function handleSalvarViatura(e) {
  e.preventDefault();

  const payload = {
    prefixo: document.getElementById('vtrcad-prefixo').value.trim(),
    companhia: document.getElementById('vtrcad-companhia').value,
    categoria: document.getElementById('vtrcad-categoria').value,
    status: document.getElementById('vtrcad-status').value,
    setor: document.getElementById('vtrcad-setor').value.trim(),
    observacao: document.getElementById('vtrcad-observacao').value.trim()
  };

  await comBotaoCarregando(e.submitter, async () => {
    try {
      let res;
      if (viaturaEmEdicao) {
        res = await apiFetch(`${API_BASE_URL}/api/viaturas/${viaturaEmEdicao}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await apiFetch(`${API_BASE_URL}/api/viaturas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const dados = await res.json();

      if (res.ok) {
        document.getElementById('modal-viatura').classList.add('hidden');
        showToast(viaturaEmEdicao ? 'Viatura atualizada com sucesso.' : 'Viatura cadastrada com sucesso.', 'success');
        renderViaturasTab();
      } else {
        showToast(esc(dados.error) || 'Falha ao salvar a viatura.', 'danger');
      }
    } catch (error) {
      console.error('Erro ao salvar cadastro de viatura:', error);
      showToast('Falha na comunicação com o servidor.', 'danger');
    }
  });
}

window.handleExcluirViatura = async function(id) {
  if (!confirm('Excluir permanentemente esta viatura do cadastro?')) return;

  try {
    const res = await apiFetch(`${API_BASE_URL}/api/viaturas/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Viatura excluída.', 'info');
      renderViaturasTab();
    } else {
      const dados = await res.json();
      showToast(esc(dados.error) || 'Falha ao excluir a viatura.', 'danger');
    }
  } catch (error) {
    console.error('Erro ao excluir cadastro de viatura:', error);
    showToast('Falha na comunicação com o servidor.', 'danger');
  }
};

// Preenche o <datalist> de sugestão de prefixo usado nos campos de VTR do Cartão Programa
// (a lista só sugere — o campo continua sendo texto livre, para reservas rotativas não cadastradas)
function popularDatalistViaturas() {
  const datalist = document.getElementById('lista-prefixos-viaturas');
  if (!datalist) return;
  const viaturas = Array.isArray(state.viaturas) ? state.viaturas : [];
  datalist.innerHTML = viaturas.map(v => `<option value="${esc(v.prefixo)}"></option>`).join('');
}

// -------------------------------------------------------------
// CONFIRMAÇÃO FORTE DE EXCLUSÃO (genérico, reaproveitável) — usado nas exclusões em cascata
// (evento e cartão), onde digitar errado ou em branco mantém o botão "Excluir" desabilitado.
// -------------------------------------------------------------
let confirmacaoExclusaoForteCallback = null;
let confirmacaoExclusaoForteValorEsperado = '';

function abrirConfirmacaoExclusaoForte({ titulo, aviso, label, valorEsperado, onConfirmar }) {
  document.getElementById('confirmar-exclusao-titulo').innerHTML = `<i data-lucide="alert-triangle"></i> ${esc(titulo)}`;
  document.getElementById('confirmar-exclusao-aviso').textContent = aviso;
  document.getElementById('confirmar-exclusao-label').textContent = label;

  const input = document.getElementById('confirmar-exclusao-input');
  input.value = '';
  input.placeholder = valorEsperado;

  document.getElementById('btn-confirmar-exclusao-forte').disabled = true;
  confirmacaoExclusaoForteCallback = onConfirmar;
  confirmacaoExclusaoForteValorEsperado = valorEsperado;

  document.getElementById('modal-confirmar-exclusao-forte').classList.remove('hidden');
  lucide.createIcons();
  input.focus();
}

// -------------------------------------------------------------
// SISTEMA DE TOAST NOTIFICATION
// -------------------------------------------------------------
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let iconName = 'info';
  if (type === 'success') iconName = 'check-circle-2';
  if (type === 'warning') iconName = 'alert-triangle';
  if (type === 'danger') iconName = 'alert-octagon';

  toast.innerHTML = `
    <i data-lucide="${iconName}" class="toast-icon"></i>
    <div class="toast-content">${message}</div>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => {
      if (toast.parentNode) {
        container.removeChild(toast);
      }
    }, 200);
  }, 4000);
}
