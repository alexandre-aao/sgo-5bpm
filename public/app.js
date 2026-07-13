// State Management
let state = {
  eventos: [],
  alocacoes: [],
  escalas: [],
  currentEventId: null,
  calendarMonth: new Date().getMonth(),
  calendarYear: new Date().getFullYear(),
  calendarDiariasMonth: new Date().getMonth(),
  calendarDiariasYear: new Date().getFullYear(),
  user: null, // Dados do usuário logado
  config: { cota_mensal_diarias: 0 }, // Configurações globais (cota de diárias)
  cartaoAtual: null, // Cartão Programa carregado na aba
  relatorioSeiAtual: null, // Último relatório SEI gerado (para o botão de copiar)
  pessoal: [] // Cadastro de Pessoal (Adjunto/Fiscal/Oficial de Operações/Oficial de Sobreaviso)
};

// -------------------------------------------------------------
// TEMA DE COR (Padrão / Escuro / Claro) — aplicado o mais cedo possível no boot,
// antes de qualquer outra coisa, pra minimizar flash do tema errado.
// -------------------------------------------------------------
const TEMA_PREFS_KEY = 'sgo_tema';

function carregarPrefsTema() {
  const salvo = localStorage.getItem(TEMA_PREFS_KEY);
  return ['padrao', 'escuro', 'claro'].includes(salvo) ? salvo : 'padrao';
}

function aplicarTema(tema) {
  document.body.classList.remove('tema-escuro', 'tema-claro');
  if (tema === 'escuro') document.body.classList.add('tema-escuro');
  else if (tema === 'claro') document.body.classList.add('tema-claro');
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
  
  // Atualiza dados automaticamente a cada 15 segundos para sincronização online
  setInterval(() => {
    if (state.user) {
      fetchData();
    }
  }, 15000);
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

function applyRolePermissions(user) {
  // Atualiza rodapé da sidebar
  document.getElementById('user-display-name').textContent = user.nome;
  document.getElementById('user-display-role').textContent = `Perfil: ${user.role}`;
  document.getElementById('avatar-display').textContent = user.role === 'P3' ? 'P3' : user.role.substring(0, 2).toUpperCase();

  // Elementos do Menu
  const btnDashboard = document.getElementById('nav-btn-dashboard');
  const btnCadastro = document.getElementById('nav-btn-cadastro');
  const btnRelatorio = document.getElementById('nav-btn-relatorio');
  const btnPlanejador = document.getElementById('nav-btn-planejador');
  const btnEstatisticas = document.getElementById('nav-btn-estatisticas');
  const btnUsuarios = document.getElementById('nav-btn-usuarios');
  const btnPessoal = document.getElementById('nav-btn-pessoal');
  const btnViaturas = document.getElementById('nav-btn-viaturas');
  const btnAuditoria = document.getElementById('nav-btn-auditoria');
  const btnTurno = document.getElementById('nav-btn-turno');
  const btnEventos = document.getElementById('nav-btn-eventos');

  // Rótulos de seção exclusivos do P3 (Diárias, Análise, Administração só têm
  // itens administrativos; Eventos e Patrulhamento sempre têm algo visível pra todo perfil)
  const secoesSomenteP3 = ['nav-section-diarias', 'nav-section-analise', 'nav-section-administracao']
    .map(id => document.getElementById(id));

  // Ajusta visibilidade com base no Role
  if (user.role === 'P3') {
    btnDashboard.classList.remove('hidden-role');
    btnCadastro.classList.remove('hidden-role');
    btnRelatorio.classList.remove('hidden-role');
    btnPlanejador.classList.remove('hidden-role');
    btnEstatisticas.classList.remove('hidden-role');
    btnUsuarios.classList.remove('hidden-role');
    btnPessoal.classList.remove('hidden-role');
    btnViaturas.classList.remove('hidden-role');
    btnAuditoria.classList.remove('hidden-role');
    btnTurno.classList.add('hidden-role'); // P3 foca no Dashboard Geral
    secoesSomenteP3.forEach(el => el.classList.remove('hidden-role'));

    // Mostra botões admin no drawer
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden-role'));

    // Abre por padrão o Dashboard
    btnDashboard.click();
  } else {
    // Oficial ou Adjunto
    btnDashboard.classList.add('hidden-role');
    btnCadastro.classList.add('hidden-role');
    btnRelatorio.classList.add('hidden-role');
    btnPlanejador.classList.add('hidden-role');
    btnEstatisticas.classList.add('hidden-role');
    btnUsuarios.classList.add('hidden-role');
    btnPessoal.classList.add('hidden-role');
    btnViaturas.classList.add('hidden-role');
    btnAuditoria.classList.add('hidden-role');
    btnTurno.classList.remove('hidden-role');
    secoesSomenteP3.forEach(el => el.classList.add('hidden-role'));

    // Oculta botões admin no drawer (Modo Leitura)
    document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden-role'));

    // Abre por padrão a aba de Turno
    btnTurno.click();
  }
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
    'tab-planejador': { title: 'Planejador Mensal de Diárias', subtitle: 'Controle da cota mensal e distribuição de diárias operacionais por evento.' },
    'tab-estatisticas': { title: 'Painel Analítico de Policiamento', subtitle: 'Cruzamento de dados históricos para apoiar o planejamento de efetivo e recursos.' },
    'tab-cartao': { title: 'Cartão Programa', subtitle: 'Roteiro diário de patrulhamento das viaturas: locais, horários e atividades.' },
    'tab-usuarios': { title: 'Usuários do Sistema', subtitle: 'Gestão de perfis de acesso e redefinição de senhas.' },
    'tab-pessoal': { title: 'Cadastro de Pessoal', subtitle: 'Adjuntos, Fiscais de Operações, Oficiais de Operações e Oficiais de Sobreaviso.' },
    'tab-viaturas': { title: 'Cadastro de Viaturas', subtitle: 'Registro central de viaturas, usado para sugerir o prefixo no Cartão Programa.' },
    'tab-auditoria': { title: 'Trilha de Auditoria', subtitle: 'Registro de criação, edição e exclusão de dados no sistema.' }
  };

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      
      navButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(tab => tab.classList.remove('active'));
      
      btn.classList.add('active');
      const targetTab = document.getElementById(targetId);
      if (targetTab) targetTab.classList.add('active');

      // Atualiza cabeçalho
      if (titles[targetId]) {
        titleEl.textContent = titles[targetId].title;
        subtitleEl.textContent = titles[targetId].subtitle;
      }

      // Dispara renderizações sob demanda
      if (targetId === 'tab-relatorio') {
        renderRelatorioTable();
      } else if (targetId === 'tab-turno') {
        renderTurnoTab();
      } else if (targetId === 'tab-eventos') {
        renderEventosTab();
      } else if (targetId === 'tab-mapa') {
        renderMapaTab();
      } else if (targetId === 'tab-planejador') {
        renderPlanejadorTab();
      } else if (targetId === 'tab-estatisticas') {
        renderEstatisticasTab();
      } else if (targetId === 'tab-cartao') {
        renderCartaoTab();
      } else if (targetId === 'tab-usuarios') {
        renderUsuariosTab();
      } else if (targetId === 'tab-pessoal') {
        renderPessoalTab();
      } else if (targetId === 'tab-viaturas') {
        renderViaturasTab();
      } else if (targetId === 'tab-auditoria') {
        renderAuditoriaTab();
      }
    });
  });
}

// -------------------------------------------------------------
// EVENT LISTENERS GERAIS
// -------------------------------------------------------------
function setupEventListeners() {
  // Seletor de tema (aplicado ao body no boot, aqui só sincroniza o <select> e liga a troca)
  const temaSelect = document.getElementById('tema-select');
  temaSelect.value = carregarPrefsTema();
  temaSelect.addEventListener('change', () => {
    localStorage.setItem(TEMA_PREFS_KEY, temaSelect.value);
    aplicarTema(temaSelect.value);
  });

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

  // Auditoria (P3)
  document.getElementById('btn-filtrar-auditoria').addEventListener('click', renderAuditoriaTab);

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


  // Navegação do Calendário
  document.getElementById('btn-prev-month').addEventListener('click', () => {
    state.calendarMonth--;
    if (state.calendarMonth < 0) {
      state.calendarMonth = 11;
      state.calendarYear--;
    }
    renderCalendar();
  });

  document.getElementById('btn-next-month').addEventListener('click', () => {
    state.calendarMonth++;
    if (state.calendarMonth > 11) {
      state.calendarMonth = 0;
      state.calendarYear++;
    }
    renderCalendar();
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
  });
  document.getElementById('form-escala').addEventListener('submit', handleCreateEscala);

  // Preview de diárias no sub-formulário de Escala
  const escQtdAparicoesInput = document.getElementById('esc_qtd_aparicoes');
  escQtdAparicoesInput.addEventListener('input', () => {
    const val = parseInt(escQtdAparicoesInput.value, 10) || 1;
    document.getElementById('diarias-calc-preview').textContent = val * 2;
    updateEscalaBudgetPreview();
  });

  // Filtros de Relatório
  document.getElementById('filter-mes').addEventListener('change', renderRelatorioTable);
  document.getElementById('filter-ano').addEventListener('change', renderRelatorioTable);
  document.getElementById('filter-search-input').addEventListener('input', renderRelatorioTable);

  // Exportar relatório
  document.getElementById('btn-export').addEventListener('click', exportRelatorioToCSV);

  // Excluir evento na Gaveta Lateral
  document.getElementById('btn-delete-evento').addEventListener('click', handleDeleteEvento);

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

  // Relatório para o SEI (por período, a partir de Listar Eventos, ou por evento, na gaveta)
  document.getElementById('btn-gerar-relatorio-sei').addEventListener('click', () => {
    const dataInicio = document.getElementById('filter-eventos-inicio').value;
    const dataFim = document.getElementById('filter-eventos-fim').value;
    abrirRelatorioSei({ dataInicio, dataFim });
  });
  document.getElementById('btn-drawer-relatorio-sei').addEventListener('click', () => {
    if (state.currentEventId) abrirRelatorioSei({ eventoId: state.currentEventId });
  });
  const fecharModalSei = () => document.getElementById('modal-relatorio-sei').classList.add('hidden');
  document.getElementById('btn-fechar-modal-sei').addEventListener('click', fecharModalSei);
  document.getElementById('btn-fechar-modal-sei-footer').addEventListener('click', fecharModalSei);
  document.getElementById('btn-copiar-relatorio-sei').addEventListener('click', handleCopiarRelatorioSei);
  document.getElementById('btn-exportar-pdf-sei').addEventListener('click', () => window.print());

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

  // Modal de Nova Missão Planejada (Planejador de Diárias)
  document.getElementById('btn-nova-missao-planejada').addEventListener('click', abrirModalMissaoPlanejada);
  const fecharModalMissaoPlanejada = () => document.getElementById('modal-missao-planejada').classList.add('hidden');
  document.getElementById('btn-fechar-modal-missao-planejada').addEventListener('click', fecharModalMissaoPlanejada);
  document.getElementById('btn-cancelar-modal-missao-planejada').addEventListener('click', fecharModalMissaoPlanejada);
  document.getElementById('form-missao-planejada').addEventListener('submit', handleCriarMissaoPlanejada);

  // Filtro de ano do Painel de Estatísticas
  document.getElementById('stats-filter-ano').addEventListener('change', renderEstatisticasTab);

  // Cartão Programa
  document.getElementById('cartao-data').addEventListener('change', renderCartaoTab);
  document.getElementById('btn-novo-cartao').addEventListener('click', () => handleCriarCartao(false));
  document.getElementById('btn-copiar-cartao').addEventListener('click', () => handleCriarCartao(true));
  document.getElementById('btn-imprimir-cartao').addEventListener('click', () => {
    if (!state.cartaoAtual) {
      showToast('Não há Cartão Programa nesta data para imprimir.', 'warning');
      return;
    }
    window.print();
  });
  document.getElementById('btn-excluir-cartao').addEventListener('click', handleExcluirCartao);

  // Menu overflow (⋯) do Cartão Programa — Templates / Novo Template
  const overflowToggle = document.getElementById('btn-cartao-overflow-toggle');
  const overflowMenu = document.getElementById('cartao-overflow-menu');
  const fecharOverflowCartao = () => {
    overflowMenu.classList.add('hidden');
    overflowToggle.setAttribute('aria-expanded', 'false');
  };
  overflowToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const abrindo = overflowMenu.classList.contains('hidden');
    overflowMenu.classList.toggle('hidden', !abrindo);
    overflowToggle.setAttribute('aria-expanded', String(abrindo));
  });
  document.addEventListener('click', (e) => {
    if (!overflowMenu.classList.contains('hidden') && !e.target.closest('#cartao-overflow-dropdown')) {
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

  ['filter-ano', 'plan-filter-ano', 'stats-filter-ano'].forEach(id => {
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
  state.alocacoes = [];
  state.escalas = [];
  state.currentEventId = null;
  state.cartaoAtual = null;

  closeDrawer();
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
    const resEventos = await apiFetch(`${API_BASE_URL}/api/eventos`);
    state.eventos = await resEventos.json();
    
    // Carrega todas as alocações/escalas de fundo para permitir métricas rápidas nos cards do Turno
    const resAloc = await apiFetch(`${API_BASE_URL}/api/alocacoes`);
    state.alocacoes = await resAloc.json();

    const resEsc = await apiFetch(`${API_BASE_URL}/api/escalas`);
    state.escalas = await resEsc.json();

    const resConfig = await apiFetch(`${API_BASE_URL}/api/config`);
    state.config = await resConfig.json();

    // Cadastro de Pessoal em memória — alimenta os seletores de Fiscal/Adjunto/Sobreaviso do Cartão Programa
    const resPessoal = await apiFetch(`${API_BASE_URL}/api/pessoal`);
    state.pessoal = await resPessoal.json();

    // Cadastro de Viaturas em memória — alimenta a sugestão de prefixo no Cartão Programa
    const resViaturas = await apiFetch(`${API_BASE_URL}/api/viaturas`);
    state.viaturas = await resViaturas.json();
    popularDatalistViaturas();

    // Cadastro de Bairros — alimenta o select de Bairro em Novo Evento
    popularSelectBairros();

    updateStats();

    // Atualiza aba atual
    const activeTab = document.querySelector('.nav-btn.active').getAttribute('data-target');
    if (activeTab === 'tab-dashboard') {
      renderCalendar();
      renderDashboardOperacional();
    } else if (activeTab === 'tab-turno') {
      renderTurnoTab();
    } else if (activeTab === 'tab-eventos') {
      renderEventosTab();
    } else if (activeTab === 'tab-mapa') {
      renderMapaTab();
    } else if (activeTab === 'tab-planejador') {
      renderPlanejadorTab();
    } else if (activeTab === 'tab-estatisticas') {
      renderEstatisticasTab();
    }

    // Se a gaveta lateral de detalhes do evento estiver aberta, recarrega
    if (state.currentEventId) {
      await fetchEventDetails(state.currentEventId);
    }
  } catch (error) {
    console.error("Erro ao buscar dados do servidor:", error);
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

  const idsEventosMes = new Set(
    state.eventos.filter(e => e.data_inicio.startsWith(prefixoMesAtual)).map(e => e.id)
  );
  const consumidoMes = state.escalas
    .filter(s => idsEventosMes.has(s.evento_id))
    .reduce((sum, s) => sum + (s.total_diarias || 0), 0);

  const idsEventosMesAnterior = new Set(
    state.eventos.filter(e => e.data_inicio.startsWith(prefixoMesAnterior)).map(e => e.id)
  );
  const consumidoMesAnterior = state.escalas
    .filter(s => idsEventosMesAnterior.has(s.evento_id))
    .reduce((sum, s) => sum + (s.total_diarias || 0), 0);

  const cota = state.config ? (state.config.cota_mensal_diarias || 0) : 0;

  const statDiarias = document.getElementById('stat-diarias-mes');
  statDiarias.textContent = `${consumidoMes} / ${cota}`;
  statDiarias.style.color = (cota > 0 && consumidoMes > cota) ? 'var(--danger)' : '';
  renderTendencia('stat-diarias-mes-tendencia', consumidoMes, consumidoMesAnterior);
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

  // Card de resumo "Cartão Programa de Hoje"
  const iconCartaoHoje = document.getElementById('stat-cartao-hoje-icon');
  const statCartaoHoje = document.getElementById('stat-cartao-hoje');
  if (cartaoHoje) {
    statCartaoHoje.textContent = `${cartaoHoje.viaturas.length} viatura(s)`;
    iconCartaoHoje.classList.remove('alert');
    iconCartaoHoje.classList.add('success');
  } else {
    statCartaoHoje.textContent = 'Não lançado';
    iconCartaoHoje.classList.remove('success');
    iconCartaoHoje.classList.add('alert');
  }

  // Alertas consolidados: conflitos do cartão de hoje + eventos com OS pendente se aproximando
  const alertasCartao = cartaoHoje ? calcularAlertasCartao(cartaoHoje) : [];
  const alertasEventos = calcularAlertasEventosUrgentes();
  const todosAlertas = [...alertasCartao, ...alertasEventos];

  const painelAlertas = document.getElementById('dashboard-alertas');
  const listaAlertas = document.getElementById('dashboard-alertas-lista');

  if (todosAlertas.length === 0) {
    painelAlertas.classList.add('hidden');
  } else {
    painelAlertas.classList.remove('hidden');
    listaAlertas.innerHTML = todosAlertas.map(a => `
      <div class="cartao-alerta-item">
        <i data-lucide="alert-triangle"></i>
        <span>${esc(a.mensagem)}</span>
      </div>
    `).join('');
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
        <td><strong>${esc(v.prefixo)}</strong></td>
        <td>${esc(v.setor)}</td>
        <td>${esc(v.companhia) || '-'}</td>
        <td>${esc(v.comandante) || 'Não informado'}</td>
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

function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  document.getElementById('calendar-month-year').textContent = `${meses[state.calendarMonth]} ${state.calendarYear}`;

  // Primeiro dia do mês e número de dias
  const primeiroDiaSemana = new Date(state.calendarYear, state.calendarMonth, 1).getDay();
  const totalDiasMes = new Date(state.calendarYear, state.calendarMonth + 1, 0).getDate();

  // Dias em branco do mês anterior
  for (let i = 0; i < primeiroDiaSemana; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'calendar-day inactive';
    grid.appendChild(emptyCell);
  }

  // Dias do mês atual
  const hoje = new Date();
  for (let dia = 1; dia <= totalDiasMes; dia++) {
    const dayCell = document.createElement('div');
    dayCell.className = 'calendar-day';
    
    // Verifica se é hoje
    if (hoje.getDate() === dia && hoje.getMonth() === state.calendarMonth && hoje.getFullYear() === state.calendarYear) {
      dayCell.classList.add('today');
    }

    const dayNum = document.createElement('span');
    dayNum.className = 'calendar-day-number';
    dayNum.textContent = dia;
    dayCell.appendChild(dayNum);

    // Eventos do dia
    const mesFormatado = String(state.calendarMonth + 1).padStart(2, '0');
    const diaFormatado = String(dia).padStart(2, '0');
    const dataStr = `${state.calendarYear}-${mesFormatado}-${diaFormatado}`;

    const eventosDoDia = state.eventos.filter(e => e.data_inicio === dataStr);
    
    if (eventosDoDia.length > 0) {
      const container = document.createElement('div');
      container.className = 'calendar-events-container';

      eventosDoDia.forEach(evt => {
        const item = document.createElement('div');
        const classeTipo = evt.tipo_evento.toLowerCase().replace(' ', '-').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        item.className = `calendar-event-item badge ${classeTipo}`;
        item.textContent = evt.nome_evento;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          openDrawer(evt.id);
        });
        container.appendChild(item);
      });

      dayCell.appendChild(container);
    }

    grid.appendChild(dayCell);
  }
  
  lucide.createIcons();
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
function renderTurnoTab() {
  const containerHoje = document.getElementById('turno-cards-hoje');
  const containerAmanha = document.getElementById('turno-cards-amanha');

  containerHoje.innerHTML = '';
  containerAmanha.innerHTML = '';

  // Determinar datas (horário local, não UTC)
  const hoje = new Date();
  const hojeStr = getLocalDateStr(hoje);
  document.getElementById('turno-data-hoje').textContent = hojeStr.split('-').reverse().join('/');

  const amanha = new Date(hoje);
  amanha.setDate(hoje.getDate() + 1);
  const amanhaStr = getLocalDateStr(amanha);
  document.getElementById('turno-data-amanha').textContent = amanhaStr.split('-').reverse().join('/');

  // Filtra eventos
  const eventosHoje = state.eventos.filter(e => e.data_inicio === hojeStr);
  const eventosAmanha = state.eventos.filter(e => e.data_inicio === amanhaStr);

  // Renderiza Hoje
  if (eventosHoje.length === 0) {
    containerHoje.innerHTML = `<p style="font-size:0.8rem;color:var(--text-muted);text-align:center;padding:32px;">Nenhum evento agendado para hoje.</p>`;
  } else {
    eventosHoje.forEach(evt => containerHoje.appendChild(createTurnoCard(evt)));
  }

  // Renderiza Amanhã
  if (eventosAmanha.length === 0) {
    containerAmanha.innerHTML = `<p style="font-size:0.8rem;color:var(--text-muted);text-align:center;padding:32px;">Nenhum evento agendado para amanhã.</p>`;
  } else {
    eventosAmanha.forEach(evt => containerAmanha.appendChild(createTurnoCard(evt)));
  }

  lucide.createIcons();
}

function createTurnoCard(evt) {
  const card = document.createElement('div');
  card.className = 'turno-card';
  card.addEventListener('click', () => openDrawer(evt.id));

  const typeClass = evt.tipo_evento.toLowerCase().replace(' ', '-').normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Calcular métricas
  const alocacoesEvt = state.alocacoes.filter(a => a.evento_id === evt.id);
  const totalPoliciais = alocacoesEvt.reduce((sum, current) => sum + current.qtd_policiais, 0);
  const totalViaturas = alocacoesEvt.reduce((sum, current) => sum + current.qtd_viaturas, 0);
  
  card.innerHTML = `
    <div class="turno-card-header">
      <h3 class="turno-card-title">${esc(evt.nome_evento)}</h3>
      <span class="badge ${typeClass}">${esc(evt.tipo_evento)}</span>
    </div>
    <div class="turno-card-detail">
      <span><i data-lucide="award"></i> <strong>Demandante:</strong> ${esc(evt.demandante)}</span>
      <span><i data-lucide="clock"></i> <strong>Início:</strong> ${esc(evt.horario_inicio) || 'Horário Não Informado'}</span>
      <span><i data-lucide="map-pin"></i> <strong>Local:</strong> ${esc(evt.local_itinerario)} (${esc(evt.bairro) || 'Sem Bairro'})</span>
      <span><i data-lucide="file-text"></i> <strong>OS:</strong> ${esc(evt.num_os_manual) || 'Não informado'}</span>
    </div>
    <div class="turno-card-stats">
      <span>Mod: <strong>${alocacoesEvt.length}</strong></span>
      <span>Efetivo: <strong>${totalPoliciais} PMs</strong></span>
      <span>Viaturas: <strong>${totalViaturas} VTRs</strong></span>
    </div>
  `;

  return card;
}

// -------------------------------------------------------------
// TELA 4: LISTAR EVENTOS (COM FILTRO DE DATAS POR PERÍODO)
// -------------------------------------------------------------
function renderEventosTab() {
  const tableBody = document.getElementById('table-eventos-body');
  const dataInicioFiltro = document.getElementById('filter-eventos-inicio').value;
  const dataFimFiltro = document.getElementById('filter-eventos-fim').value;
  const searchText = document.getElementById('filter-eventos-search').value.toLowerCase().trim();

  tableBody.innerHTML = '';

  // Filtra coleções de acordo com os inputs
  let eventosFiltrados = [...state.eventos];

  // Filtro de data inicial
  if (dataInicioFiltro) {
    eventosFiltrados = eventosFiltrados.filter(e => e.data_inicio >= dataInicioFiltro);
  }

  // Filtro de data final
  if (dataFimFiltro) {
    eventosFiltrados = eventosFiltrados.filter(e => e.data_inicio <= dataFimFiltro);
  }

  // Filtro de busca textual
  if (searchText) {
    eventosFiltrados = eventosFiltrados.filter(e => {
      return e.nome_evento.toLowerCase().includes(searchText) ||
             e.bairro.toLowerCase().includes(searchText) ||
             e.local_itinerario.toLowerCase().includes(searchText) ||
             e.demandante.toLowerCase().includes(searchText) ||
             (e.num_os_manual && e.num_os_manual.toLowerCase().includes(searchText)) ||
             (e.num_sei && e.num_sei.toLowerCase().includes(searchText));
    });
  }

  if (eventosFiltrados.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:32px;">Nenhum evento localizado com os filtros aplicados.</td></tr>`;
    return;
  }

  // Ordena por data (mais recente primeiro)
  eventosFiltrados.sort((a, b) => b.data_inicio.localeCompare(a.data_inicio));

  eventosFiltrados.forEach(evt => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => openDrawer(evt.id));

    const typeClass = evt.tipo_evento.toLowerCase().replace(' ', '-').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const dateBr = evt.data_inicio.split('-').reverse().join('/');

    const escalasEvt = state.escalas.filter(s => s.evento_id === evt.id);
    const totalDiariasEvt = escalasEvt.reduce((sum, s) => sum + (s.total_diarias || 0), 0);
    const badgeDiaria = totalDiariasEvt > 0
      ? `<span class="badge-diaria tem-diaria"><i data-lucide="wallet"></i> ${totalDiariasEvt} diária(s)</span>`
      : `<span class="badge-diaria sem-diaria">Sem diária</span>`;

    tr.innerHTML = `
      <td data-label="Data"><strong>${dateBr}</strong></td>
      <td class="card-title-cell">${esc(evt.nome_evento)}</td>
      <td data-label="Tipo"><span class="badge ${typeClass}">${esc(evt.tipo_evento)}</span></td>
      <td data-label="Demandante">${esc(evt.demandante)}</td>
      <td data-label="Bairro/Local">${esc(evt.bairro) || 'Centro'}</td>
      <td data-label="Nº OS"><code style="color:#a5b4fc;">${esc(evt.num_os_manual) || '-'}</code></td>
      <td data-label="Nº SEI"><code style="color:#a5b4fc;">${esc(evt.num_sei) || '-'}</code></td>
      <td data-label="Diária">${badgeDiaria}</td>
    `;

    tableBody.appendChild(tr);
  });

  lucide.createIcons();
}

// -------------------------------------------------------------
// RELATÓRIO PARA O SEI
// -------------------------------------------------------------

// Abre o modal e busca os dados: { eventoId } para um único evento, ou { dataInicio, dataFim } para um período
async function abrirRelatorioSei({ eventoId, dataInicio, dataFim } = {}) {
  const params = new URLSearchParams();
  if (eventoId) {
    params.set('evento_id', eventoId);
  } else if (dataInicio && dataFim) {
    params.set('data_inicio', dataInicio);
    params.set('data_fim', dataFim);
  } else {
    showToast('Selecione uma Data Inicial e uma Data Final para gerar o relatório do período.', 'warning');
    return;
  }

  try {
    const res = await apiFetch(`${API_BASE_URL}/api/relatorio-sei?${params.toString()}`);
    if (!res.ok) {
      const err = await res.json();
      showToast(err.error || 'Falha ao gerar o relatório.', 'danger');
      return;
    }
    const data = await res.json();
    state.relatorioSeiAtual = data;
    renderRelatorioSei(data);
    document.getElementById('modal-relatorio-sei').classList.remove('hidden');
  } catch (error) {
    console.error('Erro ao gerar relatório SEI:', error);
    showToast('Falha na comunicação com o servidor.', 'danger');
  }
}

function renderRelatorioSei(data) {
  const dataBr = (iso) => iso ? iso.split('-').reverse().join('/') : '-';

  if (data.modo === 'evento') {
    const evt = data.evento;
    document.getElementById('sei-titulo').textContent = evt.nome_evento;
    document.getElementById('sei-periodo').textContent =
      `${esc(evt.tipo_evento)} · ${dataBr(evt.data_inicio)}${evt.data_termino && evt.data_termino !== evt.data_inicio ? ' a ' + dataBr(evt.data_termino) : ''} · ${esc(evt.demandante) || 'Demandante não informado'}`;
  } else {
    document.getElementById('sei-titulo').textContent = 'Relatório de Emprego Operacional — Período';
    document.getElementById('sei-periodo').textContent = `${dataBr(data.periodo.data_inicio)} a ${dataBr(data.periodo.data_fim)}`;
  }

  document.getElementById('sei-resumo-grid').innerHTML = `
    <div class="sei-resumo-item"><strong>${data.resumo.total_eventos}</strong><span>Evento(s)</span></div>
    <div class="sei-resumo-item"><strong>${data.resumo.total_viaturas}</strong><span>Viatura(s)</span></div>
    <div class="sei-resumo-item"><strong>${data.resumo.total_policiais}</strong><span>Policiais Empregados</span></div>
    <div class="sei-resumo-item"><strong>${data.resumo.total_diarias}</strong><span>Diária(s)</span></div>
  `;

  document.getElementById('sei-bairros').textContent = data.bairros.length > 0 ? data.bairros.join(', ') : 'Nenhum bairro informado.';

  const listaEfetivo = document.getElementById('sei-lista-efetivo');
  if (data.efetivo.length === 0) {
    listaEfetivo.innerHTML = `<li style="color:var(--text-muted);">Nenhum militar escalado neste período.</li>`;
  } else {
    listaEfetivo.innerHTML = data.efetivo.map(m => `
      <li>${esc(m.militar_nome)} — Mat. ${esc(m.militar_id) || 'não informada'} — ${m.total_diarias} diária(s)</li>
    `).join('');
  }

  lucide.createIcons();
}

// Monta o texto puro (sem HTML) no padrão de numeração usado no SEI: "01 – NOME – Mat. XXXXXX"
function montarTextoRelatorioSei(data) {
  const dataBr = (iso) => iso ? iso.split('-').reverse().join('/') : '-';
  const linhas = [];

  linhas.push('POLÍCIA MILITAR DO ESTADO DO RIO GRANDE DO NORTE');
  linhas.push('5º BATALHÃO DE POLÍCIA MILITAR');
  linhas.push('SEÇÃO DE PLANEJAMENTO E OPERAÇÕES — P3');
  linhas.push('');

  if (data.modo === 'evento') {
    linhas.push(`RELATÓRIO DE EMPREGO OPERACIONAL — ${data.evento.nome_evento.toUpperCase()}`);
    linhas.push(`Tipo: ${data.evento.tipo_evento} | Data: ${dataBr(data.evento.data_inicio)}${data.evento.data_termino && data.evento.data_termino !== data.evento.data_inicio ? ' a ' + dataBr(data.evento.data_termino) : ''}`);
    linhas.push(`Demandante: ${data.evento.demandante || 'Não informado'}`);
  } else {
    linhas.push('RELATÓRIO DE EMPREGO OPERACIONAL — PERÍODO');
    linhas.push(`Período: ${dataBr(data.periodo.data_inicio)} a ${dataBr(data.periodo.data_fim)}`);
  }
  linhas.push('');

  linhas.push('RESUMO');
  linhas.push(`Eventos: ${data.resumo.total_eventos} | Viaturas: ${data.resumo.total_viaturas} | Policiais: ${data.resumo.total_policiais} | Diárias: ${data.resumo.total_diarias}`);
  linhas.push('');

  linhas.push('BAIRROS ATENDIDOS');
  linhas.push(data.bairros.length > 0 ? data.bairros.join(', ') : 'Nenhum bairro informado.');
  linhas.push('');

  linhas.push('EFETIVO EMPREGADO (DIÁRIAS)');
  if (data.efetivo.length === 0) {
    linhas.push('Nenhum militar escalado neste período.');
  } else {
    data.efetivo.forEach((m, i) => {
      const num = String(i + 1).padStart(2, '0');
      linhas.push(`${num} – ${m.militar_nome.toUpperCase()} – Mat. ${m.militar_id || 'não informada'} – ${m.total_diarias} diária(s)`);
    });
  }

  return linhas.join('\n');
}

async function handleCopiarRelatorioSei() {
  if (!state.relatorioSeiAtual) return;
  const texto = montarTextoRelatorioSei(state.relatorioSeiAtual);
  try {
    await navigator.clipboard.writeText(texto);
    showToast('Texto do relatório copiado para a área de transferência.', 'success');
  } catch (error) {
    console.error('Erro ao copiar relatório:', error);
    showToast('Não foi possível copiar automaticamente. Selecione o texto manualmente.', 'danger');
  }
}

// -------------------------------------------------------------
// MAPA DE EVENTOS DA SEMANA (LEAFLET, DARK MODE) + CAMADA DE VIATURAS
// -------------------------------------------------------------
let mapaLeafletInstancia = null;
let mapaLeafletTileLayer = null;
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
  'Ordinária': '#4f46e5'
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

  // Troca o tile conforme o estilo salvo (dark vs. colorido)
  if (mapaLeafletTileLayer) mapaLeafletInstancia.removeLayer(mapaLeafletTileLayer);
  mapaLeafletTileLayer = L.tileLayer(MAPA_TILES[prefs.estilo], {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(mapaLeafletInstancia);

  // Limpa marcadores da renderização anterior
  mapaLeafletMarkersEventos.forEach(m => mapaLeafletInstancia.removeLayer(m));
  mapaLeafletMarkersEventos = [];
  mapaLeafletMarkersViaturas.forEach(m => mapaLeafletInstancia.removeLayer(m));
  mapaLeafletMarkersViaturas = [];

  try {
    const resCoords = await apiFetch(`${API_BASE_URL}/api/bairros-coordenadas`);
    const bairrosCoordenadas = await resCoords.json();

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
async function popularSelectBairros() {
  const select = document.getElementById('bairro');
  if (!select) return;

  const valorAtual = select.value;
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/bairros-coordenadas`);
    const bairros = await res.json();

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
            <button class="btn-icon btn-sm" title="Editar" aria-label="Editar" onclick="abrirEdicaoBairro('${b.id}', '${esc(b.nome_bairro)}', ${b.latitude}, ${b.longitude})">
              <i data-lucide="pencil" style="width:14px;height:14px;"></i>
            </button>
            <button class="btn-icon btn-danger btn-sm" title="Excluir" aria-label="Excluir" onclick="handleExcluirBairro('${b.id}')">
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
  document.getElementById('form-escala-container').classList.add('hidden');
  document.getElementById('form-alocacao').reset();
  document.getElementById('form-escala').reset();
  document.getElementById('diarias-calc-preview').textContent = '2';
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
    
    const badgeClass = evt.tipo_evento.toLowerCase().replace(' ', '-').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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

    // Carrega alocações da API
    const resAloc = await apiFetch(`${API_BASE_URL}/api/alocacoes?evento_id=${id}`);
    const alocacoes = await resAloc.json();
    renderAlocacoesList(alocacoes);

    // Carrega escalas da API
    const resEscalas = await apiFetch(`${API_BASE_URL}/api/escalas?evento_id=${id}`);
    const escalas = await resEscalas.json();
    renderEscalasList(escalas);

  } catch (error) {
    console.error(error);
  }
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
      <button class="btn-icon btn-danger btn-sm" title="Remover alocação" aria-label="Remover alocação" onclick="handleDeleteAlocacao('${item.id}')">
        <i data-lucide="trash" style="width:12px;height:12px;"></i>
      </button>` : ''}
    `;
    container.appendChild(el);
  });
  
  lucide.createIcons();
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
        <p><strong>Aparições:</strong> ${item.qtd_aparicoes} | <strong>Total de Diárias:</strong> <span style="color:#f59e0b;font-weight:600;">${item.total_diarias} un.</span></p>
      </div>
      ${isAdmin ? `
      <button class="btn-icon btn-danger btn-sm" title="Remover militar da escala" aria-label="Remover militar da escala" onclick="handleDeleteEscala('${item.id}')">
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

  const payload = {
    evento_id: state.currentEventId,
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

        await fetchData(); // Atualiza escalas em cache
        fetchEventDetails(state.currentEventId);
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
        fetchEventDetails(state.currentEventId);
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
        <td class="text-right" data-label="Total Diárias" style="color:#f59e0b;font-weight:600;">${item.total_diarias}</td>
      `;
      tableBody.appendChild(tr);
    });

  } catch (error) {
    console.error("Erro ao gerar relatório:", error);
    tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--danger);">Falha ao carregar relatório financeiro.</td></tr>`;
  }
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

    // Cards de resumo
    document.getElementById('plan-stat-cota').textContent = data.cota_mensal;
    document.getElementById('plan-stat-consumido').textContent = data.total_consumido;

    const saldoEl = document.getElementById('plan-stat-saldo');
    saldoEl.textContent = data.saldo;
    saldoEl.style.color = data.saldo < 0 ? 'var(--danger)' : '';

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

    document.getElementById('budget-label-text').textContent = totalPlanejado > 0
      ? `${data.total_consumido} consumidas + ${totalPlanejado} planejadas de ${data.cota_mensal} diárias`
      : `${data.total_consumido} de ${data.cota_mensal} diárias planejadas no mês`;
    document.getElementById('budget-label-pct').textContent = `${Math.round(pctTotal)}%`;

    // Alerta de estouro da cota (considera consumido + planejado)
    const alertEl = document.getElementById('budget-alert');
    if (data.saldo < 0) {
      document.getElementById('budget-alert-text').textContent =
        `Cota mensal excedida em ${Math.abs(data.saldo)} diária(s), somando consumido e planejado.`;
      alertEl.classList.remove('hidden');
    } else {
      alertEl.classList.add('hidden');
    }

    renderMissoesPlanejadasTab(data.missoes_planejadas || []);

    // Tabela de eventos do mês
    tableBody.innerHTML = '';

    if (data.eventos.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:32px;">Nenhum evento na pauta para este mês.</td></tr>`;
    } else {
      data.eventos.forEach(evt => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', () => openDrawer(evt.id));

        const typeClass = evt.tipo_evento.toLowerCase().replace(' ', '-').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const dateBr = evt.data_inicio.split('-').reverse().join('/');
        const pctEvento = data.cota_mensal > 0
          ? `${((evt.total_diarias / data.cota_mensal) * 100).toFixed(1)}%`
          : '—';

        tr.innerHTML = `
          <td><strong>${dateBr}</strong></td>
          <td>${esc(evt.nome_evento)}</td>
          <td><span class="badge ${typeClass}">${esc(evt.tipo_evento)}</span></td>
          <td class="text-center">${evt.militares_escalados}</td>
          <td class="text-right" style="color:#f59e0b;font-weight:600;">${evt.total_diarias}</td>
          <td class="text-right">${pctEvento}</td>
        `;
        tableBody.appendChild(tr);
      });
    }

    lucide.createIcons();
  } catch (error) {
    console.error("Erro ao carregar planejador de diárias:", error);
    tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--danger);">Falha ao carregar o planejador de diárias.</td></tr>`;
  }
}

// -------------------------------------------------------------
// MISSÕES PLANEJADAS (PLANEJADOR DE DIÁRIAS)
// -------------------------------------------------------------
const ROTULOS_RECORRENCIA = {
  diaria: 'Diária',
  fim_de_semana: 'Fim de Semana',
  dia_unico: 'Dia Único'
};

function renderMissoesPlanejadasTab(missoes) {
  const tbody = document.getElementById('table-missoes-planejadas-body');
  if (!tbody) return;

  if (missoes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;">Nenhuma missão planejada para este mês.</td></tr>`;
    lucide.createIcons();
    return;
  }

  const isAdmin = state.user && state.user.role === 'P3';

  tbody.innerHTML = missoes.map(m => {
    const inicioBr = m.data_inicio.split('-').reverse().join('/');
    const fimBr = m.data_fim.split('-').reverse().join('/');
    const periodo = m.data_inicio === m.data_fim ? inicioBr : `${inicioBr} a ${fimBr}`;
    const convertida = !!m.convertida_em_evento_id;

    return `
      <tr>
        <td><strong>${esc(m.nome)}</strong></td>
        <td>${esc(ROTULOS_RECORRENCIA[m.tipo_recorrencia] || m.tipo_recorrencia)}</td>
        <td>${periodo}</td>
        <td class="text-right" style="color:#f59e0b;font-weight:600;">${m.qtd_diarias_por_ocorrencia}</td>
        <td class="text-right">
          <div style="display:flex;gap:6px;justify-content:flex-end;">
            ${convertida
              ? `<span class="badge outros" title="Já convertida em evento">Convertida</span>`
              : `<button class="btn btn-secondary btn-sm admin-only" onclick="handleConverterMissaoPlanejada('${m.id}')">
                   <i data-lucide="arrow-right-circle" style="width:12px;height:12px;"></i> Converter em Evento
                 </button>`}
            ${isAdmin ? `
            <button class="btn-icon btn-danger btn-sm" title="Excluir" aria-label="Excluir" onclick="handleExcluirMissaoPlanejada('${m.id}')">
              <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
            </button>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  lucide.createIcons();
}

window.abrirModalMissaoPlanejada = function() {
  document.getElementById('form-missao-planejada').reset();
  document.getElementById('modal-missao-planejada').classList.remove('hidden');
};

async function handleCriarMissaoPlanejada(e) {
  e.preventDefault();

  const payload = {
    nome: document.getElementById('missao-planejada-nome').value.trim(),
    tipo_recorrencia: document.getElementById('missao-planejada-recorrencia').value,
    data_inicio: document.getElementById('missao-planejada-inicio').value,
    data_fim: document.getElementById('missao-planejada-fim').value || document.getElementById('missao-planejada-inicio').value,
    qtd_diarias_por_ocorrencia: document.getElementById('missao-planejada-diarias').value
  };

  await comBotaoCarregando(e.submitter, async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/missoes-planejadas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const dados = await res.json();

      if (res.ok) {
        document.getElementById('modal-missao-planejada').classList.add('hidden');
        showToast('Missão planejada criada com sucesso.', 'success');
        renderPlanejadorTab();
      } else {
        showToast(esc(dados.error) || 'Falha ao criar a missão planejada.', 'danger');
      }
    } catch (error) {
      console.error('Erro ao criar missão planejada:', error);
      showToast('Falha na comunicação com o servidor.', 'danger');
    }
  });
}

window.handleExcluirMissaoPlanejada = async function(id) {
  if (!confirm('Excluir permanentemente esta missão planejada?')) return;

  try {
    const res = await apiFetch(`${API_BASE_URL}/api/missoes-planejadas/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Missão planejada excluída.', 'info');
      renderPlanejadorTab();
    } else {
      const dados = await res.json();
      showToast(esc(dados.error) || 'Falha ao excluir a missão planejada.', 'danger');
    }
  } catch (error) {
    console.error('Erro ao excluir missão planejada:', error);
    showToast('Falha na comunicação com o servidor.', 'danger');
  }
};

window.handleConverterMissaoPlanejada = async function(id) {
  if (!confirm('Converter esta missão planejada num evento real? Depois disso você poderá escalar o efetivo normalmente na gaveta do evento.')) return;

  try {
    const res = await apiFetch(`${API_BASE_URL}/api/missoes-planejadas/${id}/converter`, { method: 'POST' });
    const dados = await res.json();

    if (res.ok) {
      showToast(`Evento "${esc(dados.nome_evento)}" criado a partir da missão planejada.`, 'success');
      await fetchData();
      renderPlanejadorTab();
      openDrawer(dados.id);
    } else {
      showToast(esc(dados.error) || 'Falha ao converter a missão planejada.', 'danger');
    }
  } catch (error) {
    console.error('Erro ao converter missão planejada:', error);
    showToast('Falha na comunicação com o servidor.', 'danger');
  }
};

// -------------------------------------------------------------
// CALENDÁRIO DE DIÁRIAS + LANÇAMENTO RÁPIDO DE MISSÃO AVULSA
// -------------------------------------------------------------
async function renderCalendarioDiarias() {
  const grid = document.getElementById('calendar-diarias-grid');
  grid.innerHTML = '';

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
    lista.forEach(d => { diasComDiaria[d.dia] = d; });
  } catch (error) {
    console.error("Erro ao carregar o calendário de diárias:", error);
  }

  const primeiroDiaSemana = new Date(state.calendarDiariasYear, state.calendarDiariasMonth, 1).getDay();
  const totalDiasMes = new Date(state.calendarDiariasYear, state.calendarDiariasMonth + 1, 0).getDate();

  for (let i = 0; i < primeiroDiaSemana; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'calendar-day inactive';
    grid.appendChild(emptyCell);
  }

  const hoje = new Date();
  for (let dia = 1; dia <= totalDiasMes; dia++) {
    const dayCell = document.createElement('div');
    dayCell.className = 'calendar-day';

    if (hoje.getDate() === dia && hoje.getMonth() === state.calendarDiariasMonth && hoje.getFullYear() === state.calendarDiariasYear) {
      dayCell.classList.add('today');
    }

    const dayNum = document.createElement('span');
    dayNum.className = 'calendar-day-number';
    dayNum.textContent = dia;
    dayCell.appendChild(dayNum);

    const diaFormatado = String(dia).padStart(2, '0');
    const dataStr = `${anoStr}-${mesStr}-${diaFormatado}`;
    const infoDia = diasComDiaria[dataStr];

    if (infoDia) {
      dayCell.classList.add('tem-diaria');
      dayCell.title = infoDia.eventos.map(e => `${e.nome_evento} (${e.total_diarias} diária(s))`).join('\n');
      const badge = document.createElement('span');
      badge.className = 'calendar-day-diaria-badge';
      badge.textContent = `${infoDia.total_diarias} diária(s)`;
      dayCell.appendChild(badge);
    }

    dayCell.title = (dayCell.title ? dayCell.title + '\n' : '') + 'Clique para lançar uma missão avulsa nesta data';
    dayCell.addEventListener('click', () => abrirModalMissaoAvulsa(dataStr));

    grid.appendChild(dayCell);
  }

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

  const payload = {
    nome_evento: document.getElementById('missao-nome').value.trim(),
    tipo_evento: 'Missão Avulsa',
    demandante: 'Interno / Diária Avulsa',
    data_inicio: document.getElementById('missao-data').value,
    horario_inicio: document.getElementById('missao-horario').value,
    local_itinerario: document.getElementById('missao-local').value.trim() || 'Não informado'
  };

  await comBotaoCarregando(e.submitter, async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/eventos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const criado = await res.json();

      if (res.ok) {
        document.getElementById('modal-missao-avulsa').classList.add('hidden');
        showToast('Missão avulsa criada! Agora escale o(s) militar(es) para gerar a diária.', 'success');
        await fetchData(); // já atualiza o Planejador/Calendário de Diárias, pois esta é a aba ativa
        openDrawer(criado.id);
      } else {
        showToast(esc(criado.error) || 'Falha ao criar a missão avulsa.', 'danger');
      }
    } catch (error) {
      console.error("Erro ao criar missão avulsa:", error);
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

// Mostra o impacto da nova escala no saldo da cota do mês do evento
function updateEscalaBudgetPreview() {
  const textEl = document.getElementById('escala-budget-text');
  const wrap = document.getElementById('escala-budget-preview');
  const evt = state.eventos.find(e => e.id === state.currentEventId);

  if (!evt) {
    textEl.textContent = 'Saldo indisponível.';
    return;
  }

  const qtd = parseInt(document.getElementById('esc_qtd_aparicoes').value, 10) || 1;
  const novasDiarias = qtd * 2;

  const prefixoMes = evt.data_inicio.slice(0, 7); // "YYYY-MM"
  const idsEventosMes = new Set(
    state.eventos.filter(e => e.data_inicio.startsWith(prefixoMes)).map(e => e.id)
  );
  const consumido = state.escalas
    .filter(s => idsEventosMes.has(s.evento_id))
    .reduce((sum, s) => sum + (s.total_diarias || 0), 0);

  const cota = state.config ? (state.config.cota_mensal_diarias || 0) : 0;
  const saldoApos = cota - consumido - novasDiarias;
  const [anoEvt, mesEvt] = evt.data_inicio.split('-');

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

async function renderEstatisticasTab() {
  const ano = document.getElementById('stats-filter-ano').value;

  try {
    const res = await apiFetch(`${API_BASE_URL}/api/estatisticas?ano=${ano}`);
    const data = await res.json();

    // Cards de resumo
    document.getElementById('stats-total-eventos').textContent = data.resumo.total_eventos;
    document.getElementById('stats-total-policiais').textContent = data.resumo.total_policiais;
    document.getElementById('stats-total-viaturas').textContent = data.resumo.total_viaturas;
    document.getElementById('stats-total-diarias').textContent = data.resumo.total_diarias;

    // Tabela: Por Bairro
    const bodyBairro = document.getElementById('table-stats-bairro-body');
    if (data.por_bairro.length === 0) {
      bodyBairro.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px;">Sem dados para este ano.</td></tr>`;
    } else {
      bodyBairro.innerHTML = data.por_bairro.map(item => `
        <tr>
          <td>${esc(item.bairro)}</td>
          <td class="text-center">${item.total_eventos}</td>
          <td class="text-center">${item.total_policiais}</td>
          <td class="text-center">${item.total_viaturas}</td>
        </tr>
      `).join('');
    }

    // Tabela: Por Tipo de Evento
    const bodyTipo = document.getElementById('table-stats-tipo-body');
    if (data.por_tipo.length === 0) {
      bodyTipo.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px;">Sem dados para este ano.</td></tr>`;
    } else {
      bodyTipo.innerHTML = data.por_tipo.map(item => {
        const typeClass = item.tipo_evento.toLowerCase().replace(' ', '-').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return `
        <tr>
          <td><span class="badge ${typeClass}">${esc(item.tipo_evento)}</span></td>
          <td class="text-center">${item.total_eventos}</td>
          <td class="text-center">${item.total_policiais}</td>
          <td class="text-center">${item.media_policiais_por_evento}</td>
        </tr>
      `;
      }).join('');
    }

    // Tabela: Por Modalidade
    const bodyModalidade = document.getElementById('table-stats-modalidade-body');
    if (data.por_modalidade.length === 0) {
      bodyModalidade.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px;">Sem dados para este ano.</td></tr>`;
    } else {
      bodyModalidade.innerHTML = data.por_modalidade.map(item => `
        <tr>
          <td>${esc(item.modalidade)}</td>
          <td class="text-center">${item.total_policiais}</td>
          <td class="text-center">${item.total_viaturas}</td>
          <td class="text-right">${item.percentual_efetivo}%</td>
        </tr>
      `).join('');
    }

    // Gráfico de Sazonalidade: Planejados x Realizados por mês, com pico de diárias destacado
    renderSazonalidadeChart(data.tendencia_mensal);

    // Mini-sparklines dos cards de resumo (evolução mensal no ano filtrado)
    renderSparkline('spark-stats-eventos', data.tendencia_mensal.map(m => m.total_eventos));
    renderSparkline('spark-stats-policiais', data.tendencia_mensal.map(m => m.total_policiais));
    renderSparkline('spark-stats-viaturas', data.tendencia_mensal.map(m => m.total_viaturas));
    renderSparkline('spark-stats-diarias', data.tendencia_mensal.map(m => m.total_diarias));

    // Tabela: Tendência Mensal (com mini-barra proporcional ao maior mês)
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const maiorEfetivoMes = Math.max(1, ...data.tendencia_mensal.map(m => m.total_policiais));
    const bodyTendencia = document.getElementById('table-stats-tendencia-body');
    bodyTendencia.innerHTML = data.tendencia_mensal.map(item => {
      const pct = (item.total_policiais / maiorEfetivoMes) * 100;
      return `
        <tr>
          <td><strong>${meses[parseInt(item.mes, 10) - 1]}</strong></td>
          <td class="text-center">${item.total_eventos}</td>
          <td>
            <div class="mini-bar-row">
              <div class="mini-bar-track">
                <div class="mini-bar-fill" style="width:${pct}%;"></div>
              </div>
              <span class="mini-bar-value">${item.total_policiais}</span>
            </div>
          </td>
        </tr>
      `;
    }).join('');

  } catch (error) {
    console.error("Erro ao carregar estatísticas:", error);
    showToast('Falha ao carregar o painel analítico.', 'danger');
  }

  await renderEstatisticasCartaoTab(ano);
}

// Estatísticas de patrulhamento (Cartão Programa), mesma seleção de ano da aba
async function renderEstatisticasCartaoTab(ano) {
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/estatisticas-cartao?ano=${ano}`);
    const data = await res.json();

    document.getElementById('stats-cartao-total-cartoes').textContent = data.resumo.total_cartoes;
    document.getElementById('stats-cartao-total-viaturas-dia').textContent = data.resumo.total_viaturas_dia;
    document.getElementById('stats-cartao-total-itens').textContent = data.resumo.total_itens_roteiro;
    document.getElementById('stats-cartao-total-horas').textContent = data.resumo.total_horas;

    // Tabela: Por Setor
    const bodySetor = document.getElementById('table-stats-cartao-setor-body');
    if (data.por_setor.length === 0) {
      bodySetor.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:24px;">Sem cartões lançados neste ano.</td></tr>`;
    } else {
      bodySetor.innerHTML = data.por_setor.map(item => `
        <tr>
          <td>${esc(item.setor)}</td>
          <td class="text-center">${item.qtd_itens}</td>
          <td class="text-center">${item.horas_totais}</td>
        </tr>
      `).join('');
    }

    // Tabela: Por Atividade
    const bodyAtividade = document.getElementById('table-stats-cartao-atividade-body');
    if (data.por_atividade.length === 0) {
      bodyAtividade.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:24px;">Sem cartões lançados neste ano.</td></tr>`;
    } else {
      bodyAtividade.innerHTML = data.por_atividade.map(item => `
        <tr>
          <td><span class="badge ${atividadeBadgeClass(item.atividade)}">${esc(item.atividade)}</span></td>
          <td class="text-center">${item.qtd_itens}</td>
          <td class="text-right">${item.percentual}%</td>
        </tr>
      `).join('');
    }

    // Tabela: Por Viatura
    const bodyViatura = document.getElementById('table-stats-cartao-viatura-body');
    if (data.por_viatura.length === 0) {
      bodyViatura.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:24px;">Sem cartões lançados neste ano.</td></tr>`;
    } else {
      bodyViatura.innerHTML = data.por_viatura.map(item => `
        <tr>
          <td><strong>${esc(item.prefixo)}</strong></td>
          <td class="text-center">${item.qtd_dias}</td>
          <td class="text-center">${item.qtd_itens}</td>
        </tr>
      `).join('');
    }

    // Tabela: Tendência Mensal (mini-barra proporcional ao maior mês)
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const maiorViaturasDiaMes = Math.max(1, ...data.tendencia_mensal.map(m => m.total_viaturas_dia));
    const bodyTendenciaCartao = document.getElementById('table-stats-cartao-tendencia-body');
    bodyTendenciaCartao.innerHTML = data.tendencia_mensal.map(item => {
      const pct = (item.total_viaturas_dia / maiorViaturasDiaMes) * 100;
      return `
        <tr>
          <td><strong>${meses[parseInt(item.mes, 10) - 1]}</strong></td>
          <td class="text-center">${item.total_cartoes}</td>
          <td>
            <div class="mini-bar-row">
              <div class="mini-bar-track">
                <div class="mini-bar-fill" style="width:${pct}%;"></div>
              </div>
              <span class="mini-bar-value">${item.total_viaturas_dia}</span>
            </div>
          </td>
        </tr>
      `;
    }).join('');

  } catch (error) {
    console.error("Erro ao carregar estatísticas do Cartão Programa:", error);
    showToast('Falha ao carregar as estatísticas de patrulhamento.', 'danger');
  }
}

// -------------------------------------------------------------
// TELA 8: CARTÃO PROGRAMA (PATRULHAMENTO DIÁRIO POR VIATURA)
// -------------------------------------------------------------
const ATIVIDADES_CARTAO = ['PB', 'Patrulhamento', 'QTL Almoço', 'QTL Jantar', 'Corredor Seguro', 'Barreira Itinerante', 'Outros'];

function atividadeBadgeClass(atividade) {
  const slug = (atividade || 'Outros').toLowerCase().replace(/ /g, '-').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return `atv-${slug}`;
}

function categoriaBadgeClass(categoria) {
  const slug = (categoria || 'Ordin\u00e1ria').toLowerCase().replace(/ /g, '-').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return `cat-${slug}`;
}

function statusViaturaBadgeClass(status) {
  const slug = (status || 'Ativa').toLowerCase().replace(/ /g, '-').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return `status-${slug}`;
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

// Renderiza o painel de alertas de conflito do cartão atualmente aberto
function renderAlertasCartao() {
  const painel = document.getElementById('cartao-alertas-panel');
  const lista = document.getElementById('cartao-alertas-lista');
  const alertas = calcularAlertasCartao(state.cartaoAtual);

  if (alertas.length === 0) {
    painel.classList.add('hidden');
    return;
  }

  painel.classList.remove('hidden');
  lista.innerHTML = alertas.map(a => `
    <div class="cartao-alerta-item">
      <i data-lucide="alert-triangle"></i>
      <span>${esc(a.mensagem)}</span>
    </div>
  `).join('');
  lucide.createIcons();
}

async function renderCartaoTab() {
  const dataSelecionada = document.getElementById('cartao-data').value;
  const vazioEl = document.getElementById('cartao-vazio');
  const conteudoEl = document.getElementById('cartao-conteudo');

  state.cartaoAtual = null;

  if (!dataSelecionada) {
    vazioEl.classList.remove('hidden');
    conteudoEl.classList.add('hidden');
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
      atualizarSugestaoTemplateUI();
      lucide.createIcons();
      renderHistoricoRecente();
      return;
    }

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
    document.getElementById('cartao-titulo-print').textContent = `TEMPLATE: ${cartao.nome_template}`;
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
    if (headerFieldsEl) headerFieldsEl.classList.remove('hidden');
    atualizarCampoSobreavisoPrint();
  }

  renderCartaoVtrGrid();
  renderQuadroResumo();
  renderAlertasCartao();
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

// Atualiza o badge Dia Útil / Fim de Semana e limpa o resultado da busca de template anterior
function atualizarSugestaoTemplateUI() {
  const resultadoEl = document.getElementById('cartao-sugestao-resultado');
  if (resultadoEl) resultadoEl.innerHTML = '';

  const dataSelecionada = document.getElementById('cartao-data').value;
  const badge = document.getElementById('cartao-sugestao-badge-periodo');
  if (!badge) return;

  if (!dataSelecionada) {
    badge.textContent = '-';
    return;
  }
  const diaSemana = new Date(dataSelecionada + 'T00:00:00').getDay(); // 0=Dom .. 6=Sáb
  const fimDeSemana = diaSemana === 0 || diaSemana === 6;
  badge.textContent = fimDeSemana ? 'Fim de Semana' : 'Dia Útil';
  badge.style.backgroundColor = fimDeSemana ? 'rgba(245, 158, 11, 0.15)' : 'rgba(99, 102, 241, 0.15)';
  badge.style.color = fimDeSemana ? 'var(--warning)' : 'var(--primary)';
}

// Busca o template cadastrado para o período (dia útil/fim de semana) + quantidade de viaturas da data selecionada
async function handleBuscarTemplateSugerido() {
  const dataSelecionada = document.getElementById('cartao-data').value;
  if (!dataSelecionada) {
    showToast('Selecione a data do Cartão Programa.', 'warning');
    return;
  }

  const diaSemana = new Date(dataSelecionada + 'T00:00:00').getDay();
  const tipoPeriodo = (diaSemana === 0 || diaSemana === 6) ? 'fim_de_semana' : 'semana';
  const qtdViaturas = document.getElementById('sugestao-qtd-viaturas').value;
  const resultadoEl = document.getElementById('cartao-sugestao-resultado');

  try {
    const res = await apiFetch(`${API_BASE_URL}/api/cartoes/templates?tipo_periodo=${tipoPeriodo}&qtd_viaturas_base=${qtdViaturas}`);
    const templates = await res.json();

    if (templates.length === 0) {
      resultadoEl.innerHTML = `
        <div class="template-sugerido-box nao-encontrado">
          <span><i data-lucide="alert-triangle" style="width:14px;height:14px;vertical-align:middle;"></i>
          Nenhum template cadastrado para <strong>${tipoPeriodo === 'fim_de_semana' ? 'Fim de Semana' : 'Dia Útil'}</strong> com <strong>${qtdViaturas}</strong> viaturas.
          Crie o cartão manualmente abaixo, ou cadastre um template em "Novo Template".</span>
        </div>`;
    } else {
      const tpl = templates[0];
      resultadoEl.innerHTML = `
        <div class="template-sugerido-box encontrado">
          <span><i data-lucide="layout-template" style="width:14px;height:14px;vertical-align:middle;"></i>
          Template sugerido: <strong>${esc(tpl.nome_template)}</strong> (${tpl.qtd_viaturas} viatura(s) cadastradas)</span>
          <button class="btn btn-primary btn-sm" onclick="handleImportarClonarTemplate('${tpl.id}')">
            <i data-lucide="copy-plus"></i> Importar e Clonar
          </button>
        </div>`;
    }
    lucide.createIcons();
  } catch (error) {
    console.error('Erro ao buscar template sugerido:', error);
    resultadoEl.innerHTML = '';
    showToast('Falha ao buscar template.', 'danger');
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
      showToast(`Cartão criado a partir do template, com <strong>${criado.viaturas.length}</strong> viatura(s). Preencha os comandantes.`, 'success');
      renderCartaoTab();
    } else {
      const err = await res.json();
      showToast(err.error || 'Falha ao importar o template.', 'danger');
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
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;">Nenhum template cadastrado ainda.</td></tr>`;
      return;
    }

    tbody.innerHTML = templates.map(t => `
      <tr>
        <td><strong>${esc(t.nome_template)}</strong></td>
        <td>${t.tipo_periodo === 'fim_de_semana' ? 'Fim de Semana' : 'Dia Útil'}</td>
        <td class="text-center">${t.qtd_viaturas_base}</td>
        <td class="text-center">${t.qtd_viaturas}</td>
        <td class="text-right">
          <button class="btn btn-secondary btn-sm" onclick="handleAbrirTemplate('${t.id}')">
            <i data-lucide="folder-open" style="width:12px;height:12px;"></i> Abrir
          </button>
          <button class="btn btn-danger btn-sm" onclick="handleExcluirTemplate('${t.id}')">
            <i data-lucide="trash-2" style="width:12px;height:12px;"></i> Excluir
          </button>
        </td>
      </tr>
    `).join('');
    lucide.createIcons();
  } catch (error) {
    console.error('Erro ao carregar templates:', error);
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--danger);padding:24px;">Falha ao carregar templates.</td></tr>`;
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
    showToast('Falha ao abrir o template.', 'danger');
  }
};

window.handleExcluirTemplate = async function (id) {
  if (!confirm('Excluir permanentemente este template?')) return;
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/cartoes/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Template excluído.', 'info');
      renderTemplatesTab();
      if (state.cartaoAtual && state.cartaoAtual.id === id) {
        state.cartaoAtual = null;
        document.getElementById('cartao-conteudo').classList.add('hidden');
        document.getElementById('cartao-vazio').classList.remove('hidden');
      }
    } else {
      const err = await res.json();
      showToast(err.error || 'Falha ao excluir template.', 'danger');
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
        showToast('Template criado. Adicione as viaturas e roteiros abaixo.', 'success');
        document.getElementById('cartao-data').value = '';
        exibirCartaoNoEditor(criado);
      } else {
        const err = await res.json();
        showToast(err.error || 'Falha ao criar o template.', 'danger');
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
            <button class="btn btn-secondary btn-sm" onclick="handleAbrirCartaoHistorico('${c.data}')">
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

function renderCartaoVtrGrid() {
  const grid = document.getElementById('cartao-vtr-grid');
  grid.innerHTML = '';

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

    const itensHtml = (vtr.itens || []).map(item => `
      <tr>
        <td class="cartao-item-hora">${formatHoraCartao(esc(item.inicio))}${item.fim ? ' às ' + formatHoraCartao(esc(item.fim)) : ''}</td>
        <td>${esc(item.local)}</td>
        <td><span class="badge ${atividadeBadgeClass(item.atividade)}">${esc(item.atividade)}</span></td>
        <td style="width:30px;">
          <button class="btn-icon btn-sm" title="Remover item" aria-label="Remover item" onclick="handleDeleteCartaoItem('${vtr.id}', '${item.id}')">
            <i data-lucide="x" style="width:12px;height:12px;"></i>
          </button>
        </td>
      </tr>
    `).join('');

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
          <button class="btn-icon btn-sm" title="Editar viatura" aria-label="Editar viatura" onclick="abrirModalEditarVtr('${vtr.id}')">
            <i data-lucide="pencil" style="width:14px;height:14px;"></i>
          </button>
          <button class="btn-icon btn-sm" title="Remover viatura" aria-label="Remover viatura" onclick="handleDeleteCartaoVtr('${vtr.id}')">
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
          <button class="btn btn-primary btn-sm" onclick="handleAddCartaoItem('${vtr.id}')">
            <i data-lucide="plus" style="width:12px;height:12px;"></i> Incluir
          </button>
        </div>
      </div>
    `;

    grid.appendChild(card);
  });
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
        copiar_de: copiarAnterior ? 'ultimo' : undefined
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
        oficial_sobreaviso: document.getElementById('cartao-sobreaviso').value
      })
    });
    if (res.ok) {
      state.cartaoAtual = { ...state.cartaoAtual, ...(await res.json()) };
      showToast('Cabeçalho do cartão atualizado.', 'success');
      renderAlertasCartao();
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
            <button class="btn-icon btn-sm" title="Editar" aria-label="Editar" onclick="abrirModalUsuario('${esc(u.usuario)}', '${esc(u.nome)}', '${esc(u.role)}')">
              <i data-lucide="pencil" style="width:14px;height:14px;"></i>
            </button>
            <button class="btn-icon btn-sm" title="Resetar Senha" aria-label="Resetar Senha" onclick="abrirModalResetSenha('${esc(u.usuario)}', '${esc(u.nome)}')">
              <i data-lucide="key-round" style="width:14px;height:14px;"></i>
            </button>
            <button class="btn-icon btn-danger btn-sm" title="Excluir" aria-label="Excluir" onclick="handleExcluirUsuario('${esc(u.usuario)}')">
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
  tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;">Carregando...</td></tr>`;

  try {
    const params = pessoalFiltroCategoria ? `?categoria=${encodeURIComponent(pessoalFiltroCategoria)}` : '';
    const res = await apiFetch(`${API_BASE_URL}/api/pessoal${params}`);
    const pessoal = await res.json();

    if (!res.ok) {
      tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--danger);padding:24px;">${esc(pessoal.error) || 'Falha ao carregar o cadastro de pessoal.'}</td></tr>`;
      return;
    }

    pessoalListaAtual = pessoal;
    // Mantém a lista completa em memória para alimentar os seletores de Fiscal/Adjunto/Sobreaviso no Cartão Programa
    if (!pessoalFiltroCategoria) state.pessoal = pessoal;

    if (pessoal.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;">Nenhuma pessoa cadastrada${pessoalFiltroCategoria ? ' nesta categoria' : ''}.</td></tr>`;
      return;
    }

    tableBody.innerHTML = pessoal.map(p => `
      <tr>
        <td><strong>${esc(p.nome)}</strong></td>
        <td>${esc(p.posto_graduacao)}</td>
        <td><span class="badge tipo-${p.tipo === 'Praça' ? 'praca' : 'oficial'}">${esc(p.tipo)}</span></td>
        <td>${p.categorias.map(c => `<span class="badge outros" style="margin:2px;">${esc(c)}</span>`).join('')}</td>
        <td class="text-right">
          <div style="display:flex;gap:6px;justify-content:flex-end;">
            <button class="btn-icon btn-sm" title="Editar" aria-label="Editar" onclick="abrirModalPessoa('${p.id}')">
              <i data-lucide="pencil" style="width:14px;height:14px;"></i>
            </button>
            <button class="btn-icon btn-danger btn-sm" title="Excluir" aria-label="Excluir" onclick="handleExcluirPessoa('${p.id}')">
              <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    lucide.createIcons();
  } catch (error) {
    console.error('Erro ao carregar o cadastro de pessoal:', error);
    tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--danger);padding:24px;">Falha ao carregar o cadastro de pessoal.</td></tr>`;
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
  const posto_graduacao = document.getElementById('pes-posto').value;
  const categorias = Array.from(document.querySelectorAll('.pessoal-categorias-checkboxes input:checked')).map(cb => cb.value);

  if (categorias.length === 0) {
    showToast('Selecione ao menos uma categoria.', 'warning');
    return;
  }

  await comBotaoCarregando(e.submitter, async () => {
    try {
      let res;
      if (pessoaEmEdicao) {
        res = await apiFetch(`${API_BASE_URL}/api/pessoal/${pessoaEmEdicao}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome, posto_graduacao, categorias })
        });
      } else {
        res = await apiFetch(`${API_BASE_URL}/api/pessoal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome, posto_graduacao, categorias })
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
            <button class="btn-icon btn-sm" title="Editar" aria-label="Editar" onclick="abrirModalViatura('${v.id}')">
              <i data-lucide="pencil" style="width:14px;height:14px;"></i>
            </button>
            <button class="btn-icon btn-danger btn-sm" title="Excluir" aria-label="Excluir" onclick="handleExcluirViatura('${v.id}')">
              <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
            </button>
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
  datalist.innerHTML = (state.viaturas || []).map(v => `<option value="${esc(v.prefixo)}"></option>`).join('');
}

// -------------------------------------------------------------
// TRILHA DE AUDITORIA (P3) — só leitura, sem edição/exclusão pela interface
// -------------------------------------------------------------
const ENTIDADE_LABELS_AUDITORIA = {
  evento: 'Evento', alocacao: 'Alocação', escala: 'Escala', pessoal: 'Pessoal',
  usuario: 'Usuário', viatura: 'Viatura', missao_planejada: 'Missão Planejada',
  cartao: 'Cartão Programa', bairro: 'Bairro', config: 'Configuração'
};
const ACAO_LABELS_AUDITORIA = { criar: 'Criar', editar: 'Editar', excluir: 'Excluir' };

async function renderAuditoriaTab() {
  const tableBody = document.getElementById('table-auditoria-body');
  tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;">Carregando...</td></tr>`;

  const params = new URLSearchParams();
  const usuario = document.getElementById('aud-filtro-usuario').value.trim();
  const entidade = document.getElementById('aud-filtro-entidade').value;
  const dataInicio = document.getElementById('aud-filtro-data-inicio').value;
  const dataFim = document.getElementById('aud-filtro-data-fim').value;
  if (usuario) params.set('usuario', usuario);
  if (entidade) params.set('entidade', entidade);
  if (dataInicio) params.set('data_inicio', dataInicio);
  if (dataFim) params.set('data_fim', dataFim);

  try {
    const res = await apiFetch(`${API_BASE_URL}/api/auditoria?${params.toString()}`);
    const registros = await res.json();

    if (!res.ok) {
      tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--danger);padding:24px;">${esc(registros.error) || 'Falha ao carregar a auditoria.'}</td></tr>`;
      return;
    }

    if (registros.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;">Nenhum registro encontrado.</td></tr>`;
      return;
    }

    tableBody.innerHTML = registros.map(r => `
      <tr>
        <td>${esc(new Date(r.criado_em).toLocaleString('pt-BR'))}</td>
        <td>${esc(r.usuario)}</td>
        <td><span class="badge acao-${esc(r.acao)}">${esc(ACAO_LABELS_AUDITORIA[r.acao] || r.acao)}</span></td>
        <td>${esc(ENTIDADE_LABELS_AUDITORIA[r.entidade] || r.entidade)}</td>
        <td>${esc(r.descricao_resumida) || '-'}</td>
      </tr>
    `).join('');

    lucide.createIcons();
  } catch (error) {
    console.error('Erro ao carregar auditoria:', error);
    tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--danger);padding:24px;">Falha ao carregar a auditoria.</td></tr>`;
  }
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
