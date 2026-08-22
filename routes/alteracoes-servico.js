const express = require('express');
const {
  SITUACOES_ALTERACAO,
  TIPOS_ALTERACAO,
  UNIDADES_SERVICO,
  alteracaoAfetaData,
  alteracaoAfetaServico,
  calcularImpactoOperacional,
  dataIsoValida,
  enriquecerProjecao,
  horarioValido,
  normalizarJornada,
  normalizarTurno,
  validarPeriodo,
} = require('../lib/alteracoes-servico');

function texto(valor, limite = 300) {
  return String(valor || '').trim().slice(0, limite);
}

function podeConsultar(req, unidade) {
  return req.user.role !== 'Sargenteante' || req.user.unidade === unidade;
}

function podeEditarUnidade(req, unidade) {
  return req.user.role === 'P3' || (req.user.role === 'Sargenteante' && req.user.unidade === unidade);
}

function exigirEdicao(req, res, unidade, mensagem = 'Seu perfil não pode editar este registro.') {
  if (!['P3', 'Sargenteante'].includes(req.user.role) || !unidade || !UNIDADES_SERVICO.includes(unidade) || !podeEditarUnidade(req, unidade)) {
    res.status(403).json({ error: mensagem });
    return false;
  }
  return true;
}

// Mantido como helper exportado: alguns testes e integrações antigas usam a
// função para comprovar que Adjunto/P3 não passam pela regra de criação da
// Sargenteação. A regra nova de escrita usa exigirEdicao.
function exigirSargenteante(req, res) {
  if (req.user.role !== 'Sargenteante' || !UNIDADES_SERVICO.includes(req.user.unidade)) {
    res.status(403).json({ error: 'Apenas Sargenteantes vinculados a uma unidade podem registrar esta informação.' });
    return false;
  }
  return true;
}

function turnoDoCorpo(body) {
  const jornada = normalizarJornada(texto(body.jornada, 10), texto(body.turno, 40));
  return { jornada, turno: jornada === '24H' ? '24H' : normalizarTurno(texto(body.turno, 40), jornada) };
}

function capacidadeInteira(valor, minimo = 0, maximo = 999) {
  if (valor === undefined || valor === null || valor === '') return null;
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= minimo && numero <= maximo ? numero : undefined;
}

function validarHorarios(jornada, horarioInicio, horarioFim) {
  if (jornada !== '12H') return { ok: true, horarioInicio: null, horarioFim: null };
  if (!horarioValido(horarioInicio) || !horarioValido(horarioFim) || horarioInicio === horarioFim) {
    return { ok: false, erro: 'Para jornada de 12h informe horários inicial e final diferentes.' };
  }
  return { ok: true, horarioInicio, horarioFim };
}

function validarAlteracao(body, unidadeObrigatoria = null) {
  const unidade = texto(body.unidade || unidadeObrigatoria, 40);
  if (!UNIDADES_SERVICO.includes(unidade)) return { ok: false, erro: 'Informe uma Companhia válida.' };
  if (unidadeObrigatoria && unidade !== unidadeObrigatoria) return { ok: false, erro: 'O registro deve permanecer na sua Companhia.' };
  const dataInicio = texto(body.data_inicio, 10);
  const dataFim = texto(body.data_fim || body.data_inicio, 10);
  const periodo = validarPeriodo(dataInicio, dataFim);
  if (!periodo.ok) return periodo;
  const tipo = texto(body.tipo, 40);
  if (!TIPOS_ALTERACAO.includes(tipo)) return { ok: false, erro: 'Tipo de alteração inválido.' };
  const dadosTurno = turnoDoCorpo(body);
  const horarios = validarHorarios(dadosTurno.jornada, texto(body.horario_inicio, 5), texto(body.horario_fim, 5));
  if (!horarios.ok) return horarios;
  if (!body.policial_pessoal_id) return { ok: false, erro: 'Selecione o policial afetado.' };
  if (!texto(body.motivo, 500)) return { ok: false, erro: 'Informe o motivo.' };
  if (tipo === 'PERMUTA' && !body.substituto_pessoal_id) return { ok: false, erro: 'A permuta exige um policial substituto.' };
  if (body.substituto_pessoal_id && body.substituto_pessoal_id === body.policial_pessoal_id) {
    return { ok: false, erro: 'O substituto deve ser diferente do policial afetado.' };
  }
  if (dadosTurno.jornada === '24H' && dataInicio !== dataFim && !dataIsoValida(body.data_referencia_servico)) {
    return { ok: false, erro: 'Informe uma data de serviço confiável para projetar o ciclo 24x72 no período.' };
  }
  if (body.data_referencia_servico && !dataIsoValida(body.data_referencia_servico)) {
    return { ok: false, erro: 'A data de referência do serviço é inválida.' };
  }
  return {
    ok: true,
    valores: {
      unidade, dataInicio, dataFim, tipo, jornada: dadosTurno.jornada, turno: dadosTurno.turno,
      horarioInicio: horarios.horarioInicio, horarioFim: horarios.horarioFim,
    },
  };
}

function validarComposicao(body, unidadeObrigatoria = null) {
  const unidade = texto(body.unidade || unidadeObrigatoria, 40);
  const data = texto(body.data, 10);
  const dadosTurno = turnoDoCorpo(body);
  const horarios = validarHorarios(dadosTurno.jornada, texto(body.horario_inicio, 5), texto(body.horario_fim, 5));
  const viaturasPrevistas = capacidadeInteira(body.qtd_viaturas_previstas ?? body.viaturas_previstas, 0, 99);
  const policiaisPorViatura = capacidadeInteira(body.policiais_por_viatura, 1, 20);
  const extras = capacidadeInteira(body.qtd_extras ?? body.extras, 0, 999);
  const viaturasCompletas = capacidadeInteira(body.qtd_viaturas_completas ?? body.viaturas_completas, 0, 99);
  const policiaisDisponiveis = capacidadeInteira(body.qtd_policiais_disponiveis ?? body.policiais_disponiveis, 0, 999);
  if (!UNIDADES_SERVICO.includes(unidade) || (unidadeObrigatoria && unidade !== unidadeObrigatoria)) return { ok: false, erro: 'Informe uma Companhia válida.' };
  if (!dataIsoValida(data) || !horarios.ok || viaturasPrevistas === undefined || policiaisPorViatura === undefined || extras === undefined) {
    return { ok: false, erro: 'Revise data, jornada e quantidades da composição.' };
  }
  if (viaturasCompletas === undefined || policiaisDisponiveis === undefined) return { ok: false, erro: 'Informe a capacidade final: viaturas completas e policiais disponíveis.' };
  return {
    ok: true,
    valores: {
      unidade, data, jornada: dadosTurno.jornada, turno: dadosTurno.turno,
      horarioInicio: horarios.horarioInicio, horarioFim: horarios.horarioFim,
      viaturasPrevistas, policiaisPorViatura, extras, viaturasCompletas, policiaisDisponiveis,
      observacao: texto(body.observacao, 1000) || null,
    },
  };
}

function chaveGrupo(unidade, turno) {
  return `${unidade}::${turno}`;
}

function montarConsolidado(unidades) {
  const gruposComDados = unidades.filter((item) => item.alteracoes.length || item.composicao);
  return {
    totalAlteracoes: unidades.reduce((soma, item) => soma + (item.resumo?.totalAlteracoes || 0), 0),
    companhiasImpactadas: [...new Set(gruposComDados.map((item) => item.unidade))].length,
    viaturasCompletas: unidades.reduce((soma, item) => soma + (item.resumo?.viaturasCompletasPossiveis || 0), 0),
    policiaisDisponiveis: unidades.reduce((soma, item) => soma + (item.resumo?.policiaisRemanescentes || 0), 0),
    policiaisDisponiveisTotal: unidades.reduce((soma, item) => soma + (item.resumo?.policiaisDisponiveisProjetados || 0), 0),
  };
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
      executar(supabase.from('alteracoes_servico_ciencias').select('*').in('alteracao_id', ids).order('criado_em', { ascending: false }),
        'Falha ao consultar ciências'),
      executar(supabase.from('alteracoes_servico_divergencias').select('*').in('alteracao_id', ids).order('criado_em', { ascending: false }),
        'Falha ao consultar divergências'),
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

  router.get('/composicoes-servico', asyncRoute(async (req, res) => {
    let consulta = supabase.from('composicoes_servico').select('*').order('data', { ascending: false });
    const unidade = req.user.role === 'Sargenteante' ? req.user.unidade : texto(req.query.unidade, 40);
    if (unidade) consulta = consulta.eq('unidade', unidade);
    if (req.query.de) consulta = consulta.gte('data', texto(req.query.de, 10));
    if (req.query.ate) consulta = consulta.lte('data', texto(req.query.ate, 10));
    if (req.query.turno && texto(req.query.turno, 40) !== 'TODOS') consulta = consulta.eq('turno', texto(req.query.turno, 40));
    res.json(await executar(consulta, 'Falha ao consultar composições'));
  }));

  router.post('/composicoes-servico', asyncRoute(async (req, res) => {
    const unidade = req.user.role === 'Sargenteante' ? req.user.unidade : texto(req.body.unidade, 40);
    if (!exigirEdicao(req, res, unidade, 'Somente P3 ou o Sargenteante da Companhia pode informar capacidade operacional.')) return;
    const validacao = validarComposicao(req.body, req.user.role === 'Sargenteante' ? req.user.unidade : null);
    if (!validacao.ok) return res.status(400).json({ error: validacao.erro });
    const v = validacao.valores;
    const existente = await executar(supabase.from('composicoes_servico').select('id').eq('unidade', v.unidade).eq('data', v.data).eq('turno', v.turno).maybeSingle(), 'Falha ao verificar a composição');
    if (existente) return res.status(409).json({ error: 'Já existe composição para esta unidade, data e turno.' });
    const agora = new Date().toISOString();
    const registro = {
      id: generateId('cps'), unidade: v.unidade, data: v.data, turno: v.turno, jornada: v.jornada,
      horario_inicio: v.horarioInicio, horario_fim: v.horarioFim,
      qtd_viaturas_previstas: v.viaturasPrevistas, policiais_por_viatura: v.policiaisPorViatura, qtd_extras: v.extras,
      qtd_viaturas_completas: v.viaturasCompletas, qtd_policiais_disponiveis: v.policiaisDisponiveis,
      observacao: v.observacao, criado_por: req.user.usuario, criado_em: agora, atualizado_por: req.user.usuario, atualizado_em: agora,
    };
    await executar(supabase.from('composicoes_servico').insert(registro), 'Falha ao salvar a composição');
    await registrarAuditoria({ req, acao: 'criou', entidade: 'Composição do serviço', entidadeId: registro.id, descricao: `Informou a capacidade de ${registro.unidade} em ${registro.data} (${registro.turno}).` });
    res.status(201).json(registro);
  }));

  router.put('/composicoes-servico/:id', asyncRoute(async (req, res) => {
    const atual = await executar(supabase.from('composicoes_servico').select('*').eq('id', req.params.id).maybeSingle(), 'Falha ao consultar a composição');
    if (!atual || !exigirEdicao(req, res, atual.unidade, 'Somente P3 ou o Sargenteante da Companhia pode editar capacidade operacional.')) return;
    const validacao = validarComposicao({ ...atual, ...req.body }, req.user.role === 'Sargenteante' ? req.user.unidade : null);
    if (!validacao.ok) return res.status(400).json({ error: validacao.erro });
    const v = validacao.valores;
    const outra = await executar(supabase.from('composicoes_servico').select('id').eq('unidade', v.unidade).eq('data', v.data).eq('turno', v.turno).neq('id', atual.id).maybeSingle(), 'Falha ao verificar a composição');
    if (outra) return res.status(409).json({ error: 'Já existe outra composição para esta unidade, data e turno.' });
    const patch = {
      unidade: v.unidade, data: v.data, turno: v.turno, jornada: v.jornada, horario_inicio: v.horarioInicio, horario_fim: v.horarioFim,
      qtd_viaturas_previstas: v.viaturasPrevistas, policiais_por_viatura: v.policiaisPorViatura, qtd_extras: v.extras,
      qtd_viaturas_completas: v.viaturasCompletas, qtd_policiais_disponiveis: v.policiaisDisponiveis,
      observacao: v.observacao, atualizado_por: req.user.usuario, atualizado_em: new Date().toISOString(),
    };
    const atualizado = await executar(supabase.from('composicoes_servico').update(patch).eq('id', atual.id).select('*').single(), 'Falha ao atualizar a composição');
    await registrarAuditoria({ req, acao: 'alterou', entidade: 'Composição do serviço', entidadeId: atual.id, descricao: `Atualizou a capacidade de ${atual.unidade}.`, antes: atual, depois: atualizado, campos: Object.keys(patch) });
    res.json(atualizado);
  }));

  router.get('/alteracoes-servico/resumo', asyncRoute(async (req, res) => {
    const data = texto(req.query.data, 10);
    const turno = texto(req.query.turno, 40).toUpperCase() || 'TODOS';
    if (!dataIsoValida(data)) return res.status(400).json({ error: 'Informe uma data válida.' });
    const unidades = req.user.role === 'Sargenteante' ? [req.user.unidade] : UNIDADES_SERVICO;
    let consultaComposicoes = supabase.from('composicoes_servico').select('*').in('unidade', unidades).eq('data', data);
    let consultaAlteracoes = supabase.from('alteracoes_servico').select('*').in('unidade', unidades).lte('data_inicio', data).gte('data_fim', data);
    if (turno !== 'TODOS') {
      consultaComposicoes = consultaComposicoes.eq('turno', turno);
      consultaAlteracoes = consultaAlteracoes.eq('turno', turno);
    }
    const [composicoes, alteracoes] = await Promise.all([
      executar(consultaComposicoes, 'Falha ao consultar composições'),
      executar(consultaAlteracoes, 'Falha ao consultar alterações'),
    ]);
    const enriquecidas = await anexarRelacionamentos(alteracoes.filter((a) => alteracaoAfetaData(a, data) || a.situacao === 'CANCELADA'));
    const grupos = new Map();
    const adicionarGrupo = (unidade, turnoGrupo, composicao = null, alteracao = null) => {
      const chave = chaveGrupo(unidade, turnoGrupo || '24H');
      if (!grupos.has(chave)) grupos.set(chave, { unidade, turno: turnoGrupo || '24H', composicao, alteracoes: [] });
      const grupo = grupos.get(chave);
      if (composicao) grupo.composicao = composicao;
      if (alteracao) grupo.alteracoes.push(alteracao);
    };
    composicoes.forEach((composicao) => adicionarGrupo(composicao.unidade, composicao.turno, composicao));
    enriquecidas.forEach((alteracao) => adicionarGrupo(alteracao.unidade, alteracao.turno, null, alteracao));
    unidades.forEach((unidade) => {
      if (![...grupos.values()].some((grupo) => grupo.unidade === unidade)) adicionarGrupo(unidade, turno === 'TODOS' ? '24H' : turno);
    });
    const gruposOrdenados = [...grupos.values()].sort((a, b) => `${a.unidade}-${a.turno}`.localeCompare(`${b.unidade}-${b.turno}`, 'pt-BR'));
    const resultado = gruposOrdenados.map((grupo) => {
      const servico = {
        data, turno: grupo.turno, jornada: grupo.composicao?.jornada,
        horario_inicio: grupo.composicao?.horario_inicio, horario_fim: grupo.composicao?.horario_fim,
      };
      const daUnidade = grupo.alteracoes.filter((item) => item.situacao !== 'CANCELADA' && alteracaoAfetaServico(item, servico));
      return {
        unidade: grupo.unidade, turno: grupo.turno, jornada: grupo.composicao?.jornada || normalizarJornada('', grupo.turno),
        composicao: grupo.composicao, alteracoes: daUnidade,
        resumo: calcularImpactoOperacional(grupo.composicao, daUnidade, data, servico),
      };
    });
    res.json({ data, turno, unidades: resultado, consolidado: montarConsolidado(resultado) });
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
    if (req.query.turno && texto(req.query.turno, 40).toUpperCase() !== 'TODOS') consulta = consulta.eq('turno', texto(req.query.turno, 40));
    if (req.query.tipo) consulta = consulta.eq('tipo', texto(req.query.tipo, 40));
    // Compatibilidade para integrações históricas; a interface nova não expõe
    // esse filtro administrativo.
    if (req.query.situacao) consulta = consulta.eq('situacao', texto(req.query.situacao, 20));
    let registros = await executar(consulta, 'Falha ao consultar alterações do serviço');
    const busca = texto(req.query.busca, 120).toLocaleLowerCase('pt-BR');
    if (busca) registros = registros.filter((item) => [item.policial_nome, item.policial_matricula, item.substituto_nome, item.substituto_matricula, item.motivo, item.numero_documento].some((valor) => String(valor || '').toLocaleLowerCase('pt-BR').includes(busca)));
    res.json(await anexarRelacionamentos(registros));
  }));

  router.post('/alteracoes-servico', asyncRoute(async (req, res) => {
    const unidade = req.user.role === 'Sargenteante' ? req.user.unidade : texto(req.body.unidade, 40);
    if (!exigirEdicao(req, res, unidade, 'Somente P3 ou o Sargenteante da Companhia pode registrar alterações.')) return;
    const validacao = validarAlteracao(req.body, req.user.role === 'Sargenteante' ? req.user.unidade : null);
    if (!validacao.ok) return res.status(400).json({ error: validacao.erro });
    const v = validacao.valores;
    const [policial, substituto] = await Promise.all([buscarPessoa(req.body.policial_pessoal_id), buscarPessoa(req.body.substituto_pessoal_id)]);
    if (!policial || policial.ativo === false) return res.status(400).json({ error: 'Policial afetado não encontrado ou inativo.' });
    if (substituto?.ativo === false) return res.status(400).json({ error: 'O policial substituto está inativo.' });
    if (req.body.substituto_pessoal_id && !substituto) return res.status(400).json({ error: 'Policial substituto não encontrado.' });
    if (req.user.role === 'Sargenteante' && policial.subunidade && policial.subunidade !== req.user.unidade) return res.status(403).json({ error: 'O policial afetado não pertence à sua Companhia.' });
    if (req.user.role === 'Sargenteante' && substituto?.subunidade && substituto.subunidade !== req.user.unidade) return res.status(403).json({ error: 'O substituto não pertence à sua Companhia.' });
    const agora = new Date().toISOString();
    const registro = {
      id: generateId('als'), unidade: v.unidade, data_inicio: v.dataInicio, data_fim: v.dataFim, jornada: v.jornada, turno: v.turno,
      horario_inicio: v.horarioInicio, horario_fim: v.horarioFim,
      policial_pessoal_id: policial.id, policial_nome: policial.nome, policial_matricula: policial.matricula || null,
      tipo: v.tipo, substituto_pessoal_id: substituto?.id || null, substituto_nome: substituto?.nome || null, substituto_matricula: substituto?.matricula || null,
      data_referencia_servico: v.jornada === '24H' ? (req.body.data_referencia_servico || null) : null,
      motivo: texto(req.body.motivo, 500), observacoes: texto(req.body.observacoes || req.body.observacao, 1500) || null,
      numero_documento: texto(req.body.numero_documento || req.body.numero_sei || req.body.documento, 160) || null,
      situacao: 'INFORMADA', criado_por: req.user.usuario, criado_em: agora, atualizado_por: req.user.usuario, atualizado_em: agora,
    };
    await executar(supabase.from('alteracoes_servico').insert(registro), 'Falha ao salvar a alteração');
    await registrarHistorico(req, registro.id, 'CRIAÇÃO', null, registro);
    await registrarAuditoria({ req, acao: 'criou', entidade: 'Alteração do serviço', entidadeId: registro.id, descricao: `Registrou ${registro.tipo} para ${registro.policial_nome} em ${registro.unidade}.` });
    res.status(201).json({ ...registro, projecao: enriquecerProjecao(registro), ciencias: [], divergencias: [] });
  }));

  router.put('/alteracoes-servico/:id', asyncRoute(async (req, res) => {
    const atual = await executar(supabase.from('alteracoes_servico').select('*').eq('id', req.params.id).maybeSingle(), 'Falha ao consultar a alteração');
    if (!atual || !podeEditarUnidade(req, atual.unidade)) return res.status(404).json({ error: 'Alteração não encontrada na sua unidade.' });
    const corpo = { ...atual, ...req.body, unidade: req.user.role === 'Sargenteante' ? req.user.unidade : (req.body.unidade || atual.unidade) };
    if (!exigirEdicao(req, res, atual.unidade)) return;
    const validacao = validarAlteracao(corpo, req.user.role === 'Sargenteante' ? req.user.unidade : null);
    if (!validacao.ok) return res.status(400).json({ error: validacao.erro });
    const v = validacao.valores;
    const [policial, substituto] = await Promise.all([buscarPessoa(corpo.policial_pessoal_id), buscarPessoa(corpo.substituto_pessoal_id)]);
    if (!policial || policial.ativo === false || (corpo.substituto_pessoal_id && (!substituto || substituto.ativo === false))) return res.status(400).json({ error: 'Revise os policiais informados.' });
    if (req.user.role === 'Sargenteante' && policial.subunidade && policial.subunidade !== req.user.unidade) return res.status(403).json({ error: 'O policial afetado não pertence à sua Companhia.' });
    const patch = {
      unidade: v.unidade, data_inicio: v.dataInicio, data_fim: v.dataFim, jornada: v.jornada, turno: v.turno,
      horario_inicio: v.horarioInicio, horario_fim: v.horarioFim,
      policial_pessoal_id: policial.id, policial_nome: policial.nome, policial_matricula: policial.matricula || null,
      tipo: v.tipo, substituto_pessoal_id: substituto?.id || null, substituto_nome: substituto?.nome || null, substituto_matricula: substituto?.matricula || null,
      data_referencia_servico: v.jornada === '24H' ? (corpo.data_referencia_servico || null) : null,
      motivo: texto(corpo.motivo, 500), observacoes: texto(corpo.observacoes || corpo.observacao, 1500) || null,
      numero_documento: texto(corpo.numero_documento || corpo.numero_sei || corpo.documento, 160) || null,
      // `situacao` histórico é preservada e não é mais controlada pela tela.
      situacao: atual.situacao || SITUACOES_ALTERACAO[0], atualizado_por: req.user.usuario, atualizado_em: new Date().toISOString(),
    };
    const atualizado = await executar(supabase.from('alteracoes_servico').update(patch).eq('id', atual.id).select('*').single(), 'Falha ao atualizar a alteração');
    await registrarHistorico(req, atualizado.id, 'EDIÇÃO', atual, atualizado);
    await registrarAuditoria({ req, acao: 'edição', entidade: 'Alteração do serviço', entidadeId: atualizado.id, descricao: `Editou o registro de ${atualizado.policial_nome}.`, antes: atual, depois: atualizado, campos: Object.keys(patch) });
    res.json({ ...atualizado, projecao: enriquecerProjecao(atualizado) });
  }));

  router.post('/alteracoes-servico/:id/ciencia', asyncRoute(async (req, res) => {
    if (req.user.role !== 'Adjunto') return res.status(403).json({ error: 'Somente o Adjunto de Dia pode registrar a ciência.' });
    const alteracao = await executar(supabase.from('alteracoes_servico').select('id,unidade').eq('id', req.params.id).maybeSingle(), 'Falha ao consultar a alteração');
    if (!alteracao) return res.status(404).json({ error: 'Alteração não encontrada.' });
    const existente = await executar(supabase.from('alteracoes_servico_ciencias').select('*').eq('alteracao_id', alteracao.id).eq('usuario', req.user.usuario).maybeSingle(), 'Falha ao verificar a ciência');
    if (existente) return res.json(existente);
    const ciencia = { id: generateId('asc'), alteracao_id: alteracao.id, usuario: req.user.usuario, usuario_nome: req.user.nome, criado_em: new Date().toISOString() };
    await executar(supabase.from('alteracoes_servico_ciencias').insert(ciencia), 'Falha ao registrar ciência');
    await registrarHistorico(req, alteracao.id, 'CIÊNCIA', null, ciencia);
    res.status(201).json(ciencia);
  }));

  router.post('/alteracoes-servico/:id/divergencias', asyncRoute(async (req, res) => {
    if (req.user.role !== 'Adjunto') return res.status(403).json({ error: 'Somente o Adjunto de Dia pode informar divergência.' });
    const descricao = texto(req.body.descricao, 1000);
    if (descricao.length < 3) return res.status(400).json({ error: 'Descreva a divergência observada.' });
    const alteracao = await executar(supabase.from('alteracoes_servico').select('id').eq('id', req.params.id).maybeSingle(), 'Falha ao consultar a alteração');
    if (!alteracao) return res.status(404).json({ error: 'Alteração não encontrada.' });
    const divergencia = { id: generateId('asd'), alteracao_id: alteracao.id, descricao, criado_por: req.user.usuario, criado_por_nome: req.user.nome, criado_em: new Date().toISOString() };
    await executar(supabase.from('alteracoes_servico_divergencias').insert(divergencia), 'Falha ao registrar divergência');
    await registrarHistorico(req, alteracao.id, 'DIVERGÊNCIA', null, divergencia);
    res.status(201).json(divergencia);
  }));

  return router;
}

module.exports = criarRouterAlteracoesServico;
module.exports._internals = { podeConsultar, exigirSargenteante, podeEditarUnidade, validarAlteracao, validarComposicao };
