const express = require('express');

function usuarioPublico(usuario) {
  return {
    usuario: usuario.usuario,
    nome: usuario.nome,
    role: usuario.role,
    unidade: usuario.unidade || null,
    ativo: usuario.ativo !== false,
    exigir_troca_senha: !!usuario.exigir_troca_senha,
  };
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
  registrarAuditoria,
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
      role: { obrigatorio: true, tipo: 'string', valores: ['P3', 'Adjunto', 'Oficial', 'Sargenteante'], label: 'Perfil' }
    });
    if (!v.ok) return res.status(400).json({ error: v.erro });
    const senha = req.body.senha;
    if (!senha || String(senha).length < 3) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 3 caracteres.' });
    }
    if (req.body.exigir_troca_senha !== undefined && typeof req.body.exigir_troca_senha !== 'boolean') {
      return res.status(400).json({ error: 'A opção de troca obrigatória de senha é inválida.' });
    }

    const usuarios = await readTabela('usuarios');
    if (usuarios.some(u => u.usuario.toLowerCase() === v.valores.usuario.toLowerCase())) {
      return res.status(409).json({ error: 'Já existe um usuário com esse login.' });
    }

    const unidades = ['1ª Companhia', '2ª Companhia', '3ª Companhia', 'PCS'];
    const unidade = req.body.unidade ? String(req.body.unidade).trim() : null;
    if (v.valores.role === 'Sargenteante' && !unidades.includes(unidade)) {
      return res.status(400).json({ error: 'O Sargenteante deve estar vinculado a uma unidade válida.' });
    }
    if (v.valores.role !== 'Sargenteante' && unidade) {
      return res.status(400).json({ error: 'Somente o perfil Sargenteante pode possuir unidade vinculada.' });
    }
    const novoUsuario = {
      usuario: v.valores.usuario,
      senha: hashSenha(senha),
      nome: v.valores.nome,
      role: v.valores.role,
      unidade: v.valores.role === 'Sargenteante' ? unidade : null,
      ativo: true,
      exigir_troca_senha: !!req.body.exigir_troca_senha,
    };
    await writeRow('usuarios', novoUsuario);
    await registrarAuditoria({ req, acao: 'criou', entidade: 'Usuário', entidadeId: novoUsuario.usuario, descricao: `Criou o usuário “${novoUsuario.usuario}”.` });
    res.status(201).json(usuarioPublico(novoUsuario));
  }));

  router.put('/usuarios/:usuario', exigirP3, asyncRoute(async (req, res) => {
    const usuarios = await readTabela('usuarios');
    const alvo = usuarios.find(u => u.usuario === req.params.usuario);
    if (!alvo) return res.status(404).json({ error: 'Usuário não encontrado.' });
    const antes = { ...alvo };
    const atualizado = { ...alvo };

    if (req.body.role !== undefined) {
      if (!['P3', 'Adjunto', 'Oficial', 'Sargenteante'].includes(req.body.role)) {
        return res.status(400).json({ error: 'Perfil inválido.' });
      }
      atualizado.role = req.body.role;
    }

    const roleFinal = atualizado.role;
    const unidades = ['1ª Companhia', '2ª Companhia', '3ª Companhia', 'PCS'];
    const unidadeRecebida = req.body.unidade !== undefined ? (String(req.body.unidade || '').trim() || null) : atualizado.unidade;
    if (roleFinal === 'Sargenteante' && !unidades.includes(unidadeRecebida)) {
      return res.status(400).json({ error: 'O Sargenteante deve estar vinculado a uma unidade válida.' });
    }
    atualizado.unidade = roleFinal === 'Sargenteante' ? unidadeRecebida : null;

    if (req.body.nome !== undefined) {
      const nome = String(req.body.nome).trim();
      if (!nome || nome.length > 150) return res.status(400).json({ error: 'Informe um Nome de Exibição válido.' });
      atualizado.nome = nome;
    }
    if (req.body.ativo !== undefined) {
      if (typeof req.body.ativo !== 'boolean') return res.status(400).json({ error: 'Status de usuário inválido.' });
      atualizado.ativo = req.body.ativo;
    }

    const p3AtivosDepois = usuarios
      .map((usuario) => usuario.usuario === atualizado.usuario ? atualizado : usuario)
      .filter((usuario) => usuario.role === 'P3' && usuario.ativo !== false).length;
    if (p3AtivosDepois === 0) {
      return res.status(400).json({ error: 'É necessário manter ao menos um usuário ativo com perfil P3.' });
    }

    // Sessões guardam o perfil para autorizar sem consultar `usuarios` em toda
    // requisição. Portanto, uma mudança de papel ou desativação precisa revogar
    // os tokens antes de confirmar a conta; caso contrário o acesso antigo
    // continuaria válido por até 12 horas.
    const deveRevogarSessoes = atualizado.role !== antes.role || atualizado.unidade !== antes.unidade
      || (antes.ativo !== false && atualizado.ativo === false);
    if (deveRevogarSessoes) {
      const { error: erroSessoes } = await supabase.from('sessoes').delete().eq('usuario', atualizado.usuario);
      if (erroSessoes) throw new Error(`Falha ao encerrar sessões no Supabase: ${erroSessoes.message}`);
    }

    await writeRow('usuarios', atualizado);
    await registrarAuditoria({ req, acao: atualizado.ativo === false ? 'desativou' : 'alterou', entidade: 'Usuário', entidadeId: atualizado.usuario, descricao: `Atualizou o usuário “${atualizado.usuario}”.`, campos: ['nome', 'role', 'unidade', 'ativo'], antes, depois: atualizado });
    res.json(usuarioPublico(atualizado));
  }));

  router.post('/usuarios/:usuario/resetar-senha', exigirP3, asyncRoute(async (req, res) => {
    const usuarios = await readTabela('usuarios');
    const alvo = usuarios.find(u => u.usuario === req.params.usuario);
    if (!alvo) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const novaSenha = req.body.senha_nova;
    if (!novaSenha || String(novaSenha).length < 3) {
      return res.status(400).json({ error: 'A nova senha deve ter pelo menos 3 caracteres.' });
    }

    alvo.senha = hashSenha(novaSenha);
    alvo.exigir_troca_senha = req.body.exigir_troca_senha !== false;
    const { error: erroSessoes } = await supabase.from('sessoes').delete().eq('usuario', alvo.usuario);
    if (erroSessoes) throw new Error(`Falha ao encerrar sessões no Supabase: ${erroSessoes.message}`);
    await writeRow('usuarios', alvo);
    await registrarAuditoria({ req, acao: 'redefiniu senha', entidade: 'Usuário', entidadeId: alvo.usuario, descricao: alvo.exigir_troca_senha ? `Redefiniu a senha de “${alvo.usuario}” e marcou troca no próximo acesso.` : `Redefiniu a senha de “${alvo.usuario}”.` });
    res.json({ message: `Senha de ${alvo.usuario} redefinida com sucesso.` });
  }));

  router.delete('/usuarios/:usuario', exigirP3, asyncRoute(async (req, res) => {
    const usuarios = await readTabela('usuarios');
    const alvo = usuarios.find(u => u.usuario === req.params.usuario);
    if (!alvo) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (alvo.usuario === req.user.usuario) {
      return res.status(400).json({ error: 'Você não pode excluir o seu próprio usuário.' });
    }
    if (alvo.role === 'P3' && alvo.ativo !== false
      && usuarios.filter(u => u.usuario !== alvo.usuario && u.role === 'P3' && u.ativo !== false).length === 0) {
      return res.status(400).json({ error: 'Não é possível excluir o último usuário ativo com perfil P3.' });
    }

    const { error: erroSessoes } = await supabase.from('sessoes').delete().eq('usuario', alvo.usuario);
    if (erroSessoes) throw new Error(`Falha ao encerrar sessões no Supabase: ${erroSessoes.message}`);
    await deleteRow('usuarios', alvo.usuario);
    await registrarAuditoria({ req, acao: 'excluiu', entidade: 'Usuário', entidadeId: alvo.usuario, descricao: `Excluiu o usuário “${alvo.usuario}”.` });
    res.json({ message: 'Usuário excluído.' });
  }));

  return router;
}

module.exports = { criarRouterUsuarios, usuarioPublico };
