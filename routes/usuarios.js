const express = require('express');

function usuarioPublico(usuario) {
  return { usuario: usuario.usuario, nome: usuario.nome, role: usuario.role };
}

function criarRouterUsuarios({
  asyncRoute,
  deleteRow,
  exigirP3,
  hashSenha,
  readTabela,
  supabase,
  validarCampos,
  writeRow,
}) {
  const router = express.Router();

  router.get('/usuarios', exigirP3, asyncRoute(async (_req, res) => {
    const usuarios = await readTabela('usuarios');
    res.json(usuarios.map(usuarioPublico));
  }));

  router.post('/usuarios', exigirP3, asyncRoute(async (req, res) => {
    const v = validarCampos(req.body, {
      usuario: { obrigatorio: true, tipo: 'string', max: 60, label: 'Usuário' },
      nome: { obrigatorio: true, tipo: 'string', max: 150, label: 'Nome de Exibição' },
      role: { obrigatorio: true, tipo: 'string', valores: ['P3', 'Adjunto', 'Oficial'], label: 'Perfil' }
    });
    if (!v.ok) return res.status(400).json({ error: v.erro });
    const senha = req.body.senha;
    if (!senha || String(senha).length < 8) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 8 caracteres.' });
    }

    const usuarios = await readTabela('usuarios');
    if (usuarios.some(u => u.usuario.toLowerCase() === v.valores.usuario.toLowerCase())) {
      return res.status(409).json({ error: 'Já existe um usuário com esse login.' });
    }

    const novoUsuario = {
      usuario: v.valores.usuario,
      senha: hashSenha(senha),
      nome: v.valores.nome,
      role: v.valores.role
    };
    await writeRow('usuarios', novoUsuario);
    res.status(201).json(usuarioPublico(novoUsuario));
  }));

  router.put('/usuarios/:usuario', exigirP3, asyncRoute(async (req, res) => {
    const usuarios = await readTabela('usuarios');
    const alvo = usuarios.find(u => u.usuario === req.params.usuario);
    if (!alvo) return res.status(404).json({ error: 'Usuário não encontrado.' });

    if (req.body.role !== undefined) {
      if (!['P3', 'Adjunto', 'Oficial'].includes(req.body.role)) {
        return res.status(400).json({ error: 'Perfil inválido.' });
      }
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

  router.post('/usuarios/:usuario/resetar-senha', exigirP3, asyncRoute(async (req, res) => {
    const usuarios = await readTabela('usuarios');
    const alvo = usuarios.find(u => u.usuario === req.params.usuario);
    if (!alvo) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const novaSenha = req.body.senha_nova;
    if (!novaSenha || String(novaSenha).length < 8) {
      return res.status(400).json({ error: 'A nova senha deve ter pelo menos 8 caracteres.' });
    }

    alvo.senha = hashSenha(novaSenha);
    await writeRow('usuarios', alvo);
    const { error: erroSessoes } = await supabase.from('sessoes').delete().eq('usuario', alvo.usuario);
    if (erroSessoes) throw new Error(`Falha ao encerrar sessões no Supabase: ${erroSessoes.message}`);
    res.json({ message: `Senha de ${alvo.usuario} redefinida com sucesso.` });
  }));

  router.delete('/usuarios/:usuario', exigirP3, asyncRoute(async (req, res) => {
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
    const { error: erroSessoes } = await supabase.from('sessoes').delete().eq('usuario', alvo.usuario);
    if (erroSessoes) throw new Error(`Falha ao encerrar sessões no Supabase: ${erroSessoes.message}`);
    res.json({ message: 'Usuário excluído.' });
  }));

  return router;
}

module.exports = { criarRouterUsuarios, usuarioPublico };
