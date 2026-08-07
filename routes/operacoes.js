const express = require('express');

module.exports = function criarRouterOperacoes({
  LIMITES_RECORRENCIA,
  asyncRoute,
  buscarRow,
  deleteRow,
  deleteRows,
  diariaDaOperacao,
  exigirP3,
  generateId,
  indexarPor,
  readTabela,
  readTabelaIn,
  supabase,
  validarCampos,
  validarRegraRecorrencia,
  writeRow,
  writeRows,
}) {
  const router = express.Router();

  // -------------------------------------------------------------
  // ROTAS DE OPERAÇÕES (PLANEJAMENTO -> EXECUÇÃO, COM DIÁRIA)
  // -------------------------------------------------------------
  // Registro ÚNICO: a operação nasce Planejada (podendo reservar cota via qtd_diarias_estimada)
  // e vira Executada sem duplicar registro. As escalas nominais (diárias) penduram na operação,
  // não no evento. `operacoes` e `escalas` são de alta escrita concorrente -> writeRow/deleteRow.
  const TIPOS_OPERACAO = ['Ostensiva', 'Saturação', 'Cerco', 'Blitz', 'Cumprimento de Mandado', 'Reforço', 'Outras'];

  router.get('/operacoes', exigirP3, asyncRoute(async (req, res) => {
    res.json(await readTabela('operacoes'));
  }));

  // Schema de criação de operação, compartilhado por POST /api/operacoes (uma) e
  // POST /api/operacoes/lote (recorrência) — uma fonte de verdade só, para as duas
  // portas de entrada nunca divergirem em campo obrigatório ou limite de tamanho.
  const SCHEMA_OPERACAO_CRIACAO = {
    nome_operacao: { obrigatorio: true, tipo: 'string', max: 200, label: 'Nome da Operação' },
    tipo_operacao: { obrigatorio: true, tipo: 'string', max: 50, valores: TIPOS_OPERACAO, label: 'Tipo de Operação' },
    data_inicio: { obrigatorio: true, tipo: 'string', max: 10, label: 'Data de Início' },
    data_termino: { obrigatorio: false, tipo: 'string', max: 10, label: 'Data de Término' },
    horario_inicio: { obrigatorio: false, tipo: 'string', max: 5, padrao: '', label: 'Horário de Início' },
    local_itinerario: { obrigatorio: false, tipo: 'string', max: 300, padrao: '', label: 'Local/Itinerário' },
    num_oficio: { obrigatorio: false, tipo: 'string', max: 100, padrao: '', label: 'Número do Ofício' },
    num_os_manual: { obrigatorio: false, tipo: 'string', max: 100, padrao: '', label: 'Número da OS' },
    num_sei: { obrigatorio: false, tipo: 'string', max: 100, padrao: '', label: 'Número SEI' },
    demandante: { obrigatorio: false, tipo: 'string', max: 200, padrao: '', label: 'Demandante' },
    bairro: { obrigatorio: false, tipo: 'string', max: 100, padrao: '', label: 'Bairro' },
    situacao: { obrigatorio: false, tipo: 'string', valores: ['Planejada', 'Executada'], padrao: 'Planejada', label: 'Situação' },
    tipo_recorrencia: { obrigatorio: false, tipo: 'string', valores: ['diaria', 'fim_de_semana', 'dia_unico'], label: 'Tipo de Recorrência' }
  };

  // Criar nova operação. Mínimo para nascer como reserva de cota: nome, data_inicio,
  // qtd_diarias_estimada, tipo_operacao. O resto é completável depois.
  router.post('/operacoes', exigirP3, asyncRoute(async (req, res) => {
    const v = validarCampos(req.body, SCHEMA_OPERACAO_CRIACAO);
    if (!v.ok) return res.status(400).json({ error: v.erro });

    const qtdEstimada = parseInt(req.body.qtd_diarias_estimada, 10);
    if (isNaN(qtdEstimada) || qtdEstimada < 0) {
      return res.status(400).json({ error: 'Quantidade de diárias estimada inválida.' });
    }

    const novaOperacao = {
      id: generateId('op'),
      num_oficio: v.valores.num_oficio,
      num_os_manual: v.valores.num_os_manual,
      num_sei: v.valores.num_sei,
      nome_operacao: v.valores.nome_operacao,
      tipo_operacao: v.valores.tipo_operacao,
      demandante: v.valores.demandante,
      data_inicio: v.valores.data_inicio,
      data_termino: v.valores.data_termino || v.valores.data_inicio,
      horario_inicio: v.valores.horario_inicio,
      local_itinerario: v.valores.local_itinerario,
      bairro: v.valores.bairro,
      situacao: v.valores.situacao,
      qtd_diarias_estimada: qtdEstimada,
      tipo_recorrencia: v.valores.tipo_recorrencia || null
    };

    await writeRow('operacoes', novaOperacao);
    res.status(201).json(novaOperacao);
  }));

  // Atualizar operação (inclui o "Marcar como Executada", que só muda situacao)
  router.put('/operacoes/:id', exigirP3, asyncRoute(async (req, res) => {
    const operacaoAtual = await buscarRow('operacoes', req.params.id);
    if (!operacaoAtual) {
      return res.status(404).json({ error: 'Operação não encontrada' });
    }

    const v = validarCampos(req.body, {
      nome_operacao: { obrigatorio: false, tipo: 'string', max: 200, label: 'Nome da Operação' },
      tipo_operacao: { obrigatorio: false, tipo: 'string', max: 50, valores: TIPOS_OPERACAO, label: 'Tipo de Operação' },
      data_inicio: { obrigatorio: false, tipo: 'string', max: 10, label: 'Data de Início' },
      data_termino: { obrigatorio: false, tipo: 'string', max: 10, label: 'Data de Término' },
      horario_inicio: { obrigatorio: false, tipo: 'string', max: 5, label: 'Horário de Início' },
      local_itinerario: { obrigatorio: false, tipo: 'string', max: 300, label: 'Local/Itinerário' },
      num_oficio: { obrigatorio: false, tipo: 'string', max: 100, label: 'Número do Ofício' },
      num_os_manual: { obrigatorio: false, tipo: 'string', max: 100, label: 'Número da OS' },
      num_sei: { obrigatorio: false, tipo: 'string', max: 100, label: 'Número SEI' },
      demandante: { obrigatorio: false, tipo: 'string', max: 200, label: 'Demandante' },
      bairro: { obrigatorio: false, tipo: 'string', max: 100, label: 'Bairro' },
      situacao: { obrigatorio: false, tipo: 'string', valores: ['Planejada', 'Executada'], label: 'Situação' },
      tipo_recorrencia: { obrigatorio: false, tipo: 'string', valores: ['diaria', 'fim_de_semana', 'dia_unico'], label: 'Tipo de Recorrência' }
    });
    if (!v.ok) return res.status(400).json({ error: v.erro });

    const operacaoAtualizada = { ...operacaoAtual, ...v.valores };
    if (req.body.qtd_diarias_estimada !== undefined) {
      const qtdEstimada = parseInt(req.body.qtd_diarias_estimada, 10);
      if (isNaN(qtdEstimada) || qtdEstimada < 0) {
        return res.status(400).json({ error: 'Quantidade de diárias estimada inválida.' });
      }
      operacaoAtualizada.qtd_diarias_estimada = qtdEstimada;
    }

    await writeRow('operacoes', operacaoAtualizada);
    res.json(operacaoAtualizada);
  }));

  // Excluir operação (e escalas/alocações órfãs, apagadas diretamente por operacao_id).
  // O FK ON DELETE CASCADE do banco já cobriria, mas apagamos explicitamente para não depender
  // só da cascata e manter o padrão do delete de evento.
  router.delete('/operacoes/:id', exigirP3, asyncRoute(async (req, res) => {
    await deleteRow('operacoes', req.params.id);
    const { error: erroEscalas } = await supabase.from('escalas').delete().eq('operacao_id', req.params.id);
    if (erroEscalas) throw new Error(`Falha ao limpar "escalas" no Supabase: ${erroEscalas.message}`);
    const { error: erroAlocacoes } = await supabase.from('alocacoes').delete().eq('operacao_id', req.params.id);
    if (erroAlocacoes) throw new Error(`Falha ao limpar "alocacoes" no Supabase: ${erroAlocacoes.message}`);
    res.json({ message: 'Operação e registros relacionados excluídos' });
  }));


  // -------------------------------------------------------------
  // RECORRÊNCIA DE OPERAÇÕES (CRIAÇÃO EM LOTE, EDIÇÃO E EXCLUSÃO POR GRUPO)
  // -------------------------------------------------------------
  // Cada ocorrência é uma LINHA PRÓPRIA em `operacoes` (nada de geração virtual na
  // leitura), ligada às irmãs por `grupo_recorrencia_id`. Duas consequências que
  // valem para todo o módulo:
  //   1) com recorrência, cada ocorrência é de UM DIA (data_inicio = data_termino) e
  //      o "fim" da recorrência vive em recorrencia_regra.data_fim — o campo Data de
  //      Término do formulário muda de significado nesse modo;
  //   2) uma vez criado, o grupo é só um vínculo: qualquer ocorrência pode ser
  //      editada/excluída sozinha pelas rotas unitárias acima, sem tocar nas outras.
  // As rotas de grupo têm dois segmentos depois de /api/operacoes, então nunca
  // colidem com PUT/DELETE /api/operacoes/:id (que casa um segmento só).

  const ESCOPOS_GRUPO = ['somente_esta', 'esta_e_futuras', 'todas'];

  // Campos que uma ação de GRUPO pode alterar. Ficam de fora, deliberadamente:
  // as datas (mudar a data de todas é REGERAR o grupo, não editá-lo), `situacao`
  // (Executada é decisão de cada ocorrência) e o próprio vínculo do grupo.
  const SCHEMA_OPERACAO_GRUPO = {
    nome_operacao: { obrigatorio: false, tipo: 'string', max: 200, label: 'Nome da Operação' },
    tipo_operacao: { obrigatorio: false, tipo: 'string', max: 50, valores: TIPOS_OPERACAO, label: 'Tipo de Operação' },
    horario_inicio: { obrigatorio: false, tipo: 'string', max: 5, label: 'Horário de Início' },
    local_itinerario: { obrigatorio: false, tipo: 'string', max: 300, label: 'Local/Itinerário' },
    num_oficio: { obrigatorio: false, tipo: 'string', max: 100, label: 'Número do Ofício' },
    num_os_manual: { obrigatorio: false, tipo: 'string', max: 100, label: 'Número da OS' },
    num_sei: { obrigatorio: false, tipo: 'string', max: 100, label: 'Número SEI' },
    demandante: { obrigatorio: false, tipo: 'string', max: 200, label: 'Demandante' },
    bairro: { obrigatorio: false, tipo: 'string', max: 100, label: 'Bairro' },
    tipo_recorrencia: { obrigatorio: false, tipo: 'string', valores: ['diaria', 'fim_de_semana', 'dia_unico'], label: 'Tipo de Recorrência' }
  };
  const CAMPOS_BLOQUEADOS_GRUPO = ['id', 'data_inicio', 'data_termino', 'situacao', 'grupo_recorrencia_id', 'recorrencia_regra'];

  // A regra pode chegar completa ou só com o tipo/dias, deixando o período a cargo dos
  // campos do próprio formulário (Data de Início / Fim da Recorrência). Completa os
  // buracos antes de validar. 'avulsa' não usa período — traz a lista `datas`.
  function regraComPeriodoDoFormulario(regraBruta, corpo) {
    const regra = { ...(regraBruta || {}) };
    if (regra.tipo !== 'avulsa') {
      if (!regra.data_inicio && corpo.data_inicio) regra.data_inicio = String(corpo.data_inicio).trim();
      if (!regra.data_fim && corpo.data_termino) regra.data_fim = String(corpo.data_termino).trim();
    }
    return regra;
  }

  // Resolve quais ocorrências uma ação de escopo atinge.
  //   somente_esta   -> só a ocorrência de referência (exige ?ref=<id>)
  //   esta_e_futuras -> a de referência e as de data igual ou posterior (exige ?ref=<id>)
  //   todas          -> o grupo inteiro
  // REGRA FIXA: ocorrência já Executada nunca é alterada nem excluída por ação de
  // grupo — é registro histórico do que a tropa cumpriu. Sai da lista `alvo` e volta
  // contabilizada em `ignoradas`, para a UI conseguir dizer o que ficou de fora.
  async function resolverEscopoGrupo(grupoId, escopo, refId) {
    if (!ESCOPOS_GRUPO.includes(escopo)) {
      return { ok: false, status: 400, erro: `Escopo inválido. Valores aceitos: ${ESCOPOS_GRUPO.join(', ')}.` };
    }
    const grupo = await readTabela('operacoes', { grupo_recorrencia_id: grupoId });
    if (grupo.length === 0) {
      return { ok: false, status: 404, erro: 'Grupo de recorrência não encontrado.' };
    }

    let selecionadas;
    if (escopo === 'todas') {
      selecionadas = grupo;
    } else {
      const referencia = grupo.find(o => o.id === refId);
      if (!referencia) {
        return { ok: false, status: 400, erro: 'Informe ?ref=<id da ocorrência> pertencente ao grupo para os escopos "somente_esta" e "esta_e_futuras".' };
      }
      // data_inicio vem do Postgres como 'YYYY-MM-DD' — comparação de string já é cronológica.
      selecionadas = escopo === 'somente_esta'
        ? [referencia]
        : grupo.filter(o => o.data_inicio >= referencia.data_inicio);
    }

    return {
      ok: true,
      grupo,
      alvo: selecionadas.filter(o => o.situacao !== 'Executada'),
      ignoradas: selecionadas.filter(o => o.situacao === 'Executada')
    };
  }

  // Ocorrências do grupo COM o efetivo de cada uma — alimenta a tela de replicação de
  // escala (quantas ocorrências recebem o efetivo, quantas diárias isso soma, quais já
  // foram executadas). Duas leituras de tabela única, não readDB.
  router.get('/operacoes/grupo/:grupoId', exigirP3, asyncRoute(async (req, res) => {
    const grupo = await readTabela('operacoes', { grupo_recorrencia_id: req.params.grupoId });
    if (grupo.length === 0) return res.status(404).json({ error: 'Grupo de recorrência não encontrado.' });

    const escalasDoGrupo = await readTabelaIn('escalas', 'operacao_id', grupo.map(o => o.id));
    const escalasPorOperacao = indexarPor(escalasDoGrupo, 'operacao_id');

    const operacoes = grupo
      .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio))
      .map(op => {
        const escalasOp = escalasPorOperacao.get(op.id) || [];
        return {
          ...op,
          escalas: escalasOp,
          militares_escalados: escalasOp.length,
          // Mesma dupla fonte do resto do módulo: escala real quando existe, senão a estimativa.
          total_diarias: diariaDaOperacao(op, escalasOp)
        };
      });

    res.json({
      grupo_recorrencia_id: req.params.grupoId,
      recorrencia_regra: grupo[0].recorrencia_regra || null,
      total: operacoes.length,
      total_executadas: operacoes.filter(o => o.situacao === 'Executada').length,
      total_diarias: operacoes.reduce((soma, o) => soma + o.total_diarias, 0),
      operacoes
    });
  }));

  // Prévia das datas, sem persistir nada — alimenta a lista de conferência do modal.
  // Aceita a regra em `recorrencia_regra` ou solta na raiz do corpo.
  router.post('/operacoes/preview-recorrencia', exigirP3, asyncRoute(async (req, res) => {
    const regra = regraComPeriodoDoFormulario(req.body.recorrencia_regra || req.body, req.body);
    const validacao = validarRegraRecorrencia(regra);
    if (!validacao.ok) return res.status(400).json({ error: validacao.erro });
    res.json({
      datas: validacao.datas,
      total: validacao.datas.length,
      recorrencia_regra: validacao.regra,
      limites: LIMITES_RECORRENCIA
    });
  }));

  // Criação em lote. Uma escrita só (writeRows), nunca um POST por ocorrência em laço.
  // Os limites (92 ocorrências / 12 meses) são revalidados aqui — a UI não é autoridade.
  router.post('/operacoes/lote', exigirP3, asyncRoute(async (req, res) => {
    const v = validarCampos(req.body, SCHEMA_OPERACAO_CRIACAO);
    if (!v.ok) return res.status(400).json({ error: v.erro });

    const qtdEstimada = parseInt(req.body.qtd_diarias_estimada, 10);
    if (isNaN(qtdEstimada) || qtdEstimada < 0) {
      return res.status(400).json({ error: 'Quantidade de diárias estimada inválida.' });
    }

    const validacao = validarRegraRecorrencia(regraComPeriodoDoFormulario(req.body.recorrencia_regra, req.body));
    if (!validacao.ok) return res.status(400).json({ error: validacao.erro });

    const grupoRecorrenciaId = generateId('grp');
    const operacoes = validacao.datas.map(data => ({
      id: generateId('op'),
      num_oficio: v.valores.num_oficio,
      num_os_manual: v.valores.num_os_manual,
      num_sei: v.valores.num_sei,
      nome_operacao: v.valores.nome_operacao,
      tipo_operacao: v.valores.tipo_operacao,
      demandante: v.valores.demandante,
      // Cada ocorrência é de UM dia: início e término são a mesma data. O período
      // total do lote fica registrado em recorrencia_regra.
      data_inicio: data,
      data_termino: data,
      horario_inicio: v.valores.horario_inicio,
      local_itinerario: v.valores.local_itinerario,
      bairro: v.valores.bairro,
      situacao: v.valores.situacao,
      // Estimativa é POR OCORRÊNCIA — o total do grupo é este valor x total_ocorrencias.
      qtd_diarias_estimada: qtdEstimada,
      tipo_recorrencia: v.valores.tipo_recorrencia || null,
      grupo_recorrencia_id: grupoRecorrenciaId,
      recorrencia_regra: validacao.regra
    }));

    await writeRows('operacoes', operacoes);
    res.status(201).json({
      grupo_recorrencia_id: grupoRecorrenciaId,
      total: operacoes.length,
      total_diarias_estimadas: qtdEstimada * operacoes.length,
      recorrencia_regra: validacao.regra,
      operacoes
    });
  }));

  // Edição em grupo. Só os campos descritivos (SCHEMA_OPERACAO_GRUPO) e só os que
  // vierem no corpo — campo ausente não é sobrescrito com vazio.
  router.put('/operacoes/grupo/:grupoId', exigirP3, asyncRoute(async (req, res) => {
    const bloqueados = CAMPOS_BLOQUEADOS_GRUPO.filter(campo => campo in req.body);
    if (bloqueados.length > 0) {
      return res.status(400).json({
        error: `Estes campos não podem ser alterados por ação de grupo: ${bloqueados.join(', ')}. Edite a ocorrência individualmente.`
      });
    }

    const v = validarCampos(req.body, SCHEMA_OPERACAO_GRUPO);
    if (!v.ok) return res.status(400).json({ error: v.erro });

    const alteracoes = {};
    for (const campo of Object.keys(SCHEMA_OPERACAO_GRUPO)) {
      if (req.body[campo] !== undefined && v.valores[campo] !== undefined) alteracoes[campo] = v.valores[campo];
    }
    if (req.body.qtd_diarias_estimada !== undefined) {
      const qtd = parseInt(req.body.qtd_diarias_estimada, 10);
      if (isNaN(qtd) || qtd < 0) return res.status(400).json({ error: 'Quantidade de diárias estimada inválida.' });
      alteracoes.qtd_diarias_estimada = qtd;
    }
    if (Object.keys(alteracoes).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo válido para atualizar foi informado.' });
    }

    const escopo = await resolverEscopoGrupo(req.params.grupoId, req.query.escopo, req.query.ref);
    if (!escopo.ok) return res.status(escopo.status).json({ error: escopo.erro });

    const atualizadas = escopo.alvo.map(op => ({ ...op, ...alteracoes }));
    await writeRows('operacoes', atualizadas);
    res.json({
      grupo_recorrencia_id: req.params.grupoId,
      escopo: req.query.escopo,
      atualizadas: atualizadas.length,
      ignoradas_executadas: escopo.ignoradas.length,
      total_no_grupo: escopo.grupo.length,
      operacoes: atualizadas
    });
  }));

  // Exclusão em grupo. Apaga escalas e alocações das ocorrências atingidas antes das
  // operações — mesmo padrão explícito do DELETE unitário, sem depender só da cascata.
  router.delete('/operacoes/grupo/:grupoId', exigirP3, asyncRoute(async (req, res) => {
    const escopo = await resolverEscopoGrupo(req.params.grupoId, req.query.escopo, req.query.ref);
    if (!escopo.ok) return res.status(escopo.status).json({ error: escopo.erro });

    const ids = escopo.alvo.map(op => op.id);
    await deleteRows('escalas', 'operacao_id', ids);
    await deleteRows('alocacoes', 'operacao_id', ids);
    await deleteRows('operacoes', 'id', ids);

    res.json({
      grupo_recorrencia_id: req.params.grupoId,
      escopo: req.query.escopo,
      excluidas: ids.length,
      ignoradas_executadas: escopo.ignoradas.length,
      total_no_grupo: escopo.grupo.length,
      message: escopo.ignoradas.length > 0
        ? `${ids.length} operação(ões) excluída(s). ${escopo.ignoradas.length} já executada(s) foram preservadas.`
        : `${ids.length} operação(ões) e registros relacionados excluídos.`
    });
  }));

  return router;
};
