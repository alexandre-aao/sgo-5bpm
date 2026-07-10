const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();
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
  'http://localhost:3005'
];
function origemPermitida(origin) {
  if (!origin) return true; // requisições sem Origin (ex: curl, apps nativos) — não é o caso de browsers
  if (ORIGENS_PERMITIDAS.includes(origin)) return true;
  // Deploys de preview da Vercel para este projeto: sgo-5bpm-<hash>-alexandre-alves.vercel.app
  return /^https:\/\/sgo-5bpm-[a-z0-9]+-alexandre-alves\.vercel\.app$/.test(origin);
}
app.use(cors({
  origin(origin, callback) {
    if (origemPermitida(origin)) return callback(null, true);
    callback(new Error('Origem não permitida pelo CORS.'));
  }
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
// vindas de IPs diferentes contra o mesmo login). Estado em memória: reinicia a cada cold start
// da função serverless, o que é uma limitação aceita nesta fase (ver plano — sem Redis por ora).
const tentativasLoginPorUsuario = new Map();
function verificarBloqueioProgressivo(usuario) {
  const chave = String(usuario || '').toLowerCase().trim();
  const registro = tentativasLoginPorUsuario.get(chave);
  if (!registro || registro.falhas < 3) return null;
  const esperaMs = Math.pow(2, registro.falhas - 2) * 1000;
  const restanteMs = (registro.ultimaFalha + esperaMs) - Date.now();
  return restanteMs > 0 ? Math.ceil(restanteMs / 1000) : null;
}
function registrarFalhaLogin(usuario) {
  const chave = String(usuario || '').toLowerCase().trim();
  const registro = tentativasLoginPorUsuario.get(chave) || { falhas: 0, ultimaFalha: 0 };
  registro.falhas += 1;
  registro.ultimaFalha = Date.now();
  tentativasLoginPorUsuario.set(chave, registro);
}
function limparFalhasLogin(usuario) {
  tentativasLoginPorUsuario.delete(String(usuario || '').toLowerCase().trim());
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
const TABELAS = ['usuarios', 'sessoes', 'bairros_coordenadas', 'pessoal', 'eventos', 'alocacoes', 'escalas', 'cartoes', 'missoes_planejadas'];
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
const COMPANHIAS_VALIDAS = ['1ª Companhia', '2ª Companhia', '3ª Companhia'];

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
const CATEGORIAS_PESSOAL = ['Adjunto', 'Fiscal de Operações', 'Oficial de Operações', 'Oficial de Sobreaviso'];

// -------------------------------------------------------------
// SEGURANÇA: HASH DE SENHAS (scrypt) E SESSÕES COM EXPIRAÇÃO
// -------------------------------------------------------------
const SESSAO_DURACAO_MS = 12 * 60 * 60 * 1000; // 12 horas

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
      await supabase.from('usuarios').insert({
        usuario: 'p3',
        senha: hashSenha('123'),
        role: 'P3',
        nome: 'Planejamento (P3 / 5º BPM)'
      });
      console.log('Usuário administrador padrão criado: login "p3", senha "123" — troque assim que possível.');
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
  } catch (err) {
    console.error('Falha na inicialização (seed) do Supabase:', err.message);
  }
})();

// Middleware: exige token de sessão válido em todas as rotas da API (exceto login)
async function autenticar(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Não autenticado. Faça login para acessar o sistema.' });
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

// -------------------------------------------------------------
// ROTA DE AUTENTICAÇÃO (LOGIN)
// -------------------------------------------------------------
app.post('/api/login', loginRateLimiter, asyncRoute(async (req, res) => {
  const { usuario, senha } = req.body;

  if (!usuario || !senha) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
  }

  const esperaSegundos = verificarBloqueioProgressivo(usuario);
  if (esperaSegundos) {
    return res.status(429).json({ error: `Muitas tentativas para este usuário. Tente novamente em ${esperaSegundos} segundo(s).` });
  }

  const user = await buscarUsuarioPorLogin(usuario);

  if (!user || !verificarSenha(senha, user.senha)) {
    registrarFalhaLogin(usuario);
    return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  }

  limparFalhasLogin(usuario);

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

  res.json({ usuario: user.usuario, role: user.role, nome: user.nome, token, expira });
}));

// A partir daqui, todas as rotas /api exigem sessão válida
app.use('/api', autenticar);

// Encerrar sessão (invalida o token no servidor)
app.post('/api/logout', asyncRoute(async (req, res) => {
  const token = (req.headers.authorization || '').slice(7);
  await supabase.from('sessoes').delete().eq('token', token);
  res.json({ message: 'Sessão encerrada.' });
}));

// Alterar a própria senha
app.post('/api/alterar-senha', asyncRoute(async (req, res) => {
  const { senha_atual, senha_nova } = req.body;

  if (!senha_atual || !senha_nova) {
    return res.status(400).json({ error: 'Informe a senha atual e a nova senha.' });
  }
  if (String(senha_nova).length < 3) {
    return res.status(400).json({ error: 'A nova senha deve ter pelo menos 3 caracteres.' });
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
  const db = await readDB();
  res.json((db.usuarios || []).map(usuarioPublico));
}));

// Criar novo usuário
app.post('/api/usuarios', exigirP3, asyncRoute(async (req, res) => {
  const db = await readDB();
  const { usuario, senha, nome, role } = req.body;

  if (!usuario || !senha || !nome || !role) {
    return res.status(400).json({ error: 'Usuário, senha, nome e perfil são obrigatórios.' });
  }
  if (!['P3', 'Adjunto', 'Oficial'].includes(role)) {
    return res.status(400).json({ error: 'Perfil inválido.' });
  }
  if (String(senha).length < 3) {
    return res.status(400).json({ error: 'A senha deve ter pelo menos 3 caracteres.' });
  }

  if (db.usuarios.some(u => u.usuario.toLowerCase() === String(usuario).toLowerCase())) {
    return res.status(409).json({ error: 'Já existe um usuário com esse login.' });
  }

  const novoUsuario = { usuario: String(usuario).trim(), senha: hashSenha(senha), nome: String(nome).trim(), role };
  db.usuarios.push(novoUsuario);
  await writeDB(db, ['usuarios']);
  res.status(201).json(usuarioPublico(novoUsuario));
}));

// Atualizar nome e/ou perfil de um usuário
app.put('/api/usuarios/:usuario', exigirP3, asyncRoute(async (req, res) => {
  const db = await readDB();
  const alvo = db.usuarios.find(u => u.usuario === req.params.usuario);

  if (!alvo) return res.status(404).json({ error: 'Usuário não encontrado.' });

  if (req.body.role !== undefined) {
    if (!['P3', 'Adjunto', 'Oficial'].includes(req.body.role)) {
      return res.status(400).json({ error: 'Perfil inválido.' });
    }
    // Impede remover o último administrador P3 do sistema
    const seriaUltimoP3 = alvo.role === 'P3' && req.body.role !== 'P3'
      && db.usuarios.filter(u => u.role === 'P3').length <= 1;
    if (seriaUltimoP3) {
      return res.status(400).json({ error: 'Não é possível rebaixar o último usuário com perfil P3.' });
    }
    alvo.role = req.body.role;
  }

  if (req.body.nome !== undefined) alvo.nome = String(req.body.nome).trim();

  await writeDB(db, ['usuarios']);
  res.json(usuarioPublico(alvo));
}));

// Resetar a senha de um usuário (ação administrativa do P3, sem exigir a senha atual)
app.post('/api/usuarios/:usuario/resetar-senha', exigirP3, asyncRoute(async (req, res) => {
  const db = await readDB();
  const alvo = db.usuarios.find(u => u.usuario === req.params.usuario);

  if (!alvo) return res.status(404).json({ error: 'Usuário não encontrado.' });

  const novaSenha = req.body.senha_nova;
  if (!novaSenha || String(novaSenha).length < 3) {
    return res.status(400).json({ error: 'A nova senha deve ter pelo menos 3 caracteres.' });
  }

  alvo.senha = hashSenha(novaSenha);

  // Encerra todas as sessões ativas desse usuário por segurança
  db.sessoes = (db.sessoes || []).filter(s => s.usuario !== alvo.usuario);

  await writeDB(db, ['usuarios','sessoes']);
  res.json({ message: `Senha de ${alvo.usuario} redefinida com sucesso.` });
}));

// Excluir usuário
app.delete('/api/usuarios/:usuario', exigirP3, asyncRoute(async (req, res) => {
  const db = await readDB();
  const alvo = db.usuarios.find(u => u.usuario === req.params.usuario);

  if (!alvo) return res.status(404).json({ error: 'Usuário não encontrado.' });
  if (alvo.usuario === req.user.usuario) {
    return res.status(400).json({ error: 'Você não pode excluir o seu próprio usuário.' });
  }
  if (alvo.role === 'P3' && db.usuarios.filter(u => u.role === 'P3').length <= 1) {
    return res.status(400).json({ error: 'Não é possível excluir o último usuário com perfil P3.' });
  }

  db.usuarios = db.usuarios.filter(u => u.usuario !== alvo.usuario);
  db.sessoes = (db.sessoes || []).filter(s => s.usuario !== alvo.usuario);
  await writeDB(db, ['usuarios','sessoes']);
  res.json({ message: 'Usuário excluído.' });
}));

// -------------------------------------------------------------
// ROTAS DE CADASTRO DE PESSOAL (ADJUNTO / FISCAL / OFICIAL DE OPERAÇÕES / OFICIAL DE SOBREAVISO)
// -------------------------------------------------------------

// Listar (todos os perfis podem ler, para alimentar os seletores do Cartão Programa); filtro opcional por categoria
app.get('/api/pessoal', asyncRoute(async (req, res) => {
  const db = await readDB();
  let pessoal = db.pessoal || [];
  if (req.query.categoria) {
    pessoal = pessoal.filter(p => (p.categorias || []).includes(req.query.categoria));
  }
  res.json(pessoal.sort((a, b) => a.nome.localeCompare(b.nome)));
}));

// Criar novo cadastro de pessoal (P3)
app.post('/api/pessoal', exigirP3, asyncRoute(async (req, res) => {
  const db = await readDB();

  const { nome, posto_graduacao, categorias } = req.body;
  if (!nome || !posto_graduacao) {
    return res.status(400).json({ error: 'Nome e posto/graduação são obrigatórios.' });
  }
  const postoInfo = POSTOS_GRADUACAO.find(p => p.posto === posto_graduacao);
  if (!postoInfo) {
    return res.status(400).json({ error: 'Posto/graduação inválido.' });
  }
  const categoriasValidas = Array.isArray(categorias) ? categorias.filter(c => CATEGORIAS_PESSOAL.includes(c)) : [];
  if (categoriasValidas.length === 0) {
    return res.status(400).json({ error: 'Selecione ao menos uma categoria.' });
  }

  const novaPessoa = {
    id: generateId('pes'),
    nome: String(nome).trim(),
    posto_graduacao,
    tipo: postoInfo.tipo,
    categorias: categoriasValidas,
    ativo: true
  };
  db.pessoal.push(novaPessoa);
  await writeDB(db, ['pessoal']);
  res.status(201).json(novaPessoa);
}));

// Atualizar cadastro de pessoal (P3)
app.put('/api/pessoal/:id', exigirP3, asyncRoute(async (req, res) => {
  const db = await readDB();
  const pessoa = db.pessoal.find(p => p.id === req.params.id);
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
    if (categoriasValidas.length === 0) return res.status(400).json({ error: 'Selecione ao menos uma categoria.' });
    pessoa.categorias = categoriasValidas;
  }
  if (req.body.ativo !== undefined) pessoa.ativo = !!req.body.ativo;

  await writeDB(db, ['pessoal']);
  res.json(pessoa);
}));

// Excluir cadastro de pessoal (P3)
app.delete('/api/pessoal/:id', exigirP3, asyncRoute(async (req, res) => {
  const db = await readDB();
  db.pessoal = (db.pessoal || []).filter(p => p.id !== req.params.id);
  await writeDB(db, ['pessoal']);
  res.json({ message: 'Cadastro excluído.' });
}));

// -------------------------------------------------------------
// ROTAS DE EVENTOS
// -------------------------------------------------------------

// Listar todos os eventos
app.get('/api/eventos', asyncRoute(async (req, res) => {
  const db = await readDB();
  res.json(db.eventos || []);
}));

// Criar novo evento
app.post('/api/eventos', exigirP3, asyncRoute(async (req, res) => {
  const db = await readDB();
  const novoEvento = {
    id: generateId('evt'),
    num_oficio: req.body.num_oficio || '',
    num_os_manual: req.body.num_os_manual || '',
    num_sei: req.body.num_sei || '',
    nome_evento: req.body.nome_evento,
    tipo_evento: req.body.tipo_evento,
    demandante: req.body.demandante || 'Não Informado',
    data_inicio: req.body.data_inicio,
    data_termino: req.body.data_termino || req.body.data_inicio,
    horario_inicio: req.body.horario_inicio || '',
    local_itinerario: req.body.local_itinerario,
    bairro: req.body.bairro || ''
  };

  db.eventos.push(novoEvento);
  await writeDB(db, ['eventos']);
  res.status(201).json(novoEvento);
}));

// Atualizar evento
app.put('/api/eventos/:id', exigirP3, asyncRoute(async (req, res) => {
  const db = await readDB();
  const index = db.eventos.findIndex(e => e.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: 'Evento não encontrado' });
  }

  const eventoAtualizado = { ...db.eventos[index], ...req.body };
  db.eventos[index] = eventoAtualizado;
  await writeDB(db, ['eventos']);
  res.json(eventoAtualizado);
}));

// Excluir evento
app.delete('/api/eventos/:id', exigirP3, asyncRoute(async (req, res) => {
  const db = await readDB();
  db.eventos = db.eventos.filter(e => e.id !== req.params.id);
  // Remove alocações e escalas órfãs
  db.alocacoes = db.alocacoes.filter(a => a.evento_id !== req.params.id);
  db.escalas = db.escalas.filter(s => s.evento_id !== req.params.id);
  await writeDB(db, ['eventos','alocacoes','escalas']);
  res.json({ message: 'Evento e registros relacionados excluídos' });
}));


// -------------------------------------------------------------
// ROTAS DE ALOCAÇÃO DE POLICIAMENTO
// -------------------------------------------------------------

// Listar alocações (permite filtro por evento_id)
app.get('/api/alocacoes', asyncRoute(async (req, res) => {
  const db = await readDB();
  let result = db.alocacoes || [];
  if (req.query.evento_id) {
    result = result.filter(a => a.evento_id === req.query.evento_id);
  }
  res.json(result);
}));

// Adicionar alocação
app.post('/api/alocacoes', exigirP3, asyncRoute(async (req, res) => {
  const db = await readDB();
  const novaAlocacao = {
    id: generateId('aloc'),
    evento_id: req.body.evento_id,
    modalidade: req.body.modalidade,
    qtd_policiais: parseInt(req.body.qtd_policiais, 10) || 0,
    qtd_viaturas: parseInt(req.body.qtd_viaturas, 10) || 0,
    prefixos_vtr: req.body.prefixos_vtr || '',
    comando_servico: req.body.comando_servico || ''
  };

  db.alocacoes.push(novaAlocacao);
  await writeDB(db, ['alocacoes']);
  res.status(201).json(novaAlocacao);
}));

// Remover alocação
app.delete('/api/alocacoes/:id', exigirP3, asyncRoute(async (req, res) => {
  const db = await readDB();
  db.alocacoes = db.alocacoes.filter(a => a.id !== req.params.id);
  await writeDB(db, ['alocacoes']);
  res.json({ message: 'Alocação excluída' });
}));


// -------------------------------------------------------------
// ROTAS DE ESCALA DE DIÁRIAS
// -------------------------------------------------------------

// Listar escalas (permite filtro por evento_id)
app.get('/api/escalas', asyncRoute(async (req, res) => {
  const db = await readDB();
  let result = db.escalas || [];
  if (req.query.evento_id) {
    result = result.filter(s => s.evento_id === req.query.evento_id);
  }
  res.json(result);
}));

// Adicionar militar na escala (trata a automação de diárias: qtd_aparicoes * 2)
app.post('/api/escalas', exigirP3, asyncRoute(async (req, res) => {
  const db = await readDB();

  const qtd_aparicoes = parseInt(req.body.qtd_aparicoes, 10) || 1;
  const total_diarias = qtd_aparicoes * 2; // Automação: Regra de 2 diárias por aparição

  const novaEscala = {
    id: generateId('esc'),
    evento_id: req.body.evento_id,
    militar_nome: req.body.militar_nome,
    militar_id: req.body.militar_id,
    qtd_aparicoes: qtd_aparicoes,
    total_diarias: total_diarias
  };

  db.escalas.push(novaEscala);
  await writeDB(db, ['escalas']);
  res.status(201).json(novaEscala);
}));

// Atualizar escala (recalcula diárias)
app.put('/api/escalas/:id', exigirP3, asyncRoute(async (req, res) => {
  const db = await readDB();
  const index = db.escalas.findIndex(s => s.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: 'Militar não escalado neste evento' });
  }

  const qtd_aparicoes = parseInt(req.body.qtd_aparicoes, 10) || 1;
  const total_diarias = qtd_aparicoes * 2;

  db.escalas[index] = {
    ...db.escalas[index],
    militar_nome: req.body.militar_nome || db.escalas[index].militar_nome,
    militar_id: req.body.militar_id || db.escalas[index].militar_id,
    qtd_aparicoes: qtd_aparicoes,
    total_diarias: total_diarias
  };

  await writeDB(db, ['escalas']);
  res.json(db.escalas[index]);
}));

// Remover militar da escala
app.delete('/api/escalas/:id', exigirP3, asyncRoute(async (req, res) => {
  const db = await readDB();
  db.escalas = db.escalas.filter(s => s.id !== req.params.id);
  await writeDB(db, ['escalas']);
  res.json({ message: 'Militar removido da escala' });
}));


// -------------------------------------------------------------
// ROTAS DE COORDENADAS DE BAIRROS (USADAS PELO MAPA E PELO CADASTRO DE EVENTOS)
// -------------------------------------------------------------
app.get('/api/bairros-coordenadas', asyncRoute(async (req, res) => {
  const db = await readDB();
  res.json(db.bairros_coordenadas || []);
}));

// Criar bairro (P3)
app.post('/api/bairros-coordenadas', exigirP3, asyncRoute(async (req, res) => {
  const db = await readDB();

  const { nome_bairro, latitude, longitude } = req.body;
  if (!nome_bairro) {
    return res.status(400).json({ error: 'O nome do bairro é obrigatório.' });
  }
  const lat = parseFloat(latitude);
  const lon = parseFloat(longitude);
  if (isNaN(lat) || isNaN(lon)) {
    return res.status(400).json({ error: 'Latitude e longitude devem ser números válidos.' });
  }
  if (db.bairros_coordenadas.some(b => normalizarTextoServer(b.nome_bairro) === normalizarTextoServer(nome_bairro))) {
    return res.status(409).json({ error: 'Já existe um bairro cadastrado com esse nome.' });
  }

  const novoBairro = { id: generateId('bco'), nome_bairro: String(nome_bairro).trim(), latitude: lat, longitude: lon };
  db.bairros_coordenadas.push(novoBairro);
  await writeDB(db, ['bairros_coordenadas']);
  res.status(201).json(novoBairro);
}));

// Atualizar bairro (P3)
app.put('/api/bairros-coordenadas/:id', exigirP3, asyncRoute(async (req, res) => {
  const db = await readDB();
  const bairro = db.bairros_coordenadas.find(b => b.id === req.params.id);
  if (!bairro) return res.status(404).json({ error: 'Bairro não encontrado.' });

  if (req.body.nome_bairro !== undefined) bairro.nome_bairro = String(req.body.nome_bairro).trim();
  if (req.body.latitude !== undefined) {
    const lat = parseFloat(req.body.latitude);
    if (isNaN(lat)) return res.status(400).json({ error: 'Latitude inválida.' });
    bairro.latitude = lat;
  }
  if (req.body.longitude !== undefined) {
    const lon = parseFloat(req.body.longitude);
    if (isNaN(lon)) return res.status(400).json({ error: 'Longitude inválida.' });
    bairro.longitude = lon;
  }

  await writeDB(db, ['bairros_coordenadas']);
  res.json(bairro);
}));

// Excluir bairro (P3)
app.delete('/api/bairros-coordenadas/:id', exigirP3, asyncRoute(async (req, res) => {
  const db = await readDB();
  db.bairros_coordenadas = (db.bairros_coordenadas || []).filter(b => b.id !== req.params.id);
  await writeDB(db, ['bairros_coordenadas']);
  res.json({ message: 'Bairro excluído.' });
}));

// -------------------------------------------------------------
// ROTAS DE CONFIGURAÇÃO (COTA MENSAL DE DIÁRIAS)
// -------------------------------------------------------------
app.get('/api/config', asyncRoute(async (req, res) => {
  const db = await readDB();
  res.json(db.config || { cota_mensal_diarias: 0 });
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
app.get('/api/planejador-diarias', asyncRoute(async (req, res) => {
  const db = await readDB();
  const mesFiltro = req.query.mes; // Formato "MM" (ex: "07")
  const anoFiltro = req.query.ano || String(new Date().getFullYear());

  if (!mesFiltro) {
    return res.status(400).json({ error: 'Parâmetro mês é obrigatório (ex: ?mes=07)' });
  }

  // Eventos do mês/ano com o total de diárias escaladas em cada um
  const eventos = db.eventos
    .filter(e => {
      const [ano, mes] = e.data_inicio.split('-');
      return ano === anoFiltro && mes === mesFiltro;
    })
    .map(evt => {
      const escalasEvt = db.escalas.filter(s => s.evento_id === evt.id);
      return {
        id: evt.id,
        nome_evento: evt.nome_evento,
        tipo_evento: evt.tipo_evento,
        data_inicio: evt.data_inicio,
        militares_escalados: escalasEvt.length,
        total_diarias: escalasEvt.reduce((sum, s) => sum + (s.total_diarias || 0), 0)
      };
    })
    .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));

  const totalConsumido = eventos.reduce((sum, e) => sum + e.total_diarias, 0);
  const cota = (db.config && db.config.cota_mensal_diarias) || 0;

  // Missões planejadas do mesmo mês/ano — reservam diárias no planejamento sem precisar
  // de um evento real ainda (ver ROTAS DE MISSÕES PLANEJADAS logo abaixo).
  const missoesPlanejadas = (db.missoes_planejadas || [])
    .filter(m => m.ano === anoFiltro && m.mes === mesFiltro)
    .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));
  const totalPlanejado = missoesPlanejadas.reduce((sum, m) => sum + (m.qtd_diarias_por_ocorrencia || 0), 0);

  res.json({
    cota_mensal: cota,
    total_consumido: totalConsumido,
    total_planejado: totalPlanejado,
    saldo: cota - totalConsumido - totalPlanejado,
    eventos,
    missoes_planejadas: missoesPlanejadas
  });
}));

// -------------------------------------------------------------
// ROTAS DE MISSÕES PLANEJADAS (PLANEJADOR DE DIÁRIAS)
// -------------------------------------------------------------
// Entidade independente de "eventos": reserva diárias no planejamento mensal antes de um
// evento real existir (ou sem nunca virar evento). Não aparece em Listar Eventos, Cartão
// Programa ou Mapa.
app.get('/api/missoes-planejadas', asyncRoute(async (req, res) => {
  const db = await readDB();
  const mesFiltro = req.query.mes;
  const anoFiltro = req.query.ano || String(new Date().getFullYear());

  let missoes = db.missoes_planejadas || [];
  if (mesFiltro) missoes = missoes.filter(m => m.mes === mesFiltro);
  missoes = missoes.filter(m => m.ano === anoFiltro);

  res.json(missoes.sort((a, b) => a.data_inicio.localeCompare(b.data_inicio)));
}));

app.post('/api/missoes-planejadas', exigirP3, asyncRoute(async (req, res) => {
  const db = await readDB();
  const { nome, tipo_recorrencia, data_inicio, data_fim, qtd_diarias_por_ocorrencia } = req.body;

  if (!nome || !data_inicio) {
    return res.status(400).json({ error: 'Nome e data de início são obrigatórios.' });
  }
  if (!['diaria', 'fim_de_semana', 'dia_unico'].includes(tipo_recorrencia)) {
    return res.status(400).json({ error: "tipo_recorrencia deve ser 'diaria', 'fim_de_semana' ou 'dia_unico'." });
  }
  const qtdDiarias = parseInt(qtd_diarias_por_ocorrencia, 10);
  if (isNaN(qtdDiarias) || qtdDiarias < 0) {
    return res.status(400).json({ error: 'Quantidade de diárias por ocorrência inválida.' });
  }

  const dataFimFinal = data_fim || data_inicio;
  const [ano, mes] = data_inicio.split('-');

  const novaMissao = {
    id: generateId('mpl'),
    nome: String(nome).trim(),
    tipo_recorrencia,
    data_inicio,
    data_fim: dataFimFinal,
    qtd_diarias_por_ocorrencia: qtdDiarias,
    mes,
    ano,
    convertida_em_evento_id: null
  };

  db.missoes_planejadas.push(novaMissao);
  await writeDB(db, ['missoes_planejadas']);
  res.status(201).json(novaMissao);
}));

app.put('/api/missoes-planejadas/:id', exigirP3, asyncRoute(async (req, res) => {
  const db = await readDB();
  const missao = db.missoes_planejadas.find(m => m.id === req.params.id);
  if (!missao) return res.status(404).json({ error: 'Missão planejada não encontrada.' });

  if (req.body.nome !== undefined) missao.nome = String(req.body.nome).trim();
  if (req.body.tipo_recorrencia !== undefined) {
    if (!['diaria', 'fim_de_semana', 'dia_unico'].includes(req.body.tipo_recorrencia)) {
      return res.status(400).json({ error: "tipo_recorrencia deve ser 'diaria', 'fim_de_semana' ou 'dia_unico'." });
    }
    missao.tipo_recorrencia = req.body.tipo_recorrencia;
  }
  if (req.body.data_inicio !== undefined) {
    missao.data_inicio = req.body.data_inicio;
    const [ano, mes] = req.body.data_inicio.split('-');
    missao.mes = mes;
    missao.ano = ano;
  }
  if (req.body.data_fim !== undefined) missao.data_fim = req.body.data_fim || missao.data_inicio;
  if (req.body.qtd_diarias_por_ocorrencia !== undefined) {
    const qtdDiarias = parseInt(req.body.qtd_diarias_por_ocorrencia, 10);
    if (isNaN(qtdDiarias) || qtdDiarias < 0) {
      return res.status(400).json({ error: 'Quantidade de diárias por ocorrência inválida.' });
    }
    missao.qtd_diarias_por_ocorrencia = qtdDiarias;
  }

  await writeDB(db, ['missoes_planejadas']);
  res.json(missao);
}));

app.delete('/api/missoes-planejadas/:id', exigirP3, asyncRoute(async (req, res) => {
  const db = await readDB();
  db.missoes_planejadas = (db.missoes_planejadas || []).filter(m => m.id !== req.params.id);
  await writeDB(db, ['missoes_planejadas']);
  res.json({ message: 'Missão planejada excluída.' });
}));

// Converte a missão planejada num evento real (Novo Evento) — a missão não desaparece,
// só passa a apontar pro evento criado via convertida_em_evento_id. Não escala efetivo
// automaticamente: quem faz isso é o fluxo normal da gaveta, depois de aberto o evento.
app.post('/api/missoes-planejadas/:id/converter', exigirP3, asyncRoute(async (req, res) => {
  const db = await readDB();
  const missao = db.missoes_planejadas.find(m => m.id === req.params.id);
  if (!missao) return res.status(404).json({ error: 'Missão planejada não encontrada.' });
  if (missao.convertida_em_evento_id) {
    return res.status(409).json({ error: 'Esta missão já foi convertida em evento.' });
  }

  const novoEvento = {
    id: generateId('evt'),
    num_oficio: '',
    num_os_manual: '',
    num_sei: '',
    nome_evento: missao.nome,
    tipo_evento: 'Missão Avulsa',
    demandante: 'Interno / Missão Planejada',
    data_inicio: missao.data_inicio,
    data_termino: missao.data_fim,
    horario_inicio: '',
    local_itinerario: 'Não informado',
    bairro: ''
  };

  db.eventos.push(novoEvento);
  missao.convertida_em_evento_id = novoEvento.id;
  await writeDB(db, ['eventos', 'missoes_planejadas']);
  res.status(201).json(novoEvento);
}));


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

  // 1. Encontra todos os eventos no mês e ano selecionados
  const eventosNoPeriodo = db.eventos.filter(e => {
    const dataParts = e.data_inicio.split('-'); // YYYY-MM-DD
    const ano = dataParts[0];
    const mes = dataParts[1];
    return ano === anoFiltro && mes === mesFiltro;
  });

  const idsEventosPeriodo = new Set(eventosNoPeriodo.map(e => e.id));

  // 2. Filtra escalas vinculadas a esses eventos
  const escalasFiltradas = db.escalas.filter(s => idsEventosPeriodo.has(s.evento_id));

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
// ROTA DO RELATÓRIO PARA O SEI (POR EVENTO OU POR PERÍODO)
// -------------------------------------------------------------
app.get('/api/relatorio-sei', asyncRoute(async (req, res) => {
  const db = await readDB();
  const { evento_id, data_inicio, data_fim } = req.query;

  let eventosAlvo;
  let modo;
  let eventoUnico = null;

  if (evento_id) {
    eventoUnico = db.eventos.find(e => e.id === evento_id);
    if (!eventoUnico) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }
    eventosAlvo = [eventoUnico];
    modo = 'evento';
  } else if (data_inicio && data_fim) {
    eventosAlvo = db.eventos.filter(e => e.data_inicio >= data_inicio && e.data_inicio <= data_fim);
    modo = 'periodo';
  } else {
    return res.status(400).json({ error: 'Informe evento_id, ou data_inicio e data_fim.' });
  }

  const idsAlvo = new Set(eventosAlvo.map(e => e.id));
  const alocacoesAlvo = db.alocacoes.filter(a => idsAlvo.has(a.evento_id));
  const escalasAlvo = db.escalas.filter(s => idsAlvo.has(s.evento_id));

  const totalPoliciais = alocacoesAlvo.reduce((sum, a) => sum + (a.qtd_policiais || 0), 0);
  const totalViaturas = alocacoesAlvo.reduce((sum, a) => sum + (a.qtd_viaturas || 0), 0);
  const totalDiarias = escalasAlvo.reduce((sum, s) => sum + (s.total_diarias || 0), 0);

  const bairros = [...new Set(eventosAlvo.map(e => e.bairro).filter(Boolean))].sort();

  const consolidadoEfetivo = {};
  escalasAlvo.forEach(s => {
    const chave = s.militar_id || s.militar_nome;
    if (!consolidadoEfetivo[chave]) {
      consolidadoEfetivo[chave] = {
        militar_id: s.militar_id,
        militar_nome: s.militar_nome,
        qtd_aparicoes: 0,
        total_diarias: 0
      };
    }
    consolidadoEfetivo[chave].qtd_aparicoes += s.qtd_aparicoes;
    consolidadoEfetivo[chave].total_diarias += s.total_diarias;
  });
  const efetivo = Object.values(consolidadoEfetivo).sort((a, b) => a.militar_nome.localeCompare(b.militar_nome));

  res.json({
    modo,
    evento: eventoUnico,
    periodo: modo === 'periodo' ? { data_inicio, data_fim } : null,
    resumo: {
      total_eventos: eventosAlvo.length,
      total_policiais: totalPoliciais,
      total_viaturas: totalViaturas,
      total_diarias: totalDiarias
    },
    bairros,
    efetivo
  });
}));


// -------------------------------------------------------------
// ROTA DO CALENDÁRIO DE DIÁRIAS (TOTAL POR DIA NO MÊS)
// -------------------------------------------------------------
app.get('/api/diarias-calendario', asyncRoute(async (req, res) => {
  const db = await readDB();
  const mesFiltro = req.query.mes;
  const anoFiltro = req.query.ano || String(new Date().getFullYear());

  if (!mesFiltro) {
    return res.status(400).json({ error: 'Parâmetro mês é obrigatório (ex: ?mes=07)' });
  }

  const eventosNoPeriodo = db.eventos.filter(e => {
    const [ano, mes] = e.data_inicio.split('-');
    return ano === anoFiltro && mes === mesFiltro;
  });

  const porDia = {};
  eventosNoPeriodo.forEach(evt => {
    const escalasEvt = db.escalas.filter(s => s.evento_id === evt.id);
    const totalDiariasEvt = escalasEvt.reduce((sum, s) => sum + (s.total_diarias || 0), 0);
    if (totalDiariasEvt === 0) return; // só entra no calendário quem tem diária de fato

    if (!porDia[evt.data_inicio]) {
      porDia[evt.data_inicio] = { dia: evt.data_inicio, total_diarias: 0, eventos: [] };
    }
    porDia[evt.data_inicio].total_diarias += totalDiariasEvt;
    porDia[evt.data_inicio].eventos.push({
      id: evt.id,
      nome_evento: evt.nome_evento,
      tipo_evento: evt.tipo_evento,
      total_diarias: totalDiariasEvt
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
  const escalasDoAno = db.escalas.filter(s => idsEventosDoAno.has(s.evento_id));

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
    db.alocacoes.filter(a => a.evento_id === evt.id).forEach(a => {
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
    db.alocacoes.filter(a => a.evento_id === evt.id).forEach(a => {
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
    const idsEventosDoMes = new Set(eventosDoMes.map(e => e.id));
    const efetivoMes = db.alocacoes
      .filter(a => idsEventosDoMes.has(a.evento_id))
      .reduce((sum, a) => sum + a.qtd_policiais, 0);
    const diariasMes = db.escalas
      .filter(s => idsEventosDoMes.has(s.evento_id))
      .reduce((sum, s) => sum + (s.total_diarias || 0), 0);
    const realizadosMes = eventosDoMes.filter(e => (e.data_termino || e.data_inicio) < hojeStr).length;
    const planejadosMes = eventosDoMes.length - realizadosMes;

    tendenciaMensal.push({
      mes: mesStr,
      total_eventos: eventosDoMes.length,
      eventos_planejados: planejadosMes,
      eventos_realizados: realizadosMes,
      total_policiais: efetivoMes,
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

// Ordena os itens de roteiro de uma viatura pela distância circular do horário de início do
// turno (07h por padrão), não em ordem alfabética simples — itens como "Alvorada" às 05h30
// pertencem ao fim do turno (do dia anterior), não ao início.
function ordenarPorTurno(itens, inicioTurno = '07:00') {
  const minutos = (hhmm) => {
    const [h, m] = String(hhmm || '00:00').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const refMin = minutos(inicioTurno);
  return itens.slice().sort((a, b) => {
    const diffA = ((minutos(a.inicio) - refMin) + 1440) % 1440;
    const diffB = ((minutos(b.inicio) - refMin) + 1440) % 1440;
    return diffA - diffB;
  });
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

// Lista resumida (filtrável por data exata, ou por mês/ano para o histórico) — nunca inclui templates
app.get('/api/cartoes', asyncRoute(async (req, res) => {
  const db = await readDB();
  let cartoes = (db.cartoes || []).filter(c => !c.is_template);

  if (req.query.data) {
    cartoes = cartoes.filter(c => c.data === req.query.data);
  } else {
    if (req.query.ano) {
      cartoes = cartoes.filter(c => c.data.startsWith(req.query.ano));
    }
    if (req.query.mes) {
      cartoes = cartoes.filter(c => c.data.split('-')[1] === req.query.mes);
    }
  }

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
  const db = await readDB();
  let templates = (db.cartoes || []).filter(c => c.is_template);

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
    qtd_viaturas: (c.viaturas || []).length
  })));
}));

// Detalhe completo de um cartão (ou template)
app.get('/api/cartoes/:id', asyncRoute(async (req, res) => {
  const db = await readDB();
  const cartao = (db.cartoes || []).find(c => c.id === req.params.id);
  if (!cartao) return res.status(404).json({ error: 'Cartão Programa não encontrado' });

  // Reordena os itens por turno na leitura — cartões salvos antes desta mudança ainda estão
  // em ordem alfabética simples; isso corrige a exibição sem exigir migração de dados.
  const cartaoOrdenado = {
    ...cartao,
    viaturas: (cartao.viaturas || []).map(v => ({ ...v, itens: ordenarPorTurno(v.itens || []) }))
  };
  res.json(cartaoOrdenado);
}));

// Criar cartão de um dia (com opção de copiar as viaturas/roteiros do cartão mais recente),
// ou criar um TEMPLATE nomeado (is_template=true, exclusivo do P3, sem data)
app.post('/api/cartoes', asyncRoute(async (req, res) => {
  const db = await readDB();

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
      viaturas: []
    };
    db.cartoes.push(novoTemplate);
    await writeDB(db, ['cartoes']);
    return res.status(201).json(novoTemplate);
  }

  const dataCartao = req.body.data;
  if (!dataCartao) {
    return res.status(400).json({ error: 'A data do Cartão Programa é obrigatória.' });
  }
  if (db.cartoes.some(c => !c.is_template && c.data === dataCartao)) {
    return res.status(409).json({ error: 'Já existe um Cartão Programa para esta data.' });
  }

  const novoCartao = {
    id: generateId('cp'),
    data: dataCartao,
    fiscal: req.body.fiscal || '',
    adjunto: req.body.adjunto || '',
    oficial_sobreaviso: req.body.oficial_sobreaviso || '',
    is_template: false,
    nome_template: null,
    tipo_periodo: null,
    qtd_viaturas_base: null,
    origem_template_id: null,
    viaturas: []
  };

  // Copia a estrutura do cartão mais recente anterior à nova data
  if (req.body.copiar_de === 'ultimo') {
    const anteriores = db.cartoes
      .filter(c => !c.is_template && c.data < dataCartao)
      .sort((a, b) => b.data.localeCompare(a.data));

    if (anteriores.length > 0) {
      const base = anteriores[0];
      novoCartao.fiscal = novoCartao.fiscal || base.fiscal;
      novoCartao.adjunto = novoCartao.adjunto || base.adjunto;
      novoCartao.viaturas = (base.viaturas || []).map(v => ({
        id: generateId('cpv'),
        prefixo: v.prefixo,
        setor: v.setor,
        companhia: v.companhia || '',
        categoria: v.categoria || 'Ordinária',
        comandante: v.comandante,
        observacao: v.observacao || '',
        itens: (v.itens || []).map(i => ({
          id: generateId('cpi'),
          inicio: i.inicio,
          fim: i.fim,
          local: i.local,
          atividade: i.atividade
        }))
      }));
    }
  }

  db.cartoes.push(novoCartao);
  await writeDB(db, ['cartoes']);
  res.status(201).json(novoCartao);
}));

// "Importar e Clonar" um template: gera o cartão do dia a partir do template, com viaturas/roteiros
// prontos e o campo Comandante em branco para o Adjunto preencher
app.post('/api/cartoes/:id/clonar', asyncRoute(async (req, res) => {
  const db = await readDB();
  const template = (db.cartoes || []).find(c => c.id === req.params.id);
  if (!template) return res.status(404).json({ error: 'Template não encontrado' });
  if (!template.is_template) return res.status(400).json({ error: 'Este cartão não é um template.' });

  const dataCartao = req.body.data;
  if (!dataCartao) {
    return res.status(400).json({ error: 'A data do Cartão Programa é obrigatória.' });
  }
  if (db.cartoes.some(c => !c.is_template && c.data === dataCartao)) {
    return res.status(409).json({ error: 'Já existe um Cartão Programa para esta data.' });
  }

  const novoCartao = {
    id: generateId('cp'),
    data: dataCartao,
    fiscal: '',
    adjunto: '',
    oficial_sobreaviso: '',
    is_template: false,
    nome_template: null,
    tipo_periodo: template.tipo_periodo,
    qtd_viaturas_base: template.qtd_viaturas_base,
    origem_template_id: template.id,
    viaturas: (template.viaturas || []).map(v => ({
      id: generateId('cpv'),
      prefixo: v.prefixo,
      setor: v.setor,
      companhia: v.companhia || '',
      categoria: v.categoria || 'Ordinária',
      comandante: '', // em branco: preenchido pelo Adjunto no dia
      observacao: v.observacao || '',
      itens: (v.itens || []).map(i => ({
        id: generateId('cpi'),
        inicio: i.inicio,
        fim: i.fim,
        local: i.local,
        atividade: i.atividade
      }))
    }))
  };

  db.cartoes.push(novoCartao);
  await writeDB(db, ['cartoes']);
  res.status(201).json(novoCartao);
}));

// Atualizar cabeçalho do cartão (fiscal / adjunto / oficial de sobreaviso)
app.put('/api/cartoes/:id', asyncRoute(async (req, res) => {
  const db = await readDB();
  const cartao = (db.cartoes || []).find(c => c.id === req.params.id);
  if (!cartao) return res.status(404).json({ error: 'Cartão Programa não encontrado' });

  if (req.body.fiscal !== undefined) cartao.fiscal = req.body.fiscal;
  if (req.body.adjunto !== undefined) cartao.adjunto = req.body.adjunto;
  if (req.body.oficial_sobreaviso !== undefined) cartao.oficial_sobreaviso = req.body.oficial_sobreaviso;

  await writeDB(db, ['cartoes']);
  res.json(cartao);
}));

// Excluir cartão (templates só podem ser excluídos pelo P3)
app.delete('/api/cartoes/:id', asyncRoute(async (req, res) => {
  const db = await readDB();
  const cartao = (db.cartoes || []).find(c => c.id === req.params.id);
  if (cartao && cartao.is_template && (!req.user || req.user.role !== 'P3')) {
    return res.status(403).json({ error: 'Apenas o perfil P3 tem permissão para excluir templates.' });
  }
  db.cartoes = (db.cartoes || []).filter(c => c.id !== req.params.id);
  await writeDB(db, ['cartoes']);
  res.json({ message: 'Cartão Programa excluído' });
}));

// Adicionar viatura ao cartão
app.post('/api/cartoes/:id/viaturas', asyncRoute(async (req, res) => {
  const db = await readDB();
  const cartao = (db.cartoes || []).find(c => c.id === req.params.id);
  if (!cartao) return res.status(404).json({ error: 'Cartão Programa não encontrado' });

  if (!req.body.prefixo || !req.body.setor) {
    return res.status(400).json({ error: 'Prefixo da VTR e setor são obrigatórios.' });
  }
  if (req.body.companhia && !COMPANHIAS_VALIDAS.includes(req.body.companhia)) {
    return res.status(400).json({ error: 'Companhia inválida.' });
  }
  const categoria = req.body.categoria || 'Ordinária';
  if (!CATEGORIAS_VIATURA.includes(categoria)) {
    return res.status(400).json({ error: 'Categoria de viatura inválida.' });
  }

  const novaViatura = {
    id: generateId('cpv'),
    prefixo: req.body.prefixo,
    setor: req.body.setor,
    companhia: req.body.companhia || '',
    categoria,
    comandante: req.body.comandante || '',
    observacao: req.body.observacao || '',
    itens: []
  };

  cartao.viaturas.push(novaViatura);
  await writeDB(db, ['cartoes']);
  res.status(201).json(novaViatura);
}));

// Atualizar viatura
app.put('/api/cartoes/:id/viaturas/:vid', asyncRoute(async (req, res) => {
  const db = await readDB();
  const cartao = (db.cartoes || []).find(c => c.id === req.params.id);
  if (!cartao) return res.status(404).json({ error: 'Cartão Programa não encontrado' });

  const viatura = cartao.viaturas.find(v => v.id === req.params.vid);
  if (!viatura) return res.status(404).json({ error: 'Viatura não encontrada neste cartão' });

  if (req.body.companhia !== undefined && req.body.companhia && !COMPANHIAS_VALIDAS.includes(req.body.companhia)) {
    return res.status(400).json({ error: 'Companhia inválida.' });
  }
  if (req.body.categoria !== undefined && !CATEGORIAS_VIATURA.includes(req.body.categoria)) {
    return res.status(400).json({ error: 'Categoria de viatura inválida.' });
  }

  ['prefixo', 'setor', 'companhia', 'categoria', 'comandante', 'observacao'].forEach(campo => {
    if (req.body[campo] !== undefined) viatura[campo] = req.body[campo];
  });

  await writeDB(db, ['cartoes']);
  res.json(viatura);
}));

// Remover viatura do cartão
app.delete('/api/cartoes/:id/viaturas/:vid', asyncRoute(async (req, res) => {
  const db = await readDB();
  const cartao = (db.cartoes || []).find(c => c.id === req.params.id);
  if (!cartao) return res.status(404).json({ error: 'Cartão Programa não encontrado' });

  cartao.viaturas = cartao.viaturas.filter(v => v.id !== req.params.vid);
  await writeDB(db, ['cartoes']);
  res.json({ message: 'Viatura removida do cartão' });
}));

// Adicionar item de roteiro à viatura
app.post('/api/cartoes/:id/viaturas/:vid/itens', asyncRoute(async (req, res) => {
  const db = await readDB();
  const cartao = (db.cartoes || []).find(c => c.id === req.params.id);
  if (!cartao) return res.status(404).json({ error: 'Cartão Programa não encontrado' });

  const viatura = cartao.viaturas.find(v => v.id === req.params.vid);
  if (!viatura) return res.status(404).json({ error: 'Viatura não encontrada neste cartão' });

  if (!req.body.inicio || !req.body.local) {
    return res.status(400).json({ error: 'Horário de início e local são obrigatórios.' });
  }

  const novoItem = {
    id: generateId('cpi'),
    inicio: req.body.inicio,
    fim: req.body.fim || '',
    local: req.body.local,
    atividade: req.body.atividade || 'Patrulhamento'
  };

  viatura.itens.push(novoItem);
  viatura.itens = ordenarPorTurno(viatura.itens);
  await writeDB(db, ['cartoes']);
  res.status(201).json(novoItem);
}));

// Atualizar item de roteiro
app.put('/api/cartoes/:id/viaturas/:vid/itens/:iid', asyncRoute(async (req, res) => {
  const db = await readDB();
  const cartao = (db.cartoes || []).find(c => c.id === req.params.id);
  if (!cartao) return res.status(404).json({ error: 'Cartão Programa não encontrado' });

  const viatura = cartao.viaturas.find(v => v.id === req.params.vid);
  if (!viatura) return res.status(404).json({ error: 'Viatura não encontrada neste cartão' });

  const item = viatura.itens.find(i => i.id === req.params.iid);
  if (!item) return res.status(404).json({ error: 'Item de roteiro não encontrado' });

  ['inicio', 'fim', 'local', 'atividade'].forEach(campo => {
    if (req.body[campo] !== undefined) item[campo] = req.body[campo];
  });

  viatura.itens = ordenarPorTurno(viatura.itens);
  await writeDB(db, ['cartoes']);
  res.json(item);
}));

// Remover item de roteiro
app.delete('/api/cartoes/:id/viaturas/:vid/itens/:iid', asyncRoute(async (req, res) => {
  const db = await readDB();
  const cartao = (db.cartoes || []).find(c => c.id === req.params.id);
  if (!cartao) return res.status(404).json({ error: 'Cartão Programa não encontrado' });

  const viatura = cartao.viaturas.find(v => v.id === req.params.vid);
  if (!viatura) return res.status(404).json({ error: 'Viatura não encontrada neste cartão' });

  viatura.itens = viatura.itens.filter(i => i.id !== req.params.iid);
  await writeDB(db, ['cartoes']);
  res.json({ message: 'Item de roteiro removido' });
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
