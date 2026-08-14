// Camada de acesso a dados + constantes de dominio do backend (Fase 8).
//
// Saiu do server.js, que tinha 3.735 linhas com 83 rotas, 49 helpers e 23
// constantes no mesmo escopo de modulo. O risco desta divisao nunca foi
// sintatico: e um helper que deixa de ser importado virar ReferenceError so
// quando aquela rota e chamada -- o boot passa, `node --check` passa, e o erro
// aparece em producao. E `no-undef` (npm run lint) que transforma isso em erro
// estatico, e `scripts/listar-rotas.js` que prova que o roteamento nao mudou.
//
// A estrategia do shim readDB()/writeDB() esta explicada no server.js e nao
// mudou aqui: a logica de negocio segue em JS puro sobre os arrays, nao em SQL.
const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltam as variaveis de ambiente SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY. O servidor vai subir, mas toda chamada a API vai falhar ate elas serem configuradas.');
}

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { persistSession: false } }
);

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

// Atualização otimista de uma linha já existente. O filtro pela versão ocorre no
// mesmo UPDATE que grava os dados: entre o SELECT da rota e esta chamada, outra
// requisição pode ter alterado a linha, mas nesse caso nenhuma linha casa e o
// chamador recebe null. `atualizado_em` não entra no payload — o trigger do banco
// gera o novo carimbo e o SELECT o devolve para a resposta da API.
async function writeRowSeVersao(tabela, row, versao) {
  const chave = chavePrimariaDe(tabela);
  const { [chave]: id, atualizado_em: _atualizadoEm, ...campos } = row;
  const { data, error } = await supabase
    .from(tabela)
    .update(campos)
    .eq(chave, id)
    .eq('atualizado_em', versao)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`Falha ao gravar "${tabela}" no Supabase: ${error.message}`);
  return data || null;
}

async function deleteRow(tabela, id) {
  const chave = chavePrimariaDe(tabela);
  const { error } = await supabase.from(tabela).delete().eq(chave, id);
  if (error) throw new Error(`Falha ao apagar "${tabela}" no Supabase: ${error.message}`);
}

async function deleteRowSeVersao(tabela, id, versao) {
  const chave = chavePrimariaDe(tabela);
  const { data, error } = await supabase
    .from(tabela)
    .delete()
    .eq(chave, id)
    .eq('atualizado_em', versao)
    .select(chave)
    .maybeSingle();
  if (error) throw new Error(`Falha ao apagar "${tabela}" no Supabase: ${error.message}`);
  return !!data;
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
  // Resolva primeiro cada padrão ativo para a fotografia publicada. Selecionar
  // pelo `tipo_periodo` do rascunho atual faria uma edição de período deslocar o
  // padrão publicado para o dia errado antes mesmo de ele ser republicado.
  const resolvidos = await Promise.all(padroes.map(async (padrao) => {
    if (padrao.estado_template !== 'rascunho') return padrao;
    const { data: versao, error } = await supabase.from('cartao_padrao_versoes')
      .select('snapshot,versao').eq('cartao_id', padrao.id).order('versao', { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(`Falha ao buscar versão publicada do cartão padrão: ${error.message}`);
    if (!versao?.snapshot) return null;
    return { ...padrao, ...versao.snapshot, id: padrao.id, estado_template: 'publicado', versao_publicada: versao.versao, padrao_ativo: true };
  }));
  const publicados = resolvidos.filter(Boolean);
  if (publicados.length === 0) return null;
  const tipo = dataCartao ? tipoPeriodoDaData(dataCartao) : null;
  return (tipo ? publicados.find(p => p.tipo_periodo === tipo) : null) || publicados[0];
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

module.exports = {
  supabase,
  CATEGORIAS_PESSOAL,
  CATEGORIAS_VIATURA,
  CHAVE_PRIMARIA,
  COMPANHIAS_VALIDAS,
  COMPANHIAS_VIATURA,
  POSTOS_GRADUACAO,
  STATUS_VIATURA,
  SUBUNIDADES_PESSOAL,
  TABELAS,
  TABELAS_E_CONFIG,
  asyncRoute,
  buscarCartaoPorId,
  buscarCartoesFiltrados,
  buscarConfig,
  buscarPadraoAtivo,
  buscarPadroesAtivos,
  buscarRow,
  buscarSessaoPorToken,
  buscarUsuarioPorLogin,
  chavePrimariaDe,
  deleteRow,
  deleteRowSeVersao,
  deleteRows,
  ehFimDeSemana,
  generateId,
  getLocalDateStrServer,
  indexarPor,
  normalizarTextoServer,
  readDB,
  readTabela,
  readTabelaIn,
  tipoPeriodoDaData,
  writeDB,
  writeRow,
  writeRowSeVersao,
  writeRows,
};
