const express = require('express');
const {
  SITUACOES_ALTERACAO,
  TIPOS_ALTERACAO,
  UNIDADES_SERVICO,
  alteracaoAfetaData,
  calcularImpactoOperacional,
  dataIsoValida,
  enriquecerProjecao,
  validarPeriodo,
} = require('../lib/alteracoes-servico');

function texto(valor, limite = 300) {
  return String(valor || '').trim().slice(0, limite);
}

function podeConsultar(req, unidade) {
  return req.user.role !== 'Sargenteante' || req.user.unidade === unidade;
}

function exigirSargenteante(req, res) {
  if (req.user.role !== 'Sargenteante' || !UNIDADES_SERVICO.includes(req.user.unidade)) {
    res.status(403).json({ error: 'Apenas Sargenteantes vinculados a uma unidade podem registrar esta informação.' });
    return false;
  }
  return true;
}

function criarRouterAlteracoesServico({ asyncRoute, generateId, supabase, registrarAuditoria }) {
  const router = express.Router();

  async function executar(consulta, mensagem) {
    const { data, error } = await consulta;
    if (error) throw new Error(`${mensagem}: ${error.message}`);
    return data;
  }

  async function buscarPessoa(id) {
    if (!id) return null;
    return executar(supabase.from('pessoal').select('id,nome,matricula,ativo,subunidade').eq('id', id).maybeSingle(), 'Falha ao consultar o policial');
  }

  async function anexarRelacionamentos(registros) {
    if (!registros.length) return [];
    const ids = registros.map((registro) => registro.id);
    const [ciencias, divergencias] = await Promise.all([
      executar(supabase.from('alteracoes_servico_ciencias').select('*').in('alteracao_id', ids), 'Falha ao consultar ciências'),
      executar(supabase.from('alteracoes_servico_divergencias').select('*').in('alteracao_id', ids).order('criado_em', { ascending: false }), 'Falha ao consultar divergências'),
    ]);
    return registros.map((registro) => ({
      ...registro,
      projecao: enriquecerProjecao(registro),
      ciencias: ciencias.filter((item) => item.alteracao_id === registro.id),
      divergencias: divergencias.filter((item) => item.alteracao_id === registro.id),
    }));
  }

  async function registrarHistorico(req, alteracaoId, acao, antes, depois) {
    await executar(supabase.from('alteracoes_servico_historico').insert({
      id: generateId('ash'), alteracao_id: alteracaoId, acao,
      usuario: req.user.usuario, usuario_nome: req.user.nome,
      valores_anteriores: antes || null, valores_novos: depois || null,
    }), 'Falha ao registrar o histórico da alteração');
  }

  function validarAlteracao(body) {
    const dataInicio = texto(body.data_inicio, 10);
    const dataFim = texto(body.data_fim || body.data_inicio, 10);
    const periodo = validarPeriodo(dataInicio, dataFim);
    if (!periodo.ok) return periodo;
    const tipo = texto(body.tipo, 40);
    if (!TIPOS_ALTERACAO.includes(tipo)) return { ok: false, erro: 'Tipo de alteração inválido.' };
    const situacao = texto(body.situacao || 'INFORMADA', 20);
    if (!SITUACOES_ALTERACAO.includes(situacao)) return { ok: false, erro: 'Situação inválida.' };
    const turno = texto(body.turno, 40);
    if (!turno) return { ok: false, erro: 'Informe o turno.' };
    if (!body.policial_pessoal_id) return { ok: false, erro: 'Selecione o policial afetado.' };
    if (!texto(body.motivo, 500)) return { ok: false, erro: 'Informe o motivo.' };
    if (tipo === 'PERMUTA' && !body.substituto_pessoal_id) return { ok: false, erro: 'A permuta exige um policial substituto.' };
    if (body.substituto_pessoal_id && body.substituto_pessoal_id === body.policial_pessoal_id) {
      return { ok: false, erro: 'O substituto deve ser diferente do policial afetado.' };
    }
    if (dataInicio !== dataFim && !dataIsoValida(body.data_referencia_servico)) {
      return { ok: false, erro: 'Informe uma data de serviço confiável para projetar o ciclo 24x72 no período.' };
    }
    if (body.data_referencia_servico && !dataIsoValida(body.data_referencia_servico)) {
      return { ok: false, erro: 'A data de referência do serviço é inválida.' };
    }
    return { ok: true, valores: { dataInicio, dataFim, tipo, situacao, turno } };
  }

  router.get('/composicoes-servico', asyncRoute(async (req, res) => {
    let consulta = supabase.from('composicoes_servico').select('*').order('data', { ascending: false });
    const unidade = req.user.role === 'Sargenteante' ? req.user.unidade : texto(req.query.unidade, 40);
    if (unidade) consulta = consulta.eq('unidade', unidade);
    if (req.query.de) consulta = consulta.gte('data', texto(req.query.de, 10));
    if (req.query.ate) consulta = consulta.lte('data', texto(req.query.ate, 10));
    if (req.query.turno) consulta = consulta.eq('turno', texto(req.query.turno, 40));
    res.json(await executar(consulta, 'Falha ao consultar composições'));
  }));

  router.post('/composicoes-servico', asyncRoute(async (req, res) => {
    if (!exigirSargenteante(req, res)) return;
    const data = texto(req.body.data, 10);
    const turno = texto(req.body.turno, 40);
    const qtdViaturas = Number(req.body.qtd_viaturas_previstas);
    const porViatura = Number(req.body.policiais_por_viatura);
    const extras = Number(req.body.qtd_extras || 0);
    if (!dataIsoValida(data) || !turno || !Number.isInteger(qtdViaturas) || qtdViaturas < 0 || qtdViaturas > 99
      || !Number.isInteger(porViatura) || porViatura < 1 || porViatura > 20
      || !Number.isInteger(extras) || extras < 0 || extras > 999) {
      return res.status(400).json({ error: 'Revise data, turno e quantidades da composição.' });
    }
    const existente = await executar(supabase.from('composicoes_servico').select('id').eq('unidade', req.user.unidade).eq('data', data).eq('turno', turno).maybeSingle(), 'Falha ao verificar a composição');
    if (existente) return res.status(409).json({ error: 'Já existe composição para esta unidade, data e turno.' });
    const agora = new Date().toISOString();
    const registro = {
      id: generateId('cps'), unidade: req.user.unidade, data, turno,
      qtd_viaturas_previstas: qtdViaturas, policiais_por_viatura: porViatura, qtd_extras: extras,
      observacao: texto(req.body.observacao, 1000) || null,
      criado_por: req.user.usuario, criado_em: agora, atualizado_por: req.user.usuario, atualizado_em: agora,
    };
    await executar(supabase.from('composicoes_servico').insert(registro), 'Falha ao salvar a composição');
    await registrarAuditoria({ req, acao: 'criou', entidade: 'Composição do serviço', entidadeId: registro.id, descricao: `Informou a composição de ${registro.unidade} em ${registro.data} (${registro.turno}).` });
    res.status(201).json(registro);
  }));

  router.put('/composicoes-servico/:id', asyncRoute(async (req, res) => {
    if (!exigirSargenteante(req, res)) return;
    const atual = await executar(supabase.from('composicoes_servico').select('*').eq('id', req.params.id).maybeSingle(), 'Falha ao consultar a composição');
    if (!atual || atual.unidade !== req.user.unidade) return res.status(404).json({ error: 'Composição não encontrada na sua unidade.' });
    const qtdViaturas = Number(req.body.qtd_viaturas_previstas);
    const porViatura = Number(req.body.policiais_por_viatura);
    const extras = Number(req.body.qtd_extras || 0);
    if (!Number.isInteger(qtdViaturas) || qtdViaturas < 0 || qtdViaturas > 99 || !Number.isInteger(porViatura) || porViatura < 1 || porViatura > 20 || !Number.isInteger(extras) || extras < 0 || extras > 999) {
      return res.status(400).json({ error: 'Revise as quantidades da composição.' });
    }
    const patch = { qtd_viaturas_previstas: qtdViaturas, policiais_por_viatura: porViatura, qtd_extras: extras, observacao: texto(req.body.observacao, 1000) || null, atualizado_por: req.user.usuario, atualizado_em: new Date().toISOString() };
    const atualizado = await executar(supabase.from('composicoes_servico').update(patch).eq('id', atual.id).eq('unidade', req.user.unidade).select('*').single(), 'Falha ao atualizar a composição');
    await registrarAuditoria({ req, acao: 'alterou', entidade: 'Composição do serviço', entidadeId: atual.id, descricao: `Atualizou a composição de ${atual.unidade}.`, antes: atual, depois: atualizado, campos: Object.keys(patch) });
    res.json(atualizado);
  }));

  router.get('/alteracoes-servico/resumo', asyncRoute(async (req, res) => {
    const data = texto(req.query.data, 10);
    const turno = texto(req.query.turno || '24H', 40);
    if (!dataIsoValida(data)) return res.status(400).json({ error: 'Informe uma data válida.' });
    const unidades = req.user.role === 'Sargenteante' ? [req.user.unidade] : UNIDADES_SERVICO;
    const [composicoes, alteracoes] = await Promise.all([
      executar(supabase.from('composicoes_servico').select('*').in('unidade', unidades).eq('data', data).eq('turno', turno), 'Falha ao consultar composições'),
      executar(supabase.from('alteracoes_servico').select('*').in('unidade', unidades).lte('data_inicio', data).gte('data_fim', data).eq('turno', turno), 'Falha ao consultar alterações'),
    ]);
    const enriquecidas = await anexarRelacionamentos(alteracoes.filter((a) => alteracaoAfetaData(a, data) || a.situacao === 'CANCELADA'));
    res.json({
      data, turno,
      unidades: unidades.map((unidade) => {
        const composicao = composicoes.find((item) => item.unidade === unidade) || null;
        const daUnidade = enriquecidas.filter((item) => item.unidade === unidade && item.situacao !== 'CANCELADA' && alteracaoAfetaData(item, data));
        return { unidade, composicao, alteracoes: daUnidade, resumo: calcularImpactoOperacional(composicao, daUnidade, data) };
      }),
    });
  }));

  router.get('/alteracoes-servico/:id/historico', asyncRoute(async (req, res) => {
    const alteracao = await executar(supabase.from('alteracoes_servico').select('id,unidade').eq('id', req.params.id).maybeSingle(), 'Falha ao consultar a alteração');
    if (!alteracao || !podeConsultar(req, alteracao.unidade)) return res.status(404).json({ error: 'Alteração não encontrada.' });
    const historico = await executar(supabase.from('alteracoes_servico_historico').select('*').eq('alteracao_id', alteracao.id).order('criado_em', { ascending: false }), 'Falha ao consultar o histórico');
    res.json(historico);
  }));

  router.get('/alteracoes-servico', asyncRoute(async (req, res) => {
    let consulta = supabase.from('alteracoes_servico').select('*').order('data_inicio', { ascending: false }).order('criado_em', { ascending: false });
    const unidade = req.user.role === 'Sargenteante' ? req.user.unidade : texto(req.query.unidade, 40);
    if (unidade) consulta = consulta.eq('unidade', unidade);
    if (req.query.de) consulta = consulta.gte('data_fim', texto(req.query.de, 10));
    if (req.query.ate) consulta = consulta.lte('data_inicio', texto(req.query.ate, 10));
    if (req.query.turno) consulta = consulta.eq('turno', texto(req.query.turno, 40));
    if (req.query.tipo) consulta = consulta.eq('tipo', texto(req.query.tipo, 40));
    if (req.query.situacao) consulta = consulta.eq('situacao', texto(req.query.situacao, 20));
    let registros = await executar(consulta, 'Falha ao consultar alterações do serviço');
    const busca = texto(req.query.busca, 120).toLocaleLowerCase('pt-BR');
    if (busca) registros = registros.filter((item) => [item.policial_nome, item.policial_matricula, item.substituto_nome, item.substituto_matricula, item.motivo, item.numero_documento].some((valor) => String(valor || '').toLocaleLowerCase('pt-BR').includes(busca)));
    res.json(await anexarRelacionamentos(registros));
  }));

  router.post('/alteracoes-servico', asyncRoute(async (req, res) => {
    if (!exigirSargenteante(req, res)) return;
    const validacao = validarAlteracao(req.body);
    if (!validacao.ok) return res.status(400).json({ error: validacao.erro });
    const [policial, substituto] = await Promise.all([buscarPessoa(req.body.policial_pessoal_id), buscarPessoa(req.body.substituto_pessoal_id)]);
    if (!policial || policial.ativo === false) return res.status(400).json({ error: 'Policial afetado não encontrado ou inativo.' });
    if (substituto?.ativo === false) return res.status(400).json({ error: 'O policial substituto está inativo.' });
    if (req.body.substituto_pessoal_id && !substituto) return res.status(400).json({ error: 'Policial substituto não encontrado.' });
    const agora = new Date().toISOString();
    const registro = {
      id: generateId('als'), unidade: req.user.unidade,
      data_inicio: validacao.valores.dataInicio, data_fim: validacao.valores.dataFim, turno: validacao.valores.turno,
      policial_pessoal_id: policial.id, policial_nome: policial.nome, policial_matricula: policial.matricula || null,
      tipo: validacao.valores.tipo,
      substituto_pessoal_id: substituto?.id || null, substituto_nome: substituto?.nome || null, substituto_matricula: substituto?.matricula || null,
      data_referencia_servico: req.body.data_referencia_servico || null,
      motivo: texto(req.body.motivo, 500), observacoes: texto(req.body.observacoes, 1500) || null,
      numero_documento: texto(req.body.numero_documento, 160) || null, situacao: validacao.valores.situacao,
      criado_por: req.user.usuario, criado_em: agora, atualizado_por: req.user.usuario, atualizado_em: agora,
    };
    await executar(supabase.from('alteracoes_servico').insert(registro), 'Falha ao salvar a alteração');
    await registrarHistorico(req, registro.id, 'CRIAÇÃO', null, registro);
    await registrarAuditoria({ req, acao: 'criou', entidade: 'Alteração do serviço', entidadeId: registro.id, descricao: `Registrou ${registro.tipo} para ${registro.policial_nome} em ${registro.unidade}.` });
    res.status(201).json({ ...registro, projecao: enriquecerProjecao(registro), ciencias: [], divergencias: [] });
  }));

  router.put('/alteracoes-servico/:id', asyncRoute(async (req, res) => {
    if (!exigirSargenteante(req, res)) return;
    const atual = await executar(supabase.from('alteracoes_servico').select('*').eq('id', req.params.id).maybeSingle(), 'Falha ao consultar a alteração');
    if (!atual || atual.unidade !== req.user.unidade) return res.status(404).json({ error: 'Alteração não encontrada na sua unidade.' });
    if (atual.situacao === 'CANCELADA') return res.status(409).json({ error: 'Uma alteração cancelada permanece somente para histórico e não pode ser editada.' });
    const corpo = { ...atual, ...req.body };
    const validacao = validarAlteracao(corpo);
    if (!validacao.ok) return res.status(400).json({ error: validacao.erro });
    const [policial, substituto] = await Promise.all([buscarPessoa(corpo.policial_pessoal_id), buscarPessoa(corpo.substituto_pessoal_id)]);
    if (!policial || policial.ativo === false || (corpo.substituto_pessoal_id && (!substituto || substituto.ativo === false))) return res.status(400).json({ error: 'Revise os policiais informados.' });
    const patch = {
      data_inicio: validacao.valores.dataInicio, data_fim: validacao.valores.dataFim, turno: validacao.valores.turno,
      policial_pessoal_id: policial.id, policial_nome: policial.nome, policial_matricula: policial.matricula || null,
      tipo: validacao.valores.tipo, substituto_pessoal_id: substituto?.id || null,
      substituto_nome: substituto?.nome || null, substituto_matricula: substituto?.matricula || null,
      data_referencia_servico: corpo.data_referencia_servico || null, motivo: texto(corpo.motivo, 500),
      observacoes: texto(corpo.observacoes, 1500) || null, numero_documento: texto(corpo.numero_documento, 160) || null,
      situacao: validacao.valores.situacao, atualizado_por: req.user.usuario, atualizado_em: new Date().toISOString(),
    };
    const atualizado = await executar(supabase.from('alteracoes_servico').update(patch).eq('id', atual.id).eq('unidade', req.user.unidade).select('*').single(), 'Falha ao atualizar a alteração');
    const acao = atualizado.situacao === 'CANCELADA' ? 'CANCELAMENTO' : atualizado.situacao === 'CONFIRMADA' && atual.situacao !== 'CONFIRMADA' ? 'CONFIRMAÇÃO' : 'EDIÇÃO';
    await registrarHistorico(req, atualizado.id, acao, atual, atualizado);
    await registrarAuditoria({ req, acao: acao.toLocaleLowerCase('pt-BR'), entidade: 'Alteração do serviço', entidadeId: atualizado.id, descricao: `${acao} de ${atual.policial_nome}.`, antes: atual, depois: atualizado, campos: Object.keys(patch) });
    res.json({ ...atualizado, projecao: enriquecerProjecao(atualizado) });
  }));

  router.post('/alteracoes-servico/:id/ciencia', asyncRoute(async (req, res) => {
    if (!['Adjunto', 'Oficial'].includes(req.user.role)) return res.status(403).json({ error: 'Seu perfil não pode registrar ciência.' });
    const alteracao = await executar(supabase.from('alteracoes_servico').select('id,unidade').eq('id', req.params.id).maybeSingle(), 'Falha ao consultar a alteração');
    if (!alteracao) return res.status(404).json({ error: 'Alteração não encontrada.' });
    const existente = await executar(supabase.from('alteracoes_servico_ciencias').select('*').eq('alteracao_id', alteracao.id).eq('usuario', req.user.usuario).maybeSingle(), 'Falha ao verificar a ciência');
    if (existente) return res.json(existente);
    const ciencia = { id: generateId('asc'), alteracao_id: alteracao.id, usuario: req.user.usuario, usuario_nome: req.user.nome };
    await executar(supabase.from('alteracoes_servico_ciencias').insert(ciencia), 'Falha ao registrar ciência');
    await registrarHistorico(req, alteracao.id, 'CIÊNCIA', null, ciencia);
    res.status(201).json(ciencia);
  }));

  router.post('/alteracoes-servico/:id/divergencias', asyncRoute(async (req, res) => {
    if (!['Adjunto', 'Oficial'].includes(req.user.role)) return res.status(403).json({ error: 'Seu perfil não pode informar divergência.' });
    const descricao = texto(req.body.descricao, 1000);
    if (descricao.length < 3) return res.status(400).json({ error: 'Descreva a divergência observada.' });
    const alteracao = await executar(supabase.from('alteracoes_servico').select('id').eq('id', req.params.id).maybeSingle(), 'Falha ao consultar a alteração');
    if (!alteracao) return res.status(404).json({ error: 'Alteração não encontrada.' });
    const divergencia = { id: generateId('asd'), alteracao_id: alteracao.id, descricao, criado_por: req.user.usuario, criado_por_nome: req.user.nome };
    await executar(supabase.from('alteracoes_servico_divergencias').insert(divergencia), 'Falha ao registrar divergência');
    await registrarHistorico(req, alteracao.id, 'DIVERGÊNCIA', null, divergencia);
    res.status(201).json(divergencia);
  }));

  return router;
}

module.exports = criarRouterAlteracoesServico;
module.exports._internals = { podeConsultar, exigirSargenteante };
