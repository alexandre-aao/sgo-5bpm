const express = require('express');

function criarRouterRelatorios({
  asyncRoute,
  buscarConfig,
  diariaDaOperacao,
  exigirP3,
  getLocalDateStrServer,
  indexarPor,
  readTabela,
}) {
  const router = express.Router();

// -------------------------------------------------------------
// ROTA DO PLANEJADOR MENSAL DE DIÁRIAS (COTA x CONSUMO)
// -------------------------------------------------------------
router.get('/planejador-diarias', exigirP3, asyncRoute(async (req, res) => {
  // Só as 3 tabelas que este agregador usa, em vez das 11 do readDB(). O objeto
  // `db` parcial mantém o corpo abaixo intacto — a lógica segue em JS puro.
  const [tabOperacoes, tabEscalas, tabConfig] = await Promise.all([
    readTabela('operacoes'), readTabela('escalas'), buscarConfig(),
  ]);
  const db = { operacoes: tabOperacoes, escalas: tabEscalas, config: tabConfig };
  const mesFiltro = req.query.mes; // Formato "MM" (ex: "07")
  const anoFiltro = req.query.ano || String(new Date().getFullYear());

  if (!mesFiltro) {
    return res.status(400).json({ error: 'Parâmetro mês é obrigatório (ex: ?mes=07)' });
  }

  // Operações do mês/ano, cada uma com sua diária (real se tem escala, estimada se não tem).
  const operacoes = db.operacoes
    .filter(o => {
      const [ano, mes] = o.data_inicio.split('-');
      return ano === anoFiltro && mes === mesFiltro;
    })
    .map(op => {
      const escalasOp = db.escalas.filter(s => s.operacao_id === op.id);
      const temEscala = escalasOp.length > 0;
      return {
        id: op.id,
        nome_operacao: op.nome_operacao,
        tipo_operacao: op.tipo_operacao,
        situacao: op.situacao,
        data_inicio: op.data_inicio,
        militares_escalados: escalasOp.length,
        qtd_diarias_estimada: op.qtd_diarias_estimada || 0,
        tem_escala: temEscala,
        total_diarias: diariaDaOperacao(op, escalasOp)
      };
    })
    .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));

  const cota = (db.config && db.config.cota_mensal_diarias) || 0;
  // Consumido = diárias reais das operações que já têm escala. Planejado = estimativa das que
  // ainda NÃO têm escala. Nunca a mesma operação nos dois — evita contagem dupla da diária.
  const totalConsumido = operacoes.filter(o => o.tem_escala).reduce((sum, o) => sum + o.total_diarias, 0);
  const totalPlanejado = operacoes.filter(o => !o.tem_escala).reduce((sum, o) => sum + o.qtd_diarias_estimada, 0);

  res.json({
    cota_mensal: cota,
    total_consumido: totalConsumido,
    total_planejado: totalPlanejado,
    saldo: cota - totalConsumido - totalPlanejado,
    operacoes
  });
}));

// -------------------------------------------------------------
// ROTA AGREGADORA DO DASHBOARD (P3) — um único round-trip para popular o
// grid de cards-resumo, em vez de várias chamadas paralelas do frontend.
// -------------------------------------------------------------
router.get('/dashboard-resumo', exigirP3, asyncRoute(async (req, res) => {
  // Só as 7 tabelas realmente usadas por este agregador (de 10 no total) — corta 4 SELECTs
  // inúteis (sessoes, bairros_coordenadas, cartoes, viaturas) que o readDB() antigo fazia.
  // Continua em JS puro (Promise.all de readTabela), não em SQL — ver nota de arquitetura
  // no topo do arquivo sobre por que a lógica de negócio fica no shim, não no banco.
  const [eventos, operacoes, escalas, alocacoes, pessoal, usuarios, cartoes, config] = await Promise.all([
    readTabela('eventos'),
    readTabela('operacoes'),
    readTabela('escalas'),
    readTabela('alocacoes'),
    readTabela('pessoal'),
    readTabela('usuarios'),
    readTabela('cartoes'),
    buscarConfig(),
  ]);
  const hojeStr = getLocalDateStrServer();
  const [anoHoje, mesHoje] = hojeStr.split('-');
  const amanhaData = new Date(`${hojeStr}T12:00:00Z`);
  amanhaData.setUTCDate(amanhaData.getUTCDate() + 1);
  const amanhaStr = amanhaData.toISOString().slice(0, 10);

  // Período do relatório: vem do filtro (?mes=&ano=) ou o mês/ano atual por padrão. "Hoje" (Cartão
  // Programa de hoje, próximos 7 dias) continua sempre literal, independente do período escolhido.
  const anoPeriodo = req.query.ano || anoHoje;
  const mesPeriodo = req.query.mes || mesHoje;
  const prefixoPeriodo = `${anoPeriodo}-${mesPeriodo}`;

  const eventosDoPeriodo = eventos.filter(e => e.data_inicio.startsWith(prefixoPeriodo));
  const idsEventosDoPeriodo = new Set(eventosDoPeriodo.map(e => e.id));

  // Eventos: total no período + próximos 7 dias (sempre a partir de hoje, não do período filtrado)
  const daqui7Dias = new Date(`${hojeStr}T12:00:00Z`);
  daqui7Dias.setUTCDate(daqui7Dias.getUTCDate() + 7);
  const daqui7DiasStr = daqui7Dias.toISOString().slice(0, 10);
  const eventosProximos7Dias = eventos.filter(e => e.data_inicio >= hojeStr && e.data_inicio <= daqui7DiasStr).length;

  // Diárias: total pago no período + saldo da cota do período (mesma lógica de /api/planejador-diarias).
  // Fonte da diária agora são as OPERAÇÕES do período (não mais eventos): consumido = operações
  // com escala; planejado = estimativa das operações sem escala. Nunca a mesma nos dois.
  const operacoesDoPeriodo = operacoes.filter(o => o.data_inicio.startsWith(prefixoPeriodo));
  const idsOperacoesDoPeriodo = new Set(operacoesDoPeriodo.map(o => o.id));
  const escalasDoPeriodo = escalas.filter(s => idsOperacoesDoPeriodo.has(s.operacao_id));
  const opsComEscala = new Set(escalasDoPeriodo.map(s => s.operacao_id));
  const consumidoPeriodo = escalasDoPeriodo.reduce((sum, s) => sum + (s.total_diarias || 0), 0);
  const operacoesPlanejadas = operacoesDoPeriodo.filter(o => !opsComEscala.has(o.id));
  const planejadoPeriodo = operacoesPlanejadas.reduce((sum, o) => sum + (o.qtd_diarias_estimada || 0), 0);
  const cota = (config && config.cota_mensal_diarias) || 0;
  const comprometidoPeriodo = consumidoPeriodo + planejadoPeriodo;

  const cartaoHoje = cartoes.find((c) => !c.is_template && c.data === hojeStr) || null;
  const cartaoAmanha = cartoes.find((c) => !c.is_template && c.data === amanhaStr) || null;
  const modeloOrdinario = cartoes.find((c) => c.is_template && (c.tipo_modelo || 'ordinario') === 'ordinario' && c.padrao_ativo) || null;
  const operacoesHoje = operacoes.filter((o) => o.data_inicio === hojeStr);
  const operacoesProximas = operacoes
    .filter((o) => o.data_inicio > hojeStr && o.data_inicio <= daqui7DiasStr)
    .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));
  const idsComEscala = new Set(escalas.map((e) => e.operacao_id));
  const operacoesDiariaPendente = operacoes
    .filter((o) => o.data_inicio >= hojeStr && o.data_inicio <= daqui7DiasStr)
    .filter((o) => !idsComEscala.has(o.id) && o.diaria_definida !== true)
    .map((o) => ({ id: o.id, nome_operacao: o.nome_operacao, data_inicio: o.data_inicio }));

  // Índice alocações por evento — construído uma vez para não varrer alocacoes dentro do forEach abaixo.
  const alocacoesPorEvento = indexarPor(alocacoes, 'evento_id');

  // Efetivo total empregado no período
  const alocacoesDoPeriodo = alocacoes.filter(a => idsEventosDoPeriodo.has(a.evento_id));
  const efetivoTotalPeriodo = alocacoesDoPeriodo.reduce((sum, a) => sum + a.qtd_policiais, 0);

  // Distribuição por tipo de missão/evento no período — mesma agregação de GET /api/estatisticas,
  // só filtrada por mês+ano em vez de ano inteiro.
  const mapaTipo = {};
  eventosDoPeriodo.forEach(evt => {
    const chave = evt.tipo_evento || 'Outros';
    if (!mapaTipo[chave]) {
      mapaTipo[chave] = { tipo_evento: chave, total_eventos: 0, total_policiais: 0, total_viaturas: 0 };
    }
    mapaTipo[chave].total_eventos += 1;
    (alocacoesPorEvento.get(evt.id) || []).forEach(a => {
      mapaTipo[chave].total_policiais += a.qtd_policiais;
      mapaTipo[chave].total_viaturas += a.qtd_viaturas;
    });
  });
  const distribuicaoTipo = Object.values(mapaTipo).sort((a, b) => b.total_eventos - a.total_eventos);

  // Top 10 militares por empenho no período — mesma agregação por militar de /api/relatorio-diarias,
  // sobre as escalas do período. Enriquece com posto/graduação via matrícula (best-effort; escalas
  // antigas podem ter militar_id de texto livre que não casa com nenhum cadastro).
  const postoPorMatricula = new Map();
  pessoal.forEach(p => { if (p.matricula) postoPorMatricula.set(String(p.matricula), p.posto_graduacao || ''); });
  const consolidadoMilitares = {};
  escalasDoPeriodo.forEach(s => {
    const chave = s.militar_id || s.militar_nome;
    if (!consolidadoMilitares[chave]) {
      consolidadoMilitares[chave] = {
        militar_nome: s.militar_nome,
        posto_graduacao: postoPorMatricula.get(String(s.militar_id)) || '',
        escalas_count: 0,
        total_diarias: 0
      };
    }
    consolidadoMilitares[chave].escalas_count += 1;
    consolidadoMilitares[chave].total_diarias += (s.total_diarias || 0);
  });
  const topMilitares = Object.values(consolidadoMilitares)
    .sort((a, b) => b.total_diarias - a.total_diarias || b.escalas_count - a.escalas_count)
    .slice(0, 10);

  // Cadastro de Pessoal: total + quebra Praça/Oficial (não depende de período)
  const totalPessoal = pessoal.length;
  const pracas = pessoal.filter(p => p.tipo === 'Praça').length;
  const oficiais = pessoal.filter(p => p.tipo === 'Oficial').length;

  res.json({
    periodo: { mes: mesPeriodo, ano: anoPeriodo },
    eventos: { total_periodo: eventosDoPeriodo.length, proximos_7_dias: eventosProximos7Dias },
    // `planejado_periodo` alimenta o donut "Diárias — Visão Geral" do Dashboard (consumido real
    // x planejado estimado). Já era calculado aqui pro saldo da cota; só passou a ser exposto.
    diarias: { total_pago_periodo: consumidoPeriodo, planejado_periodo: planejadoPeriodo, comprometido_periodo: comprometidoPeriodo, saldo_cota_periodo: cota - comprometidoPeriodo, cota_mensal: cota },
    operacional: {
      hoje: hojeStr,
      amanha: amanhaStr,
      cartao_hoje_pronto: !!cartaoHoje && (cartaoHoje.viaturas || []).length > 0,
      cartao_amanha_preparado: !!cartaoAmanha && (cartaoAmanha.viaturas || []).length > 0,
      cartao_hoje_id: cartaoHoje?.id || null,
      cartao_amanha_id: cartaoAmanha?.id || null,
      modelo_ordinario_ativo: modeloOrdinario ? { id: modeloOrdinario.id, nome: modeloOrdinario.nome_template } : null,
      modelo_ordinario_com_rascunho: modeloOrdinario?.estado_template === 'rascunho',
      operacoes_hoje: operacoesHoje.map((o) => ({ id: o.id, nome_operacao: o.nome_operacao })),
      operacoes_proximas: operacoesProximas.map((o) => ({ id: o.id, nome_operacao: o.nome_operacao, data_inicio: o.data_inicio })),
      operacoes_diaria_pendente: operacoesDiariaPendente,
    },
    planejador: { operacoes_planejadas: operacoesPlanejadas.length },
    efetivo_total_periodo: efetivoTotalPeriodo,
    distribuicao_tipo: distribuicaoTipo,
    top_militares: topMilitares,
    pessoal: { total: totalPessoal, pracas, oficiais },
    usuarios: { total: usuarios.length }
  });
}));

// As antigas ROTAS DE MISSÕES PLANEJADAS foram removidas: missões viraram `operacoes`
// com situacao='Planejada' (reserva de cota via qtd_diarias_estimada), sem entidade separada
// nem "conversão" que duplicava registro. Ver ROTAS DE OPERAÇÕES acima.


// -------------------------------------------------------------
// ROTA DO RELATÓRIO DE DIÁRIAS (AGREGADO NO MÊS)
// -------------------------------------------------------------
router.get('/relatorio-diarias', asyncRoute(async (req, res) => {
  const [tabOperacoes, tabEscalas, tabPessoal] = await Promise.all([
    readTabela('operacoes'), readTabela('escalas'), readTabela('pessoal'),
  ]);
  const db = { operacoes: tabOperacoes, escalas: tabEscalas, pessoal: tabPessoal };
  const mesFiltro = req.query.mes; // Formato "MM" (ex: "07")
  const anoFiltro = req.query.ano || String(new Date().getFullYear());

  if (!mesFiltro) {
    return res.status(400).json({ error: 'Parâmetro mês é obrigatório (ex: ?mes=07)' });
  }

  // 1. Encontra todas as operações no mês e ano selecionados (diária é das operações, não eventos)
  const operacoesNoPeriodo = db.operacoes.filter(o => {
    const dataParts = o.data_inicio.split('-'); // YYYY-MM-DD
    const ano = dataParts[0];
    const mes = dataParts[1];
    return ano === anoFiltro && mes === mesFiltro;
  });

  const idsOperacoesPeriodo = new Set(operacoesNoPeriodo.map(o => o.id));

  // 2. Filtra escalas vinculadas a essas operações
  const escalasFiltradas = db.escalas.filter(s => idsOperacoesPeriodo.has(s.operacao_id));

  // 3. Agrupa por militar_id e militar_nome
  const consolidado = {};
  escalasFiltradas.forEach(esc => {
    const chave = esc.militar_id;
    if (!consolidado[chave]) {
      consolidado[chave] = {
        militar_id: esc.militar_id,
        militar_nome: esc.militar_nome,
        escalas_count: 0,
        qtd_aparicoes: 0,
        total_diarias: 0
      };
    }
    consolidado[chave].escalas_count += 1;
    consolidado[chave].qtd_aparicoes += esc.qtd_aparicoes;
    consolidado[chave].total_diarias += esc.total_diarias;
  });

  res.json(Object.values(consolidado));
}));


// -------------------------------------------------------------
// RELATÓRIO DIÁRIO DE DIÁRIAS (por data ou por operação) — fonte: operacoes + escalas
// -------------------------------------------------------------
router.get('/relatorio-diario', exigirP3, asyncRoute(async (req, res) => {
  const [tabOperacoes, tabEscalas, tabPessoal, tabEventos, tabAlocacoes] = await Promise.all([
    readTabela('operacoes'), readTabela('escalas'), readTabela('pessoal'),
    readTabela('eventos'), readTabela('alocacoes'),
  ]);
  const db = {
    operacoes: tabOperacoes, escalas: tabEscalas, pessoal: tabPessoal,
    eventos: tabEventos, alocacoes: tabAlocacoes,
  };
  const mes = req.query.mes;
  const ano = req.query.ano || String(new Date().getFullYear());
  const agrupar = req.query.agrupar === 'operacao' ? 'operacao' : 'data';
  if (!mes) return res.status(400).json({ error: 'Parâmetro mês é obrigatório (ex: ?mes=07)' });

  const operacoesPeriodo = (db.operacoes || []).filter(o => {
    const partes = o.data_inicio.split('-'); // YYYY-MM-DD
    return partes[0] === ano && partes[1] === mes;
  });
  const opPorId = new Map(operacoesPeriodo.map(o => [o.id, o]));
  const idsOp = new Set(opPorId.keys());
  const escalas = (db.escalas || []).filter(s => idsOp.has(s.operacao_id));

  // índice de pessoal por matrícula, para resolver posto + nome de guerra
  const pessoalPorMat = new Map();
  (db.pessoal || []).forEach(p => { if (p.matricula) pessoalPorMat.set(String(p.matricula), p); });

  const resolver = (esc) => {
    const p = pessoalPorMat.get(String(esc.militar_id));
    return {
      posto_graduacao: p ? (p.posto_graduacao || '') : '',
      nome_guerra: p ? (p.nome_guerra || '') : '',
      militar_nome: esc.militar_nome || '',
      matricula: esc.militar_id || '',
      diarias: esc.total_diarias || 0
    };
  };
  // agrega escalas por militar dentro de um grupo (soma diárias se o mesmo militar repetir)
  const agregarMilitares = (lista) => {
    const mmap = new Map();
    lista.forEach(esc => {
      const chave = esc.militar_id || esc.militar_nome;
      const m = resolver(esc);
      if (mmap.has(chave)) mmap.get(chave).diarias += m.diarias;
      else mmap.set(chave, m);
    });
    return [...mmap.values()];
  };

  let grupos = [];
  let total_mes = 0;

  if (agrupar === 'data') {
    const porData = new Map(); // data -> array de escalas
    escalas.forEach(esc => {
      const data = opPorId.get(esc.operacao_id).data_inicio;
      if (!porData.has(data)) porData.set(data, []);
      porData.get(data).push(esc);
    });
    grupos = [...porData.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([data, escs]) => {
        const militares = agregarMilitares(escs);
        const total = militares.reduce((s, x) => s + x.diarias, 0);
        total_mes += total;
        return { data, total, militares };
      });
  } else {
    grupos = operacoesPeriodo
      .filter(o => escalas.some(s => s.operacao_id === o.id)) // só operações com escala (diária real)
      .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio))
      .map(o => {
        const militares = agregarMilitares(escalas.filter(s => s.operacao_id === o.id));
        const total = militares.reduce((s, x) => s + x.diarias, 0);
        total_mes += total;
        return { operacao: o.nome_operacao, data: o.data_inicio, tipo: o.tipo_operacao, total, militares };
      });
  }

  res.json({ mes, ano, agrupar, total_mes, grupos });
}));


// -------------------------------------------------------------
// ROTA DO CALENDÁRIO DE DIÁRIAS (TOTAL POR DIA NO MÊS)
// -------------------------------------------------------------
router.get('/diarias-calendario', exigirP3, asyncRoute(async (req, res) => {
  const [tabOperacoes, tabEscalas, tabEventos, tabAlocacoes] = await Promise.all([
    readTabela('operacoes'), readTabela('escalas'), readTabela('eventos'), readTabela('alocacoes'),
  ]);
  const db = {
    operacoes: tabOperacoes, escalas: tabEscalas, eventos: tabEventos, alocacoes: tabAlocacoes,
  };
  const mesFiltro = req.query.mes;
  const anoFiltro = req.query.ano || String(new Date().getFullYear());

  if (!mesFiltro) {
    return res.status(400).json({ error: 'Parâmetro mês é obrigatório (ex: ?mes=07)' });
  }

  const operacoesNoPeriodo = db.operacoes.filter(o => {
    const [ano, mes] = o.data_inicio.split('-');
    return ano === anoFiltro && mes === mesFiltro;
  });

  // Calendário de diárias por dia. Usa diariaDaOperacao: operação com escala conta a diária real,
  // operação só Planejada conta a estimativa — assim a reserva de cota também aparece no calendário.
  const porDia = {};
  operacoesNoPeriodo.forEach(op => {
    const escalasOp = db.escalas.filter(s => s.operacao_id === op.id);
    const totalDiariasOp = diariaDaOperacao(op, escalasOp);
    if (totalDiariasOp === 0) return; // só entra no calendário quem tem diária (real ou estimada)

    if (!porDia[op.data_inicio]) {
      porDia[op.data_inicio] = { dia: op.data_inicio, total_diarias: 0, eventos: [] };
    }
    porDia[op.data_inicio].total_diarias += totalDiariasOp;
    porDia[op.data_inicio].eventos.push({
      id: op.id,
      nome_evento: op.nome_operacao,
      tipo_evento: op.tipo_operacao,
      total_diarias: totalDiariasOp
    });
  });

  res.json(Object.values(porDia));
}));


// -------------------------------------------------------------
// ROTA DE ESTATÍSTICAS (PAINEL ANALÍTICO PARA PLANEJAMENTO)
// -------------------------------------------------------------
router.get('/estatisticas', asyncRoute(async (req, res) => {
  const [tabOperacoes, tabEscalas, tabEventos, tabAlocacoes] = await Promise.all([
    readTabela('operacoes'), readTabela('escalas'), readTabela('eventos'), readTabela('alocacoes'),
  ]);
  const db = {
    operacoes: tabOperacoes, escalas: tabEscalas, eventos: tabEventos, alocacoes: tabAlocacoes,
  };
  const anoFiltro = req.query.ano || String(new Date().getFullYear());

  const eventosDoAno = db.eventos.filter(e => e.data_inicio.startsWith(anoFiltro));
  const idsEventosDoAno = new Set(eventosDoAno.map(e => e.id));
  const alocacoesDoAno = db.alocacoes.filter(a => idsEventosDoAno.has(a.evento_id));

  // Diárias vêm das OPERAÇÕES do ano (não mais dos eventos). Painel analítico = diária realizada,
  // por isso soma as escalas reais (não a estimativa de operações ainda só Planejadas).
  const operacoesDoAno = db.operacoes.filter(o => o.data_inicio.startsWith(anoFiltro));
  const idsOperacoesDoAno = new Set(operacoesDoAno.map(o => o.id));
  const escalasDoAno = db.escalas.filter(s => idsOperacoesDoAno.has(s.operacao_id));

  // Índices construídos uma vez para as agregações abaixo (evita varrer db.alocacoes/db.escalas
  // dentro dos forEach/loop de meses — antes era O(eventos×alocacoes) e O(12×alocacoes/escalas)).
  const alocacoesPorEvento = indexarPor(db.alocacoes, 'evento_id');
  const escalasPorOperacao = indexarPor(db.escalas, 'operacao_id');

  const totalPoliciais = alocacoesDoAno.reduce((sum, a) => sum + a.qtd_policiais, 0);
  const totalViaturas = alocacoesDoAno.reduce((sum, a) => sum + a.qtd_viaturas, 0);
  const totalDiarias = escalasDoAno.reduce((sum, s) => sum + (s.total_diarias || 0), 0);

  // --- Agrupamento por Bairro ---
  const mapaBairro = {};
  eventosDoAno.forEach(evt => {
    const chave = evt.bairro || 'Não Informado';
    if (!mapaBairro[chave]) {
      mapaBairro[chave] = { bairro: chave, total_eventos: 0, total_policiais: 0, total_viaturas: 0 };
    }
    mapaBairro[chave].total_eventos += 1;
    (alocacoesPorEvento.get(evt.id) || []).forEach(a => {
      mapaBairro[chave].total_policiais += a.qtd_policiais;
      mapaBairro[chave].total_viaturas += a.qtd_viaturas;
    });
  });
  const porBairro = Object.values(mapaBairro).sort((a, b) => b.total_policiais - a.total_policiais);

  // --- Agrupamento por Tipo de Evento ---
  const mapaTipo = {};
  eventosDoAno.forEach(evt => {
    const chave = evt.tipo_evento || 'Outros';
    if (!mapaTipo[chave]) {
      mapaTipo[chave] = { tipo_evento: chave, total_eventos: 0, total_policiais: 0, total_viaturas: 0 };
    }
    mapaTipo[chave].total_eventos += 1;
    (alocacoesPorEvento.get(evt.id) || []).forEach(a => {
      mapaTipo[chave].total_policiais += a.qtd_policiais;
      mapaTipo[chave].total_viaturas += a.qtd_viaturas;
    });
  });
  const porTipo = Object.values(mapaTipo)
    .map(t => ({ ...t, media_policiais_por_evento: t.total_eventos > 0 ? Math.round((t.total_policiais / t.total_eventos) * 10) / 10 : 0 }))
    .sort((a, b) => b.total_policiais - a.total_policiais);

  // --- Agrupamento por Modalidade de Policiamento ---
  const mapaModalidade = {};
  alocacoesDoAno.forEach(a => {
    const chave = a.modalidade || 'Outros';
    if (!mapaModalidade[chave]) {
      mapaModalidade[chave] = { modalidade: chave, total_alocacoes: 0, total_policiais: 0, total_viaturas: 0 };
    }
    mapaModalidade[chave].total_alocacoes += 1;
    mapaModalidade[chave].total_policiais += a.qtd_policiais;
    mapaModalidade[chave].total_viaturas += a.qtd_viaturas;
  });
  const porModalidade = Object.values(mapaModalidade)
    .map(m => ({ ...m, percentual_efetivo: totalPoliciais > 0 ? Math.round((m.total_policiais / totalPoliciais) * 1000) / 10 : 0 }))
    .sort((a, b) => b.total_policiais - a.total_policiais);

  // --- Tendência Mensal (Jan a Dez do ano filtrado) ---
  // "Planejado" x "Realizado" é calculado pela data (sem depender de status manual):
  // o evento é considerado realizado quando seu término (ou início) já passou.
  const hojeStr = getLocalDateStrServer();
  const tendenciaMensal = [];
  for (let mes = 1; mes <= 12; mes++) {
    const mesStr = String(mes).padStart(2, '0');
    const eventosDoMes = eventosDoAno.filter(e => e.data_inicio.split('-')[1] === mesStr);
    // Soma efetivo/viaturas do mês pelos índices (mesma soma que filtrar db.alocacoes por evento do mês).
    let efetivoMes = 0;
    let viaturasMes = 0;
    eventosDoMes.forEach(e => {
      (alocacoesPorEvento.get(e.id) || []).forEach(a => {
        efetivoMes += a.qtd_policiais;
        viaturasMes += a.qtd_viaturas;
      });
    });
    const operacoesDoMes = operacoesDoAno.filter(o => o.data_inicio.split('-')[1] === mesStr);
    let diariasMes = 0;
    operacoesDoMes.forEach(o => {
      (escalasPorOperacao.get(o.id) || []).forEach(s => { diariasMes += (s.total_diarias || 0); });
    });
    const realizadosMes = eventosDoMes.filter(e => (e.data_termino || e.data_inicio) < hojeStr).length;
    const planejadosMes = eventosDoMes.length - realizadosMes;

    tendenciaMensal.push({
      mes: mesStr,
      total_eventos: eventosDoMes.length,
      eventos_planejados: planejadosMes,
      eventos_realizados: realizadosMes,
      total_policiais: efetivoMes,
      total_viaturas: viaturasMes,
      total_diarias: diariasMes
    });
  }

  res.json({
    ano: anoFiltro,
    resumo: {
      total_eventos: eventosDoAno.length,
      total_policiais: totalPoliciais,
      total_viaturas: totalViaturas,
      total_diarias: totalDiarias
    },
    por_bairro: porBairro,
    por_tipo: porTipo,
    por_modalidade: porModalidade,
    tendencia_mensal: tendenciaMensal
  });
}));

// Calcula a duração em horas (decimal) entre dois horários "HH:MM". Retorna 0 se inválido.
function duracaoHoras(inicio, fim) {
  if (!inicio || !fim) return 0;
  const [hi, mi] = inicio.split(':').map(Number);
  const [hf, mf] = fim.split(':').map(Number);
  if ([hi, mi, hf, mf].some(Number.isNaN)) return 0;

  let minutos = (hf * 60 + mf) - (hi * 60 + mi);
  if (minutos < 0) minutos += 24 * 60; // roteiro que atravessa a meia-noite
  return minutos / 60;
}

// -------------------------------------------------------------
// ROTA DE ESTATÍSTICAS DO CARTÃO PROGRAMA (PATRULHAMENTO)
// -------------------------------------------------------------
router.get('/estatisticas-cartao', asyncRoute(async (req, res) => {
  // Usava só `cartoes` e baixava as 11 tabelas — o pior caso do readDB(), ainda
  // por cima trazendo o JSONB pesado de viaturas/itens junto com o resto.
  const db = { cartoes: await readTabela('cartoes') };
  const anoFiltro = req.query.ano || String(new Date().getFullYear());

  const cartoesDoAno = (db.cartoes || []).filter(c => !c.is_template && c.data && c.data.startsWith(anoFiltro));

  let totalItensRoteiro = 0;
  let totalHoras = 0;
  let totalViaturasDia = 0;

  const mapaSetor = {};
  const mapaAtividade = {};
  const mapaViatura = {};

  cartoesDoAno.forEach(cartao => {
    (cartao.viaturas || []).forEach(vtr => {
      totalViaturasDia += 1;

      const chaveViatura = vtr.prefixo || 'Não informado';
      if (!mapaViatura[chaveViatura]) {
        mapaViatura[chaveViatura] = { prefixo: chaveViatura, qtd_dias: 0, qtd_itens: 0 };
      }
      mapaViatura[chaveViatura].qtd_dias += 1;

      const chaveSetor = vtr.setor || 'Não informado';
      if (!mapaSetor[chaveSetor]) {
        mapaSetor[chaveSetor] = { setor: chaveSetor, qtd_itens: 0, horas_totais: 0 };
      }

      (vtr.itens || []).forEach(item => {
        totalItensRoteiro += 1;
        mapaViatura[chaveViatura].qtd_itens += 1;
        mapaSetor[chaveSetor].qtd_itens += 1;

        const horas = duracaoHoras(item.inicio, item.fim);
        mapaSetor[chaveSetor].horas_totais += horas;
        totalHoras += horas;

        const chaveAtividade = item.atividade || 'Outros';
        if (!mapaAtividade[chaveAtividade]) {
          mapaAtividade[chaveAtividade] = { atividade: chaveAtividade, qtd_itens: 0 };
        }
        mapaAtividade[chaveAtividade].qtd_itens += 1;
      });
    });
  });

  const porSetor = Object.values(mapaSetor)
    .map(s => ({ ...s, horas_totais: Math.round(s.horas_totais * 10) / 10 }))
    .sort((a, b) => b.qtd_itens - a.qtd_itens);

  const porAtividade = Object.values(mapaAtividade)
    .map(a => ({ ...a, percentual: totalItensRoteiro > 0 ? Math.round((a.qtd_itens / totalItensRoteiro) * 1000) / 10 : 0 }))
    .sort((a, b) => b.qtd_itens - a.qtd_itens);

  const porViatura = Object.values(mapaViatura).sort((a, b) => b.qtd_dias - a.qtd_dias);

  const tendenciaMensal = [];
  for (let mes = 1; mes <= 12; mes++) {
    const mesStr = String(mes).padStart(2, '0');
    const cartoesDoMes = cartoesDoAno.filter(c => c.data.split('-')[1] === mesStr);
    tendenciaMensal.push({
      mes: mesStr,
      total_cartoes: cartoesDoMes.length,
      total_viaturas_dia: cartoesDoMes.reduce((sum, c) => sum + (c.viaturas || []).length, 0)
    });
  }

  res.json({
    ano: anoFiltro,
    resumo: {
      total_cartoes: cartoesDoAno.length,
      total_viaturas_dia: totalViaturasDia,
      total_itens_roteiro: totalItensRoteiro,
      total_horas: Math.round(totalHoras * 10) / 10
    },
    por_setor: porSetor,
    por_atividade: porAtividade,
    por_viatura: porViatura,
    tendencia_mensal: tendenciaMensal
  });
}));



  return router;
}

module.exports = criarRouterRelatorios;
