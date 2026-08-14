const express = require('express');

module.exports = function criarRouterEscalas({
  asyncRoute,
  buscarConfig,
  buscarRow,
  chaveMilitar,
  deleteRow,
  deleteRows,
  exigirP3,
  generateId,
  indexarPor,
  readTabela,
  readTabelaIn,
  validarCampos,
  writeRow,
  writeRows,
  registrarAuditoria,
}) {
  const router = express.Router();

  // -------------------------------------------------------------
  // ROTAS DE ESCALA DE DIÁRIAS
  // -------------------------------------------------------------

  // Listar escalas (permite filtro por operacao_id)
  router.get('/escalas', exigirP3, asyncRoute(async (req, res) => {
    res.json(await readTabela('escalas', { operacao_id: req.query.operacao_id }));
  }));

  // Teto de diárias por militar no mês. É ALERTA, nunca bloqueio: quem decide escalar
  // além disso é a P3, e o sistema não tem autoridade para impedir. Aparece na resposta
  // do lote e na consulta por militar, e a UI mostra sem travar a confirmação.
  const TETO_DIARIAS_MILITAR_MES = 20;

  function mesDe(dataIso) {
    return String(dataIso || '').slice(0, 7);
  }

  function normalizarTotalDiarias(valor, padrao = 2) {
    if (valor === undefined || valor === null || valor === '') return { ok: true, valor: padrao, informado: false };
    const numero = Number(valor);
    if (!Number.isInteger(numero) || numero < 0) {
      return { ok: false, erro: 'Quantidade de diárias inválida. Use um número inteiro maior ou igual a zero.' };
    }
    return { ok: true, valor: numero, informado: true };
  }

  // Normaliza a lista de militares dos endpoints de lote. Aceita `militar_id` ou
  // `matricula`, `militar_nome` ou `nome`, `qtd_aparicoes` ou `aparicoes`.
  function normalizarMilitaresDoLote(bruto, exigirAparicoes) {
    const lista = Array.isArray(bruto) ? bruto : [];
    const militares = [];
    const vistos = new Set();
    for (const item of lista) {
      const matricula = String(item.militar_id ?? item.matricula ?? '').trim();
      const nome = String(item.militar_nome ?? item.nome ?? '').trim();
      if (!nome) return { ok: false, erro: 'Todo militar do lote precisa de um nome (militar_nome).' };
      if (nome.length > 150) return { ok: false, erro: `Nome de militar acima de 150 caracteres: "${nome.slice(0, 30)}…".` };

      let aparicoes = 1;
      if (exigirAparicoes) {
        aparicoes = parseInt(item.qtd_aparicoes ?? item.aparicoes, 10);
        if (isNaN(aparicoes) || aparicoes < 1) {
          return { ok: false, erro: `Número de aparições inválido para "${nome}". Use um inteiro maior ou igual a 1.` };
        }
      }

      const diarias = normalizarTotalDiarias(item.total_diarias, 2);
      if (!diarias.ok) return { ok: false, erro: `${diarias.erro} Militar: "${nome}".` };

      // Militar repetido no MESMO payload: o último vence, em vez de gerar duas escalas
      // para a mesma pessoa na mesma operação.
      const chave = chaveMilitar(matricula, nome);
      const jaVisto = vistos.has(chave);
      vistos.add(chave);
      const registro = { chave, matricula, nome, aparicoes, totalDiarias: diarias.valor, diariasInformadas: diarias.informado };
      if (jaVisto) militares[militares.findIndex(m => m.chave === chave)] = registro;
      else militares.push(registro);
    }
    if (militares.length === 0) return { ok: false, erro: 'Informe ao menos um militar em "militares".' };
    return { ok: true, militares };
  }

  // Separa as operações do lote em atingíveis e ignoradas. Ocorrência já Executada não é
  // tocada por ação de lote — mesma regra das ações de grupo. Quem precisa escalar alguém
  // numa operação já executada usa o POST unitário /api/escalas, que segue sem trava.
  async function resolverOperacoesDoLote(idsBrutos) {
    const ids = [...new Set((Array.isArray(idsBrutos) ? idsBrutos : []).map(id => String(id || '').trim()).filter(Boolean))];
    if (ids.length === 0) return { ok: false, erro: 'Informe ao menos uma operação em "operacao_ids".' };

    const encontradas = await readTabelaIn('operacoes', 'id', ids);
    const idsEncontrados = new Set(encontradas.map(o => o.id));
    return {
      ok: true,
      alvo: encontradas.filter(o => o.situacao !== 'Executada'),
      ignoradasExecutadas: encontradas.filter(o => o.situacao === 'Executada').map(o => o.id),
      naoEncontradas: ids.filter(id => !idsEncontrados.has(id))
    };
  }

  // Diárias consumidas e saldo de cota, recalculados DEPOIS da escrita para a resposta
  // refletir o estado já gravado. Mesma dupla fonte do Planejador — consumido vem das
  // escalas reais e planejado só das operações SEM escala —, para os números baterem
  // com aquela tela em vez de contarem a mesma diária duas vezes.
  async function resumoCotaEteto(meses) {
    const [operacoes, escalas, config] = await Promise.all([
      readTabela('operacoes'), readTabela('escalas'), buscarConfig()
    ]);
    const operacaoPorId = new Map(operacoes.map(o => [o.id, o]));
    const escalasPorOperacao = indexarPor(escalas, 'operacao_id');

    // Data da escala: a coluna quando preenchida, senão a data_inicio da operação —
    // escalas anteriores à migration 004 têm `data` nula e não foram backfilladas.
    const mesDaEscala = (esc) => mesDe(esc.data || operacaoPorId.get(esc.operacao_id)?.data_inicio);

    const cotaMensal = config.cota_mensal_diarias || 0;
    const porMes = meses.map(mes => {
      const opsDoMes = operacoes.filter(o => mesDe(o.data_inicio) === mes);
      const consumido = escalas.filter(e => mesDaEscala(e) === mes).reduce((s, e) => s + (e.total_diarias || 0), 0);
      const planejado = opsDoMes
        .filter(o => (escalasPorOperacao.get(o.id) || []).length === 0)
        .reduce((s, o) => s + (o.qtd_diarias_estimada || 0), 0);
      return { mes, consumido, planejado, saldo: cotaMensal - consumido - planejado };
    });

    // Militares acima do teto nos meses tocados pelo lote. Informativo.
    const porMilitarMes = new Map();
    for (const esc of escalas) {
      const mes = mesDaEscala(esc);
      if (!meses.includes(mes)) continue;
      const chave = `${mes}|${chaveMilitar(esc.militar_id, esc.militar_nome)}`;
      const atual = porMilitarMes.get(chave);
      if (atual) atual.total_diarias += esc.total_diarias || 0;
      else porMilitarMes.set(chave, { mes, militar_id: esc.militar_id || '', militar_nome: esc.militar_nome, total_diarias: esc.total_diarias || 0 });
    }

    return {
      cota: { mensal: cotaMensal, meses: porMes },
      teto_militar_mes: TETO_DIARIAS_MILITAR_MES,
      militares_acima_do_teto: [...porMilitarMes.values()]
        .filter(m => m.total_diarias > TETO_DIARIAS_MILITAR_MES)
        .sort((a, b) => b.total_diarias - a.total_diarias)
    };
  }

  // -------------------------------------------------------------
  // ESCALA EM LOTE (N militares × N operações)
  // -------------------------------------------------------------
  // ATENÇÃO À ORDEM: estas duas rotas ficam ANTES de PUT/DELETE /api/escalas/:id.
  // `/api/escalas/lote` tem um segmento só, igual a `/api/escalas/:id` — registradas
  // depois, o Express casaria "lote" como se fosse um id e o DELETE nunca chegaria aqui.

  // Escala N militares em N operações numa escrita só. IDEMPOTENTE: se o militar já está
  // escalado naquela operação, atualiza as aparições em vez de duplicar.
  //
  // A idempotência é por leitura-e-escrita, não por constraint única em
  // (operacao_id, militar_id): existe duplicata legítima no banco de produção, criar a
  // constraint exigiria apagar dado real, e o ON CONFLICT reescreveria o `id` da linha
  // existente (que é a PK e é referenciada em nenhum lugar hoje, mas mudaria à toa).
  router.post('/escalas/lote', exigirP3, asyncRoute(async (req, res) => {
    const operacoes = await resolverOperacoesDoLote(req.body.operacao_ids);
    if (!operacoes.ok) return res.status(400).json({ error: operacoes.erro });

    const normalizados = normalizarMilitaresDoLote(req.body.militares, true);
    if (!normalizados.ok) return res.status(400).json({ error: normalizados.erro });
    const { militares } = normalizados;

    const idsAlvo = operacoes.alvo.map(o => o.id);
    const escalasExistentes = await readTabelaIn('escalas', 'operacao_id', idsAlvo);

    // Índice das escalas já gravadas. Havendo duplicata pré-existente do mesmo par,
    // atualiza a de menor id (determinístico) e deixa as outras intactas — apagar
    // registro que o app não criou nesta requisição não é decisão desta rota.
    const existentePorPar = new Map();
    const duplicatas = new Map();
    for (const esc of escalasExistentes) {
      const par = `${esc.operacao_id}|${chaveMilitar(esc.militar_id, esc.militar_nome)}`;
      const atual = existentePorPar.get(par);
      if (!atual) existentePorPar.set(par, esc);
      else {
        duplicatas.set(par, (duplicatas.get(par) || 1) + 1);
        if (esc.id < atual.id) existentePorPar.set(par, esc);
      }
    }

    const linhas = [];
    let criadas = 0;
    let atualizadas = 0;
    for (const op of operacoes.alvo) {
      for (const militar of militares) {
        const existente = existentePorPar.get(`${op.id}|${militar.chave}`);
        const campos = {
          operacao_id: op.id,
          militar_nome: militar.nome,
          militar_id: militar.matricula,
          qtd_aparicoes: militar.aparicoes,
          // A diária é um valor operacional próprio. Uma escala nova começa em 2;
          // aparições nunca recalculam uma diária já registrada.
          total_diarias: militar.diariasInformadas
            ? militar.totalDiarias
            : (existente ? existente.total_diarias : 2),
          // Data da ocorrência, não a do início do grupo: cada ocorrência da recorrência
          // é de um dia, e é essa data que o Relatório Diário precisa.
          data: op.data_inicio
        };
        if (existente) {
          atualizadas++;
          linhas.push({ ...existente, ...campos });
        } else {
          criadas++;
          linhas.push({ id: generateId('esc'), ...campos });
        }
      }
    }

    await writeRows('escalas', linhas);
    await registrarAuditoria({
      req, acao: 'definiu diárias', entidade: 'Escala', entidadeId: idsAlvo.join(','),
      descricao: `Definiu a escala de ${militares.length} militar(es) em ${idsAlvo.length} operação(ões), com quantidade manual de diárias.`,
    });

    const meses = [...new Set(operacoes.alvo.map(o => mesDe(o.data_inicio)))].sort();
    const resumo = await resumoCotaEteto(meses);

    res.status(201).json({
      escalas_criadas: criadas,
      escalas_atualizadas: atualizadas,
      operacoes_afetadas: idsAlvo.length,
      militares_no_lote: militares.length,
      total_diarias_lote: linhas.reduce((soma, l) => soma + l.total_diarias, 0),
      operacoes_ignoradas_executadas: operacoes.ignoradasExecutadas,
      operacoes_nao_encontradas: operacoes.naoEncontradas,
      duplicatas_preexistentes: [...duplicatas.keys()],
      ...resumo
    });
  }));

  // Remove militares de um conjunto de operações. Mesmo formato de payload do POST
  // (só `qtd_aparicoes` é dispensável) e mesma proteção da ocorrência Executada.
  router.delete('/escalas/lote', exigirP3, asyncRoute(async (req, res) => {
    const operacoes = await resolverOperacoesDoLote(req.body.operacao_ids);
    if (!operacoes.ok) return res.status(400).json({ error: operacoes.erro });

    const normalizados = normalizarMilitaresDoLote(req.body.militares, false);
    if (!normalizados.ok) return res.status(400).json({ error: normalizados.erro });

    const chavesAlvo = new Set(normalizados.militares.map(m => m.chave));
    const idsAlvo = operacoes.alvo.map(o => o.id);
    const escalasExistentes = await readTabelaIn('escalas', 'operacao_id', idsAlvo);

    // Aqui TODAS as linhas do par são removidas, inclusive duplicatas pré-existentes:
    // deixar uma sobra depois de "remover do grupo" seria pior que o excesso de zelo.
    const paraApagar = escalasExistentes.filter(e => chavesAlvo.has(chaveMilitar(e.militar_id, e.militar_nome)));
    await deleteRows('escalas', 'id', paraApagar.map(e => e.id));

    const meses = [...new Set(operacoes.alvo.map(o => mesDe(o.data_inicio)))].sort();
    const resumo = await resumoCotaEteto(meses);

    res.json({
      escalas_removidas: paraApagar.length,
      diarias_liberadas: paraApagar.reduce((soma, e) => soma + (e.total_diarias || 0), 0),
      operacoes_afetadas: idsAlvo.length,
      operacoes_ignoradas_executadas: operacoes.ignoradasExecutadas,
      operacoes_nao_encontradas: operacoes.naoEncontradas,
      ...resumo
    });
  }));

  // Diárias de UM militar num mês — alimenta o alerta de teto na tela de escala.
  // `:matricula` é o `escalas.militar_id` (RE), não o `pessoal.id`: não existe FK entre
  // escala e cadastro, e escalar quem não está cadastrado é permitido.
  router.get('/militares/:matricula/diarias', exigirP3, asyncRoute(async (req, res) => {
    const mes = String(req.query.mes || '').trim();
    if (!/^\d{4}-\d{2}$/.test(mes)) {
      return res.status(400).json({ error: 'Informe o mês no formato AAAA-MM.' });
    }

    const [operacoes, escalasDoMilitar] = await Promise.all([
      readTabela('operacoes'),
      readTabela('escalas', { militar_id: req.params.matricula })
    ]);
    const operacaoPorId = new Map(operacoes.map(o => [o.id, o]));

    const doMes = escalasDoMilitar.filter(e => mesDe(e.data || operacaoPorId.get(e.operacao_id)?.data_inicio) === mes);
    const totalDiarias = doMes.reduce((soma, e) => soma + (e.total_diarias || 0), 0);

    res.json({
      matricula: req.params.matricula,
      militar_nome: doMes[0]?.militar_nome || escalasDoMilitar[0]?.militar_nome || '',
      mes,
      escalas: doMes.length,
      total_aparicoes: doMes.reduce((soma, e) => soma + (e.qtd_aparicoes || 0), 0),
      total_diarias: totalDiarias,
      teto_militar_mes: TETO_DIARIAS_MILITAR_MES,
      acima_do_teto: totalDiarias > TETO_DIARIAS_MILITAR_MES
    });
  }));

  // Adicionar militar na escala. O padrão inicial é 2 diárias, independente de aparições. Sem trava por
  // situacao da operação — escala pode ser lançada tanto em operação Planejada quanto Executada.
  router.post('/escalas', exigirP3, asyncRoute(async (req, res) => {
    const v = validarCampos(req.body, {
      operacao_id: { obrigatorio: true, tipo: 'string', max: 50, label: 'Operação' },
      militar_nome: { obrigatorio: true, tipo: 'string', max: 150, label: 'Nome Completo' },
      militar_id: { obrigatorio: true, tipo: 'string', max: 50, label: 'Matrícula/ID' }
    });
    if (!v.ok) return res.status(400).json({ error: v.erro });

    const qtd_aparicoes = parseInt(req.body.qtd_aparicoes, 10) || 1;
    const diarias = normalizarTotalDiarias(req.body.total_diarias, 2);
    if (!diarias.ok) return res.status(400).json({ error: diarias.erro });

    // Data da escala (migration 004). Preenchida aqui também, e não só no lote, senão a
    // coluna nasceria pela metade — escala criada pela gaveta ficaria sem data e só a
    // criada pelo lote teria. Custa 1 SELECT por id. Sem trava por situacao: escalar em
    // operação já Executada continua permitido por esta rota (é a regra do módulo).
    const operacao = await buscarRow('operacoes', v.valores.operacao_id);
    if (!operacao) return res.status(404).json({ error: 'Operação não encontrada' });

    const novaEscala = {
      id: generateId('esc'),
      operacao_id: v.valores.operacao_id,
      militar_nome: v.valores.militar_nome,
      militar_id: v.valores.militar_id,
      qtd_aparicoes: qtd_aparicoes,
      total_diarias: diarias.valor,
      data: operacao.data_inicio
    };

    await writeRow('escalas', novaEscala);
    await registrarAuditoria({ req, acao: 'definiu diárias', entidade: 'Escala', entidadeId: novaEscala.id, descricao: `Incluiu ${novaEscala.militar_nome} com ${novaEscala.total_diarias} diária(s).` });
    res.status(201).json(novaEscala);
  }));

  // Atualizar escala. Aparições e diárias são independentes.
  router.put('/escalas/:id', exigirP3, asyncRoute(async (req, res) => {
    const escalaAtual = await buscarRow('escalas', req.params.id);
    if (!escalaAtual) {
      return res.status(404).json({ error: 'Militar não escalado nesta operação' });
    }

    const qtd_aparicoes = req.body.qtd_aparicoes === undefined
      ? escalaAtual.qtd_aparicoes
      : parseInt(req.body.qtd_aparicoes, 10);
    if (!Number.isInteger(qtd_aparicoes) || qtd_aparicoes < 1) {
      return res.status(400).json({ error: 'Número de aparições inválido. Use um inteiro maior ou igual a 1.' });
    }
    const diarias = normalizarTotalDiarias(req.body.total_diarias, escalaAtual.total_diarias);
    if (!diarias.ok) return res.status(400).json({ error: diarias.erro });

    const escalaAtualizada = {
      ...escalaAtual,
      militar_nome: req.body.militar_nome || escalaAtual.militar_nome,
      militar_id: req.body.militar_id || escalaAtual.militar_id,
      qtd_aparicoes: qtd_aparicoes,
      total_diarias: diarias.valor
    };

    await writeRow('escalas', escalaAtualizada);
    if (escalaAtualizada.total_diarias !== escalaAtual.total_diarias) {
      await registrarAuditoria({
        req, acao: 'alterou diárias', entidade: 'Escala', entidadeId: escalaAtualizada.id,
        descricao: `Alterou as diárias de ${escalaAtualizada.militar_nome}: ${escalaAtual.total_diarias} → ${escalaAtualizada.total_diarias}.`,
        antes: escalaAtual, depois: escalaAtualizada, campos: ['total_diarias'],
      });
    }
    res.json(escalaAtualizada);
  }));

  // Remover militar da escala
  router.delete('/escalas/:id', exigirP3, asyncRoute(async (req, res) => {
    await deleteRow('escalas', req.params.id);
    res.json({ message: 'Militar removido da escala' });
  }));

  return router;
};
