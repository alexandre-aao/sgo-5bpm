const express = require('express');

module.exports = function criarRouterPessoal({
  CATEGORIAS_PESSOAL,
  POSTOS_GRADUACAO,
  SUBUNIDADES_PESSOAL,
  asyncRoute,
  deleteRow,
  exigirP3,
  generateId,
  readTabela,
  supabase,
  validarCampos,
  writeRow,
}) {
  const router = express.Router();

  router.get('/pessoal', asyncRoute(async (req, res) => {
    let pessoal = await readTabela('pessoal');
    if (req.query.categoria) {
      pessoal = pessoal.filter(p => (p.categorias || []).includes(req.query.categoria));
    }
    res.json(pessoal.sort((a, b) => a.nome.localeCompare(b.nome)));
  }));

  router.post('/pessoal', exigirP3, asyncRoute(async (req, res) => {
    const v = validarCampos(req.body, {
      nome: { obrigatorio: true, tipo: 'string', max: 150, label: 'Nome' },
      posto_graduacao: { obrigatorio: true, tipo: 'string', max: 50, label: 'Posto/Graduação' }
    });
    if (!v.ok) return res.status(400).json({ error: v.erro });

    const { nome, posto_graduacao } = v.valores;
    const { categorias, matricula, subunidade } = req.body;
    const postoInfo = POSTOS_GRADUACAO.find(p => p.posto === posto_graduacao);
    if (!postoInfo) return res.status(400).json({ error: 'Posto/graduação inválido.' });
    const categoriasValidas = Array.isArray(categorias)
      ? categorias.filter(c => CATEGORIAS_PESSOAL.includes(c))
      : [];

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

  router.put('/pessoal/:id', exigirP3, asyncRoute(async (req, res) => {
    const { data: pessoa, error: erroBusca } = await supabase
      .from('pessoal').select('*').eq('id', req.params.id).maybeSingle();
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
      pessoa.categorias = Array.isArray(req.body.categorias)
        ? req.body.categorias.filter(c => CATEGORIAS_PESSOAL.includes(c))
        : [];
    }
    if (req.body.matricula !== undefined) pessoa.matricula = String(req.body.matricula).trim().slice(0, 30);
    if (req.body.subunidade !== undefined) {
      pessoa.subunidade = SUBUNIDADES_PESSOAL.includes(req.body.subunidade) ? req.body.subunidade : '';
    }
    if (req.body.ativo !== undefined) pessoa.ativo = !!req.body.ativo;

    await writeRow('pessoal', pessoa);
    res.json(pessoa);
  }));

  router.delete('/pessoal/:id', exigirP3, asyncRoute(async (req, res) => {
    const { data: pessoa, error: erroBusca } = await supabase
      .from('pessoal').select('id').eq('id', req.params.id).maybeSingle();
    if (erroBusca) throw new Error(`Falha ao ler "pessoal" do Supabase: ${erroBusca.message}`);
    if (!pessoa) return res.status(404).json({ error: 'Cadastro não encontrado.' });
    await deleteRow('pessoal', req.params.id);
    res.json({ message: 'Cadastro excluído.' });
  }));

  return router;
};
