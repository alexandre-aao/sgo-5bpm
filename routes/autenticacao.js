const crypto = require('crypto');
const express = require('express');

function criarRouterAutenticacaoPublica({
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
}) {
  const router = express.Router();

// -------------------------------------------------------------
// ROTA DE AUTENTICAÇÃO (LOGIN)
// -------------------------------------------------------------
router.post('/login', loginRateLimiter, asyncRoute(async (req, res) => {
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

router.post('/cartoes/:id/arquivo-pdf', entregaPdfRateLimiter, receberFormularioPdf, asyncRoute(async (req, res) => {
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

  return router;
}

function criarRouterAutenticacaoProtegida({
  asyncRoute,
  buscarUsuarioPorLogin,
  hashSenha,
  limparCookieSessao,
  supabase,
  tokenDaRequisicao,
  verificarSenha,
}) {
  const router = express.Router();

// Encerrar sessão (invalida o token no servidor)
router.post('/logout', asyncRoute(async (req, res) => {
  // Pega do cookie OU do Bearer: durante a transição a sessão pode ter vindo de
  // qualquer um dos dois, e sair pela metade deixaria a linha viva em `sessoes`.
  const token = tokenDaRequisicao(req);
  if (token) await supabase.from('sessoes').delete().eq('token', token);
  limparCookieSessao(res);
  res.json({ message: 'Sessão encerrada.' });
}));

// Alterar a própria senha
router.post('/alterar-senha', asyncRoute(async (req, res) => {
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

  return router;
}

module.exports = { criarRouterAutenticacaoProtegida, criarRouterAutenticacaoPublica };
