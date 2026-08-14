const express = require('express');

module.exports = function criarRouterAuditoria({ asyncRoute, exigirP3, supabase }) {
  const router = express.Router();

  router.get('/historico-atividades', exigirP3, asyncRoute(async (req, res) => {
    let consulta = supabase.from('auditoria').select('*').order('criado_em', { ascending: false }).limit(500);
    if (req.query.usuario) consulta = consulta.eq('usuario', String(req.query.usuario).trim());
    if (req.query.acao) consulta = consulta.eq('acao', String(req.query.acao).trim());
    if (req.query.entidade) consulta = consulta.eq('entidade', String(req.query.entidade).trim());

    const { data, error } = await consulta;
    if (error) throw new Error(`Falha ao ler o histórico de atividades: ${error.message}`);

    const busca = String(req.query.busca || '').trim().toLocaleLowerCase('pt-BR');
    const de = req.query.de ? Date.parse(String(req.query.de)) : null;
    const ate = req.query.ate ? Date.parse(String(req.query.ate)) + 24 * 60 * 60 * 1000 - 1 : null;
    const registros = (data || []).filter((registro) => {
      if (de && Number(registro.criado_em) < de) return false;
      if (ate && Number(registro.criado_em) > ate) return false;
      if (!busca) return true;
      return [registro.usuario, registro.usuario_nome, registro.entidade, registro.acao, registro.descricao_resumida]
        .some((valor) => String(valor || '').toLocaleLowerCase('pt-BR').includes(busca));
    });
    res.json(registros);
  }));

  return router;
};
