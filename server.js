const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
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

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltam as variáveis de ambiente SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY. O servidor vai subir, mas toda chamada à API vai falhar até elas serem configuradas.');
}
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { persistSession: false } }
);

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
      scriptSrc: ["'self'", 'https://unpkg.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com', 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https://unpkg.com', 'https://*.basemaps.cartocdn.com', 'https://basemaps.cartocdn.com'],
      connectSrc: ["'self'", 'https://*.supabase.co', 'https://*.basemaps.cartocdn.com', 'https://basemaps.cartocdn.com', 'https://unpkg.com'],
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
const CHAVE_PRIMARIA = { usuarios: 'usuario', sessoes: 'token' };
// `operacoes` usa chave 'id' (default de chavePrimariaDe), como eventos/escalas/alocacoes — por
// isso não entra em CHAVE_PRIMARIA. `missoes_planejadas` foi migrada para `operacoes` e a tabela
// foi removida do banco (DROP), então saiu desta lista.
const TABELAS = ['usuarios', 'sessoes', 'bairros_coordenadas', 'pessoal', 'eventos', 'operacoes', 'alocacoes', 'escalas', 'cartoes', 'viaturas'];
const TABELAS_E_CONFIG = [...TABELAS, 'config'];

function chavePrimariaDe(tabela) {
  return CHAVE_PRIMARIA[tabela] || 'id';
}

async function readDB() {
  const db = {};
  // Todas as tabelas em paralelo — são leituras independentes, sem risco de condição de corrida entre elas.
  await Promise.all(TABELAS.map(async (tabela) => {
    const { data, error } = await supabase.from(tabela).select('*');
    if (error) throw new Error(`Falha ao ler "${tabela}" do Supabase: ${error.message}`);
    db[tabela] = data || [];
  }));
  const { data: configRow, error: erroConfig } = await supabase.from('config').select('cota_mensal_diarias').eq('id', 1).maybeSingle();
  if (erroConfig) throw new Error(`Falha ao ler "config" do Supabase: ${erroConfig.message}`);
  db.config = configRow || { cota_mensal_diarias: 0 };
  return db;
}

// Lê UMA tabela inteira (SELECT *), opcionalmente filtrada por igualdade (.eq) em uma ou
// mais colunas. Substitui readDB() nas rotas GET de tabela única — evita baixar as outras
// 9 tabelas à toa (é o que causa dezenas de SELECTs por request). Só para tabelas-lista;
// `config` é linha única/objeto — usar buscarConfig().
async function readTabela(tabela, filtros = {}) {
  let query = supabase.from(tabela).select('*');
  for (const [coluna, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== null && valor !== '') query = query.eq(coluna, valor);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Falha ao ler "${tabela}" do Supabase: ${error.message}`);
  return data || [];
}

// Lê UMA tabela filtrando uma coluna por LISTA de valores (SELECT * ... WHERE col IN (...)).
// Complementa readTabela, que só faz igualdade. Usado pelas rotas de lote, que operam
// sobre N operações de uma vez e não podem virar N requisições. Lista vazia devolve []
// sem ir ao banco (o PostgREST trataria `in.()` como erro de sintaxe).
async function readTabelaIn(tabela, coluna, valores) {
  if (!valores || valores.length === 0) return [];
  const { data, error } = await supabase.from(tabela).select('*').in(coluna, valores);
  if (error) throw new Error(`Falha ao ler "${tabela}" do Supabase: ${error.message}`);
  return data || [];
}

// config é linha única (objeto, não lista) — consulta pontual dedicada, mesmo SELECT que readDB faz.
async function buscarConfig() {
  const { data, error } = await supabase.from('config')
    .select('cota_mensal_diarias').eq('id', 1).maybeSingle();
  if (error) throw new Error(`Falha ao ler "config" do Supabase: ${error.message}`);
  return data || { cota_mensal_diarias: 0 };
}

// `tabelas`: lista explícita das tabelas realmente alteradas por essa escrita (evita
// sincronizar as 8 tabelas inteiras a cada POST/PUT/DELETE — é isso que fazia uma
// única escrita levar dezenas de round-trips ao Supabase). Omitir sincroniza tudo,
// usado só onde não há como saber o escopo com segurança.
async function writeDB(db, tabelas = TABELAS_E_CONFIG) {
  const tabelasArray = tabelas.filter(t => t !== 'config');
  await Promise.all(tabelasArray.map(async (tabela) => {
    const linhas = db[tabela] || [];
    const chave = chavePrimariaDe(tabela);

    if (linhas.length > 0) {
      const { error } = await supabase.from(tabela).upsert(linhas, { onConflict: chave });
      if (error) throw new Error(`Falha ao gravar "${tabela}" no Supabase: ${error.message}`);
    }

    const { data: existentes, error: erroSelect } = await supabase.from(tabela).select(chave);
    if (erroSelect) throw new Error(`Falha ao conferir "${tabela}" no Supabase: ${erroSelect.message}`);

    const idsAtuais = new Set(linhas.map(r => r[chave]));
    const idsParaApagar = (existentes || []).map(r => r[chave]).filter(id => !idsAtuais.has(id));
    if (idsParaApagar.length > 0) {
      const { error: erroDelete } = await supabase.from(tabela).delete().in(chave, idsParaApagar);
      if (erroDelete) throw new Error(`Falha ao limpar "${tabela}" no Supabase: ${erroDelete.message}`);
    }
  }));

  if (tabelas.includes('config') && db.config) {
    const { error } = await supabase.from('config').update({ cota_mensal_diarias: db.config.cota_mensal_diarias }).eq('id', 1);
    if (error) throw new Error(`Falha ao gravar "config" no Supabase: ${error.message}`);
  }
}

// Grava/exclui uma única linha, sem o upsert+diff da tabela inteira que writeDB faz.
// Usado nas tabelas de maior escrita concorrente (cartoes, escalas, eventos) para reduzir
// a janela de "lost update" entre duas requisições simultâneas na mesma tabela.
async function writeRow(tabela, row) {
  const chave = chavePrimariaDe(tabela);
  const { error } = await supabase.from(tabela).upsert(row, { onConflict: chave });
  if (error) throw new Error(`Falha ao gravar "${tabela}" no Supabase: ${error.message}`);
}

async function deleteRow(tabela, id) {
  const chave = chavePrimariaDe(tabela);
  const { error } = await supabase.from(tabela).delete().eq(chave, id);
  if (error) throw new Error(`Falha ao apagar "${tabela}" no Supabase: ${error.message}`);
}

// Versões em lote de writeRow/deleteRow: MESMA semântica, um round-trip só, para
// escritas que nascem múltiplas por natureza (criação de um grupo de recorrência).
// O que NÃO fazem, de propósito: o upsert+diff da tabela inteira do writeDB — só
// tocam as linhas passadas. Array vazio é no-op (o PostgREST recusa payload vazio).
async function writeRows(tabela, rows) {
  if (!rows || rows.length === 0) return;
  const chave = chavePrimariaDe(tabela);
  const { error } = await supabase.from(tabela).upsert(rows, { onConflict: chave });
  if (error) throw new Error(`Falha ao gravar "${tabela}" no Supabase: ${error.message}`);
}

async function deleteRows(tabela, coluna, valores) {
  if (!valores || valores.length === 0) return;
  const { error } = await supabase.from(tabela).delete().in(coluna, valores);
  if (error) throw new Error(`Falha ao apagar "${tabela}" no Supabase: ${error.message}`);
}

// Lê UMA linha por id (SELECT * ... WHERE chave = id). Para PUT/validações que só precisam
// do registro atual — evita o readDB() inteiro (11 SELECTs) só para achar uma linha. Retorna
// o objeto ou null se não existir.
async function buscarRow(tabela, id) {
  const chave = chavePrimariaDe(tabela);
  const { data, error } = await supabase.from(tabela).select('*').eq(chave, id).maybeSingle();
  if (error) throw new Error(`Falha ao ler "${tabela}" do Supabase: ${error.message}`);
  return data || null;
}

// Indexa uma lista num Map<valorDaChave, item[]>. Usado nas rotas de agregação para evitar
// varrer db.alocacoes/db.escalas inteiras dentro de um forEach de eventos/operações (O(n×m)):
// o índice é construído UMA vez e cada grupo é lido em O(1). Não altera nenhum total — só
// reorganiza a mesma soma. Chaves null/undefined (ex: alocação sem evento_id) caem num grupo
// próprio que nunca é consultado por um id real, então são inofensivas.
function indexarPor(lista, chave) {
  const mapa = new Map();
  for (const item of lista) {
    const k = item[chave];
    const grupo = mapa.get(k);
    if (grupo) grupo.push(item);
    else mapa.set(k, [item]);
  }
  return mapa;
}

// Consultas pontuais para o caminho mais quente (autenticação em toda requisição),
// evitando pagar o custo de um readDB() completo a cada chamada autenticada.
async function buscarSessaoPorToken(token) {
  const { data, error } = await supabase.from('sessoes').select('*').eq('token', token).maybeSingle();
  if (error) throw new Error(`Falha ao verificar sessão: ${error.message}`);
  return data;
}

async function buscarUsuarioPorLogin(usuario) {
  const { data, error } = await supabase.from('usuarios').select('*').ilike('usuario', usuario).maybeSingle();
  if (error) throw new Error(`Falha ao buscar usuário: ${error.message}`);
  return data;
}

// Idem para o Cartão Programa (GET /api/cartoes/:id é chamado o tempo todo pela tela) —
// evita ler as outras 9 tabelas de TABELAS só para achar um cartão por id.
async function buscarCartaoPorId(id) {
  const { data, error } = await supabase.from('cartoes').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Falha ao buscar cartão: ${error.message}`);
  return data;
}

// O padrão ativo é a fonte de todo cartão do dia novo (POST /api/cartoes) — busca pontual
// em vez de filtrar em JS depois de trazer todos os templates.
/** Sábado e domingo. Sexta-feira NÃO entra — decisão de produto registrada:
 *  o pedido especificava sáb/dom, e incluir sexta é mudar aqui uma linha. */
function ehFimDeSemana(dataIso) {
  if (!dataIso) return false;
  // UTC pela mesma razão do motor de recorrência: a Vercel roda em UTC e a
  // máquina do batalhão em America/Fortaleza; `new Date('2026-08-08').getDay()`
  // daria o dia anterior em todo fuso a oeste de Greenwich.
  const dia = new Date(`${dataIso}T00:00:00Z`).getUTCDay();
  return dia === 0 || dia === 6;
}

function tipoPeriodoDaData(dataIso) {
  return ehFimDeSemana(dataIso) ? 'fim_de_semana' : 'semana';
}

/** Padrões ativos. Depois da migration 006 pode haver um por tipo de período;
 *  antes dela o índice global garante no máximo um. A função lida com os dois
 *  casos — por isso devolve LISTA, e não `maybeSingle()`, que passaria a estourar
 *  assim que existisse o segundo padrão ativo. */
async function buscarPadroesAtivos() {
  const { data, error } = await supabase
    .from('cartoes')
    .select('*')
    .eq('is_template', true)
    .eq('padrao_ativo', true);
  if (error) throw new Error(`Falha ao buscar cartão padrão: ${error.message}`);
  return data || [];
}

/** O padrão que deve originar o cartão de uma data. Com `data` ausente ou sem
 *  padrão do tipo certo, cai no que houver — criar o cartão com o padrão do
 *  outro período é melhor que travar o Adjunto às 07h de um domingo. */
async function buscarPadraoAtivo(dataCartao = null) {
  const padroes = await buscarPadroesAtivos();
  if (padroes.length === 0) return null;
  if (!dataCartao) return padroes[0];
  const tipo = tipoPeriodoDaData(dataCartao);
  return padroes.find(p => p.tipo_periodo === tipo) || padroes[0];
}

async function buscarCartoesFiltrados({ data: dataFiltro, ano, mes }) {
  // `data` é coluna `date` no Postgres — LIKE não se aplica (operador de texto), usa faixa
  // (gte/lt) em vez de prefixo. Exceção: filtro só por mês (sem ano, todo histórico) não dá
  // pra expressar como faixa contígua — busca só a tabela cartoes (ainda bem mais barato que
  // readDB() inteiro) e filtra o mês em JS, igual à lógica original.
  if (!dataFiltro && !ano && mes) {
    const { data, error } = await supabase.from('cartoes').select('*').eq('is_template', false);
    if (error) throw new Error(`Falha ao listar cartões: ${error.message}`);
    return (data || []).filter(c => c.data && c.data.split('-')[1] === mes);
  }

  let query = supabase.from('cartoes').select('*').eq('is_template', false);
  if (dataFiltro) {
    query = query.eq('data', dataFiltro);
  } else if (ano && mes) {
    const inicio = `${ano}-${mes}-01`;
    const proximoMes = mes === '12' ? `${Number(ano) + 1}-01-01` : `${ano}-${String(Number(mes) + 1).padStart(2, '0')}-01`;
    query = query.gte('data', inicio).lt('data', proximoMes);
  } else if (ano) {
    query = query.gte('data', `${ano}-01-01`).lt('data', `${Number(ano) + 1}-01-01`);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Falha ao listar cartões: ${error.message}`);
  return data || [];
}

// Envolve um handler assíncrono e converte qualquer erro (inclusive falha de conexão
// com o Supabase) em 500, sem precisar repetir try/catch em cada rota.
function asyncRoute(handler) {
  return (req, res) => {
    Promise.resolve(handler(req, res)).catch(err => {
      console.error('Erro na rota:', err.message);
      res.status(500).json({ error: 'Falha ao acessar o banco de dados. Tente novamente em instantes.' });
    });
  };
}

// Generates a unique short ID
function generateId(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
}


// Normaliza texto para comparação (minúsculas, sem acentos) — usado para evitar bairros duplicados por grafia
function normalizarTextoServer(texto) {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

// Data local do servidor no formato YYYY-MM-DD
function getLocalDateStrServer(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Categorias válidas para viaturas do Cartão Programa
const CATEGORIAS_VIATURA = ['Ordinária', 'Força Tática', 'Suplementar'];

// DUAS listas de propósito, não é duplicação a consolidar:
// - COMPANHIAS_VIATURA inclui a PCS, que também emprega viatura. Nem `viaturas`
//   nem o JSONB de viaturas do cartão têm CHECK no banco, então basta validar aqui.
// - COMPANHIAS_VALIDAS (sem PCS) é a de `avisos`, onde o banco TEM o CHECK
//   `avisos_companhia_check` restrito às três companhias. Incluir PCS aqui faria o
//   Postgres recusar a linha depois de a validação do app ter passado.
//   Estender o alcance da PMRN aos alertas exige migration antes.
const COMPANHIAS_VIATURA = ['PCS', '1ª Companhia', '2ª Companhia', '3ª Companhia'];
const COMPANHIAS_VALIDAS = ['1ª Companhia', '2ª Companhia', '3ª Companhia'];
const STATUS_VIATURA = ['Ativa', 'Manutenção'];

// Hierarquia da PMRN: cada posto/graduação já vem classificado como Praça ou Oficial —
// usado para decidir automaticamente quando o Oficial de Sobreaviso é necessário no Cartão Programa
const POSTOS_GRADUACAO = [
  { posto: 'Soldado PM', tipo: 'Praça' },
  { posto: 'Cabo PM', tipo: 'Praça' },
  { posto: '3º Sargento PM', tipo: 'Praça' },
  { posto: '2º Sargento PM', tipo: 'Praça' },
  { posto: '1º Sargento PM', tipo: 'Praça' },
  { posto: 'Subtenente PM', tipo: 'Praça' },
  { posto: 'Aspirante a Oficial PM', tipo: 'Oficial' },
  { posto: '2º Tenente PM', tipo: 'Oficial' },
  { posto: '1º Tenente PM', tipo: 'Oficial' },
  { posto: 'Capitão PM', tipo: 'Oficial' },
  { posto: 'Major PM', tipo: 'Oficial' },
  { posto: 'Tenente-Coronel PM', tipo: 'Oficial' },
  { posto: 'Coronel PM', tipo: 'Oficial' }
];
const CATEGORIAS_PESSOAL = ['Adjunto', 'Fiscal de Operações', 'Oficial de Operações', 'Oficial de Sobreaviso', 'Executor'];
const SUBUNIDADES_PESSOAL = ['PCS', '1ª Companhia', '2ª Companhia', '3ª Companhia'];

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
        nome: 'Planejamento (P3 / 5º BPM)'
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
    req.user = { usuario: sessao.usuario, role: sessao.role, nome: sessao.nome };
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

// -------------------------------------------------------------
// ROTA DE AUTENTICAÇÃO (LOGIN)
// -------------------------------------------------------------
app.post('/api/login', loginRateLimiter, asyncRoute(async (req, res) => {
  const { usuario, senha } = req.body;

  if (!usuario || !senha) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
  }

  const esperaSegundos = await verificarBloqueioProgressivo(usuario);
  if (esperaSegundos) {
    return res.status(429).json({ error: `Muitas tentativas para este usuário. Tente novamente em ${esperaSegundos} segundo(s).` });
  }

  const user = await buscarUsuarioPorLogin(usuario);

  if (!user || !verificarSenha(senha, user.senha)) {
    await registrarFalhaLogin(usuario);
    return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  }

  await limparFalhasLogin(usuario);

  // Migra senha em texto puro para scrypt, se for o caso
  if (!String(user.senha).startsWith('scrypt:')) {
    const senhaHash = hashSenha(senha);
    await supabase.from('usuarios').update({ senha: senhaHash }).eq('usuario', user.usuario);
  }

  // Limpa sessões expiradas desse usuário e cria a nova (validade de 12 horas)
  await supabase.from('sessoes').delete().eq('usuario', user.usuario).lt('expira', Date.now());

  const token = crypto.randomBytes(32).toString('hex');
  const expira = Date.now() + SESSAO_DURACAO_MS;

  const { error } = await supabase.from('sessoes').insert({ token, usuario: user.usuario, role: user.role, nome: user.nome, expira });
  if (error) throw new Error(error.message);

  definirCookieSessao(res, token);

  // `token` continua no corpo durante a transição: o cliente antigo (que guarda
  // em localStorage e manda Bearer) segue funcionando até todo mundo ter
  // recarregado a página com o build novo. Remover depois disso.
  res.json({ usuario: user.usuario, role: user.role, nome: user.nome, token, expira });
}));

// Entrega o PDF já montado pela Central de Emissão como uma resposta HTTP real.
// Alguns webviews ignoram links blob: e window.print(); um POST de formulário com
// Content-Disposition funciona como download ou abre o visualizador nativo sem
// persistir o documento operacional no servidor. O token vai no corpo (nunca na URL)
// porque formulários HTML não conseguem definir o cabeçalho Authorization.
const receberFormularioPdf = express.urlencoded({ extended: false, limit: '20mb', parameterLimit: 8 });
const entregaPdfRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Muitas solicitações de PDF. Aguarde um minuto e tente novamente.'
});

app.post('/api/cartoes/:id/arquivo-pdf', entregaPdfRateLimiter, receberFormularioPdf, asyncRoute(async (req, res) => {
  // Form submit do próprio site: com SameSite=Strict o cookie viaja, então ele é
  // a fonte preferida. O campo do corpo continua aceito para o cliente antigo.
  const token = lerCookie(req, NOME_COOKIE_SESSAO) || String(req.body.token || '');
  const sessao = token ? await buscarSessaoPorToken(token) : null;
  if (!sessao || sessao.expira <= Date.now()) {
    return res.status(401).type('text/plain').send('Sessão expirada. Faça login novamente.');
  }

  const cartao = await buscarCartaoPorId(req.params.id);
  if (!cartao || cartao.is_template) {
    return res.status(404).type('text/plain').send('Cartão Programa do dia não encontrado.');
  }

  const base64 = String(req.body.pdf_base64 || '').replace(/^data:application\/pdf;base64,/, '');
  const arquivo = Buffer.from(base64, 'base64');
  if (!base64 || arquivo.length < 5 || arquivo.subarray(0, 5).toString('ascii') !== '%PDF-') {
    return res.status(400).type('text/plain').send('Arquivo PDF inválido. Gere o documento novamente.');
  }
  if (arquivo.length > 15 * 1024 * 1024) {
    return res.status(413).type('text/plain').send('O PDF ultrapassou o limite de 15 MB.');
  }

  const nomeRecebido = String(req.body.nome_arquivo || 'cartao-programa.pdf');
  const nomeSeguro = nomeRecebido.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 160) || 'cartao-programa.pdf';
  const nomeArquivo = nomeSeguro.toLowerCase().endsWith('.pdf') ? nomeSeguro : `${nomeSeguro}.pdf`;
  const disposicao = req.body.disposicao === 'inline' ? 'inline' : 'attachment';

  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `${disposicao}; filename="${nomeArquivo}"`,
    'Cache-Control': 'private, no-store, max-age=0',
    'Content-Length': String(arquivo.length)
  });
  res.send(arquivo);
}));

// A partir daqui, todas as rotas /api exigem sessão válida
app.use('/api', autenticar);

// Encerrar sessão (invalida o token no servidor)
app.post('/api/logout', asyncRoute(async (req, res) => {
  // Pega do cookie OU do Bearer: durante a transição a sessão pode ter vindo de
  // qualquer um dos dois, e sair pela metade deixaria a linha viva em `sessoes`.
  const token = tokenDaRequisicao(req);
  if (token) await supabase.from('sessoes').delete().eq('token', token);
  limparCookieSessao(res);
  res.json({ message: 'Sessão encerrada.' });
}));

// Alterar a própria senha
app.post('/api/alterar-senha', asyncRoute(async (req, res) => {
  const { senha_atual, senha_nova } = req.body;

  if (!senha_atual || !senha_nova) {
    return res.status(400).json({ error: 'Informe a senha atual e a nova senha.' });
  }
  if (String(senha_nova).length < 8) {
    return res.status(400).json({ error: 'A nova senha deve ter pelo menos 8 caracteres.' });
  }

  const user = await buscarUsuarioPorLogin(req.user.usuario);
  if (!user || !verificarSenha(senha_atual, user.senha)) {
    return res.status(401).json({ error: 'Senha atual incorreta.' });
  }

  const { error } = await supabase.from('usuarios').update({ senha: hashSenha(senha_nova) }).eq('usuario', user.usuario);
  if (error) throw new Error(error.message);
  res.json({ message: 'Senha alterada com sucesso.' });
}));

// -------------------------------------------------------------
// ROTAS DE GESTÃO DE USUÁRIOS (APENAS P3)
// -------------------------------------------------------------

// Remove o campo de senha antes de devolver ao cliente
function usuarioPublico(u) {
  return { usuario: u.usuario, nome: u.nome, role: u.role };
}

// Listar usuários (sem senha)
app.get('/api/usuarios', exigirP3, asyncRoute(async (req, res) => {
  const usuarios = await readTabela('usuarios');
  res.json(usuarios.map(usuarioPublico));
}));

// Criar novo usuário
app.post('/api/usuarios', exigirP3, asyncRoute(async (req, res) => {
  const v = validarCampos(req.body, {
    usuario: { obrigatorio: true, tipo: 'string', max: 60, label: 'Usuário' },
    nome: { obrigatorio: true, tipo: 'string', max: 150, label: 'Nome de Exibição' },
    role: { obrigatorio: true, tipo: 'string', valores: ['P3', 'Adjunto', 'Oficial'], label: 'Perfil' }
  });
  if (!v.ok) return res.status(400).json({ error: v.erro });
  // Senha não passa por validarCampos: não deve ser trimada (espaços podem ser intencionais)
  // e a regra é comprimento mínimo, não máximo.
  const senha = req.body.senha;
  if (!senha || String(senha).length < 8) {
    return res.status(400).json({ error: 'A senha deve ter pelo menos 8 caracteres.' });
  }

  const usuarios = await readTabela('usuarios');
  if (usuarios.some(u => u.usuario.toLowerCase() === v.valores.usuario.toLowerCase())) {
    return res.status(409).json({ error: 'Já existe um usuário com esse login.' });
  }

  const novoUsuario = { usuario: v.valores.usuario, senha: hashSenha(senha), nome: v.valores.nome, role: v.valores.role };
  await writeRow('usuarios', novoUsuario);
  res.status(201).json(usuarioPublico(novoUsuario));
}));

// Atualizar nome e/ou perfil de um usuário
app.put('/api/usuarios/:usuario', exigirP3, asyncRoute(async (req, res) => {
  const usuarios = await readTabela('usuarios');
  const alvo = usuarios.find(u => u.usuario === req.params.usuario);

  if (!alvo) return res.status(404).json({ error: 'Usuário não encontrado.' });

  if (req.body.role !== undefined) {
    if (!['P3', 'Adjunto', 'Oficial'].includes(req.body.role)) {
      return res.status(400).json({ error: 'Perfil inválido.' });
    }
    // Impede remover o último administrador P3 do sistema
    const seriaUltimoP3 = alvo.role === 'P3' && req.body.role !== 'P3'
      && usuarios.filter(u => u.role === 'P3').length <= 1;
    if (seriaUltimoP3) {
      return res.status(400).json({ error: 'Não é possível rebaixar o último usuário com perfil P3.' });
    }
    alvo.role = req.body.role;
  }

  if (req.body.nome !== undefined) alvo.nome = String(req.body.nome).trim();

  await writeRow('usuarios', alvo);
  res.json(usuarioPublico(alvo));
}));

// Resetar a senha de um usuário (ação administrativa do P3, sem exigir a senha atual)
app.post('/api/usuarios/:usuario/resetar-senha', exigirP3, asyncRoute(async (req, res) => {
  const usuarios = await readTabela('usuarios');
  const alvo = usuarios.find(u => u.usuario === req.params.usuario);

  if (!alvo) return res.status(404).json({ error: 'Usuário não encontrado.' });

  const novaSenha = req.body.senha_nova;
  if (!novaSenha || String(novaSenha).length < 8) {
    return res.status(400).json({ error: 'A nova senha deve ter pelo menos 8 caracteres.' });
  }

  alvo.senha = hashSenha(novaSenha);
  await writeRow('usuarios', alvo);

  // Encerra todas as sessões ativas desse usuário por segurança (delete pontual por usuario,
  // igual ao delete de alocações órfãs por evento_id — não precisa ler a tabela sessoes inteira).
  const { error: erroSessoes } = await supabase.from('sessoes').delete().eq('usuario', alvo.usuario);
  if (erroSessoes) throw new Error(`Falha ao encerrar sessões no Supabase: ${erroSessoes.message}`);

  res.json({ message: `Senha de ${alvo.usuario} redefinida com sucesso.` });
}));

// Excluir usuário
app.delete('/api/usuarios/:usuario', exigirP3, asyncRoute(async (req, res) => {
  const usuarios = await readTabela('usuarios');
  const alvo = usuarios.find(u => u.usuario === req.params.usuario);

  if (!alvo) return res.status(404).json({ error: 'Usuário não encontrado.' });
  if (alvo.usuario === req.user.usuario) {
    return res.status(400).json({ error: 'Você não pode excluir o seu próprio usuário.' });
  }
  if (alvo.role === 'P3' && usuarios.filter(u => u.role === 'P3').length <= 1) {
    return res.status(400).json({ error: 'Não é possível excluir o último usuário com perfil P3.' });
  }

  await deleteRow('usuarios', alvo.usuario);
  // Encerra as sessões do usuário excluído (delete pontual por usuario, sem ler sessoes inteira).
  const { error: erroSessoes } = await supabase.from('sessoes').delete().eq('usuario', alvo.usuario);
  if (erroSessoes) throw new Error(`Falha ao encerrar sessões no Supabase: ${erroSessoes.message}`);
  res.json({ message: 'Usuário excluído.' });
}));

// -------------------------------------------------------------
// ROTAS DE CADASTRO DE PESSOAL (ADJUNTO / FISCAL / OFICIAL DE OPERAÇÕES / OFICIAL DE SOBREAVISO)
// -------------------------------------------------------------

// Listar (todos os perfis podem ler, para alimentar os seletores do Cartão Programa); filtro opcional por categoria
app.get('/api/pessoal', asyncRoute(async (req, res) => {
  let pessoal = await readTabela('pessoal');
  // filtro por categoria continua em JS: categorias é array (containment), não igualdade simples
  if (req.query.categoria) {
    pessoal = pessoal.filter(p => (p.categorias || []).includes(req.query.categoria));
  }
  res.json(pessoal.sort((a, b) => a.nome.localeCompare(b.nome)));
}));

// Criar novo cadastro de pessoal (P3)
app.post('/api/pessoal', exigirP3, asyncRoute(async (req, res) => {
  const v = validarCampos(req.body, {
    nome: { obrigatorio: true, tipo: 'string', max: 150, label: 'Nome' },
    posto_graduacao: { obrigatorio: true, tipo: 'string', max: 50, label: 'Posto/Graduação' }
  });
  if (!v.ok) return res.status(400).json({ error: v.erro });

  const { nome, posto_graduacao } = v.valores;
  const { categorias, matricula, subunidade } = req.body;
  const postoInfo = POSTOS_GRADUACAO.find(p => p.posto === posto_graduacao);
  if (!postoInfo) {
    return res.status(400).json({ error: 'Posto/graduação inválido.' });
  }
  // Categorias são opcionais: uma pessoa pode existir só como efetivo geral (ex: importação em massa
  // do relatório de efetivo do SGEPM), sem papel definido ainda no Cartão Programa.
  const categoriasValidas = Array.isArray(categorias) ? categorias.filter(c => CATEGORIAS_PESSOAL.includes(c)) : [];

  const novaPessoa = {
    id: generateId('pes'),
    nome: String(nome).trim(),
    posto_graduacao,
    tipo: postoInfo.tipo,
    categorias: categoriasValidas,
    ativo: true,
    matricula: matricula ? String(matricula).trim().slice(0, 30) : '',
    subunidade: SUBUNIDADES_PESSOAL.includes(subunidade) ? subunidade : ''
  };
  await writeRow('pessoal', novaPessoa);
  res.status(201).json(novaPessoa);
}));

// Atualizar cadastro de pessoal (P3)
app.put('/api/pessoal/:id', exigirP3, asyncRoute(async (req, res) => {
  const { data: pessoa, error: erroBusca } = await supabase.from('pessoal').select('*').eq('id', req.params.id).maybeSingle();
  if (erroBusca) throw new Error(`Falha ao ler "pessoal" do Supabase: ${erroBusca.message}`);
  if (!pessoa) return res.status(404).json({ error: 'Cadastro não encontrado.' });

  if (req.body.nome !== undefined) pessoa.nome = String(req.body.nome).trim();
  if (req.body.posto_graduacao !== undefined) {
    const postoInfo = POSTOS_GRADUACAO.find(p => p.posto === req.body.posto_graduacao);
    if (!postoInfo) return res.status(400).json({ error: 'Posto/graduação inválido.' });
    pessoa.posto_graduacao = req.body.posto_graduacao;
    pessoa.tipo = postoInfo.tipo;
  }
  if (req.body.categorias !== undefined) {
    const categoriasValidas = Array.isArray(req.body.categorias) ? req.body.categorias.filter(c => CATEGORIAS_PESSOAL.includes(c)) : [];
    pessoa.categorias = categoriasValidas;
  }
  if (req.body.matricula !== undefined) pessoa.matricula = String(req.body.matricula).trim().slice(0, 30);
  if (req.body.subunidade !== undefined) pessoa.subunidade = SUBUNIDADES_PESSOAL.includes(req.body.subunidade) ? req.body.subunidade : '';
  if (req.body.ativo !== undefined) pessoa.ativo = !!req.body.ativo;

  await writeRow('pessoal', pessoa);
  res.json(pessoa);
}));

// Excluir cadastro de pessoal (P3)
app.delete('/api/pessoal/:id', exigirP3, asyncRoute(async (req, res) => {
  const { data: pessoa, error: erroBusca } = await supabase.from('pessoal').select('id').eq('id', req.params.id).maybeSingle();
  if (erroBusca) throw new Error(`Falha ao ler "pessoal" do Supabase: ${erroBusca.message}`);
  if (!pessoa) return res.status(404).json({ error: 'Cadastro não encontrado.' });
  await deleteRow('pessoal', req.params.id);
  res.json({ message: 'Cadastro excluído.' });
}));

// -------------------------------------------------------------
// ROTAS DE EVENTOS
// -------------------------------------------------------------
// Lista fechada de tipos de evento — espelha os <option> dos selects #tipo_evento /
// #edit-tipo_evento do index.html. Aplicada só na ESCRITA (POST/PUT): impede tipo arbitrário
// (defesa em profundidade contra XSS via classe de badge no frontend) sem travar a leitura de
// eventuais dados legados com tipo fora da lista.
const TIPOS_EVENTO = ['Show', 'Futebol', 'Ato Público', 'Religioso', 'Cultural', 'Evento Junino', 'Missão Avulsa', 'Outros'];

// Listar todos os eventos
app.get('/api/eventos', asyncRoute(async (req, res) => {
  res.json(await readTabela('eventos'));
}));

// Criar novo evento
app.post('/api/eventos', exigirP3, asyncRoute(async (req, res) => {
  const v = validarCampos(req.body, {
    nome_evento: { obrigatorio: true, tipo: 'string', max: 200, label: 'Nome do Evento' },
    tipo_evento: { obrigatorio: true, tipo: 'string', max: 50, valores: TIPOS_EVENTO, label: 'Tipo de Evento' },
    local_itinerario: { obrigatorio: true, tipo: 'string', max: 300, label: 'Local/Itinerário' },
    data_inicio: { obrigatorio: true, tipo: 'string', max: 10, label: 'Data de Início' },
    data_termino: { obrigatorio: false, tipo: 'string', max: 10, label: 'Data de Término' },
    horario_inicio: { obrigatorio: false, tipo: 'string', max: 5, padrao: '', label: 'Horário de Início' },
    num_oficio: { obrigatorio: false, tipo: 'string', max: 100, padrao: '', label: 'Número do Ofício' },
    num_os_manual: { obrigatorio: false, tipo: 'string', max: 100, padrao: '', label: 'Número da OS' },
    num_sei: { obrigatorio: false, tipo: 'string', max: 100, padrao: '', label: 'Número SEI' },
    demandante: { obrigatorio: false, tipo: 'string', max: 200, padrao: 'Não Informado', label: 'Demandante' },
    bairro: { obrigatorio: false, tipo: 'string', max: 100, padrao: '', label: 'Bairro' }
  });
  if (!v.ok) return res.status(400).json({ error: v.erro });

  const novoEvento = {
    id: generateId('evt'),
    num_oficio: v.valores.num_oficio,
    num_os_manual: v.valores.num_os_manual,
    num_sei: v.valores.num_sei,
    nome_evento: v.valores.nome_evento,
    tipo_evento: v.valores.tipo_evento,
    demandante: v.valores.demandante,
    data_inicio: v.valores.data_inicio,
    data_termino: v.valores.data_termino || v.valores.data_inicio,
    horario_inicio: v.valores.horario_inicio,
    local_itinerario: v.valores.local_itinerario,
    bairro: v.valores.bairro
  };

  await writeRow('eventos', novoEvento);
  res.status(201).json(novoEvento);
}));

// Atualizar evento
app.put('/api/eventos/:id', exigirP3, asyncRoute(async (req, res) => {
  const eventoAtual = await buscarRow('eventos', req.params.id);
  if (!eventoAtual) {
    return res.status(404).json({ error: 'Evento não encontrado' });
  }

  const v = validarCampos(req.body, {
    nome_evento: { obrigatorio: false, tipo: 'string', max: 200, label: 'Nome do Evento' },
    tipo_evento: { obrigatorio: false, tipo: 'string', max: 50, valores: TIPOS_EVENTO, label: 'Tipo de Evento' },
    local_itinerario: { obrigatorio: false, tipo: 'string', max: 300, label: 'Local/Itinerário' },
    data_inicio: { obrigatorio: false, tipo: 'string', max: 10, label: 'Data de Início' },
    data_termino: { obrigatorio: false, tipo: 'string', max: 10, label: 'Data de Término' },
    horario_inicio: { obrigatorio: false, tipo: 'string', max: 5, label: 'Horário de Início' },
    num_oficio: { obrigatorio: false, tipo: 'string', max: 100, label: 'Número do Ofício' },
    num_os_manual: { obrigatorio: false, tipo: 'string', max: 100, label: 'Número da OS' },
    num_sei: { obrigatorio: false, tipo: 'string', max: 100, label: 'Número SEI' },
    demandante: { obrigatorio: false, tipo: 'string', max: 200, label: 'Demandante' },
    bairro: { obrigatorio: false, tipo: 'string', max: 100, label: 'Bairro' }
  });
  if (!v.ok) return res.status(400).json({ error: v.erro });

  const eventoAtualizado = { ...eventoAtual, ...v.valores };
  await writeRow('eventos', eventoAtualizado);
  res.json(eventoAtualizado);
}));

// Excluir evento (e alocações órfãs, apagadas diretamente por evento_id em vez de reescrever a
// tabela inteira). Evento não tem mais escala nominal vinculada — isso agora é das operações.
app.delete('/api/eventos/:id', exigirP3, asyncRoute(async (req, res) => {
  await deleteRow('eventos', req.params.id);
  const { error: erroAlocacoes } = await supabase.from('alocacoes').delete().eq('evento_id', req.params.id);
  if (erroAlocacoes) throw new Error(`Falha ao limpar "alocacoes" no Supabase: ${erroAlocacoes.message}`);
  res.json({ message: 'Evento e registros relacionados excluídos' });
}));


// -------------------------------------------------------------
// ROTAS DE OPERAÇÕES (PLANEJAMENTO -> EXECUÇÃO, COM DIÁRIA)
// -------------------------------------------------------------
// Registro ÚNICO: a operação nasce Planejada (podendo reservar cota via qtd_diarias_estimada)
// e vira Executada sem duplicar registro. As escalas nominais (diárias) penduram na operação,
// não no evento. `operacoes` e `escalas` são de alta escrita concorrente -> writeRow/deleteRow.
const TIPOS_OPERACAO = ['Ostensiva', 'Saturação', 'Cerco', 'Blitz', 'Cumprimento de Mandado', 'Reforço', 'Outras'];

app.get('/api/operacoes', exigirP3, asyncRoute(async (req, res) => {
  res.json(await readTabela('operacoes'));
}));

// Schema de criação de operação, compartilhado por POST /api/operacoes (uma) e
// POST /api/operacoes/lote (recorrência) — uma fonte de verdade só, para as duas
// portas de entrada nunca divergirem em campo obrigatório ou limite de tamanho.
const SCHEMA_OPERACAO_CRIACAO = {
  nome_operacao: { obrigatorio: true, tipo: 'string', max: 200, label: 'Nome da Operação' },
  tipo_operacao: { obrigatorio: true, tipo: 'string', max: 50, valores: TIPOS_OPERACAO, label: 'Tipo de Operação' },
  data_inicio: { obrigatorio: true, tipo: 'string', max: 10, label: 'Data de Início' },
  data_termino: { obrigatorio: false, tipo: 'string', max: 10, label: 'Data de Término' },
  horario_inicio: { obrigatorio: false, tipo: 'string', max: 5, padrao: '', label: 'Horário de Início' },
  local_itinerario: { obrigatorio: false, tipo: 'string', max: 300, padrao: '', label: 'Local/Itinerário' },
  num_oficio: { obrigatorio: false, tipo: 'string', max: 100, padrao: '', label: 'Número do Ofício' },
  num_os_manual: { obrigatorio: false, tipo: 'string', max: 100, padrao: '', label: 'Número da OS' },
  num_sei: { obrigatorio: false, tipo: 'string', max: 100, padrao: '', label: 'Número SEI' },
  demandante: { obrigatorio: false, tipo: 'string', max: 200, padrao: '', label: 'Demandante' },
  bairro: { obrigatorio: false, tipo: 'string', max: 100, padrao: '', label: 'Bairro' },
  situacao: { obrigatorio: false, tipo: 'string', valores: ['Planejada', 'Executada'], padrao: 'Planejada', label: 'Situação' },
  tipo_recorrencia: { obrigatorio: false, tipo: 'string', valores: ['diaria', 'fim_de_semana', 'dia_unico'], label: 'Tipo de Recorrência' }
};

// Criar nova operação. Mínimo para nascer como reserva de cota: nome, data_inicio,
// qtd_diarias_estimada, tipo_operacao. O resto é completável depois.
app.post('/api/operacoes', exigirP3, asyncRoute(async (req, res) => {
  const v = validarCampos(req.body, SCHEMA_OPERACAO_CRIACAO);
  if (!v.ok) return res.status(400).json({ error: v.erro });

  const qtdEstimada = parseInt(req.body.qtd_diarias_estimada, 10);
  if (isNaN(qtdEstimada) || qtdEstimada < 0) {
    return res.status(400).json({ error: 'Quantidade de diárias estimada inválida.' });
  }

  const novaOperacao = {
    id: generateId('op'),
    num_oficio: v.valores.num_oficio,
    num_os_manual: v.valores.num_os_manual,
    num_sei: v.valores.num_sei,
    nome_operacao: v.valores.nome_operacao,
    tipo_operacao: v.valores.tipo_operacao,
    demandante: v.valores.demandante,
    data_inicio: v.valores.data_inicio,
    data_termino: v.valores.data_termino || v.valores.data_inicio,
    horario_inicio: v.valores.horario_inicio,
    local_itinerario: v.valores.local_itinerario,
    bairro: v.valores.bairro,
    situacao: v.valores.situacao,
    qtd_diarias_estimada: qtdEstimada,
    tipo_recorrencia: v.valores.tipo_recorrencia || null
  };

  await writeRow('operacoes', novaOperacao);
  res.status(201).json(novaOperacao);
}));

// Atualizar operação (inclui o "Marcar como Executada", que só muda situacao)
app.put('/api/operacoes/:id', exigirP3, asyncRoute(async (req, res) => {
  const operacaoAtual = await buscarRow('operacoes', req.params.id);
  if (!operacaoAtual) {
    return res.status(404).json({ error: 'Operação não encontrada' });
  }

  const v = validarCampos(req.body, {
    nome_operacao: { obrigatorio: false, tipo: 'string', max: 200, label: 'Nome da Operação' },
    tipo_operacao: { obrigatorio: false, tipo: 'string', max: 50, valores: TIPOS_OPERACAO, label: 'Tipo de Operação' },
    data_inicio: { obrigatorio: false, tipo: 'string', max: 10, label: 'Data de Início' },
    data_termino: { obrigatorio: false, tipo: 'string', max: 10, label: 'Data de Término' },
    horario_inicio: { obrigatorio: false, tipo: 'string', max: 5, label: 'Horário de Início' },
    local_itinerario: { obrigatorio: false, tipo: 'string', max: 300, label: 'Local/Itinerário' },
    num_oficio: { obrigatorio: false, tipo: 'string', max: 100, label: 'Número do Ofício' },
    num_os_manual: { obrigatorio: false, tipo: 'string', max: 100, label: 'Número da OS' },
    num_sei: { obrigatorio: false, tipo: 'string', max: 100, label: 'Número SEI' },
    demandante: { obrigatorio: false, tipo: 'string', max: 200, label: 'Demandante' },
    bairro: { obrigatorio: false, tipo: 'string', max: 100, label: 'Bairro' },
    situacao: { obrigatorio: false, tipo: 'string', valores: ['Planejada', 'Executada'], label: 'Situação' },
    tipo_recorrencia: { obrigatorio: false, tipo: 'string', valores: ['diaria', 'fim_de_semana', 'dia_unico'], label: 'Tipo de Recorrência' }
  });
  if (!v.ok) return res.status(400).json({ error: v.erro });

  const operacaoAtualizada = { ...operacaoAtual, ...v.valores };
  if (req.body.qtd_diarias_estimada !== undefined) {
    const qtdEstimada = parseInt(req.body.qtd_diarias_estimada, 10);
    if (isNaN(qtdEstimada) || qtdEstimada < 0) {
      return res.status(400).json({ error: 'Quantidade de diárias estimada inválida.' });
    }
    operacaoAtualizada.qtd_diarias_estimada = qtdEstimada;
  }

  await writeRow('operacoes', operacaoAtualizada);
  res.json(operacaoAtualizada);
}));

// Excluir operação (e escalas/alocações órfãs, apagadas diretamente por operacao_id).
// O FK ON DELETE CASCADE do banco já cobriria, mas apagamos explicitamente para não depender
// só da cascata e manter o padrão do delete de evento.
app.delete('/api/operacoes/:id', exigirP3, asyncRoute(async (req, res) => {
  await deleteRow('operacoes', req.params.id);
  const { error: erroEscalas } = await supabase.from('escalas').delete().eq('operacao_id', req.params.id);
  if (erroEscalas) throw new Error(`Falha ao limpar "escalas" no Supabase: ${erroEscalas.message}`);
  const { error: erroAlocacoes } = await supabase.from('alocacoes').delete().eq('operacao_id', req.params.id);
  if (erroAlocacoes) throw new Error(`Falha ao limpar "alocacoes" no Supabase: ${erroAlocacoes.message}`);
  res.json({ message: 'Operação e registros relacionados excluídos' });
}));


// -------------------------------------------------------------
// RECORRÊNCIA DE OPERAÇÕES (CRIAÇÃO EM LOTE, EDIÇÃO E EXCLUSÃO POR GRUPO)
// -------------------------------------------------------------
// Cada ocorrência é uma LINHA PRÓPRIA em `operacoes` (nada de geração virtual na
// leitura), ligada às irmãs por `grupo_recorrencia_id`. Duas consequências que
// valem para todo o módulo:
//   1) com recorrência, cada ocorrência é de UM DIA (data_inicio = data_termino) e
//      o "fim" da recorrência vive em recorrencia_regra.data_fim — o campo Data de
//      Término do formulário muda de significado nesse modo;
//   2) uma vez criado, o grupo é só um vínculo: qualquer ocorrência pode ser
//      editada/excluída sozinha pelas rotas unitárias acima, sem tocar nas outras.
// As rotas de grupo têm dois segmentos depois de /api/operacoes, então nunca
// colidem com PUT/DELETE /api/operacoes/:id (que casa um segmento só).

const ESCOPOS_GRUPO = ['somente_esta', 'esta_e_futuras', 'todas'];

// Campos que uma ação de GRUPO pode alterar. Ficam de fora, deliberadamente:
// as datas (mudar a data de todas é REGERAR o grupo, não editá-lo), `situacao`
// (Executada é decisão de cada ocorrência) e o próprio vínculo do grupo.
const SCHEMA_OPERACAO_GRUPO = {
  nome_operacao: { obrigatorio: false, tipo: 'string', max: 200, label: 'Nome da Operação' },
  tipo_operacao: { obrigatorio: false, tipo: 'string', max: 50, valores: TIPOS_OPERACAO, label: 'Tipo de Operação' },
  horario_inicio: { obrigatorio: false, tipo: 'string', max: 5, label: 'Horário de Início' },
  local_itinerario: { obrigatorio: false, tipo: 'string', max: 300, label: 'Local/Itinerário' },
  num_oficio: { obrigatorio: false, tipo: 'string', max: 100, label: 'Número do Ofício' },
  num_os_manual: { obrigatorio: false, tipo: 'string', max: 100, label: 'Número da OS' },
  num_sei: { obrigatorio: false, tipo: 'string', max: 100, label: 'Número SEI' },
  demandante: { obrigatorio: false, tipo: 'string', max: 200, label: 'Demandante' },
  bairro: { obrigatorio: false, tipo: 'string', max: 100, label: 'Bairro' },
  tipo_recorrencia: { obrigatorio: false, tipo: 'string', valores: ['diaria', 'fim_de_semana', 'dia_unico'], label: 'Tipo de Recorrência' }
};
const CAMPOS_BLOQUEADOS_GRUPO = ['id', 'data_inicio', 'data_termino', 'situacao', 'grupo_recorrencia_id', 'recorrencia_regra'];

// A regra pode chegar completa ou só com o tipo/dias, deixando o período a cargo dos
// campos do próprio formulário (Data de Início / Fim da Recorrência). Completa os
// buracos antes de validar. 'avulsa' não usa período — traz a lista `datas`.
function regraComPeriodoDoFormulario(regraBruta, corpo) {
  const regra = { ...(regraBruta || {}) };
  if (regra.tipo !== 'avulsa') {
    if (!regra.data_inicio && corpo.data_inicio) regra.data_inicio = String(corpo.data_inicio).trim();
    if (!regra.data_fim && corpo.data_termino) regra.data_fim = String(corpo.data_termino).trim();
  }
  return regra;
}

// Resolve quais ocorrências uma ação de escopo atinge.
//   somente_esta   -> só a ocorrência de referência (exige ?ref=<id>)
//   esta_e_futuras -> a de referência e as de data igual ou posterior (exige ?ref=<id>)
//   todas          -> o grupo inteiro
// REGRA FIXA: ocorrência já Executada nunca é alterada nem excluída por ação de
// grupo — é registro histórico do que a tropa cumpriu. Sai da lista `alvo` e volta
// contabilizada em `ignoradas`, para a UI conseguir dizer o que ficou de fora.
async function resolverEscopoGrupo(grupoId, escopo, refId) {
  if (!ESCOPOS_GRUPO.includes(escopo)) {
    return { ok: false, status: 400, erro: `Escopo inválido. Valores aceitos: ${ESCOPOS_GRUPO.join(', ')}.` };
  }
  const grupo = await readTabela('operacoes', { grupo_recorrencia_id: grupoId });
  if (grupo.length === 0) {
    return { ok: false, status: 404, erro: 'Grupo de recorrência não encontrado.' };
  }

  let selecionadas;
  if (escopo === 'todas') {
    selecionadas = grupo;
  } else {
    const referencia = grupo.find(o => o.id === refId);
    if (!referencia) {
      return { ok: false, status: 400, erro: 'Informe ?ref=<id da ocorrência> pertencente ao grupo para os escopos "somente_esta" e "esta_e_futuras".' };
    }
    // data_inicio vem do Postgres como 'YYYY-MM-DD' — comparação de string já é cronológica.
    selecionadas = escopo === 'somente_esta'
      ? [referencia]
      : grupo.filter(o => o.data_inicio >= referencia.data_inicio);
  }

  return {
    ok: true,
    grupo,
    alvo: selecionadas.filter(o => o.situacao !== 'Executada'),
    ignoradas: selecionadas.filter(o => o.situacao === 'Executada')
  };
}

// Ocorrências do grupo COM o efetivo de cada uma — alimenta a tela de replicação de
// escala (quantas ocorrências recebem o efetivo, quantas diárias isso soma, quais já
// foram executadas). Duas leituras de tabela única, não readDB.
app.get('/api/operacoes/grupo/:grupoId', exigirP3, asyncRoute(async (req, res) => {
  const grupo = await readTabela('operacoes', { grupo_recorrencia_id: req.params.grupoId });
  if (grupo.length === 0) return res.status(404).json({ error: 'Grupo de recorrência não encontrado.' });

  const escalasDoGrupo = await readTabelaIn('escalas', 'operacao_id', grupo.map(o => o.id));
  const escalasPorOperacao = indexarPor(escalasDoGrupo, 'operacao_id');

  const operacoes = grupo
    .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio))
    .map(op => {
      const escalasOp = escalasPorOperacao.get(op.id) || [];
      return {
        ...op,
        escalas: escalasOp,
        militares_escalados: escalasOp.length,
        // Mesma dupla fonte do resto do módulo: escala real quando existe, senão a estimativa.
        total_diarias: diariaDaOperacao(op, escalasOp)
      };
    });

  res.json({
    grupo_recorrencia_id: req.params.grupoId,
    recorrencia_regra: grupo[0].recorrencia_regra || null,
    total: operacoes.length,
    total_executadas: operacoes.filter(o => o.situacao === 'Executada').length,
    total_diarias: operacoes.reduce((soma, o) => soma + o.total_diarias, 0),
    operacoes
  });
}));

// Prévia das datas, sem persistir nada — alimenta a lista de conferência do modal.
// Aceita a regra em `recorrencia_regra` ou solta na raiz do corpo.
app.post('/api/operacoes/preview-recorrencia', exigirP3, asyncRoute(async (req, res) => {
  const regra = regraComPeriodoDoFormulario(req.body.recorrencia_regra || req.body, req.body);
  const validacao = validarRegraRecorrencia(regra);
  if (!validacao.ok) return res.status(400).json({ error: validacao.erro });
  res.json({
    datas: validacao.datas,
    total: validacao.datas.length,
    recorrencia_regra: validacao.regra,
    limites: LIMITES_RECORRENCIA
  });
}));

// Criação em lote. Uma escrita só (writeRows), nunca um POST por ocorrência em laço.
// Os limites (92 ocorrências / 12 meses) são revalidados aqui — a UI não é autoridade.
app.post('/api/operacoes/lote', exigirP3, asyncRoute(async (req, res) => {
  const v = validarCampos(req.body, SCHEMA_OPERACAO_CRIACAO);
  if (!v.ok) return res.status(400).json({ error: v.erro });

  const qtdEstimada = parseInt(req.body.qtd_diarias_estimada, 10);
  if (isNaN(qtdEstimada) || qtdEstimada < 0) {
    return res.status(400).json({ error: 'Quantidade de diárias estimada inválida.' });
  }

  const validacao = validarRegraRecorrencia(regraComPeriodoDoFormulario(req.body.recorrencia_regra, req.body));
  if (!validacao.ok) return res.status(400).json({ error: validacao.erro });

  const grupoRecorrenciaId = generateId('grp');
  const operacoes = validacao.datas.map(data => ({
    id: generateId('op'),
    num_oficio: v.valores.num_oficio,
    num_os_manual: v.valores.num_os_manual,
    num_sei: v.valores.num_sei,
    nome_operacao: v.valores.nome_operacao,
    tipo_operacao: v.valores.tipo_operacao,
    demandante: v.valores.demandante,
    // Cada ocorrência é de UM dia: início e término são a mesma data. O período
    // total do lote fica registrado em recorrencia_regra.
    data_inicio: data,
    data_termino: data,
    horario_inicio: v.valores.horario_inicio,
    local_itinerario: v.valores.local_itinerario,
    bairro: v.valores.bairro,
    situacao: v.valores.situacao,
    // Estimativa é POR OCORRÊNCIA — o total do grupo é este valor x total_ocorrencias.
    qtd_diarias_estimada: qtdEstimada,
    tipo_recorrencia: v.valores.tipo_recorrencia || null,
    grupo_recorrencia_id: grupoRecorrenciaId,
    recorrencia_regra: validacao.regra
  }));

  await writeRows('operacoes', operacoes);
  res.status(201).json({
    grupo_recorrencia_id: grupoRecorrenciaId,
    total: operacoes.length,
    total_diarias_estimadas: qtdEstimada * operacoes.length,
    recorrencia_regra: validacao.regra,
    operacoes
  });
}));

// Edição em grupo. Só os campos descritivos (SCHEMA_OPERACAO_GRUPO) e só os que
// vierem no corpo — campo ausente não é sobrescrito com vazio.
app.put('/api/operacoes/grupo/:grupoId', exigirP3, asyncRoute(async (req, res) => {
  const bloqueados = CAMPOS_BLOQUEADOS_GRUPO.filter(campo => campo in req.body);
  if (bloqueados.length > 0) {
    return res.status(400).json({
      error: `Estes campos não podem ser alterados por ação de grupo: ${bloqueados.join(', ')}. Edite a ocorrência individualmente.`
    });
  }

  const v = validarCampos(req.body, SCHEMA_OPERACAO_GRUPO);
  if (!v.ok) return res.status(400).json({ error: v.erro });

  const alteracoes = {};
  for (const campo of Object.keys(SCHEMA_OPERACAO_GRUPO)) {
    if (req.body[campo] !== undefined && v.valores[campo] !== undefined) alteracoes[campo] = v.valores[campo];
  }
  if (req.body.qtd_diarias_estimada !== undefined) {
    const qtd = parseInt(req.body.qtd_diarias_estimada, 10);
    if (isNaN(qtd) || qtd < 0) return res.status(400).json({ error: 'Quantidade de diárias estimada inválida.' });
    alteracoes.qtd_diarias_estimada = qtd;
  }
  if (Object.keys(alteracoes).length === 0) {
    return res.status(400).json({ error: 'Nenhum campo válido para atualizar foi informado.' });
  }

  const escopo = await resolverEscopoGrupo(req.params.grupoId, req.query.escopo, req.query.ref);
  if (!escopo.ok) return res.status(escopo.status).json({ error: escopo.erro });

  const atualizadas = escopo.alvo.map(op => ({ ...op, ...alteracoes }));
  await writeRows('operacoes', atualizadas);
  res.json({
    grupo_recorrencia_id: req.params.grupoId,
    escopo: req.query.escopo,
    atualizadas: atualizadas.length,
    ignoradas_executadas: escopo.ignoradas.length,
    total_no_grupo: escopo.grupo.length,
    operacoes: atualizadas
  });
}));

// Exclusão em grupo. Apaga escalas e alocações das ocorrências atingidas antes das
// operações — mesmo padrão explícito do DELETE unitário, sem depender só da cascata.
app.delete('/api/operacoes/grupo/:grupoId', exigirP3, asyncRoute(async (req, res) => {
  const escopo = await resolverEscopoGrupo(req.params.grupoId, req.query.escopo, req.query.ref);
  if (!escopo.ok) return res.status(escopo.status).json({ error: escopo.erro });

  const ids = escopo.alvo.map(op => op.id);
  await deleteRows('escalas', 'operacao_id', ids);
  await deleteRows('alocacoes', 'operacao_id', ids);
  await deleteRows('operacoes', 'id', ids);

  res.json({
    grupo_recorrencia_id: req.params.grupoId,
    escopo: req.query.escopo,
    excluidas: ids.length,
    ignoradas_executadas: escopo.ignoradas.length,
    total_no_grupo: escopo.grupo.length,
    message: escopo.ignoradas.length > 0
      ? `${ids.length} operação(ões) excluída(s). ${escopo.ignoradas.length} já executada(s) foram preservadas.`
      : `${ids.length} operação(ões) e registros relacionados excluídos.`
  });
}));


// -------------------------------------------------------------
// ROTAS DE ALOCAÇÃO DE POLICIAMENTO
// -------------------------------------------------------------

// Listar alocações (permite filtro por evento_id OU operacao_id)
app.get('/api/alocacoes', asyncRoute(async (req, res) => {
  // precedência evento_id > operacao_id, igual ao else-if original
  const filtros = req.query.evento_id
    ? { evento_id: req.query.evento_id }
    : (req.query.operacao_id ? { operacao_id: req.query.operacao_id } : {});
  res.json(await readTabela('alocacoes', filtros));
}));

// Adicionar alocação — vinculada a UM evento OU a UMA operação (nunca aos dois, nunca a nenhum),
// espelhando a constraint alocacoes_um_vinculo do banco.
app.post('/api/alocacoes', exigirP3, asyncRoute(async (req, res) => {
  const eventoId = req.body.evento_id ? String(req.body.evento_id).trim() : '';
  const operacaoId = req.body.operacao_id ? String(req.body.operacao_id).trim() : '';
  if ((eventoId ? 1 : 0) + (operacaoId ? 1 : 0) !== 1) {
    return res.status(400).json({ error: 'Informe exatamente um vínculo: evento_id OU operacao_id.' });
  }

  const v = validarCampos(req.body, {
    modalidade: { obrigatorio: true, tipo: 'string', max: 50, label: 'Modalidade' },
    prefixos_vtr: { obrigatorio: false, tipo: 'string', max: 300, padrao: '', label: 'Prefixos das Viaturas' },
    comando_servico: { obrigatorio: false, tipo: 'string', max: 150, padrao: '', label: 'Comando do Serviço' }
  });
  if (!v.ok) return res.status(400).json({ error: v.erro });

  const novaAlocacao = {
    id: generateId('aloc'),
    evento_id: eventoId || null,
    operacao_id: operacaoId || null,
    modalidade: v.valores.modalidade,
    qtd_policiais: parseInt(req.body.qtd_policiais, 10) || 0,
    qtd_viaturas: parseInt(req.body.qtd_viaturas, 10) || 0,
    prefixos_vtr: v.valores.prefixos_vtr,
    comando_servico: v.valores.comando_servico
  };

  await writeRow('alocacoes', novaAlocacao);
  res.status(201).json(novaAlocacao);
}));

// Remover alocação
app.delete('/api/alocacoes/:id', exigirP3, asyncRoute(async (req, res) => {
  await deleteRow('alocacoes', req.params.id);
  res.json({ message: 'Alocação excluída' });
}));


// -------------------------------------------------------------
// ROTAS DE ESCALA DE DIÁRIAS
// -------------------------------------------------------------

// Listar escalas (permite filtro por operacao_id)
app.get('/api/escalas', exigirP3, asyncRoute(async (req, res) => {
  res.json(await readTabela('escalas', { operacao_id: req.query.operacao_id }));
}));

// Teto de diárias por militar no mês. É ALERTA, nunca bloqueio: quem decide escalar
// além disso é a P3, e o sistema não tem autoridade para impedir. Aparece na resposta
// do lote e na consulta por militar, e a UI mostra sem travar a confirmação.
const TETO_DIARIAS_MILITAR_MES = 20;

function mesDe(dataIso) {
  return String(dataIso || '').slice(0, 7);
}

// Normaliza a lista de militares dos endpoints de lote. Aceita `militar_id` ou
// `matricula`, `militar_nome` ou `nome`, `qtd_aparicoes` ou `aparicoes`.
function normalizarMilitaresDoLote(bruto, exigirAparicoes) {
  const lista = Array.isArray(bruto) ? bruto : [];
  const militares = [];
  const vistos = new Set();
  for (const item of lista) {
    const matricula = String(item.militar_id ?? item.matricula ?? '').trim();
    const nome = String(item.militar_nome ?? item.nome ?? '').trim();
    if (!nome) return { ok: false, erro: 'Todo militar do lote precisa de um nome (militar_nome).' };
    if (nome.length > 150) return { ok: false, erro: `Nome de militar acima de 150 caracteres: "${nome.slice(0, 30)}…".` };

    let aparicoes = 1;
    if (exigirAparicoes) {
      aparicoes = parseInt(item.qtd_aparicoes ?? item.aparicoes, 10);
      if (isNaN(aparicoes) || aparicoes < 1) {
        return { ok: false, erro: `Número de aparições inválido para "${nome}". Use um inteiro maior ou igual a 1.` };
      }
    }

    // Militar repetido no MESMO payload: o último vence, em vez de gerar duas escalas
    // para a mesma pessoa na mesma operação.
    const chave = chaveMilitar(matricula, nome);
    const jaVisto = vistos.has(chave);
    vistos.add(chave);
    const registro = { chave, matricula, nome, aparicoes };
    if (jaVisto) militares[militares.findIndex(m => m.chave === chave)] = registro;
    else militares.push(registro);
  }
  if (militares.length === 0) return { ok: false, erro: 'Informe ao menos um militar em "militares".' };
  return { ok: true, militares };
}

// Separa as operações do lote em atingíveis e ignoradas. Ocorrência já Executada não é
// tocada por ação de lote — mesma regra das ações de grupo. Quem precisa escalar alguém
// numa operação já executada usa o POST unitário /api/escalas, que segue sem trava.
async function resolverOperacoesDoLote(idsBrutos) {
  const ids = [...new Set((Array.isArray(idsBrutos) ? idsBrutos : []).map(id => String(id || '').trim()).filter(Boolean))];
  if (ids.length === 0) return { ok: false, erro: 'Informe ao menos uma operação em "operacao_ids".' };

  const encontradas = await readTabelaIn('operacoes', 'id', ids);
  const idsEncontrados = new Set(encontradas.map(o => o.id));
  return {
    ok: true,
    alvo: encontradas.filter(o => o.situacao !== 'Executada'),
    ignoradasExecutadas: encontradas.filter(o => o.situacao === 'Executada').map(o => o.id),
    naoEncontradas: ids.filter(id => !idsEncontrados.has(id))
  };
}

// Diárias consumidas e saldo de cota, recalculados DEPOIS da escrita para a resposta
// refletir o estado já gravado. Mesma dupla fonte do Planejador — consumido vem das
// escalas reais e planejado só das operações SEM escala —, para os números baterem
// com aquela tela em vez de contarem a mesma diária duas vezes.
async function resumoCotaEteto(meses) {
  const [operacoes, escalas, config] = await Promise.all([
    readTabela('operacoes'), readTabela('escalas'), buscarConfig()
  ]);
  const operacaoPorId = new Map(operacoes.map(o => [o.id, o]));
  const escalasPorOperacao = indexarPor(escalas, 'operacao_id');

  // Data da escala: a coluna quando preenchida, senão a data_inicio da operação —
  // escalas anteriores à migration 004 têm `data` nula e não foram backfilladas.
  const mesDaEscala = (esc) => mesDe(esc.data || operacaoPorId.get(esc.operacao_id)?.data_inicio);

  const cotaMensal = config.cota_mensal_diarias || 0;
  const porMes = meses.map(mes => {
    const opsDoMes = operacoes.filter(o => mesDe(o.data_inicio) === mes);
    const consumido = escalas.filter(e => mesDaEscala(e) === mes).reduce((s, e) => s + (e.total_diarias || 0), 0);
    const planejado = opsDoMes
      .filter(o => (escalasPorOperacao.get(o.id) || []).length === 0)
      .reduce((s, o) => s + (o.qtd_diarias_estimada || 0), 0);
    return { mes, consumido, planejado, saldo: cotaMensal - consumido - planejado };
  });

  // Militares acima do teto nos meses tocados pelo lote. Informativo.
  const porMilitarMes = new Map();
  for (const esc of escalas) {
    const mes = mesDaEscala(esc);
    if (!meses.includes(mes)) continue;
    const chave = `${mes}|${chaveMilitar(esc.militar_id, esc.militar_nome)}`;
    const atual = porMilitarMes.get(chave);
    if (atual) atual.total_diarias += esc.total_diarias || 0;
    else porMilitarMes.set(chave, { mes, militar_id: esc.militar_id || '', militar_nome: esc.militar_nome, total_diarias: esc.total_diarias || 0 });
  }

  return {
    cota: { mensal: cotaMensal, meses: porMes },
    teto_militar_mes: TETO_DIARIAS_MILITAR_MES,
    militares_acima_do_teto: [...porMilitarMes.values()]
      .filter(m => m.total_diarias > TETO_DIARIAS_MILITAR_MES)
      .sort((a, b) => b.total_diarias - a.total_diarias)
  };
}

// -------------------------------------------------------------
// ESCALA EM LOTE (N militares × N operações)
// -------------------------------------------------------------
// ATENÇÃO À ORDEM: estas duas rotas ficam ANTES de PUT/DELETE /api/escalas/:id.
// `/api/escalas/lote` tem um segmento só, igual a `/api/escalas/:id` — registradas
// depois, o Express casaria "lote" como se fosse um id e o DELETE nunca chegaria aqui.

// Escala N militares em N operações numa escrita só. IDEMPOTENTE: se o militar já está
// escalado naquela operação, atualiza as aparições em vez de duplicar.
//
// A idempotência é por leitura-e-escrita, não por constraint única em
// (operacao_id, militar_id): existe duplicata legítima no banco de produção, criar a
// constraint exigiria apagar dado real, e o ON CONFLICT reescreveria o `id` da linha
// existente (que é a PK e é referenciada em nenhum lugar hoje, mas mudaria à toa).
app.post('/api/escalas/lote', exigirP3, asyncRoute(async (req, res) => {
  const operacoes = await resolverOperacoesDoLote(req.body.operacao_ids);
  if (!operacoes.ok) return res.status(400).json({ error: operacoes.erro });

  const normalizados = normalizarMilitaresDoLote(req.body.militares, true);
  if (!normalizados.ok) return res.status(400).json({ error: normalizados.erro });
  const { militares } = normalizados;

  const idsAlvo = operacoes.alvo.map(o => o.id);
  const escalasExistentes = await readTabelaIn('escalas', 'operacao_id', idsAlvo);

  // Índice das escalas já gravadas. Havendo duplicata pré-existente do mesmo par,
  // atualiza a de menor id (determinístico) e deixa as outras intactas — apagar
  // registro que o app não criou nesta requisição não é decisão desta rota.
  const existentePorPar = new Map();
  const duplicatas = new Map();
  for (const esc of escalasExistentes) {
    const par = `${esc.operacao_id}|${chaveMilitar(esc.militar_id, esc.militar_nome)}`;
    const atual = existentePorPar.get(par);
    if (!atual) existentePorPar.set(par, esc);
    else {
      duplicatas.set(par, (duplicatas.get(par) || 1) + 1);
      if (esc.id < atual.id) existentePorPar.set(par, esc);
    }
  }

  const linhas = [];
  let criadas = 0;
  let atualizadas = 0;
  for (const op of operacoes.alvo) {
    for (const militar of militares) {
      const existente = existentePorPar.get(`${op.id}|${militar.chave}`);
      const campos = {
        operacao_id: op.id,
        militar_nome: militar.nome,
        militar_id: militar.matricula,
        qtd_aparicoes: militar.aparicoes,
        total_diarias: militar.aparicoes * 2, // Regra fixa: 2 diárias por aparição — não alterar
        // Data da ocorrência, não a do início do grupo: cada ocorrência da recorrência
        // é de um dia, e é essa data que o Relatório Diário precisa.
        data: op.data_inicio
      };
      if (existente) {
        atualizadas++;
        linhas.push({ ...existente, ...campos });
      } else {
        criadas++;
        linhas.push({ id: generateId('esc'), ...campos });
      }
    }
  }

  await writeRows('escalas', linhas);

  const meses = [...new Set(operacoes.alvo.map(o => mesDe(o.data_inicio)))].sort();
  const resumo = await resumoCotaEteto(meses);

  res.status(201).json({
    escalas_criadas: criadas,
    escalas_atualizadas: atualizadas,
    operacoes_afetadas: idsAlvo.length,
    militares_no_lote: militares.length,
    total_diarias_lote: linhas.reduce((soma, l) => soma + l.total_diarias, 0),
    operacoes_ignoradas_executadas: operacoes.ignoradasExecutadas,
    operacoes_nao_encontradas: operacoes.naoEncontradas,
    duplicatas_preexistentes: [...duplicatas.keys()],
    ...resumo
  });
}));

// Remove militares de um conjunto de operações. Mesmo formato de payload do POST
// (só `qtd_aparicoes` é dispensável) e mesma proteção da ocorrência Executada.
app.delete('/api/escalas/lote', exigirP3, asyncRoute(async (req, res) => {
  const operacoes = await resolverOperacoesDoLote(req.body.operacao_ids);
  if (!operacoes.ok) return res.status(400).json({ error: operacoes.erro });

  const normalizados = normalizarMilitaresDoLote(req.body.militares, false);
  if (!normalizados.ok) return res.status(400).json({ error: normalizados.erro });

  const chavesAlvo = new Set(normalizados.militares.map(m => m.chave));
  const idsAlvo = operacoes.alvo.map(o => o.id);
  const escalasExistentes = await readTabelaIn('escalas', 'operacao_id', idsAlvo);

  // Aqui TODAS as linhas do par são removidas, inclusive duplicatas pré-existentes:
  // deixar uma sobra depois de "remover do grupo" seria pior que o excesso de zelo.
  const paraApagar = escalasExistentes.filter(e => chavesAlvo.has(chaveMilitar(e.militar_id, e.militar_nome)));
  await deleteRows('escalas', 'id', paraApagar.map(e => e.id));

  const meses = [...new Set(operacoes.alvo.map(o => mesDe(o.data_inicio)))].sort();
  const resumo = await resumoCotaEteto(meses);

  res.json({
    escalas_removidas: paraApagar.length,
    diarias_liberadas: paraApagar.reduce((soma, e) => soma + (e.total_diarias || 0), 0),
    operacoes_afetadas: idsAlvo.length,
    operacoes_ignoradas_executadas: operacoes.ignoradasExecutadas,
    operacoes_nao_encontradas: operacoes.naoEncontradas,
    ...resumo
  });
}));

// Diárias de UM militar num mês — alimenta o alerta de teto na tela de escala.
// `:matricula` é o `escalas.militar_id` (RE), não o `pessoal.id`: não existe FK entre
// escala e cadastro, e escalar quem não está cadastrado é permitido.
app.get('/api/militares/:matricula/diarias', exigirP3, asyncRoute(async (req, res) => {
  const mes = String(req.query.mes || '').trim();
  if (!/^\d{4}-\d{2}$/.test(mes)) {
    return res.status(400).json({ error: 'Informe o mês no formato AAAA-MM.' });
  }

  const [operacoes, escalasDoMilitar] = await Promise.all([
    readTabela('operacoes'),
    readTabela('escalas', { militar_id: req.params.matricula })
  ]);
  const operacaoPorId = new Map(operacoes.map(o => [o.id, o]));

  const doMes = escalasDoMilitar.filter(e => mesDe(e.data || operacaoPorId.get(e.operacao_id)?.data_inicio) === mes);
  const totalDiarias = doMes.reduce((soma, e) => soma + (e.total_diarias || 0), 0);

  res.json({
    matricula: req.params.matricula,
    militar_nome: doMes[0]?.militar_nome || escalasDoMilitar[0]?.militar_nome || '',
    mes,
    escalas: doMes.length,
    total_aparicoes: doMes.reduce((soma, e) => soma + (e.qtd_aparicoes || 0), 0),
    total_diarias: totalDiarias,
    teto_militar_mes: TETO_DIARIAS_MILITAR_MES,
    acima_do_teto: totalDiarias > TETO_DIARIAS_MILITAR_MES
  });
}));

// Adicionar militar na escala (trata a automação de diárias: qtd_aparicoes * 2). Sem trava por
// situacao da operação — escala pode ser lançada tanto em operação Planejada quanto Executada.
app.post('/api/escalas', exigirP3, asyncRoute(async (req, res) => {
  const v = validarCampos(req.body, {
    operacao_id: { obrigatorio: true, tipo: 'string', max: 50, label: 'Operação' },
    militar_nome: { obrigatorio: true, tipo: 'string', max: 150, label: 'Nome Completo' },
    militar_id: { obrigatorio: true, tipo: 'string', max: 50, label: 'Matrícula/ID' }
  });
  if (!v.ok) return res.status(400).json({ error: v.erro });

  const qtd_aparicoes = parseInt(req.body.qtd_aparicoes, 10) || 1;
  const total_diarias = qtd_aparicoes * 2; // Automação: Regra de 2 diárias por aparição — não alterar

  // Data da escala (migration 004). Preenchida aqui também, e não só no lote, senão a
  // coluna nasceria pela metade — escala criada pela gaveta ficaria sem data e só a
  // criada pelo lote teria. Custa 1 SELECT por id. Sem trava por situacao: escalar em
  // operação já Executada continua permitido por esta rota (é a regra do módulo).
  const operacao = await buscarRow('operacoes', v.valores.operacao_id);
  if (!operacao) return res.status(404).json({ error: 'Operação não encontrada' });

  const novaEscala = {
    id: generateId('esc'),
    operacao_id: v.valores.operacao_id,
    militar_nome: v.valores.militar_nome,
    militar_id: v.valores.militar_id,
    qtd_aparicoes: qtd_aparicoes,
    total_diarias: total_diarias,
    data: operacao.data_inicio
  };

  await writeRow('escalas', novaEscala);
  res.status(201).json(novaEscala);
}));

// Atualizar escala (recalcula diárias)
app.put('/api/escalas/:id', exigirP3, asyncRoute(async (req, res) => {
  const escalaAtual = await buscarRow('escalas', req.params.id);
  if (!escalaAtual) {
    return res.status(404).json({ error: 'Militar não escalado nesta operação' });
  }

  const qtd_aparicoes = parseInt(req.body.qtd_aparicoes, 10) || 1;
  const total_diarias = qtd_aparicoes * 2;

  const escalaAtualizada = {
    ...escalaAtual,
    militar_nome: req.body.militar_nome || escalaAtual.militar_nome,
    militar_id: req.body.militar_id || escalaAtual.militar_id,
    qtd_aparicoes: qtd_aparicoes,
    total_diarias: total_diarias
  };

  await writeRow('escalas', escalaAtualizada);
  res.json(escalaAtualizada);
}));

// Remover militar da escala
app.delete('/api/escalas/:id', exigirP3, asyncRoute(async (req, res) => {
  await deleteRow('escalas', req.params.id);
  res.json({ message: 'Militar removido da escala' });
}));


// -------------------------------------------------------------
// ROTAS DE COORDENADAS DE BAIRROS (USADAS PELO MAPA E PELO CADASTRO DE EVENTOS)
// -------------------------------------------------------------
app.get('/api/bairros-coordenadas', asyncRoute(async (req, res) => {
  res.json(await readTabela('bairros_coordenadas'));
}));

// Criar bairro (P3)
app.post('/api/bairros-coordenadas', exigirP3, asyncRoute(async (req, res) => {
  const v = validarCampos(req.body, {
    nome_bairro: { obrigatorio: true, tipo: 'string', max: 100, label: 'Nome do Bairro' }
  });
  if (!v.ok) return res.status(400).json({ error: v.erro });

  // Coordenada é OPCIONAL (migration 001): um bairro pode existir só para
  // receber Aviso Operacional e vincular viatura, sem entrar no Mapa. Mas se
  // vier uma das duas, as duas precisam vir — meia coordenada não plota nada.
  const { latitude, longitude } = req.body;
  const informouAlguma = latitude !== undefined && latitude !== '' || longitude !== undefined && longitude !== '';
  let lat = null;
  let lon = null;
  if (informouAlguma) {
    lat = parseFloat(latitude);
    lon = parseFloat(longitude);
    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ error: 'Informe latitude e longitude juntas, ambas numéricas — ou deixe as duas em branco.' });
    }
  }
  // Checagem de nome duplicado só na tabela bairros_coordenadas (não no banco inteiro).
  const bairros = await readTabela('bairros_coordenadas');
  if (bairros.some(b => normalizarTextoServer(b.nome_bairro) === normalizarTextoServer(v.valores.nome_bairro))) {
    return res.status(409).json({ error: 'Já existe um bairro cadastrado com esse nome.' });
  }

  const novoBairro = { id: generateId('bco'), nome_bairro: v.valores.nome_bairro, latitude: lat, longitude: lon };
  await writeRow('bairros_coordenadas', novoBairro);
  res.status(201).json(novoBairro);
}));

// Atualizar bairro (P3)
app.put('/api/bairros-coordenadas/:id', exigirP3, asyncRoute(async (req, res) => {
  const { data: bairro, error: erroBusca } = await supabase.from('bairros_coordenadas').select('*').eq('id', req.params.id).maybeSingle();
  if (erroBusca) throw new Error(`Falha ao ler "bairros_coordenadas" do Supabase: ${erroBusca.message}`);
  if (!bairro) return res.status(404).json({ error: 'Bairro não encontrado.' });

  if (req.body.nome_bairro !== undefined) bairro.nome_bairro = String(req.body.nome_bairro).trim();
  // String vazia limpa a coordenada (bairro deixa de ser plotado no Mapa e passa
  // a existir só para avisos/vínculo de viatura).
  if (req.body.latitude !== undefined) {
    if (req.body.latitude === '' || req.body.latitude === null) {
      bairro.latitude = null;
    } else {
      const lat = parseFloat(req.body.latitude);
      if (isNaN(lat)) return res.status(400).json({ error: 'Latitude inválida.' });
      bairro.latitude = lat;
    }
  }
  if (req.body.longitude !== undefined) {
    if (req.body.longitude === '' || req.body.longitude === null) {
      bairro.longitude = null;
    } else {
      const lon = parseFloat(req.body.longitude);
      if (isNaN(lon)) return res.status(400).json({ error: 'Longitude inválida.' });
      bairro.longitude = lon;
    }
  }

  await writeRow('bairros_coordenadas', bairro);
  res.json(bairro);
}));

// Excluir bairro (P3)
app.delete('/api/bairros-coordenadas/:id', exigirP3, asyncRoute(async (req, res) => {
  const { data: bairro, error: erroBusca } = await supabase.from('bairros_coordenadas').select('id').eq('id', req.params.id).maybeSingle();
  if (erroBusca) throw new Error(`Falha ao ler "bairros_coordenadas" do Supabase: ${erroBusca.message}`);
  if (!bairro) return res.status(404).json({ error: 'Bairro não encontrado.' });
  await deleteRow('bairros_coordenadas', req.params.id);
  res.json({ message: 'Bairro excluído.' });
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
const PRIORIDADES_AVISO = ['informativa', 'atencao', 'alta', 'critica'];
const VIGENCIA_PADRAO_DIAS = 30;
// Teto por cartão: protege o formato de UMA página por viatura, que é o ponto
// do documento (lido no celular, em serviço).
const MAX_AVISOS_POR_CARTAO = 4;

function somarDiasISO(dataISO, dias) {
  const [ano, mes, dia] = String(dataISO).split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

function hojeISO() {
  // Data no fuso do batalhão, não no do servidor (a Vercel roda em UTC): perto
  // da meia-noite os dois divergem e a vigência do aviso viraria um dia antes.
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Aviso vigente: ativo, já começou e ainda não venceu. Permanente ignora data_fim. */
function avisoVigente(aviso, hoje = hojeISO()) {
  if (!aviso.ativo) return false;
  if (aviso.data_inicio && aviso.data_inicio > hoje) return false;
  if (aviso.permanente) return true;
  if (aviso.data_fim && aviso.data_fim < hoje) return false;
  return true;
}

function validarCorpoAviso(body) {
  const v = validarCampos(body, {
    texto: { obrigatorio: true, tipo: 'string', max: 240, label: 'Texto do alerta' },
    categoria: { obrigatorio: false, tipo: 'string', max: 60, padrao: '', label: 'Categoria' },
    prioridade: { obrigatorio: false, tipo: 'string', valores: PRIORIDADES_AVISO, padrao: 'informativa', label: 'Prioridade' },
    bairro_id: { obrigatorio: false, tipo: 'string', max: 60, padrao: '', label: 'Bairro' },
    companhia: { obrigatorio: false, tipo: 'string', valores: COMPANHIAS_VALIDAS, padrao: '', label: 'Companhia' },
    data_inicio: { obrigatorio: false, tipo: 'string', max: 10, padrao: '', label: 'Início da vigência' },
    data_fim: { obrigatorio: false, tipo: 'string', max: 10, padrao: '', label: 'Fim da vigência' }
  });
  if (!v.ok) return v;

  // Espelha a constraint aviso_tem_escopo do banco, com mensagem que o operador entende.
  if (!v.valores.bairro_id && !v.valores.companhia) {
    return { ok: false, erro: 'O alerta precisa ter ao menos um escopo: bairro, Companhia, ou os dois.' };
  }
  return v;
}

app.get('/api/avisos', asyncRoute(async (req, res) => {
  let avisos = await readTabela('avisos');

  // ?vigentes=1 é o que o Cartão Programa usa; a aba Avisos lista tudo e filtra na tela.
  if (req.query.vigentes === '1') avisos = avisos.filter(a => avisoVigente(a));
  if (req.query.bairro_id) avisos = avisos.filter(a => a.bairro_id === req.query.bairro_id);
  if (req.query.companhia) avisos = avisos.filter(a => a.companhia === req.query.companhia);

  // Mais crítico primeiro; entre iguais, o mais recente.
  avisos.sort((a, b) => {
    const peso = PRIORIDADES_AVISO.indexOf(b.prioridade) - PRIORIDADES_AVISO.indexOf(a.prioridade);
    if (peso !== 0) return peso;
    return String(b.criado_em || '').localeCompare(String(a.criado_em || ''));
  });
  res.json(avisos);
}));

app.post('/api/avisos', exigirP3, asyncRoute(async (req, res) => {
  const v = validarCorpoAviso(req.body);
  if (!v.ok) return res.status(400).json({ error: v.erro });

  const permanente = !!req.body.permanente;
  const dataInicio = v.valores.data_inicio || hojeISO();

  const novoAviso = {
    id: generateId('avs'),
    bairro_id: v.valores.bairro_id || null,
    companhia: v.valores.companhia || null,
    categoria: v.valores.categoria,
    prioridade: v.valores.prioridade,
    texto: v.valores.texto,
    data_inicio: dataInicio,
    // Vigência padrão de 30 dias: a P3 renova ou encerra. Permanente não vence.
    data_fim: permanente ? null : (v.valores.data_fim || somarDiasISO(dataInicio, VIGENCIA_PADRAO_DIAS)),
    permanente,
    ativo: true,
    criado_por: req.user ? req.user.usuario : null,
    criado_em: new Date().toISOString(),
    atualizado_em: null
  };

  await writeRow('avisos', novoAviso);
  res.status(201).json(novoAviso);
}));

app.put('/api/avisos/:id', exigirP3, asyncRoute(async (req, res) => {
  const aviso = await buscarRow('avisos', req.params.id);
  if (!aviso) return res.status(404).json({ error: 'Alerta não encontrado.' });

  const v = validarCorpoAviso({ ...aviso, ...req.body });
  if (!v.ok) return res.status(400).json({ error: v.erro });

  aviso.texto = v.valores.texto;
  aviso.categoria = v.valores.categoria;
  aviso.prioridade = v.valores.prioridade;
  aviso.bairro_id = v.valores.bairro_id || null;
  aviso.companhia = v.valores.companhia || null;
  if (req.body.permanente !== undefined) aviso.permanente = !!req.body.permanente;
  if (req.body.ativo !== undefined) aviso.ativo = !!req.body.ativo;
  if (v.valores.data_inicio) aviso.data_inicio = v.valores.data_inicio;
  // Permanente zera a data de fim; senão, respeita o que veio (ou mantém).
  aviso.data_fim = aviso.permanente ? null : (v.valores.data_fim || aviso.data_fim || null);
  aviso.atualizado_em = new Date().toISOString();

  await writeRow('avisos', aviso);
  res.json(aviso);
}));

/** Renovar: empurra a vigência por mais 30 dias a partir de hoje (ou dos dias
 *  informados). É a ação que a P3 mais usa na visão "vencendo em 7 dias". */
app.post('/api/avisos/:id/renovar', exigirP3, asyncRoute(async (req, res) => {
  const aviso = await buscarRow('avisos', req.params.id);
  if (!aviso) return res.status(404).json({ error: 'Alerta não encontrado.' });

  const dias = parseInt(req.body.dias, 10) || VIGENCIA_PADRAO_DIAS;
  aviso.ativo = true;
  aviso.permanente = false;
  aviso.data_fim = somarDiasISO(hojeISO(), dias);
  aviso.atualizado_em = new Date().toISOString();

  await writeRow('avisos', aviso);
  res.json(aviso);
}));

app.delete('/api/avisos/:id', exigirP3, asyncRoute(async (req, res) => {
  const aviso = await buscarRow('avisos', req.params.id);
  if (!aviso) return res.status(404).json({ error: 'Alerta não encontrado.' });
  await deleteRow('avisos', req.params.id);
  res.json({ message: 'Alerta excluído.' });
}));


// -------------------------------------------------------------
// ROTAS DE CADASTRO DE VIATURAS (ALIMENTA O AUTOCOMPLETE DE PREFIXO NO CARTÃO PROGRAMA —
// que continua aceitando texto livre para reservas rotativas não cadastradas aqui)
// -------------------------------------------------------------
app.get('/api/viaturas', asyncRoute(async (req, res) => {
  const viaturas = await readTabela('viaturas');
  res.json(viaturas.sort((a, b) => a.prefixo.localeCompare(b.prefixo)));
}));

// Criar viatura (qualquer perfil autenticado — P3, Adjunto ou Oficial). Só a exclusão é P3-only.
app.post('/api/viaturas', asyncRoute(async (req, res) => {
  const valid = validarCampos(req.body, {
    prefixo: { obrigatorio: true, tipo: 'string', max: 30, label: 'Prefixo' },
    companhia: { obrigatorio: false, tipo: 'string', valores: COMPANHIAS_VIATURA, padrao: '', label: 'Companhia' },
    categoria: { obrigatorio: false, tipo: 'string', valores: CATEGORIAS_VIATURA, padrao: 'Ordinária', label: 'Categoria' },
    status: { obrigatorio: false, tipo: 'string', valores: STATUS_VIATURA, padrao: 'Ativa', label: 'Status' },
    setor: { obrigatorio: false, tipo: 'string', max: 100, padrao: '', label: 'Setor' },
    observacao: { obrigatorio: false, tipo: 'string', max: 300, padrao: '', label: 'Observação' }
  });
  if (!valid.ok) return res.status(400).json({ error: valid.erro });

  // Checagem de prefixo duplicado só na tabela viaturas (não no banco inteiro).
  const viaturas = await readTabela('viaturas');
  if (viaturas.some(x => normalizarTextoServer(x.prefixo) === normalizarTextoServer(valid.valores.prefixo))) {
    return res.status(409).json({ error: 'Já existe uma viatura cadastrada com esse prefixo.' });
  }

  const novaViatura = {
    id: generateId('vtr'),
    prefixo: valid.valores.prefixo,
    companhia: valid.valores.companhia,
    categoria: valid.valores.categoria,
    status: valid.valores.status,
    observacao: valid.valores.observacao,
    setor: valid.valores.setor
  };
  await writeRow('viaturas', novaViatura);
  res.status(201).json(novaViatura);
}));

// Atualizar viatura (qualquer perfil autenticado — P3, Adjunto ou Oficial). Só a exclusão é P3-only.
app.put('/api/viaturas/:id', asyncRoute(async (req, res) => {
  // Lê só a tabela viaturas: serve tanto para achar a linha quanto para a checagem de prefixo duplicado.
  const viaturas = await readTabela('viaturas');
  const viatura = viaturas.find(v => v.id === req.params.id);
  if (!viatura) return res.status(404).json({ error: 'Viatura não encontrada.' });

  if (req.body.prefixo !== undefined) {
    if (!req.body.prefixo) return res.status(400).json({ error: 'O prefixo da viatura é obrigatório.' });
    if (viaturas.some(v => v.id !== viatura.id && normalizarTextoServer(v.prefixo) === normalizarTextoServer(req.body.prefixo))) {
      return res.status(409).json({ error: 'Já existe uma viatura cadastrada com esse prefixo.' });
    }
    viatura.prefixo = String(req.body.prefixo).trim();
  }
  if (req.body.companhia !== undefined) {
    if (req.body.companhia && !COMPANHIAS_VIATURA.includes(req.body.companhia)) {
      return res.status(400).json({ error: 'Companhia inválida.' });
    }
    viatura.companhia = req.body.companhia || '';
  }
  if (req.body.categoria !== undefined) {
    if (!CATEGORIAS_VIATURA.includes(req.body.categoria)) {
      return res.status(400).json({ error: 'Categoria de viatura inválida.' });
    }
    viatura.categoria = req.body.categoria;
  }
  if (req.body.status !== undefined) {
    if (!STATUS_VIATURA.includes(req.body.status)) {
      return res.status(400).json({ error: 'Status de viatura inválido.' });
    }
    viatura.status = req.body.status;
  }
  if (req.body.observacao !== undefined) viatura.observacao = req.body.observacao;
  if (req.body.setor !== undefined) viatura.setor = String(req.body.setor).trim();

  await writeRow('viaturas', viatura);
  res.json(viatura);
}));

// Excluir viatura (P3)
app.delete('/api/viaturas/:id', exigirP3, asyncRoute(async (req, res) => {
  const { data: viatura, error: erroBusca } = await supabase.from('viaturas').select('id').eq('id', req.params.id).maybeSingle();
  if (erroBusca) throw new Error(`Falha ao ler "viaturas" do Supabase: ${erroBusca.message}`);
  if (!viatura) return res.status(404).json({ error: 'Viatura não encontrada.' });
  await deleteRow('viaturas', req.params.id);
  res.json({ message: 'Viatura excluída.' });
}));

// -------------------------------------------------------------
// ROTAS DE CONFIGURAÇÃO (COTA MENSAL DE DIÁRIAS)
// -------------------------------------------------------------
app.get('/api/config', asyncRoute(async (req, res) => {
  res.json(await buscarConfig());
}));

app.put('/api/config', exigirP3, asyncRoute(async (req, res) => {
  const db = await readDB();
  const cota = parseInt(req.body.cota_mensal_diarias, 10);

  if (isNaN(cota) || cota < 0) {
    return res.status(400).json({ error: 'Cota inválida. Informe um número inteiro maior ou igual a 0.' });
  }

  db.config = db.config || {};
  db.config.cota_mensal_diarias = cota;
  await writeDB(db, ['config']);
  res.json(db.config);
}));

// -------------------------------------------------------------
// ROTA DO PLANEJADOR MENSAL DE DIÁRIAS (COTA x CONSUMO)
// -------------------------------------------------------------
app.get('/api/planejador-diarias', exigirP3, asyncRoute(async (req, res) => {
  const db = await readDB();
  const mesFiltro = req.query.mes; // Formato "MM" (ex: "07")
  const anoFiltro = req.query.ano || String(new Date().getFullYear());

  if (!mesFiltro) {
    return res.status(400).json({ error: 'Parâmetro mês é obrigatório (ex: ?mes=07)' });
  }

  // Operações do mês/ano, cada uma com sua diária (real se tem escala, estimada se não tem).
  const operacoes = db.operacoes
    .filter(o => {
      const [ano, mes] = o.data_inicio.split('-');
      return ano === anoFiltro && mes === mesFiltro;
    })
    .map(op => {
      const escalasOp = db.escalas.filter(s => s.operacao_id === op.id);
      const temEscala = escalasOp.length > 0;
      return {
        id: op.id,
        nome_operacao: op.nome_operacao,
        tipo_operacao: op.tipo_operacao,
        situacao: op.situacao,
        data_inicio: op.data_inicio,
        militares_escalados: escalasOp.length,
        qtd_diarias_estimada: op.qtd_diarias_estimada || 0,
        tem_escala: temEscala,
        total_diarias: diariaDaOperacao(op, escalasOp)
      };
    })
    .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));

  const cota = (db.config && db.config.cota_mensal_diarias) || 0;
  // Consumido = diárias reais das operações que já têm escala. Planejado = estimativa das que
  // ainda NÃO têm escala. Nunca a mesma operação nos dois — evita contagem dupla da diária.
  const totalConsumido = operacoes.filter(o => o.tem_escala).reduce((sum, o) => sum + o.total_diarias, 0);
  const totalPlanejado = operacoes.filter(o => !o.tem_escala).reduce((sum, o) => sum + o.qtd_diarias_estimada, 0);

  res.json({
    cota_mensal: cota,
    total_consumido: totalConsumido,
    total_planejado: totalPlanejado,
    saldo: cota - totalConsumido - totalPlanejado,
    operacoes
  });
}));

// -------------------------------------------------------------
// ROTA AGREGADORA DO DASHBOARD (P3) — um único round-trip para popular o
// grid de cards-resumo, em vez de várias chamadas paralelas do frontend.
// -------------------------------------------------------------
app.get('/api/dashboard-resumo', exigirP3, asyncRoute(async (req, res) => {
  // Só as 7 tabelas realmente usadas por este agregador (de 10 no total) — corta 4 SELECTs
  // inúteis (sessoes, bairros_coordenadas, cartoes, viaturas) que o readDB() antigo fazia.
  // Continua em JS puro (Promise.all de readTabela), não em SQL — ver nota de arquitetura
  // no topo do arquivo sobre por que a lógica de negócio fica no shim, não no banco.
  const [eventos, operacoes, escalas, alocacoes, pessoal, usuarios, config] = await Promise.all([
    readTabela('eventos'),
    readTabela('operacoes'),
    readTabela('escalas'),
    readTabela('alocacoes'),
    readTabela('pessoal'),
    readTabela('usuarios'),
    buscarConfig(),
  ]);
  const hojeStr = getLocalDateStrServer();
  const [anoHoje, mesHoje] = hojeStr.split('-');

  // Período do relatório: vem do filtro (?mes=&ano=) ou o mês/ano atual por padrão. "Hoje" (Cartão
  // Programa de hoje, próximos 7 dias) continua sempre literal, independente do período escolhido.
  const anoPeriodo = req.query.ano || anoHoje;
  const mesPeriodo = req.query.mes || mesHoje;
  const prefixoPeriodo = `${anoPeriodo}-${mesPeriodo}`;

  const eventosDoPeriodo = eventos.filter(e => e.data_inicio.startsWith(prefixoPeriodo));
  const idsEventosDoPeriodo = new Set(eventosDoPeriodo.map(e => e.id));

  // Eventos: total no período + próximos 7 dias (sempre a partir de hoje, não do período filtrado)
  const daqui7Dias = new Date();
  daqui7Dias.setDate(daqui7Dias.getDate() + 7);
  const daqui7DiasStr = getLocalDateStrServer(daqui7Dias);
  const eventosProximos7Dias = eventos.filter(e => e.data_inicio >= hojeStr && e.data_inicio <= daqui7DiasStr).length;

  // Diárias: total pago no período + saldo da cota do período (mesma lógica de /api/planejador-diarias).
  // Fonte da diária agora são as OPERAÇÕES do período (não mais eventos): consumido = operações
  // com escala; planejado = estimativa das operações sem escala. Nunca a mesma nos dois.
  const operacoesDoPeriodo = operacoes.filter(o => o.data_inicio.startsWith(prefixoPeriodo));
  const idsOperacoesDoPeriodo = new Set(operacoesDoPeriodo.map(o => o.id));
  const escalasDoPeriodo = escalas.filter(s => idsOperacoesDoPeriodo.has(s.operacao_id));
  const opsComEscala = new Set(escalasDoPeriodo.map(s => s.operacao_id));
  const consumidoPeriodo = escalasDoPeriodo.reduce((sum, s) => sum + (s.total_diarias || 0), 0);
  const operacoesPlanejadas = operacoesDoPeriodo.filter(o => !opsComEscala.has(o.id));
  const planejadoPeriodo = operacoesPlanejadas.reduce((sum, o) => sum + (o.qtd_diarias_estimada || 0), 0);
  const cota = (config && config.cota_mensal_diarias) || 0;

  // Índice alocações por evento — construído uma vez para não varrer alocacoes dentro do forEach abaixo.
  const alocacoesPorEvento = indexarPor(alocacoes, 'evento_id');

  // Efetivo total empregado no período
  const alocacoesDoPeriodo = alocacoes.filter(a => idsEventosDoPeriodo.has(a.evento_id));
  const efetivoTotalPeriodo = alocacoesDoPeriodo.reduce((sum, a) => sum + a.qtd_policiais, 0);

  // Distribuição por tipo de missão/evento no período — mesma agregação de GET /api/estatisticas,
  // só filtrada por mês+ano em vez de ano inteiro.
  const mapaTipo = {};
  eventosDoPeriodo.forEach(evt => {
    const chave = evt.tipo_evento || 'Outros';
    if (!mapaTipo[chave]) {
      mapaTipo[chave] = { tipo_evento: chave, total_eventos: 0, total_policiais: 0, total_viaturas: 0 };
    }
    mapaTipo[chave].total_eventos += 1;
    (alocacoesPorEvento.get(evt.id) || []).forEach(a => {
      mapaTipo[chave].total_policiais += a.qtd_policiais;
      mapaTipo[chave].total_viaturas += a.qtd_viaturas;
    });
  });
  const distribuicaoTipo = Object.values(mapaTipo).sort((a, b) => b.total_eventos - a.total_eventos);

  // Top 10 militares por empenho no período — mesma agregação por militar de /api/relatorio-diarias,
  // sobre as escalas do período. Enriquece com posto/graduação via matrícula (best-effort; escalas
  // antigas podem ter militar_id de texto livre que não casa com nenhum cadastro).
  const postoPorMatricula = new Map();
  pessoal.forEach(p => { if (p.matricula) postoPorMatricula.set(String(p.matricula), p.posto_graduacao || ''); });
  const consolidadoMilitares = {};
  escalasDoPeriodo.forEach(s => {
    const chave = s.militar_id || s.militar_nome;
    if (!consolidadoMilitares[chave]) {
      consolidadoMilitares[chave] = {
        militar_nome: s.militar_nome,
        posto_graduacao: postoPorMatricula.get(String(s.militar_id)) || '',
        escalas_count: 0,
        total_diarias: 0
      };
    }
    consolidadoMilitares[chave].escalas_count += 1;
    consolidadoMilitares[chave].total_diarias += (s.total_diarias || 0);
  });
  const topMilitares = Object.values(consolidadoMilitares)
    .sort((a, b) => b.total_diarias - a.total_diarias || b.escalas_count - a.escalas_count)
    .slice(0, 10);

  // Cadastro de Pessoal: total + quebra Praça/Oficial (não depende de período)
  const totalPessoal = pessoal.length;
  const pracas = pessoal.filter(p => p.tipo === 'Praça').length;
  const oficiais = pessoal.filter(p => p.tipo === 'Oficial').length;

  res.json({
    periodo: { mes: mesPeriodo, ano: anoPeriodo },
    eventos: { total_periodo: eventosDoPeriodo.length, proximos_7_dias: eventosProximos7Dias },
    // `planejado_periodo` alimenta o donut "Diárias — Visão Geral" do Dashboard (consumido real
    // x planejado estimado). Já era calculado aqui pro saldo da cota; só passou a ser exposto.
    diarias: { total_pago_periodo: consumidoPeriodo, planejado_periodo: planejadoPeriodo, saldo_cota_periodo: cota - consumidoPeriodo - planejadoPeriodo, cota_mensal: cota },
    planejador: { operacoes_planejadas: operacoesPlanejadas.length },
    efetivo_total_periodo: efetivoTotalPeriodo,
    distribuicao_tipo: distribuicaoTipo,
    top_militares: topMilitares,
    pessoal: { total: totalPessoal, pracas, oficiais },
    usuarios: { total: usuarios.length }
  });
}));

// As antigas ROTAS DE MISSÕES PLANEJADAS foram removidas: missões viraram `operacoes`
// com situacao='Planejada' (reserva de cota via qtd_diarias_estimada), sem entidade separada
// nem "conversão" que duplicava registro. Ver ROTAS DE OPERAÇÕES acima.


// -------------------------------------------------------------
// ROTA DO RELATÓRIO DE DIÁRIAS (AGREGADO NO MÊS)
// -------------------------------------------------------------
app.get('/api/relatorio-diarias', asyncRoute(async (req, res) => {
  const db = await readDB();
  const mesFiltro = req.query.mes; // Formato "MM" (ex: "07")
  const anoFiltro = req.query.ano || String(new Date().getFullYear());

  if (!mesFiltro) {
    return res.status(400).json({ error: 'Parâmetro mês é obrigatório (ex: ?mes=07)' });
  }

  // 1. Encontra todas as operações no mês e ano selecionados (diária é das operações, não eventos)
  const operacoesNoPeriodo = db.operacoes.filter(o => {
    const dataParts = o.data_inicio.split('-'); // YYYY-MM-DD
    const ano = dataParts[0];
    const mes = dataParts[1];
    return ano === anoFiltro && mes === mesFiltro;
  });

  const idsOperacoesPeriodo = new Set(operacoesNoPeriodo.map(o => o.id));

  // 2. Filtra escalas vinculadas a essas operações
  const escalasFiltradas = db.escalas.filter(s => idsOperacoesPeriodo.has(s.operacao_id));

  // 3. Agrupa por militar_id e militar_nome
  const consolidado = {};
  escalasFiltradas.forEach(esc => {
    const chave = esc.militar_id;
    if (!consolidado[chave]) {
      consolidado[chave] = {
        militar_id: esc.militar_id,
        militar_nome: esc.militar_nome,
        escalas_count: 0,
        qtd_aparicoes: 0,
        total_diarias: 0
      };
    }
    consolidado[chave].escalas_count += 1;
    consolidado[chave].qtd_aparicoes += esc.qtd_aparicoes;
    consolidado[chave].total_diarias += esc.total_diarias;
  });

  res.json(Object.values(consolidado));
}));


// -------------------------------------------------------------
// RELATÓRIO DIÁRIO DE DIÁRIAS (por data ou por operação) — fonte: operacoes + escalas
// -------------------------------------------------------------
app.get('/api/relatorio-diario', exigirP3, asyncRoute(async (req, res) => {
  const db = await readDB();
  const mes = req.query.mes;
  const ano = req.query.ano || String(new Date().getFullYear());
  const agrupar = req.query.agrupar === 'operacao' ? 'operacao' : 'data';
  if (!mes) return res.status(400).json({ error: 'Parâmetro mês é obrigatório (ex: ?mes=07)' });

  const operacoesPeriodo = (db.operacoes || []).filter(o => {
    const partes = o.data_inicio.split('-'); // YYYY-MM-DD
    return partes[0] === ano && partes[1] === mes;
  });
  const opPorId = new Map(operacoesPeriodo.map(o => [o.id, o]));
  const idsOp = new Set(opPorId.keys());
  const escalas = (db.escalas || []).filter(s => idsOp.has(s.operacao_id));

  // índice de pessoal por matrícula, para resolver posto + nome de guerra
  const pessoalPorMat = new Map();
  (db.pessoal || []).forEach(p => { if (p.matricula) pessoalPorMat.set(String(p.matricula), p); });

  const resolver = (esc) => {
    const p = pessoalPorMat.get(String(esc.militar_id));
    return {
      posto_graduacao: p ? (p.posto_graduacao || '') : '',
      nome_guerra: p ? (p.nome_guerra || '') : '',
      militar_nome: esc.militar_nome || '',
      matricula: esc.militar_id || '',
      diarias: esc.total_diarias || 0
    };
  };
  // agrega escalas por militar dentro de um grupo (soma diárias se o mesmo militar repetir)
  const agregarMilitares = (lista) => {
    const mmap = new Map();
    lista.forEach(esc => {
      const chave = esc.militar_id || esc.militar_nome;
      const m = resolver(esc);
      if (mmap.has(chave)) mmap.get(chave).diarias += m.diarias;
      else mmap.set(chave, m);
    });
    return [...mmap.values()];
  };

  let grupos = [];
  let total_mes = 0;

  if (agrupar === 'data') {
    const porData = new Map(); // data -> array de escalas
    escalas.forEach(esc => {
      const data = opPorId.get(esc.operacao_id).data_inicio;
      if (!porData.has(data)) porData.set(data, []);
      porData.get(data).push(esc);
    });
    grupos = [...porData.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([data, escs]) => {
        const militares = agregarMilitares(escs);
        const total = militares.reduce((s, x) => s + x.diarias, 0);
        total_mes += total;
        return { data, total, militares };
      });
  } else {
    grupos = operacoesPeriodo
      .filter(o => escalas.some(s => s.operacao_id === o.id)) // só operações com escala (diária real)
      .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio))
      .map(o => {
        const militares = agregarMilitares(escalas.filter(s => s.operacao_id === o.id));
        const total = militares.reduce((s, x) => s + x.diarias, 0);
        total_mes += total;
        return { operacao: o.nome_operacao, data: o.data_inicio, tipo: o.tipo_operacao, total, militares };
      });
  }

  res.json({ mes, ano, agrupar, total_mes, grupos });
}));


// -------------------------------------------------------------
// ROTA DO CALENDÁRIO DE DIÁRIAS (TOTAL POR DIA NO MÊS)
// -------------------------------------------------------------
app.get('/api/diarias-calendario', exigirP3, asyncRoute(async (req, res) => {
  const db = await readDB();
  const mesFiltro = req.query.mes;
  const anoFiltro = req.query.ano || String(new Date().getFullYear());

  if (!mesFiltro) {
    return res.status(400).json({ error: 'Parâmetro mês é obrigatório (ex: ?mes=07)' });
  }

  const operacoesNoPeriodo = db.operacoes.filter(o => {
    const [ano, mes] = o.data_inicio.split('-');
    return ano === anoFiltro && mes === mesFiltro;
  });

  // Calendário de diárias por dia. Usa diariaDaOperacao: operação com escala conta a diária real,
  // operação só Planejada conta a estimativa — assim a reserva de cota também aparece no calendário.
  const porDia = {};
  operacoesNoPeriodo.forEach(op => {
    const escalasOp = db.escalas.filter(s => s.operacao_id === op.id);
    const totalDiariasOp = diariaDaOperacao(op, escalasOp);
    if (totalDiariasOp === 0) return; // só entra no calendário quem tem diária (real ou estimada)

    if (!porDia[op.data_inicio]) {
      porDia[op.data_inicio] = { dia: op.data_inicio, total_diarias: 0, eventos: [] };
    }
    porDia[op.data_inicio].total_diarias += totalDiariasOp;
    porDia[op.data_inicio].eventos.push({
      id: op.id,
      nome_evento: op.nome_operacao,
      tipo_evento: op.tipo_operacao,
      total_diarias: totalDiariasOp
    });
  });

  res.json(Object.values(porDia));
}));


// -------------------------------------------------------------
// ROTA DE ESTATÍSTICAS (PAINEL ANALÍTICO PARA PLANEJAMENTO)
// -------------------------------------------------------------
app.get('/api/estatisticas', asyncRoute(async (req, res) => {
  const db = await readDB();
  const anoFiltro = req.query.ano || String(new Date().getFullYear());

  const eventosDoAno = db.eventos.filter(e => e.data_inicio.startsWith(anoFiltro));
  const idsEventosDoAno = new Set(eventosDoAno.map(e => e.id));
  const alocacoesDoAno = db.alocacoes.filter(a => idsEventosDoAno.has(a.evento_id));

  // Diárias vêm das OPERAÇÕES do ano (não mais dos eventos). Painel analítico = diária realizada,
  // por isso soma as escalas reais (não a estimativa de operações ainda só Planejadas).
  const operacoesDoAno = db.operacoes.filter(o => o.data_inicio.startsWith(anoFiltro));
  const idsOperacoesDoAno = new Set(operacoesDoAno.map(o => o.id));
  const escalasDoAno = db.escalas.filter(s => idsOperacoesDoAno.has(s.operacao_id));

  // Índices construídos uma vez para as agregações abaixo (evita varrer db.alocacoes/db.escalas
  // dentro dos forEach/loop de meses — antes era O(eventos×alocacoes) e O(12×alocacoes/escalas)).
  const alocacoesPorEvento = indexarPor(db.alocacoes, 'evento_id');
  const escalasPorOperacao = indexarPor(db.escalas, 'operacao_id');

  const totalPoliciais = alocacoesDoAno.reduce((sum, a) => sum + a.qtd_policiais, 0);
  const totalViaturas = alocacoesDoAno.reduce((sum, a) => sum + a.qtd_viaturas, 0);
  const totalDiarias = escalasDoAno.reduce((sum, s) => sum + (s.total_diarias || 0), 0);

  // --- Agrupamento por Bairro ---
  const mapaBairro = {};
  eventosDoAno.forEach(evt => {
    const chave = evt.bairro || 'Não Informado';
    if (!mapaBairro[chave]) {
      mapaBairro[chave] = { bairro: chave, total_eventos: 0, total_policiais: 0, total_viaturas: 0 };
    }
    mapaBairro[chave].total_eventos += 1;
    (alocacoesPorEvento.get(evt.id) || []).forEach(a => {
      mapaBairro[chave].total_policiais += a.qtd_policiais;
      mapaBairro[chave].total_viaturas += a.qtd_viaturas;
    });
  });
  const porBairro = Object.values(mapaBairro).sort((a, b) => b.total_policiais - a.total_policiais);

  // --- Agrupamento por Tipo de Evento ---
  const mapaTipo = {};
  eventosDoAno.forEach(evt => {
    const chave = evt.tipo_evento || 'Outros';
    if (!mapaTipo[chave]) {
      mapaTipo[chave] = { tipo_evento: chave, total_eventos: 0, total_policiais: 0, total_viaturas: 0 };
    }
    mapaTipo[chave].total_eventos += 1;
    (alocacoesPorEvento.get(evt.id) || []).forEach(a => {
      mapaTipo[chave].total_policiais += a.qtd_policiais;
      mapaTipo[chave].total_viaturas += a.qtd_viaturas;
    });
  });
  const porTipo = Object.values(mapaTipo)
    .map(t => ({ ...t, media_policiais_por_evento: t.total_eventos > 0 ? Math.round((t.total_policiais / t.total_eventos) * 10) / 10 : 0 }))
    .sort((a, b) => b.total_policiais - a.total_policiais);

  // --- Agrupamento por Modalidade de Policiamento ---
  const mapaModalidade = {};
  alocacoesDoAno.forEach(a => {
    const chave = a.modalidade || 'Outros';
    if (!mapaModalidade[chave]) {
      mapaModalidade[chave] = { modalidade: chave, total_alocacoes: 0, total_policiais: 0, total_viaturas: 0 };
    }
    mapaModalidade[chave].total_alocacoes += 1;
    mapaModalidade[chave].total_policiais += a.qtd_policiais;
    mapaModalidade[chave].total_viaturas += a.qtd_viaturas;
  });
  const porModalidade = Object.values(mapaModalidade)
    .map(m => ({ ...m, percentual_efetivo: totalPoliciais > 0 ? Math.round((m.total_policiais / totalPoliciais) * 1000) / 10 : 0 }))
    .sort((a, b) => b.total_policiais - a.total_policiais);

  // --- Tendência Mensal (Jan a Dez do ano filtrado) ---
  // "Planejado" x "Realizado" é calculado pela data (sem depender de status manual):
  // o evento é considerado realizado quando seu término (ou início) já passou.
  const hojeStr = getLocalDateStrServer();
  const tendenciaMensal = [];
  for (let mes = 1; mes <= 12; mes++) {
    const mesStr = String(mes).padStart(2, '0');
    const eventosDoMes = eventosDoAno.filter(e => e.data_inicio.split('-')[1] === mesStr);
    // Soma efetivo/viaturas do mês pelos índices (mesma soma que filtrar db.alocacoes por evento do mês).
    let efetivoMes = 0;
    let viaturasMes = 0;
    eventosDoMes.forEach(e => {
      (alocacoesPorEvento.get(e.id) || []).forEach(a => {
        efetivoMes += a.qtd_policiais;
        viaturasMes += a.qtd_viaturas;
      });
    });
    const operacoesDoMes = operacoesDoAno.filter(o => o.data_inicio.split('-')[1] === mesStr);
    let diariasMes = 0;
    operacoesDoMes.forEach(o => {
      (escalasPorOperacao.get(o.id) || []).forEach(s => { diariasMes += (s.total_diarias || 0); });
    });
    const realizadosMes = eventosDoMes.filter(e => (e.data_termino || e.data_inicio) < hojeStr).length;
    const planejadosMes = eventosDoMes.length - realizadosMes;

    tendenciaMensal.push({
      mes: mesStr,
      total_eventos: eventosDoMes.length,
      eventos_planejados: planejadosMes,
      eventos_realizados: realizadosMes,
      total_policiais: efetivoMes,
      total_viaturas: viaturasMes,
      total_diarias: diariasMes
    });
  }

  res.json({
    ano: anoFiltro,
    resumo: {
      total_eventos: eventosDoAno.length,
      total_policiais: totalPoliciais,
      total_viaturas: totalViaturas,
      total_diarias: totalDiarias
    },
    por_bairro: porBairro,
    por_tipo: porTipo,
    por_modalidade: porModalidade,
    tendencia_mensal: tendenciaMensal
  });
}));

// Calcula a duração em horas (decimal) entre dois horários "HH:MM". Retorna 0 se inválido.
function duracaoHoras(inicio, fim) {
  if (!inicio || !fim) return 0;
  const [hi, mi] = inicio.split(':').map(Number);
  const [hf, mf] = fim.split(':').map(Number);
  if ([hi, mi, hf, mf].some(Number.isNaN)) return 0;

  let minutos = (hf * 60 + mf) - (hi * 60 + mi);
  if (minutos < 0) minutos += 24 * 60; // roteiro que atravessa a meia-noite
  return minutos / 60;
}

// -------------------------------------------------------------
// ROTA DE ESTATÍSTICAS DO CARTÃO PROGRAMA (PATRULHAMENTO)
// -------------------------------------------------------------
app.get('/api/estatisticas-cartao', asyncRoute(async (req, res) => {
  const db = await readDB();
  const anoFiltro = req.query.ano || String(new Date().getFullYear());

  const cartoesDoAno = (db.cartoes || []).filter(c => !c.is_template && c.data && c.data.startsWith(anoFiltro));

  let totalItensRoteiro = 0;
  let totalHoras = 0;
  let totalViaturasDia = 0;

  const mapaSetor = {};
  const mapaAtividade = {};
  const mapaViatura = {};

  cartoesDoAno.forEach(cartao => {
    (cartao.viaturas || []).forEach(vtr => {
      totalViaturasDia += 1;

      const chaveViatura = vtr.prefixo || 'Não informado';
      if (!mapaViatura[chaveViatura]) {
        mapaViatura[chaveViatura] = { prefixo: chaveViatura, qtd_dias: 0, qtd_itens: 0 };
      }
      mapaViatura[chaveViatura].qtd_dias += 1;

      const chaveSetor = vtr.setor || 'Não informado';
      if (!mapaSetor[chaveSetor]) {
        mapaSetor[chaveSetor] = { setor: chaveSetor, qtd_itens: 0, horas_totais: 0 };
      }

      (vtr.itens || []).forEach(item => {
        totalItensRoteiro += 1;
        mapaViatura[chaveViatura].qtd_itens += 1;
        mapaSetor[chaveSetor].qtd_itens += 1;

        const horas = duracaoHoras(item.inicio, item.fim);
        mapaSetor[chaveSetor].horas_totais += horas;
        totalHoras += horas;

        const chaveAtividade = item.atividade || 'Outros';
        if (!mapaAtividade[chaveAtividade]) {
          mapaAtividade[chaveAtividade] = { atividade: chaveAtividade, qtd_itens: 0 };
        }
        mapaAtividade[chaveAtividade].qtd_itens += 1;
      });
    });
  });

  const porSetor = Object.values(mapaSetor)
    .map(s => ({ ...s, horas_totais: Math.round(s.horas_totais * 10) / 10 }))
    .sort((a, b) => b.qtd_itens - a.qtd_itens);

  const porAtividade = Object.values(mapaAtividade)
    .map(a => ({ ...a, percentual: totalItensRoteiro > 0 ? Math.round((a.qtd_itens / totalItensRoteiro) * 1000) / 10 : 0 }))
    .sort((a, b) => b.qtd_itens - a.qtd_itens);

  const porViatura = Object.values(mapaViatura).sort((a, b) => b.qtd_dias - a.qtd_dias);

  const tendenciaMensal = [];
  for (let mes = 1; mes <= 12; mes++) {
    const mesStr = String(mes).padStart(2, '0');
    const cartoesDoMes = cartoesDoAno.filter(c => c.data.split('-')[1] === mesStr);
    tendenciaMensal.push({
      mes: mesStr,
      total_cartoes: cartoesDoMes.length,
      total_viaturas_dia: cartoesDoMes.reduce((sum, c) => sum + (c.viaturas || []).length, 0)
    });
  }

  res.json({
    ano: anoFiltro,
    resumo: {
      total_cartoes: cartoesDoAno.length,
      total_viaturas_dia: totalViaturasDia,
      total_itens_roteiro: totalItensRoteiro,
      total_horas: Math.round(totalHoras * 10) / 10
    },
    por_setor: porSetor,
    por_atividade: porAtividade,
    por_viatura: porViatura,
    tendencia_mensal: tendenciaMensal
  });
}));


// -------------------------------------------------------------
// ROTAS DO CARTÃO PROGRAMA (PATRULHAMENTO DIÁRIO POR VIATURA)
// -------------------------------------------------------------

// Número sequencial do Cartão Programa (000123/2026), atribuído na CRIAÇÃO do
// cartão — nunca na geração do PDF, pra o número não mudar entre uma versão e
// outra do mesmo cartão. A corrida é resolvida no banco pela função
// proximo_numero_cartao (INSERT ... ON CONFLICT DO UPDATE serializa na linha do
// ano); ver migrations/001_cartao_avisos.sql.
// Falha na numeração NÃO impede criar o cartão: o operador precisa do roteiro
// muito mais do que do número, e um cartão sem número é recuperável (o índice
// único ignora numero null). Só registra no log.
async function proximoNumeroCartao(dataCartao) {
  const ano = parseInt(String(dataCartao).slice(0, 4), 10);
  if (!Number.isFinite(ano)) return { ano: null, numero: null };
  try {
    const { data, error } = await supabase.rpc('proximo_numero_cartao', { p_ano: ano });
    if (error) throw new Error(error.message);
    return { ano, numero: data };
  } catch (erro) {
    console.error(`Falha ao numerar o Cartão Programa de ${dataCartao}:`, erro.message);
    return { ano, numero: null };
  }
}

// Campos de controle de envio/versão que vivem em CADA viatura do JSONB (não no
// cartão): o PDF é gerado e mandado por viatura, então status, versão e avisos
// selecionados são por viatura. Ver migrations/001_cartao_avisos.sql.
function camposEnvioIniciais() {
  return {
    avisos_ids: [],
    comandante_pessoal_id: '',
    comandante_exibicao: '',
    bairro_id: '',
    versao: 1,
    status_envio: 'pendente',
    gerado_em: null,
    // Retrato do conteúdo no momento em que o PDF foi gerado — é a referência
    // para saber se o que o comandante recebeu ainda vale.
    hash_conteudo: null
  };
}

// Só o que SAI NO DOCUMENTO entra no hash. Mudar `observacao` ou `setor` (que
// não são impressos) não invalida um cartão já enviado; mudar horário, local,
// comandante ou o Delta 07 invalida.
function hashConteudoCartaoViatura(cartao, viatura) {
  const partes = [
    cartao.numero, cartao.ano, cartao.data,
    cartao.fiscal, cartao.fiscal_pessoal_id, cartao.adjunto, cartao.adjunto_pessoal_id,
    cartao.delta07_viatura,
    viatura.prefixo, viatura.companhia, viatura.categoria, viatura.setor,
    viatura.comandante, viatura.comandante_pessoal_id, viatura.composicao,
    viatura.observacao, viatura.bairro_id, (viatura.bairros_ids || []).join('|'),
    (viatura.avisos_ids || []).join('|'),
    (viatura.itens || []).map(i => `${i.inicio}~${i.fim}~${i.local}~${i.atividade}`).join('|')
  ];
  return crypto.createHash('sha1').update(partes.map(p => String(p ?? '')).join('§')).digest('hex');
}

/**
 * Reavalia o status de envio das viaturas depois de QUALQUER escrita no cartão.
 * Uma viatura que já foi gerada ou enviada e cujo conteúdo impresso mudou volta
 * para "alterado" e sobe de versão — é o gatilho do "_v2" e do reenvio.
 *
 * A versão sobe só na TRANSIÇÃO (gerado|enviado -> alterado): sem isso, cada
 * ajuste seguinte viraria v3, v4, v5 antes mesmo de o cartão ser reenviado.
 * Muta o objeto `cartao` recebido; quem chama grava com writeRow.
 */
function reavaliarStatusEnvio(cartao) {
  (cartao.viaturas || []).forEach(viatura => {
    if (viatura.status_envio !== 'gerado' && viatura.status_envio !== 'enviado') return;
    if (!viatura.hash_conteudo) return;
    if (hashConteudoCartaoViatura(cartao, viatura) === viatura.hash_conteudo) return;

    viatura.status_envio = 'alterado';
    viatura.versao = (viatura.versao || 1) + 1;
  });
}

// Lista resumida (filtrável por data exata, ou por mês/ano para o histórico) — nunca inclui templates
app.get('/api/cartoes', asyncRoute(async (req, res) => {
  const cartoes = await buscarCartoesFiltrados({ data: req.query.data, ano: req.query.ano, mes: req.query.mes });

  const resumo = cartoes
    .sort((a, b) => b.data.localeCompare(a.data))
    .map(c => ({
      id: c.id,
      data: c.data,
      fiscal: c.fiscal,
      adjunto: c.adjunto,
      qtd_viaturas: (c.viaturas || []).length
    }));

  res.json(resumo);
}));

// Lista de templates de Cartão Programa, com filtro opcional por período/quantidade de viaturas
// IMPORTANTE: precisa vir antes de /api/cartoes/:id para o Express não tratar "templates" como :id
app.get('/api/cartoes/templates', asyncRoute(async (req, res) => {
  let templates = await readTabela('cartoes', { is_template: true });

  if (req.query.tipo_periodo) {
    templates = templates.filter(c => c.tipo_periodo === req.query.tipo_periodo);
  }
  if (req.query.qtd_viaturas_base) {
    const qtd = parseInt(req.query.qtd_viaturas_base, 10);
    templates = templates.filter(c => c.qtd_viaturas_base === qtd);
  }

  res.json(templates.map(c => ({
    id: c.id,
    nome_template: c.nome_template,
    tipo_periodo: c.tipo_periodo,
    qtd_viaturas_base: c.qtd_viaturas_base,
    qtd_viaturas: (c.viaturas || []).length,
    padrao_ativo: !!c.padrao_ativo
  })));
}));

// Clona um template inteiro (viaturas + itens) como NOVO template. Não mexe no
// padrão ativo: a cópia nasce inativa e o padrão em vigor continua o mesmo.
// Registrada antes de /api/cartoes/:id pela mesma razão de /templates acima —
// aqui o caminho tem 3 segmentos e não colidiria, mas manter as rotas literais
// juntas e à frente é o que evita a armadilha quando alguém cria a próxima.
app.post('/api/cartoes/templates/:id/duplicar', exigirP3, asyncRoute(async (req, res) => {
  const origem = await buscarCartaoPorId(req.params.id);
  if (!origem || !origem.is_template) {
    return res.status(404).json({ error: 'Cartão padrão não encontrado.' });
  }

  const nomeInformado = String(req.body.nome_template || '').trim();
  const nome = (nomeInformado || `Cópia de ${origem.nome_template || 'cartão padrão'}`).slice(0, 120);

  const copia = {
    id: generateId('cp'),
    data: null,
    fiscal: '',
    adjunto: '',
    oficial_sobreaviso: '',
    is_template: true,
    nome_template: nome,
    tipo_periodo: origem.tipo_periodo,
    qtd_viaturas_base: origem.qtd_viaturas_base,
    // Não é um cartão do dia clonado de um padrão: é outro padrão. `origem_template_id`
    // rastreia "de qual padrão veio o cartão do DIA" e ficaria mentindo aqui.
    origem_template_id: null,
    padrao_ativo: false,
    // A estrutura (prefixo/setor/companhia/categoria/observação/bairro) é o que se
    // reaproveita; comandante e controle de envio não pertencem a um padrão.
    viaturas: (origem.viaturas || []).map(v => ({
      id: generateId('cpv'),
      prefixo: v.prefixo,
      setor: v.setor,
      companhia: v.companhia || '',
      categoria: v.categoria || 'Ordinária',
      comandante: '',
      observacao: v.observacao || '',
      ...camposEnvioIniciais(),
      bairro_id: v.bairro_id || '',
      itens: ordenarPorTurno((v.itens || []).map(i => ({
        id: generateId('cpi'),
        inicio: i.inicio,
        fim: i.fim,
        local: i.local,
        atividade: i.atividade
      })))
    }))
  };

  await writeRow('cartoes', copia);
  res.status(201).json(copia);
}));

// Transforma o cartão de UM DIA em um novo cartão padrão. O inverso de
// POST /api/cartoes, que clona o padrão para criar o dia.
app.post('/api/cartoes/:id/salvar-como-padrao', exigirP3, asyncRoute(async (req, res) => {
  const origem = await buscarCartaoPorId(req.params.id);
  if (!origem) return res.status(404).json({ error: 'Cartão Programa não encontrado.' });
  if (origem.is_template) {
    return res.status(400).json({ error: 'Este cartão já é um padrão. Use "Duplicar" para criar outro a partir dele.' });
  }

  const nome = String(req.body.nome_template || '').trim();
  if (!nome) return res.status(400).json({ error: 'Informe o nome do novo cartão padrão.' });

  // tipo_periodo é obrigatório no template (o padrão é escolhido por período) e o
  // cartão do dia pode estar sem ele — nesse caso o P3 informa junto.
  const tipoPeriodo = ['semana', 'fim_de_semana'].includes(req.body.tipo_periodo)
    ? req.body.tipo_periodo
    : origem.tipo_periodo;
  if (!['semana', 'fim_de_semana'].includes(tipoPeriodo)) {
    return res.status(400).json({ error: "Informe o tipo de período ('semana' ou 'fim_de_semana')." });
  }

  const qtdViaturas = (origem.viaturas || []).length;
  const novoPadrao = {
    id: generateId('cp'),
    // Tudo que é do DIA é descartado: data, numeração oficial, comandantes
    // escalados e o controle de envio daquele serviço.
    data: null,
    ano: null,
    numero: null,
    fiscal: '',
    adjunto: '',
    oficial_sobreaviso: '',
    fiscal_pessoal_id: '',
    adjunto_pessoal_id: '',
    fiscal_exibicao: '',
    adjunto_exibicao: '',
    delta07_viatura: '',
    is_template: true,
    nome_template: nome.slice(0, 120),
    tipo_periodo: tipoPeriodo,
    qtd_viaturas_base: [5, 6, 7].includes(qtdViaturas) ? qtdViaturas : (origem.qtd_viaturas_base || 5),
    origem_template_id: null,
    // Nasce inativo de propósito: virar padrão em vigor é um segundo ato,
    // explícito, em "Definir como padrão".
    padrao_ativo: false,
    viaturas: (origem.viaturas || []).map(v => ({
      id: generateId('cpv'),
      prefixo: v.prefixo,
      setor: v.setor,
      companhia: v.companhia || '',
      categoria: v.categoria || 'Ordinária',
      comandante: '',
      observacao: v.observacao || '',
      ...camposEnvioIniciais(),
      bairro_id: v.bairro_id || '',
      itens: ordenarPorTurno((v.itens || []).map(i => ({
        id: generateId('cpi'),
        inicio: i.inicio,
        fim: i.fim,
        local: i.local,
        atividade: i.atividade
      })))
    }))
  };

  await writeRow('cartoes', novoPadrao);
  res.status(201).json(novoPadrao);
}));

// Padrão ativo que originaria o cartão de uma data (fonte de todo cartão do dia
// novo) — precisa vir antes de /api/cartoes/:id pelo mesmo motivo de /templates.
// `?data=` faz a rota devolver o MESMO padrão que o POST usaria naquele dia, para
// a tela poder dizer de qual padrão o cartão vai nascer antes do clique.
app.get('/api/cartoes/padrao-ativo', asyncRoute(async (req, res) => {
  const padrao = await buscarPadraoAtivo(req.query.data || null);
  if (!padrao) return res.json({ padrao: null });

  res.json({
    padrao: {
      ...padrao,
      viaturas: (padrao.viaturas || []).map(v => ({ ...v, itens: ordenarPorTurno(v.itens || []) }))
    }
  });
}));

// Detalhe completo de um cartão (ou template)
app.get('/api/cartoes/:id', asyncRoute(async (req, res) => {
  const cartao = await buscarCartaoPorId(req.params.id);
  if (!cartao) return res.status(404).json({ error: 'Cartão Programa não encontrado' });

  // Reordena os itens por turno na leitura — cartões salvos antes desta mudança ainda estão
  // em ordem alfabética simples; isso corrige a exibição sem exigir migração de dados.
  const cartaoOrdenado = {
    ...cartao,
    viaturas: (cartao.viaturas || []).map(v => ({ ...v, itens: ordenarPorTurno(v.itens || []) }))
  };
  res.json(cartaoOrdenado);
}));

// Criar o cartão do dia (sempre a partir do padrão ativo — ver ativar_cartao_padrao),
// ou criar um TEMPLATE nomeado (is_template=true, exclusivo do P3, sem data)
app.post('/api/cartoes', asyncRoute(async (req, res) => {
  if (req.body.is_template) {
    if (!req.user || req.user.role !== 'P3') {
      return res.status(403).json({ error: 'Apenas o perfil P3 tem permissão para criar templates.' });
    }
    const { nome_template, tipo_periodo, qtd_viaturas_base } = req.body;
    if (!nome_template) {
      return res.status(400).json({ error: 'O nome do template é obrigatório.' });
    }
    if (!['semana', 'fim_de_semana'].includes(tipo_periodo)) {
      return res.status(400).json({ error: "tipo_periodo deve ser 'semana' ou 'fim_de_semana'." });
    }
    if (![5, 6, 7].includes(parseInt(qtd_viaturas_base, 10))) {
      return res.status(400).json({ error: 'qtd_viaturas_base deve ser 5, 6 ou 7.' });
    }

    const novoTemplate = {
      id: generateId('cp'),
      data: null,
      fiscal: '',
      adjunto: '',
      oficial_sobreaviso: '',
      is_template: true,
      nome_template,
      tipo_periodo,
      qtd_viaturas_base: parseInt(qtd_viaturas_base, 10),
      origem_template_id: null,
      viaturas: [],
      padrao_ativo: false
    };
    await writeRow('cartoes', novoTemplate);
    return res.status(201).json(novoTemplate);
  }

  const dataCartao = req.body.data;
  if (!dataCartao) {
    return res.status(400).json({ error: 'A data do Cartão Programa é obrigatória.' });
  }

  // SELECT pontual (não readDB) só para checar duplicata da data.
  const existentes = await buscarCartoesFiltrados({ data: dataCartao });
  if (existentes.length > 0) {
    return res.status(409).json({ error: 'Já existe um Cartão Programa para esta data.' });
  }

  // Escolhe pelo dia da semana da data (sáb/dom = fim de semana), com fallback
  // para o padrão do outro período quando não houver do tipo certo.
  const padrao = await buscarPadraoAtivo(dataCartao);
  if (!padrao) {
    return res.status(409).json({
      error: 'Nenhum cartão padrão ativo. Peça ao P3 para definir o padrão antes de criar o cartão do dia.'
    });
  }

  const { ano, numero } = await proximoNumeroCartao(dataCartao);

  const novoCartao = {
    id: generateId('cp'),
    data: dataCartao,
    fiscal: req.body.fiscal || '',
    adjunto: req.body.adjunto || '',
    oficial_sobreaviso: req.body.oficial_sobreaviso || '',
    is_template: false,
    nome_template: null,
    tipo_periodo: ['semana', 'fim_de_semana'].includes(req.body.tipo_periodo)
      ? req.body.tipo_periodo
      : (padrao.tipo_periodo || null),
    qtd_viaturas_base: padrao.qtd_viaturas_base,
    origem_template_id: padrao.id,
    ano,
    numero,
    fiscal_pessoal_id: req.body.fiscal_pessoal_id || '',
    adjunto_pessoal_id: req.body.adjunto_pessoal_id || '',
    fiscal_exibicao: '',
    adjunto_exibicao: '',
    delta07_viatura: req.body.delta07_viatura || '',
    padrao_ativo: false,
    // Clone do padrão ativo: comandante e controle de envio nascem zerados (é um
    // cartão novo, ainda não gerado nem mandado); bairro é estrutural e vem junto.
    // Os avisos selecionados não vêm — a vigência pode ter mudado desde o padrão
    // e são recalculados na data nova (camposEnvioIniciais já zera avisos_ids).
    viaturas: (padrao.viaturas || []).map(v => ({
      id: generateId('cpv'),
      prefixo: v.prefixo,
      setor: v.setor,
      companhia: v.companhia || '',
      categoria: v.categoria || 'Ordinária',
      comandante: '',
      observacao: v.observacao || '',
      ...camposEnvioIniciais(),
      bairro_id: v.bairro_id || '',
      itens: ordenarPorTurno((v.itens || []).map(i => ({
        id: generateId('cpi'),
        inicio: i.inicio,
        fim: i.fim,
        local: i.local,
        atividade: i.atividade
      })))
    }))
  };

  await writeRow('cartoes', novoCartao);
  res.status(201).json(novoCartao);
}));

// Define qual template é o padrão único ativo (fonte de todo cartão do dia novo).
// A troca é atômica no banco (ativar_cartao_padrao) para nunca haver um instante sem padrão.
app.put('/api/cartoes/:id/padrao-ativo', exigirP3, asyncRoute(async (req, res) => {
  const template = await buscarCartaoPorId(req.params.id);
  if (!template) return res.status(404).json({ error: 'Cartão padrão não encontrado.' });
  if (!template.is_template) return res.status(400).json({ error: 'Este cartão não é um template.' });

  const { error } = await supabase.rpc('ativar_cartao_padrao', { p_id: req.params.id });
  if (error) return res.status(500).json({ error: 'Falha ao definir o padrão ativo.' });

  res.json({ ok: true });
}));

// Atualizar cabeçalho do cartão (fiscal / adjunto / oficial de sobreaviso)
app.put('/api/cartoes/:id', exigirEdicaoCartao, asyncRoute(async (req, res) => {
  const db = await readDB();
  const cartao = (db.cartoes || []).find(c => c.id === req.params.id);
  if (!cartao) return res.status(404).json({ error: 'Cartão Programa não encontrado' });
  if (cartao.is_template && req.user.role !== 'P3') {
    return res.status(403).json({ error: 'Apenas o perfil P3 pode editar um cartão padrão.' });
  }

  // padrao:'' de propósito nos três — o frontend manda string vazia para "limpar" a seleção
  // (voltar para "Selecione..."), e isso precisa continuar entrando em valores explicitamente.
  const v = validarCampos(req.body, {
    fiscal: { obrigatorio: false, tipo: 'string', max: 150, padrao: '', label: 'Fiscal de Operações' },
    adjunto: { obrigatorio: false, tipo: 'string', max: 150, padrao: '', label: 'Adjunto' },
    oficial_sobreaviso: { obrigatorio: false, tipo: 'string', max: 150, padrao: '', label: 'Oficial de Sobreaviso' },
    // "Delta 07" é o rótulo operacional do Fiscal de Operações — por isso o id
    // é fiscal_pessoal_id, não delta07_pessoal_id. `delta07_viatura` é a
    // guarnição (prefixo de VTR) em que o Delta 07 está no dia.
    fiscal_pessoal_id: { obrigatorio: false, tipo: 'string', max: 60, padrao: '', label: 'Delta 07 (cadastro)' },
    adjunto_pessoal_id: { obrigatorio: false, tipo: 'string', max: 60, padrao: '', label: 'Adjunto (cadastro)' },
    delta07_viatura: { obrigatorio: false, tipo: 'string', max: 30, padrao: '', label: 'Guarnição do Delta 07' }
  });
  if (!v.ok) return res.status(400).json({ error: v.erro });

  if (req.body.fiscal !== undefined) cartao.fiscal = v.valores.fiscal;
  if (req.body.adjunto !== undefined) cartao.adjunto = v.valores.adjunto;
  if (req.body.oficial_sobreaviso !== undefined) cartao.oficial_sobreaviso = v.valores.oficial_sobreaviso;
  if (req.body.fiscal_pessoal_id !== undefined) cartao.fiscal_pessoal_id = v.valores.fiscal_pessoal_id;
  if (req.body.adjunto_pessoal_id !== undefined) cartao.adjunto_pessoal_id = v.valores.adjunto_pessoal_id;
  if (req.body.delta07_viatura !== undefined) cartao.delta07_viatura = v.valores.delta07_viatura;

  // O cabeçalho sai no documento de TODAS as viaturas: trocar o Delta 07
  // invalida todos os cartões já enviados daquele dia.
  reavaliarStatusEnvio(cartao);

  // tipo_periodo escolhido manualmente (Dia Útil / Fim de Semana). String vazia limpa (null).
  if (req.body.tipo_periodo !== undefined) {
    cartao.tipo_periodo = ['semana', 'fim_de_semana'].includes(req.body.tipo_periodo) ? req.body.tipo_periodo : null;
  }

  await writeRow('cartoes', cartao);
  res.json(cartao);
}));

// Excluir cartão. P3 exclui qualquer um, sem prazo. O Adjunto pode excluir o
// cartão de UM DIA até as 07h00 do dia seguinte à data do serviço — depois
// disso o roteiro já foi cumprido e vira registro histórico. Template continua
// sendo exclusividade do P3 em qualquer horário: não é roteiro de um dia, é
// estrutura reaproveitada por todos os cartões futuros.
// Oficial não exclui nada (só tem leitura no Cartão Programa).
app.delete('/api/cartoes/:id', asyncRoute(async (req, res) => {
  const { data: cartaoAlvo } = await supabase.from('cartoes').select('data, is_template, nome_template, padrao_ativo').eq('id', req.params.id).maybeSingle();
  if (!cartaoAlvo) return res.status(404).json({ error: 'Cartão Programa não encontrado' });

  // Excluir o padrão ATIVO deixaria o sistema sem nenhum, e o Adjunto tomaria 409
  // ao criar o cartão do dia seguinte. Vale inclusive para o P3: ative outro antes.
  if (cartaoAlvo.padrao_ativo) {
    return res.status(409).json({
      error: 'Este é o cartão padrão ativo e não pode ser excluído. Defina outro padrão como ativo antes de excluí-lo.'
    });
  }

  const ehP3 = req.user && req.user.role === 'P3';
  if (!ehP3) {
    if (req.user?.role !== 'Adjunto') {
      return res.status(403).json({ error: 'Você não tem permissão para excluir o Cartão Programa.' });
    }
    if (cartaoAlvo.is_template) {
      return res.status(403).json({ error: 'Apenas o perfil P3 pode excluir um cartão padrão.' });
    }
    if (!dentroDaJanelaExclusaoAdjunto(cartaoAlvo.data)) {
      return res.status(403).json({
        error: `O prazo para excluir o Cartão Programa de ${formatarDataBr(cartaoAlvo.data)} terminou às 07h00 de ${formatarDataBr(proximoDiaISO(cartaoAlvo.data))}. Peça ao P3.`
      });
    }
  }

  await deleteRow('cartoes', req.params.id);
  res.json({ message: 'Cartão Programa excluído' });
}));

// Adicionar viatura ao cartão
app.post('/api/cartoes/:id/viaturas', exigirEdicaoCartao, asyncRoute(async (req, res) => {
  const db = await readDB();
  const cartao = (db.cartoes || []).find(c => c.id === req.params.id);
  if (!cartao) return res.status(404).json({ error: 'Cartão Programa não encontrado' });
  if (cartao.is_template && req.user.role !== 'P3') {
    return res.status(403).json({ error: 'Apenas o perfil P3 pode editar um cartão padrão.' });
  }

  const v = validarCampos(req.body, {
    prefixo: { obrigatorio: true, tipo: 'string', max: 30, label: 'Prefixo da VTR' },
    setor: { obrigatorio: true, tipo: 'string', max: 100, label: 'Setor / Bairro' },
    companhia: { obrigatorio: false, tipo: 'string', valores: COMPANHIAS_VIATURA, padrao: '', label: 'Companhia' },
    categoria: { obrigatorio: false, tipo: 'string', valores: CATEGORIAS_VIATURA, padrao: 'Ordinária', label: 'Categoria' },
    comandante: { obrigatorio: false, tipo: 'string', max: 150, padrao: '', label: 'Comandante' },
    composicao: { obrigatorio: false, tipo: 'string', max: 300, padrao: '', label: 'Composição da guarnição' },
    observacao: { obrigatorio: false, tipo: 'string', max: 300, padrao: '', label: 'Observação' },
    // bairro_id liga a viatura ao cadastro de bairros (é o que traz os Avisos
    // Operacionais do bairro). `setor` continua existindo em paralelo: é texto
    // livre, usado pelo Mapa e pelo Quadro Resumo, e nem todo setor é um bairro.
    bairro_id: { obrigatorio: false, tipo: 'string', max: 60, padrao: '', label: 'Bairro' },
    comandante_pessoal_id: { obrigatorio: false, tipo: 'string', max: 60, padrao: '', label: 'Comandante (cadastro)' }
  });
  if (!v.ok) return res.status(400).json({ error: v.erro });

  const novaViatura = {
    id: generateId('cpv'),
    prefixo: v.valores.prefixo,
    setor: v.valores.setor,
    companhia: v.valores.companhia,
    categoria: v.valores.categoria,
    comandante: v.valores.comandante,
    composicao: v.valores.composicao,
    observacao: v.valores.observacao,
    ...camposEnvioIniciais(),
    bairro_id: v.valores.bairro_id,
    bairros_ids: [...new Set(Array.isArray(req.body.bairros_ids)
      ? req.body.bairros_ids.filter(id => typeof id === 'string' && id)
      : (v.valores.bairro_id ? [v.valores.bairro_id] : []))].slice(0, 12),
    comandante_pessoal_id: v.valores.comandante_pessoal_id,
    // O Adjunto já escolhe os avisos no mesmo formulário em que aloca a viatura
    // no bairro, então eles podem chegar já no POST.
    avisos_ids: Array.isArray(req.body.avisos_ids)
      ? req.body.avisos_ids.filter(id => typeof id === 'string' && id).slice(0, MAX_AVISOS_POR_CARTAO)
      : [],
    itens: []
  };

  cartao.viaturas.push(novaViatura);
  await writeRow('cartoes', cartao);
  res.status(201).json(novaViatura);
}));

// Atualizar viatura
app.put('/api/cartoes/:id/viaturas/:vid', exigirEdicaoCartao, asyncRoute(async (req, res) => {
  const db = await readDB();
  const cartao = (db.cartoes || []).find(c => c.id === req.params.id);
  if (!cartao) return res.status(404).json({ error: 'Cartão Programa não encontrado' });
  if (cartao.is_template && req.user.role !== 'P3') {
    return res.status(403).json({ error: 'Apenas o perfil P3 pode editar um cartão padrão.' });
  }

  const viatura = cartao.viaturas.find(v => v.id === req.params.vid);
  if (!viatura) return res.status(404).json({ error: 'Viatura não encontrada neste cartão' });

  if (req.body.companhia !== undefined && req.body.companhia && !COMPANHIAS_VIATURA.includes(req.body.companhia)) {
    return res.status(400).json({ error: 'Companhia inválida.' });
  }
  if (req.body.categoria !== undefined && !CATEGORIAS_VIATURA.includes(req.body.categoria)) {
    return res.status(400).json({ error: 'Categoria de viatura inválida.' });
  }

  // Viaturas gravadas antes da migration 001 não têm os campos de bairro/envio.
  // Não há migração de boot pra preenchê-los: reescrever todos os cartões
  // custaria banco à toa, e todo leitor (frontend e gerador de PDF) trata a
  // ausência com `|| ''`. Aqui eles entram naturalmente na primeira edição.
  ['prefixo', 'setor', 'companhia', 'categoria', 'comandante', 'composicao', 'observacao', 'bairro_id', 'comandante_pessoal_id'].forEach(campo => {
    if (req.body[campo] !== undefined) viatura[campo] = req.body[campo];
  });

  if (req.body.bairros_ids !== undefined) {
    if (!Array.isArray(req.body.bairros_ids)) {
      return res.status(400).json({ error: 'bairros_ids deve ser uma lista de ids de bairro.' });
    }
    viatura.bairros_ids = [...new Set(req.body.bairros_ids.filter(id => typeof id === 'string' && id))].slice(0, 12);
    viatura.bairro_id = viatura.bairros_ids[0] || '';
  }

  // Avisos selecionados para o cartão desta viatura: só os ids, nunca o texto.
  // Teto de 4 aplicado também aqui (o cliente já limita, mas a regra protege o
  // formato de uma página independentemente de quem chamou a API).
  if (req.body.avisos_ids !== undefined) {
    if (!Array.isArray(req.body.avisos_ids)) {
      return res.status(400).json({ error: 'avisos_ids deve ser uma lista de ids de aviso.' });
    }
    viatura.avisos_ids = req.body.avisos_ids
      .filter(id => typeof id === 'string' && id)
      .slice(0, MAX_AVISOS_POR_CARTAO);
  }

  reavaliarStatusEnvio(cartao);

  await writeRow('cartoes', cartao);
  res.json(viatura);
}));

// Remover viatura do cartão
app.delete('/api/cartoes/:id/viaturas/:vid', exigirEdicaoCartao, asyncRoute(async (req, res) => {
  const db = await readDB();
  const cartao = (db.cartoes || []).find(c => c.id === req.params.id);
  if (!cartao) return res.status(404).json({ error: 'Cartão Programa não encontrado' });
  if (cartao.is_template && req.user.role !== 'P3') {
    return res.status(403).json({ error: 'Apenas o perfil P3 pode editar um cartão padrão.' });
  }

  const viatura = cartao.viaturas.find(v => v.id === req.params.vid);
  cartao.viaturas = cartao.viaturas.filter(v => v.id !== req.params.vid);
  await writeRow('cartoes', cartao);
  res.json({ message: 'Viatura removida do cartão' });
}));

// Marcar o cartão de uma viatura como gerado ou enviado. É aqui que o retrato
// do conteúdo (hash) é tirado: a partir deste ponto, qualquer mudança no que
// sai no documento devolve a viatura para "alterado" com a versão seguinte.
// Adjunto pode: é ele quem gera e manda o cartão ao comandante.
app.put('/api/cartoes/:id/viaturas/:vid/status', exigirEdicaoCartao, asyncRoute(async (req, res) => {
  const cartao = await buscarCartaoPorId(req.params.id);
  if (!cartao) return res.status(404).json({ error: 'Cartão Programa não encontrado' });
  if (cartao.is_template && req.user.role !== 'P3') {
    return res.status(403).json({ error: 'Apenas o perfil P3 pode editar um cartão padrão.' });
  }

  const viatura = (cartao.viaturas || []).find(v => v.id === req.params.vid);
  if (!viatura) return res.status(404).json({ error: 'Viatura não encontrada neste cartão' });

  const status = req.body.status_envio;
  if (!['gerado', 'enviado'].includes(status)) {
    return res.status(400).json({ error: "status_envio deve ser 'gerado' ou 'enviado'." });
  }

  viatura.status_envio = status;
  viatura.gerado_em = new Date().toISOString();
  viatura.hash_conteudo = hashConteudoCartaoViatura(cartao, viatura);

  await writeRow('cartoes', cartao);
  res.json(viatura);
}));

// Histórico da Central de Emissão. É leitura operacional, disponível a todos
// os perfis autenticados que já podem consultar o Cartão Programa.
app.get('/api/cartoes/:id/emissoes', asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('emissoes_cartao')
    .select('id, usuario, usuario_nome, emitido_em, modalidade, formato, tipo_documento, agrupamento, com_alertas, viaturas_ids, versao, acao, status')
    .eq('cartao_id', req.params.id)
    .order('emitido_em', { ascending: false })
    .limit(30);
  if (error) throw new Error(`Falha ao ler histórico de emissões: ${error.message}`);
  res.json(data || []);
}));

// Porta única de registro de impressão/PDF/compartilhamento. O horário é
// calculado no servidor e as viaturas selecionadas recebem o mesmo status;
// assim não existe caminho de emissão que deixe o Cartão como pendente.
app.post('/api/cartoes/:id/emissoes', asyncRoute(async (req, res) => {
  const cartao = await buscarCartaoPorId(req.params.id);
  if (!cartao || cartao.is_template) {
    return res.status(404).json({ error: 'Cartão Programa do dia não encontrado.' });
  }

  const modalidades = ['guarnicao', 'arquivo_sei', 'consolidado', 'personalizado'];
  const formatos = ['celular', 'a4'];
  const tipos = ['individual', 'consolidado'];
  const agrupamentos = ['nenhum', 'companhia', 'categoria'];
  const acao = req.body.acao === 'enviado' ? 'enviado' : 'gerado';
  if (!modalidades.includes(req.body.modalidade) || !formatos.includes(req.body.formato)
      || !tipos.includes(req.body.tipo_documento) || !agrupamentos.includes(req.body.agrupamento)) {
    return res.status(400).json({ error: 'Configuração de emissão inválida.' });
  }

  const ids = [...new Set(Array.isArray(req.body.viaturas_ids) ? req.body.viaturas_ids.filter(id => typeof id === 'string') : [])];
  const selecionadas = (cartao.viaturas || []).filter(v => ids.includes(v.id));
  if (selecionadas.length === 0 || selecionadas.length !== ids.length) {
    return res.status(400).json({ error: 'Selecione ao menos uma viatura válida deste Cartão.' });
  }

  const eraRetificacao = selecionadas.some(v => v.status_envio === 'alterado' || (v.versao || 1) > 1);
  const versao = Math.max(...selecionadas.map(v => v.versao || 1));
  const emitidoEm = new Date().toISOString();
  selecionadas.forEach(viatura => {
    viatura.status_envio = acao;
    viatura.gerado_em = emitidoEm;
    viatura.hash_conteudo = hashConteudoCartaoViatura(cartao, viatura);
  });

  const snapshot = {
    cartao: {
      id: cartao.id,
      data: cartao.data,
      ano: cartao.ano,
      numero: cartao.numero,
      tipo_periodo: cartao.tipo_periodo,
      fiscal: cartao.fiscal,
      fiscal_pessoal_id: cartao.fiscal_pessoal_id,
      adjunto: cartao.adjunto,
      adjunto_pessoal_id: cartao.adjunto_pessoal_id,
      delta07_viatura: cartao.delta07_viatura
    },
    // Deliberadamente não inclui `oficial_sobreaviso`: é dado de controle
    // interno e não pertence ao documento nem ao snapshot documental.
    viaturas: selecionadas.map(v => ({ ...v }))
  };

  const registro = {
    id: generateId('cpe'),
    cartao_id: cartao.id,
    usuario: req.user.usuario,
    usuario_nome: req.user.nome || '',
    emitido_em: emitidoEm,
    modalidade: req.body.modalidade,
    formato: req.body.formato,
    tipo_documento: req.body.tipo_documento,
    agrupamento: req.body.agrupamento,
    com_alertas: !!req.body.com_alertas,
    viaturas_ids: ids,
    versao,
    acao,
    status: eraRetificacao ? 'retificado' : acao,
    snapshot
  };

  // A função Postgres atualiza as viaturas, registra a emissão e substitui
  // versões anteriores na mesma transação, evitando qualquer estado parcial.
  const { error: erroRegistro } = await supabase.rpc('registrar_emissao_cartao', {
    p_cartao_id: cartao.id,
    p_viaturas: cartao.viaturas || [],
    p_emissao: registro,
    p_retificacao: eraRetificacao
  });
  if (erroRegistro) {
    throw new Error(`Falha ao registrar emissão do Cartão Programa: ${erroRegistro.message}`);
  }
  res.status(201).json({ emissao: registro, viaturas: selecionadas });
}));

// Adicionar item de roteiro à viatura
app.post('/api/cartoes/:id/viaturas/:vid/itens', exigirEdicaoCartao, asyncRoute(async (req, res) => {
  const db = await readDB();
  const cartao = (db.cartoes || []).find(c => c.id === req.params.id);
  if (!cartao) return res.status(404).json({ error: 'Cartão Programa não encontrado' });
  if (cartao.is_template && req.user.role !== 'P3') {
    return res.status(403).json({ error: 'Apenas o perfil P3 pode editar um cartão padrão.' });
  }

  const viatura = cartao.viaturas.find(v => v.id === req.params.vid);
  if (!viatura) return res.status(404).json({ error: 'Viatura não encontrada neste cartão' });

  const valid = validarCampos(req.body, {
    inicio: { obrigatorio: true, tipo: 'string', max: 5, label: 'Horário de Início' },
    local: { obrigatorio: true, tipo: 'string', max: 150, label: 'Local' },
    fim: { obrigatorio: false, tipo: 'string', max: 5, padrao: '', label: 'Horário de Fim' },
    atividade: { obrigatorio: false, tipo: 'string', max: 100, padrao: 'Patrulhamento', label: 'Atividade' }
  });
  if (!valid.ok) return res.status(400).json({ error: valid.erro });

  const novoItem = {
    id: generateId('cpi'),
    inicio: valid.valores.inicio,
    fim: valid.valores.fim,
    local: valid.valores.local,
    atividade: valid.valores.atividade
  };

  viatura.itens.push(novoItem);
  viatura.itens = ordenarPorTurno(viatura.itens);
  reavaliarStatusEnvio(cartao);
  await writeRow('cartoes', cartao);
  res.status(201).json(novoItem);
}));

// Atualizar item de roteiro
app.put('/api/cartoes/:id/viaturas/:vid/itens/:iid', exigirEdicaoCartao, asyncRoute(async (req, res) => {
  const cartao = await buscarCartaoPorId(req.params.id);
  if (!cartao) return res.status(404).json({ error: 'Cartão Programa não encontrado' });
  if (cartao.is_template && req.user.role !== 'P3') {
    return res.status(403).json({ error: 'Apenas o perfil P3 pode editar um cartão padrão.' });
  }

  const viatura = cartao.viaturas.find(v => v.id === req.params.vid);
  if (!viatura) return res.status(404).json({ error: 'Viatura não encontrada neste cartão' });

  const item = viatura.itens.find(i => i.id === req.params.iid);
  if (!item) return res.status(404).json({ error: 'Item de roteiro não encontrado' });

  const valid = validarCampos(req.body, {
    inicio: { obrigatorio: false, tipo: 'string', max: 5, label: 'Horário de Início' },
    fim: { obrigatorio: false, tipo: 'string', max: 5, label: 'Horário de Fim' },
    local: { obrigatorio: false, tipo: 'string', max: 150, label: 'Local' },
    atividade: { obrigatorio: false, tipo: 'string', max: 100, label: 'Atividade' }
  });
  if (!valid.ok) return res.status(400).json({ error: valid.erro });
  if (valid.valores.inicio !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(valid.valores.inicio)) {
    return res.status(400).json({ error: 'Horário de início inválido.' });
  }
  if (valid.valores.fim !== undefined && valid.valores.fim && !/^([01]\d|2[0-3]):[0-5]\d$/.test(valid.valores.fim)) {
    return res.status(400).json({ error: 'Horário de fim inválido.' });
  }
  Object.assign(item, valid.valores);

  viatura.itens = ordenarPorTurno(viatura.itens);
  reavaliarStatusEnvio(cartao);
  await writeRow('cartoes', cartao);
  res.json(item);
}));

// Copia o roteiro de outra viatura para a viatura-alvo. Os itens recebem ids
// novos e são reordenados pela janela 07h→07h, inclusive após a meia-noite.
app.post('/api/cartoes/:id/viaturas/:vid/copiar-roteiro', exigirEdicaoCartao, asyncRoute(async (req, res) => {
  const cartao = await buscarCartaoPorId(req.params.id);
  if (!cartao) return res.status(404).json({ error: 'Cartão Programa não encontrado' });
  if (cartao.is_template && req.user.role !== 'P3') {
    return res.status(403).json({ error: 'Apenas o perfil P3 pode editar um cartão padrão.' });
  }
  const alvo = (cartao.viaturas || []).find(v => v.id === req.params.vid);
  const origem = (cartao.viaturas || []).find(v => v.id === req.body.origem_viatura_id);
  if (!alvo || !origem || alvo.id === origem.id) {
    return res.status(400).json({ error: 'Informe uma viatura de origem diferente e válida.' });
  }
  const copiados = (origem.itens || []).map(item => ({ ...item, id: generateId('cpi') }));
  alvo.itens = ordenarPorTurno(req.body.substituir ? copiados : [...(alvo.itens || []), ...copiados]);
  reavaliarStatusEnvio(cartao);
  await writeRow('cartoes', cartao);
  res.json({ itens: alvo.itens, copiados: copiados.length });
}));

// Aplica uma atividade a todos os itens das viaturas selecionadas em uma única
// escrita do JSONB, evitando uma sequência de PUTs concorrentes no mesmo cartão.
app.put('/api/cartoes/:id/roteiro/atividade', exigirEdicaoCartao, asyncRoute(async (req, res) => {
  const cartao = await buscarCartaoPorId(req.params.id);
  if (!cartao) return res.status(404).json({ error: 'Cartão Programa não encontrado' });
  if (cartao.is_template && req.user.role !== 'P3') {
    return res.status(403).json({ error: 'Apenas o perfil P3 pode editar um cartão padrão.' });
  }
  const ids = new Set(Array.isArray(req.body.viaturas_ids) ? req.body.viaturas_ids : []);
  const atividade = String(req.body.atividade || '').trim();
  if (!atividade || atividade.length > 100 || ids.size === 0) {
    return res.status(400).json({ error: 'Selecione viaturas e informe uma atividade válida.' });
  }
  let alterados = 0;
  (cartao.viaturas || []).forEach(viatura => {
    if (!ids.has(viatura.id)) return;
    (viatura.itens || []).forEach(item => { item.atividade = atividade; alterados += 1; });
  });
  reavaliarStatusEnvio(cartao);
  await writeRow('cartoes', cartao);
  res.json({ alterados });
}));

// Remover item de roteiro
app.delete('/api/cartoes/:id/viaturas/:vid/itens/:iid', exigirEdicaoCartao, asyncRoute(async (req, res) => {
  const db = await readDB();
  const cartao = (db.cartoes || []).find(c => c.id === req.params.id);
  if (!cartao) return res.status(404).json({ error: 'Cartão Programa não encontrado' });
  if (cartao.is_template && req.user.role !== 'P3') {
    return res.status(403).json({ error: 'Apenas o perfil P3 pode editar um cartão padrão.' });
  }

  const viatura = cartao.viaturas.find(v => v.id === req.params.vid);
  if (!viatura) return res.status(404).json({ error: 'Viatura não encontrada neste cartão' });

  viatura.itens = viatura.itens.filter(i => i.id !== req.params.iid);
  reavaliarStatusEnvio(cartao);
  await writeRow('cartoes', cartao);
  res.json({ message: 'Item de roteiro removido' });
}));


// -------------------------------------------------------------
// ROTA DE BACKUP (P3) — exporta todas as tabelas de TABELAS + config num único JSON.
// Não inclui "auditoria": é log operacional, não dado de negócio a restaurar.
// SEGURANÇA: usuarios sai sem o campo `senha` (hash scrypt) — via usuarioPublico() — e a
// tabela `sessoes` é omitida por inteiro (tokens de sessão ativos, válidos por 12h; não são
// dado de negócio restaurável e não devem trafegar num export baixável).
// -------------------------------------------------------------
app.get('/api/backup', exigirP3, asyncRoute(async (req, res) => {
  const db = await readDB();
  const { sessoes, ...backup } = db;
  backup.usuarios = (db.usuarios || []).map(usuarioPublico);
  // `avisos` fica FORA de TABELAS de propósito (senão toda rota agregadora
  // baixaria a tabela sem usar), então readDB não a traz — aqui é somada
  // explicitamente, porque é dado de negócio e precisa estar no backup.
  backup.avisos = await readTabela('avisos');
  backup.emissoes_cartao = await readTabela('emissoes_cartao');
  res.json(backup);
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
