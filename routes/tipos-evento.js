const express = require('express');

function normalizarNome(nome) {
  return String(nome || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

module.exports = function criarRouterTiposEvento({ asyncRoute, exigirP3, generateId, supabase, validarCampos, registrarAuditoria }) {
  const router = express.Router();

  router.get('/tipos-evento', asyncRoute(async (req, res) => {
    let consulta = supabase.from('tipos_evento').select('*').order('nome', { ascending: true });
    if (String(req.query.ativos || '') === '1') consulta = consulta.eq('ativo', true);
    const { data, error } = await consulta;
    if (error) throw new Error(`Falha ao ler tipos de evento: ${error.message}`);
    res.json(data || []);
  }));

  router.post('/tipos-evento', exigirP3, asyncRoute(async (req, res) => {
    const valid = validarCampos(req.body, {
      nome: { obrigatorio: true, tipo: 'string', max: 100, label: 'Nome do Tipo de Evento' },
      descricao: { obrigatorio: false, tipo: 'string', max: 300, padrao: '', label: 'Descrição' }
    });
    if (!valid.ok) return res.status(400).json({ error: valid.erro });
    const nome = valid.valores.nome.replace(/\s+/g, ' ').trim();
    const { data: existentes, error: erroExistentes } = await supabase.from('tipos_evento').select('id,nome');
    if (erroExistentes) throw new Error(`Falha ao conferir tipos de evento: ${erroExistentes.message}`);
    if ((existentes || []).some((tipo) => normalizarNome(tipo.nome) === normalizarNome(nome))) {
      return res.status(409).json({ error: 'Já existe um Tipo de Evento com esse nome.' });
    }
    const agora = new Date().toISOString();
    const tipo = {
      id: generateId('tev'), nome, descricao: valid.valores.descricao, ativo: true,
      criado_por: req.user.usuario, criado_em: agora, atualizado_em: agora,
    };
    const { error } = await supabase.from('tipos_evento').insert(tipo);
    if (error) throw new Error(`Falha ao criar Tipo de Evento: ${error.message}`);
    await registrarAuditoria({ req, acao: 'criou', entidade: 'Tipo de Evento', entidadeId: tipo.id, descricao: `Criou o Tipo de Evento “${tipo.nome}”.` });
    res.status(201).json(tipo);
  }));

  router.put('/tipos-evento/:id', exigirP3, asyncRoute(async (req, res) => {
    const { data: tipo, error: erroBusca } = await supabase.from('tipos_evento').select('*').eq('id', req.params.id).maybeSingle();
    if (erroBusca) throw new Error(`Falha ao buscar Tipo de Evento: ${erroBusca.message}`);
    if (!tipo) return res.status(404).json({ error: 'Tipo de Evento não encontrado.' });
    const patch = {};
    if (req.body.nome !== undefined) {
      const nome = String(req.body.nome).replace(/\s+/g, ' ').trim();
      if (!nome || nome.length > 100) return res.status(400).json({ error: 'Informe um nome de Tipo de Evento válido.' });
      const { data: outros, error } = await supabase.from('tipos_evento').select('id,nome').neq('id', tipo.id);
      if (error) throw new Error(`Falha ao conferir duplicidade: ${error.message}`);
      if ((outros || []).some((outro) => normalizarNome(outro.nome) === normalizarNome(nome))) {
        return res.status(409).json({ error: 'Já existe um Tipo de Evento com esse nome.' });
      }
      patch.nome = nome;
    }
    if (req.body.descricao !== undefined) {
      const descricao = String(req.body.descricao).trim();
      if (descricao.length > 300) return res.status(400).json({ error: 'A descrição deve ter no máximo 300 caracteres.' });
      patch.descricao = descricao;
    }
    if (req.body.ativo !== undefined) {
      if (typeof req.body.ativo !== 'boolean') return res.status(400).json({ error: 'Status do Tipo de Evento inválido.' });
      patch.ativo = req.body.ativo;
    }
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nenhuma alteração informada.' });
    patch.atualizado_em = new Date().toISOString();
    const atualizado = { ...tipo, ...patch };
    const { error } = await supabase.from('tipos_evento').update(patch).eq('id', tipo.id);
    if (error) throw new Error(`Falha ao atualizar Tipo de Evento: ${error.message}`);
    await registrarAuditoria({ req, acao: patch.ativo === false ? 'desativou' : 'alterou', entidade: 'Tipo de Evento', entidadeId: tipo.id, descricao: `Atualizou o Tipo de Evento “${atualizado.nome}”.`, antes: tipo, depois: atualizado, campos: ['nome', 'descricao', 'ativo'] });
    res.json(atualizado);
  }));

  router.delete('/tipos-evento/:id', exigirP3, asyncRoute(async (req, res) => {
    const { data: tipo, error: erroBusca } = await supabase.from('tipos_evento').select('*').eq('id', req.params.id).maybeSingle();
    if (erroBusca) throw new Error(`Falha ao buscar Tipo de Evento: ${erroBusca.message}`);
    if (!tipo) return res.status(404).json({ error: 'Tipo de Evento não encontrado.' });
    const { count, error: erroVinculos } = await supabase.from('eventos').select('id', { count: 'exact', head: true }).eq('tipo_evento', tipo.nome);
    if (erroVinculos) throw new Error(`Falha ao conferir vínculos do Tipo de Evento: ${erroVinculos.message}`);
    if ((count || 0) > 0) return res.status(409).json({ error: 'Este Tipo de Evento já está vinculado a eventos. Desative-o para preservar o histórico.' });
    const { error } = await supabase.from('tipos_evento').delete().eq('id', tipo.id);
    if (error) throw new Error(`Falha ao excluir Tipo de Evento: ${error.message}`);
    await registrarAuditoria({ req, acao: 'excluiu', entidade: 'Tipo de Evento', entidadeId: tipo.id, descricao: `Excluiu o Tipo de Evento “${tipo.nome}”.` });
    res.json({ message: 'Tipo de Evento excluído.' });
  }));

  return router;
};

module.exports.normalizarNome = normalizarNome;
