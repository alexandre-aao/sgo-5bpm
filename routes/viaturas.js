const express = require('express');

module.exports = function criarRouterViaturas({
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
  registrarAuditoria,
}) {
  const router = express.Router();

  router.get('/viaturas', asyncRoute(async (_req, res) => {
    const viaturas = await readTabela('viaturas');
    res.json(viaturas.sort((a, b) => a.prefixo.localeCompare(b.prefixo)));
  }));

  router.post('/viaturas', asyncRoute(async (req, res) => {
    const valid = validarCampos(req.body, {
      prefixo: { obrigatorio: true, tipo: 'string', max: 30, label: 'Prefixo' },
      companhia: { obrigatorio: false, tipo: 'string', valores: COMPANHIAS_VIATURA, padrao: '', label: 'Companhia' },
      categoria: { obrigatorio: false, tipo: 'string', valores: CATEGORIAS_VIATURA, padrao: 'Ordinária', label: 'Categoria' },
      status: { obrigatorio: false, tipo: 'string', valores: STATUS_VIATURA, padrao: 'Ativa', label: 'Status' },
      setor: { obrigatorio: false, tipo: 'string', max: 100, padrao: '', label: 'Setor' },
      observacao: { obrigatorio: false, tipo: 'string', max: 300, padrao: '', label: 'Observação' }
    });
    if (!valid.ok) return res.status(400).json({ error: valid.erro });

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
    await registrarAuditoria({ req, acao: 'criou', entidade: 'Viatura', entidadeId: novaViatura.id, descricao: `Cadastrou a viatura “${novaViatura.prefixo}”.` });
    res.status(201).json(novaViatura);
  }));

  router.put('/viaturas/:id', asyncRoute(async (req, res) => {
    const viaturas = await readTabela('viaturas');
    const viatura = viaturas.find(v => v.id === req.params.id);
    if (!viatura) return res.status(404).json({ error: 'Viatura não encontrada.' });
    const antes = { ...viatura };

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
      if (!STATUS_VIATURA.includes(req.body.status)) return res.status(400).json({ error: 'Status de viatura inválido.' });
      viatura.status = req.body.status;
    }
    if (req.body.observacao !== undefined) viatura.observacao = req.body.observacao;
    if (req.body.setor !== undefined) viatura.setor = String(req.body.setor).trim();

    await writeRow('viaturas', viatura);
    await registrarAuditoria({ req, acao: 'alterou', entidade: 'Viatura', entidadeId: viatura.id, descricao: `Alterou a viatura “${viatura.prefixo}”.`, antes, depois: viatura, campos: ['prefixo', 'companhia', 'categoria', 'status', 'setor', 'observacao'] });
    res.json(viatura);
  }));

  router.delete('/viaturas/:id', exigirP3, asyncRoute(async (req, res) => {
    const { data: viatura, error: erroBusca } = await supabase
      .from('viaturas').select('id').eq('id', req.params.id).maybeSingle();
    if (erroBusca) throw new Error(`Falha ao ler "viaturas" do Supabase: ${erroBusca.message}`);
    if (!viatura) return res.status(404).json({ error: 'Viatura não encontrada.' });
    await deleteRow('viaturas', req.params.id);
    await registrarAuditoria({ req, acao: 'excluiu', entidade: 'Viatura', entidadeId: req.params.id, descricao: `Excluiu uma viatura do cadastro.` });
    res.json({ message: 'Viatura excluída.' });
  }));

  return router;
};
