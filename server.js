const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
// Motor de recorrência: módulo puro, sem I/O, para ser testável isoladamente
// (`npm test`). Ver lib/recorrencia.js.
const { LIMITES: LIMITES_RECORRENCIA, validarRegraRecorrencia } = require('./lib/recorrencia');
// Regras puras do domínio (Fase 7). Vivem em lib/ para poderem ser testadas sem
// subir o Express e o cliente Supabase — ver test/dominio.test.js.
const {
  validarCampos,
  proximoDiaISO,
  formatarDataBr,
  dentroDaJanelaExclusaoAdjunto,
  diariaDaOperacao,
  ordenarPorTurno,
  chaveMilitar,
} = require('./lib/dominio');

// Camada de dados e constantes de domínio (Fase 8). O `supabase` e os helpers
// readDB/readTabela/writeRow/... moraram aqui dentro até 2026-08; a divisão é
// verificável por `npm run lint` (no-undef pega helper não importado) e por
// `node scripts/listar-rotas.js`, que compara o roteamento antes/depois.
const {
  supabase,
  CATEGORIAS_PESSOAL, CATEGORIAS_VIATURA, COMPANHIAS_VALIDAS, COMPANHIAS_VIATURA,
  POSTOS_GRADUACAO, STATUS_VIATURA, SUBUNIDADES_PESSOAL,
  asyncRoute, buscarCartaoPorId, buscarCartoesFiltrados, buscarConfig,
  buscarPadraoAtivo, buscarRow, buscarSessaoPorToken, buscarUsuarioPorLogin,
  deleteRow, deleteRowSeVersao, deleteRows, generateId, getLocalDateStrServer, indexarPor,
  normalizarTextoServer, readDB, readTabela, readTabelaIn, writeDB, writeRow, writeRowSeVersao, writeRows,
} = require('./lib/dados');
const { limparAuditoriaExpirada, registrarAuditoria } = require('./lib/auditoria');
const criarRouterAlocacoes = require('./routes/alocacoes');
const criarRouterAdministracao = require('./routes/administracao');
const { criarRouterAutenticacaoProtegida, criarRouterAutenticacaoPublica } = require('./routes/autenticacao');
const { criarRouterAvisos, MAX_AVISOS_POR_CARTAO } = require('./routes/avisos');
const criarRouterBairros = require('./routes/bairros');
const criarRouterCartoes = require('./routes/cartoes');
const criarRouterConfig = require('./routes/config');
const criarRouterEscalas = require('./routes/escalas');
const criarRouterEventos = require('./routes/eventos');
const criarRouterOperacoes = require('./routes/operacoes');
const criarRouterPessoal = require('./routes/pessoal');
const criarRouterRelatorios = require('./routes/relatorios');
const { criarRouterUsuarios, usuarioPublico } = require('./routes/usuarios');
const criarRouterViaturas = require('./routes/viaturas');
const criarRouterAuditoria = require('./routes/auditoria');
const criarRouterTiposEvento = require('./routes/tipos-evento');
const { criarRouterGruposModelo } = require('./routes/grupos-modelo');

const app = express();
// Na Vercel (e atrás de qualquer proxy reverso) o IP real do cliente chega em X-Forwarded-For;
// sem trust proxy, req.ip vira o IP do proxy e o rate limit de login por IP colapsa num único
// bucket compartilhado por todos os clientes (além de o express-rate-limit v8 acusar erro de
// validação do X-Forwarded-For). `1` = confia em um único hop de proxy (o da Vercel).
// Obs.: o bloqueio progressivo por usuário é estado EM MEMÓRIA e zera a cada cold start da
// função serverless — limitação conhecida e aceita nesta fase; estado externo (ex: Redis)
// fica para uma fase futura e NÃO deve ser introduzido agora.
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;


// -------------------------------------------------------------
// SEGURANÇA: CORS restrito, CSP (helmet) e rate limiting no login
// -------------------------------------------------------------

// Allowlist de origens: produção fixa + qualquer preview do projeto na Vercel + localhost de desenvolvimento
const ORIGENS_PERMITIDAS = [
  'https://sgo-5bpm.vercel.app',
  'http://localhost:3005',
  'http://localhost:5173' // Vite dev server do /client (migração React, Fase 2) — só dev local
];
function origemPermitida(origin) {
  if (!origin) return true; // requisições sem Origin (ex: curl, apps nativos) — não é o caso de browsers
  if (ORIGENS_PERMITIDAS.includes(origin)) return true;
  // Deploys de preview da Vercel para este projeto: sgo-5bpm-<hash>-alexandre-alves.vercel.app
  return /^https:\/\/sgo-5bpm-[a-z0-9]+-alexandre-alves\.vercel\.app$/.test(origin);
}
app.use(cors({
  origin(origin, callback) {
    // Nega SEM lançar: lançar aqui virava um 500 do handler de erro do Express
    // com stack trace no corpo — expunha caminhos do servidor a quem justamente
    // veio de origem não autorizada. Negando, a resposta simplesmente sai sem os
    // cabeçalhos CORS e o navegador a bloqueia, que é o comportamento correto.
    // Quem não é navegador (curl) ignora CORS de qualquer forma; para esses, a
    // barreira é a checagem de origem em `autenticar` e o token.
    callback(null, origemPermitida(origin));
  },
  // Necessário para o cookie de sessão viajar no fetch do frontend, que roda em
  // origem diferente da API no desenvolvimento (5173 -> 3005). Só vale porque a
  // allowlist acima é fechada: `credentials` com origem `*` é proibido e o
  // navegador recusaria a resposta.
  credentials: true
}));

// CSP liberando só os CDNs que o index.html realmente usa
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      // Leaflet posiciona tiles, panes e marcadores por atributos style gerados
      // em runtime. A aplicação React não usa mais style inline; esta exceção é
      // isolada em atributos para não liberar <style> nem folhas inline.
      styleSrcAttr: ["'unsafe-inline'"],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https://*.basemaps.cartocdn.com', 'https://basemaps.cartocdn.com'],
      connectSrc: ["'self'", 'https://*.supabase.co', 'https://*.basemaps.cartocdn.com', 'https://basemaps.cartocdn.com'],
    }
  }
}));

// Rate limit por IP: no máximo 5 tentativas de login a cada 15 minutos
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Tente novamente em alguns minutos.' }
});

// Bloqueio progressivo por usuário (complementa o rate limit por IP — protege contra tentativas
// vindas de IPs diferentes contra o mesmo login).
//
// PERSISTIDO NO POSTGRES desde a Fase 4 (migration 008): o estado morava num Map
// em memória, e cada cold start da função serverless zerava o contador — bastava
// esperar o processo reciclar para ganhar tentativas de novo. O Map continua
// existindo como REDE: se a tabela ainda não foi criada, ou se o banco falhar na
// hora do login, o comportamento antigo assume em vez de derrubar o acesso.
const tentativasLoginPorUsuario = new Map();

const chaveLogin = (usuario) => String(usuario || '').toLowerCase().trim();

/** Espera em segundos, ou null se pode tentar. Dobra a cada falha a partir da 3ª. */
function esperaDe(falhas, ultimaFalha) {
  if (!falhas || falhas < 3) return null;
  const esperaMs = Math.pow(2, falhas - 2) * 1000;
  const restanteMs = (ultimaFalha + esperaMs) - Date.now();
  return restanteMs > 0 ? Math.ceil(restanteMs / 1000) : null;
}

async function verificarBloqueioProgressivo(usuario) {
  const chave = chaveLogin(usuario);
  try {
    const { data, error } = await supabase
      .from('tentativas_login').select('falhas, ultima_falha').eq('usuario', chave).maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return esperaDe(data.falhas, Number(data.ultima_falha));
    return null;
  } catch (err) {
    // Fail-open deliberado: com o banco fora, bloquear todo mundo seria pior que
    // perder o contador. O rate limit por IP continua de pé nesse cenário.
    console.error('Bloqueio progressivo indisponível, usando memória:', err.message);
    const registro = tentativasLoginPorUsuario.get(chave);
    return registro ? esperaDe(registro.falhas, registro.ultimaFalha) : null;
  }
}

async function registrarFalhaLogin(usuario) {
  const chave = chaveLogin(usuario);
  const registro = tentativasLoginPorUsuario.get(chave) || { falhas: 0, ultimaFalha: 0 };
  registro.falhas += 1;
  registro.ultimaFalha = Date.now();
  tentativasLoginPorUsuario.set(chave, registro);
  try {
    // Incremento atômico no banco: dois SELECT+UPDATE concorrentes registrariam
    // uma falha só e o bloqueio demoraria mais a fechar.
    const { error } = await supabase.rpc('registrar_falha_login', { p_usuario: chave });
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error('Falha ao registrar tentativa de login no banco:', err.message);
  }
}

async function limparFalhasLogin(usuario) {
  const chave = chaveLogin(usuario);
  tentativasLoginPorUsuario.delete(chave);
  try {
    const { error } = await supabase.from('tentativas_login').delete().eq('usuario', chave);
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error('Falha ao limpar tentativas de login:', err.message);
  }
}

app.use(compression());
app.use(express.json());

// -------------------------------------------------------------
// CAMADA DE DADOS (SUPABASE) — substitui o antigo readDB()/writeDB() de arquivo JSON
// -------------------------------------------------------------
// Estratégia deliberada: readDB() busca cada tabela inteira e monta o mesmo objeto
// { eventos, alocacoes, ... } que todo o resto do código já espera; writeDB() faz
// upsert de tudo que está em memória e apaga do banco o que não está mais no array
// (replicando "sobrescrever o arquivo inteiro"). Isso preserva a lógica de negócio já
// escrita (filter/map/reduce em JS) sem reescrever cada rota em SQL/query builder.
// Tradeoff aceito: mais round-trips por escrita do que uma query já otimizada faria —
// adequado ao volume de uma seção de planejamento de batalhão, não para alta
// concorrência. `autenticar` e `/api/login`, que rodam a cada requisição, usam
// consultas pontuais em vez desse shim, por serem o caminho mais quente.

// -------------------------------------------------------------
// SEGURANÇA: HASH DE SENHAS (scrypt) E SESSÕES COM EXPIRAÇÃO
// -------------------------------------------------------------
const SESSAO_DURACAO_MS = 12 * 60 * 60 * 1000; // 12 horas

// -------------------------------------------------------------
// SESSÃO EM COOKIE HttpOnly (Fase 4 — S2)
// -------------------------------------------------------------
// O token saiu do localStorage, onde qualquer XSS o leria, para um cookie
// HttpOnly, invisível ao JavaScript. A transição é COMPATÍVEL: `autenticar`
// aceita o cookie OU o Bearer antigo, então quem já estava logado não é
// deslogado no deploy e o app continua funcionando enquanto os dois convivem.
//
// Sem `cookie-parser`: é um header simples de ler e o projeto evita dependência
// nova sem necessidade.
const NOME_COOKIE_SESSAO = 'sgo_sessao';

function lerCookie(req, nome) {
  const bruto = req.headers.cookie;
  if (!bruto) return null;
  for (const parte of bruto.split(';')) {
    const sep = parte.indexOf('=');
    if (sep < 0) continue;
    if (parte.slice(0, sep).trim() === nome) {
      return decodeURIComponent(parte.slice(sep + 1).trim());
    }
  }
  return null;
}

/** `Secure` só em produção: em `http://localhost` o navegador recusa cookie
 *  Secure e o login local pararia de funcionar. `SameSite=Strict` porque o app
 *  não é acessado a partir de outro site — é o que dispensa token CSRF no caso
 *  comum, junto da checagem de origem abaixo. */
function definirCookieSessao(res, token) {
  const producao = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
  const partes = [
    `${NOME_COOKIE_SESSAO}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(SESSAO_DURACAO_MS / 1000)}`
  ];
  if (producao) partes.push('Secure');
  res.append('Set-Cookie', partes.join('; '));
}

function limparCookieSessao(res) {
  const producao = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
  const partes = [`${NOME_COOKIE_SESSAO}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (producao) partes.push('Secure');
  res.append('Set-Cookie', partes.join('; '));
}

/** Token da requisição: cookie primeiro, Bearer como compatibilidade. */
function tokenDaRequisicao(req) {
  const doCookie = lerCookie(req, NOME_COOKIE_SESSAO);
  if (doCookie) return doCookie;
  const auth = req.headers.authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

function hashSenha(senha) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(senha), salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verificarSenha(senha, armazenada) {
  const valor = String(armazenada || '');
  if (!valor.startsWith('scrypt:')) {
    // Formato legado (texto puro) — aceito apenas até a migração automática
    return String(senha) === valor;
  }
  const [, salt, hashArmazenado] = valor.split(':');
  const hash = crypto.scryptSync(String(senha), salt, 64).toString('hex');
  const bufA = Buffer.from(hash, 'hex');
  const bufB = Buffer.from(hashArmazenado, 'hex');
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

// -------------------------------------------------------------
// INICIALIZAÇÃO: semeia o usuário administrador e o cadastro de bairros na primeira
// vez que o app roda contra um Supabase vazio (schema já criado via supabase/schema.sql)
// -------------------------------------------------------------
(async function inicializar() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;

  try {
    const { data: usuarios, error: erroUsuarios } = await supabase.from('usuarios').select('usuario');
    if (erroUsuarios) throw erroUsuarios;
    if (!usuarios || usuarios.length === 0) {
      // Só num banco vazio (primeiro boot). Senha aleatória forte gerada aqui e exibida UMA
      // única vez neste log — não fica hardcoded no código. Anote-a e troque no primeiro login.
      const senhaInicial = crypto.randomBytes(12).toString('base64url'); // ~16 chars, URL-safe
      await supabase.from('usuarios').insert({
        usuario: 'p3',
         senha: hashSenha(senhaInicial),
         role: 'P3',
         nome: 'Planejamento (P3 / 5º BPM)',
         exigir_troca_senha: true,
         ativo: true,
       });
      console.log(`Usuário administrador padrão criado: login "p3", senha inicial "${senhaInicial}" — anote agora (não será exibida de novo) e troque no primeiro acesso.`);
    }

    const { data: bairros, error: erroBairros } = await supabase.from('bairros_coordenadas').select('id');
    if (erroBairros) throw erroBairros;
    if (!bairros || bairros.length === 0) {
      await supabase.from('bairros_coordenadas').insert([
        { id: generateId('bco'), nome_bairro: 'Ponta Negra', latitude: -5.8836, longitude: -35.1633 },
        { id: generateId('bco'), nome_bairro: 'Capim Macio', latitude: -5.8580, longitude: -35.2050 },
        { id: generateId('bco'), nome_bairro: 'Candelária', latitude: -5.8390, longitude: -35.2130 },
        { id: generateId('bco'), nome_bairro: 'Neópolis', latitude: -5.8480, longitude: -35.2200 },
        { id: generateId('bco'), nome_bairro: 'Pitimbu', latitude: -5.8650, longitude: -35.2380 },
        { id: generateId('bco'), nome_bairro: 'Lagoa Nova', latitude: -5.8230, longitude: -35.2100 },
        { id: generateId('bco'), nome_bairro: 'Nova Descoberta', latitude: -5.8080, longitude: -35.2250 }
      ]);
      console.log('Coordenadas de bairros (Zona Sul de Natal) semeadas no Supabase.');
    }

    // O cadastro de Tipos de Evento nasce dos valores já usados nos eventos,
    // sem impor uma lista fixa no código. Falhas aqui não impedem o boot em
    // bancos que ainda não aplicaram a migration 013.
    try {
      const { data: tiposAtuais, error: erroTipos } = await supabase.from('tipos_evento').select('id,nome');
      if (erroTipos) throw erroTipos;
      const { data: eventosExistentes, error: erroEventos } = await supabase.from('eventos').select('tipo_evento');
      if (erroEventos) throw erroEventos;
      const normalizar = (texto) => String(texto || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
      const conhecidos = new Set((tiposAtuais || []).map((tipo) => normalizar(tipo.nome)));
      const novosTipos = [];
      for (const registro of eventosExistentes || []) {
        const nome = String(registro.tipo_evento || '').replace(/\s+/g, ' ').trim();
        if (!nome || conhecidos.has(normalizar(nome))) continue;
        conhecidos.add(normalizar(nome));
        novosTipos.push({ id: generateId('tev'), nome, descricao: '', ativo: true, criado_por: 'sistema', criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() });
      }
      if (novosTipos.length > 0) await supabase.from('tipos_evento').insert(novosTipos);
    } catch (erroTipos) {
      console.warn('Cadastro de Tipos de Evento ainda não disponível:', erroTipos.message);
    }

    try {
      await limparAuditoriaExpirada(supabase);
    } catch (erroAuditoria) {
      console.warn('Limpeza do histórico de atividades indisponível:', erroAuditoria.message);
    }

    // Limpa sessões expiradas de qualquer usuário — antes só as do próprio usuário eram
    // removidas, e só no momento do login dele; sessões velhas de outras contas ficavam para sempre.
    await supabase.from('sessoes').delete().lt('expira', Date.now());
  } catch (err) {
    console.error('Falha na inicialização (seed) do Supabase:', err.message);
  }
})();

// Middleware: exige token de sessão válido em todas as rotas da API (exceto login)
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

async function autenticar(req, res, next) {
  const token = tokenDaRequisicao(req);

  if (!token) {
    return res.status(401).json({ error: 'Não autenticado. Faça login para acessar o sistema.' });
  }

  // CSRF: cookie viaja sozinho, então uma escrita disparada por outro site
  // chegaria autenticada. `SameSite=Strict` já impede o envio cross-site; esta é
  // a segunda camada, para o caso de um navegador antigo que ignore o atributo.
  // Só se aplica a quem se autenticou por COOKIE — o Bearer exige que o
  // JavaScript leia o token, o que outro site não consegue fazer.
  const veioDeCookie = !!lerCookie(req, NOME_COOKIE_SESSAO);
  if (veioDeCookie && !METODOS_SEGUROS.has(req.method)) {
    const origem = req.headers.origin;
    // Sem Origin: cliente não-navegador (curl, app nativo), que não sofre CSRF.
    // Mantém o mesmo critério já adotado em `origemPermitida`.
    if (origem && !origemPermitida(origem)) {
      return res.status(403).json({ error: 'Origem não autorizada para esta operação.' });
    }
  }

  try {
    const sessao = await buscarSessaoPorToken(token);
    if (!sessao || sessao.expira <= Date.now()) {
      return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }
    req.user = {
      usuario: sessao.usuario,
      role: sessao.role,
      nome: sessao.nome,
      exigir_troca_senha: !!sessao.exigir_troca_senha,
    };
    next();
  } catch (err) {
    console.error('Erro ao autenticar:', err.message);
    res.status(500).json({ error: 'Falha ao verificar sessão.' });
  }
}

// Middleware: restringe a ação ao perfil administrativo P3
function exigirP3(req, res, next) {
  if (!req.user || req.user.role !== 'P3') {
    return res.status(403).json({ error: 'Apenas o perfil P3 tem permissão para esta ação.' });
  }
  next();
}

// A troca imposta pela P3 é uma restrição de servidor, não apenas um modal. As
// únicas rotas registradas antes deste middleware são logout e alterar-senha;
// assim, editar o localStorage ou chamar a API diretamente não libera o restante
// do sistema enquanto a credencial temporária não for substituída.
function exigirSenhaAtualizada(req, res, next) {
  if (req.user?.exigir_troca_senha) {
    return res.status(403).json({
      code: 'TROCA_SENHA_OBRIGATORIA',
      error: 'Cadastre uma nova senha para continuar usando o sistema.',
    });
  }
  next();
}

// Cartão Programa é a única tela que Adjunto edita (Oficial só lê) — diferente de
// exigirP3, que bloquearia o Adjunto também e quebraria a edição diária dele.
// Cartões com is_template=true exigem uma checagem adicional, feita dentro de
// cada handler depois de carregar o cartão (aqui ainda não se sabe qual é).
function exigirEdicaoCartao(req, res, next) {
  if (!req.user || req.user.role === 'Oficial') {
    return res.status(403).json({ error: 'Seu perfil não tem permissão para editar o Cartão Programa.' });
  }
  next();
}

app.use('/api', criarRouterAutenticacaoPublica({
  asyncRoute,
  buscarCartaoPorId,
  buscarSessaoPorToken,
  buscarUsuarioPorLogin,
  definirCookieSessao,
  hashSenha,
  lerCookie,
  limparFalhasLogin,
  loginRateLimiter,
  NOME_COOKIE_SESSAO,
  rateLimit,
  registrarFalhaLogin,
  SESSAO_DURACAO_MS,
  supabase,
  verificarBloqueioProgressivo,
  verificarSenha,
  registrarAuditoria: (dados) => registrarAuditoria({ supabase, generateId, ...dados }),
}));

// A partir daqui, todas as rotas /api exigem sessão válida
app.use('/api', autenticar);

app.use('/api', criarRouterAutenticacaoProtegida({
  asyncRoute,
  buscarUsuarioPorLogin,
  hashSenha,
  limparCookieSessao,
  supabase,
  tokenDaRequisicao,
  verificarSenha,
  registrarAuditoria: (dados) => registrarAuditoria({ supabase, generateId, ...dados }),
}));

app.use('/api', exigirSenhaAtualizada);

app.use('/api', criarRouterAuditoria({
  asyncRoute,
  exigirP3,
  supabase,
}));

// -------------------------------------------------------------
// ROTAS DE GESTÃO DE USUÁRIOS (APENAS P3)
// -------------------------------------------------------------

app.use('/api', criarRouterUsuarios({
  asyncRoute,
  deleteRow,
  exigirP3,
  hashSenha,
  readTabela,
  supabase,
  validarCampos,
  writeRow,
  registrarAuditoria: (dados) => registrarAuditoria({ supabase, generateId, ...dados }),
}));

app.use('/api', criarRouterTiposEvento({
  asyncRoute,
  exigirP3,
  generateId,
  registrarAuditoria: (dados) => registrarAuditoria({ supabase, generateId, ...dados }),
  supabase,
  validarCampos,
}));

app.use('/api', criarRouterGruposModelo({
  asyncRoute,
  exigirP3,
  generateId,
  registrarAuditoria: (dados) => registrarAuditoria({ supabase, generateId, ...dados }),
  supabase,
}));

// -------------------------------------------------------------
// ROTAS DE CADASTRO DE PESSOAL (ADJUNTO / FISCAL / OFICIAL DE OPERAÇÕES / OFICIAL DE SOBREAVISO)
// -------------------------------------------------------------

app.use('/api', criarRouterPessoal({
  CATEGORIAS_PESSOAL,
  POSTOS_GRADUACAO,
  SUBUNIDADES_PESSOAL,
  asyncRoute,
  deleteRow,
  exigirP3,
  generateId,
  readTabela,
  supabase,
  validarCampos,
  writeRow,
}));

// -------------------------------------------------------------
// ROTAS DE EVENTOS
// -------------------------------------------------------------
app.use('/api', criarRouterEventos({
  asyncRoute,
  buscarRow,
  deleteRow,
  exigirP3,
  generateId,
  readTabela,
  supabase,
  validarCampos,
  writeRow,
  registrarAuditoria: (dados) => registrarAuditoria({ supabase, generateId, ...dados }),
}));


app.use('/api', criarRouterOperacoes({
  LIMITES_RECORRENCIA,
  asyncRoute,
  buscarRow,
  deleteRow,
  deleteRows,
  diariaDaOperacao,
  exigirP3,
  generateId,
  indexarPor,
  readTabela,
  readTabelaIn,
  supabase,
  validarCampos,
  validarRegraRecorrencia,
  writeRow,
  writeRows,
  registrarAuditoria: (dados) => registrarAuditoria({ supabase, generateId, ...dados }),
}));


// -------------------------------------------------------------
// ROTAS DE ALOCAÇÃO DE POLICIAMENTO
// -------------------------------------------------------------

app.use('/api', criarRouterAlocacoes({
  asyncRoute,
  deleteRow,
  exigirP3,
  generateId,
  readTabela,
  validarCampos,
  writeRow,
}));


app.use('/api', criarRouterEscalas({
  asyncRoute,
  buscarConfig,
  buscarRow,
  chaveMilitar,
  deleteRow,
  deleteRows,
  exigirP3,
  generateId,
  indexarPor,
  readTabela,
  readTabelaIn,
  validarCampos,
  writeRow,
  writeRows,
  registrarAuditoria: (dados) => registrarAuditoria({ supabase, generateId, ...dados }),
}));


// -------------------------------------------------------------
// ROTAS DE COORDENADAS DE BAIRROS (USADAS PELO MAPA E PELO CADASTRO DE EVENTOS)
// -------------------------------------------------------------
app.use('/api', criarRouterBairros({
  asyncRoute,
  deleteRow,
  exigirP3,
  generateId,
  normalizarTextoServer,
  readTabela,
  supabase,
  validarCampos,
  writeRow,
}));

// -------------------------------------------------------------
// ROTAS DE AVISOS OPERACIONAIS
//
// A P3 observa uma situação num bairro (ex.: aumento de roubo de motos) e
// cadastra o aviso; quando o Adjunto aloca uma viatura naquele bairro, o aviso
// aparece e pode entrar no Cartão Programa daquela viatura.
//
// Permissão: LEITURA para todos os perfis (o Adjunto precisa ver para
// selecionar; o Oficial, para saber o que foi orientado); ESCRITA só P3.
// -------------------------------------------------------------
app.use('/api', criarRouterAvisos({
  COMPANHIAS_VALIDAS,
  asyncRoute,
  buscarRow,
  deleteRow,
  exigirP3,
  generateId,
  readTabela,
  validarCampos,
  writeRow,
}));


// -------------------------------------------------------------
// ROTAS DE CADASTRO DE VIATURAS (ALIMENTA O AUTOCOMPLETE DE PREFIXO NO CARTÃO PROGRAMA —
// que continua aceitando texto livre para reservas rotativas não cadastradas aqui)
// -------------------------------------------------------------
app.use('/api', criarRouterViaturas({
  CATEGORIAS_VIATURA,
  COMPANHIAS_VIATURA,
  STATUS_VIATURA,
  asyncRoute,
  deleteRow,
  exigirP3,
  generateId,
  normalizarTextoServer,
  readTabela,
  supabase,
  validarCampos,
  writeRow,
  registrarAuditoria: (dados) => registrarAuditoria({ supabase, generateId, ...dados }),
}));

// -------------------------------------------------------------
// ROTAS DE CONFIGURAÇÃO (COTA MENSAL DE DIÁRIAS)
// -------------------------------------------------------------
app.use('/api', criarRouterConfig({
  asyncRoute,
  buscarConfig,
  exigirP3,
  readDB,
  writeDB,
}));

app.use('/api', criarRouterRelatorios({
  asyncRoute,
  buscarConfig,
  diariaDaOperacao,
  exigirP3,
  getLocalDateStrServer,
  indexarPor,
  readTabela,
}));
app.use('/api', criarRouterCartoes({
  CATEGORIAS_VIATURA,
  COMPANHIAS_VIATURA,
  MAX_AVISOS_POR_CARTAO,
  asyncRoute,
  buscarCartaoPorId,
  buscarCartoesFiltrados,
  buscarPadraoAtivo,
  deleteRowSeVersao,
  dentroDaJanelaExclusaoAdjunto,
  exigirEdicaoCartao,
  exigirP3,
  formatarDataBr,
  generateId,
  ordenarPorTurno,
  proximoDiaISO,
  readTabela,
  supabase,
  validarCampos,
  writeRow,
  writeRowSeVersao,
  registrarAuditoria: (dados) => registrarAuditoria({ supabase, generateId, ...dados }),
}));


app.use('/api', criarRouterAdministracao({
  asyncRoute,
  exigirP3,
  readDB,
  readTabela,
  supabase,
  usuarioPublico,
}));


// Inicializa e sobe o servidor — na Vercel o app roda como função serverless
// (a plataforma seta VERCEL=1), então app.listen() só é chamado localmente/no seu próprio host.
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`Servidor de Pauta de Eventos rodando em http://localhost:${PORT}`);
    console.log(`Para acesso externo, use o IP da rede local desta máquina.`);
  });
}

module.exports = app;
