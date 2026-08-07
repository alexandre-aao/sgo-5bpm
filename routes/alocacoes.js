const express = require('express');

module.exports = function criarRouterAlocacoes({
  asyncRoute,
  deleteRow,
  exigirP3,
  generateId,
  readTabela,
  validarCampos,
  writeRow,
}) {
  const router = express.Router();

  router.get('/alocacoes', asyncRoute(async (req, res) => {
    const filtros = req.query.evento_id
      ? { evento_id: req.query.evento_id }
      : (req.query.operacao_id ? { operacao_id: req.query.operacao_id } : {});
    res.json(await readTabela('alocacoes', filtros));
  }));

  router.post('/alocacoes', exigirP3, asyncRoute(async (req, res) => {
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

  router.delete('/alocacoes/:id', exigirP3, asyncRoute(async (req, res) => {
    await deleteRow('alocacoes', req.params.id);
    res.json({ message: 'Alocação excluída' });
  }));

  return router;
};
