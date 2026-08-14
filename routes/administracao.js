const crypto = require('crypto');
const express = require('express');

function criarRouterAdministracao({
  asyncRoute,
  exigirP3,
  readDB,
  readTabela,
  supabase,
  usuarioPublico,
}) {
  const router = express.Router();

// -------------------------------------------------------------
// ROTA DE BACKUP (P3) — exporta todas as tabelas de TABELAS + config num único JSON.
// Não inclui "auditoria": é log operacional, não dado de negócio a restaurar.
// SEGURANÇA: usuarios sai sem o campo `senha` (hash scrypt) — via usuarioPublico() — e a
// tabela `sessoes` é omitida por inteiro (tokens de sessão ativos, válidos por 12h; não são
// dado de negócio restaurável e não devem trafegar num export baixável).
// -------------------------------------------------------------
router.get('/backup', exigirP3, asyncRoute(async (req, res) => {
  const db = await readDB();
  const { sessoes, ...backup } = db;
  backup.usuarios = (db.usuarios || []).map(usuarioPublico);
  // Estas tabelas ficam FORA de TABELAS de propósito (senão toda rota
  // agregadora baixaria dados que não usa). No backup, porém, os cadastros e o
  // histórico restaurável dos padrões precisam entrar explicitamente.
  const [avisos, emissoes, tiposEvento, gruposModelo, versoesPadrao] = await Promise.all([
    readTabela('avisos'),
    readTabela('emissoes_cartao'),
    readTabela('tipos_evento'),
    readTabela('cartao_grupos_modelo'),
    readTabela('cartao_padrao_versoes'),
  ]);
  backup.avisos = avisos;
  backup.emissoes_cartao = emissoes;
  backup.tipos_evento = tiposEvento;
  backup.cartao_grupos_modelo = gruposModelo;
  backup.cartao_padrao_versoes = versoesPadrao;
  res.json(backup);
}));


// -------------------------------------------------------------
// ARQUIVAMENTO DE DADOS ANTIGOS (P3) — Fase 6, item 2
// -------------------------------------------------------------
// O banco só cresce: 463 eventos e as escalas de cada operação ficam para sempre.
// Este fluxo permite à P3 recortar o histórico antigo DEPOIS de baixá-lo.
//
// QUAIS TABELAS ENTRAM, e por quê:
//   eventos, operacoes  -> histórico que cresce e tem data própria.
//   escalas, alocacoes  -> dependem das duas acima; sozinhas virariam órfãs.
// QUAIS NÃO ENTRAM:
//   cartoes             -> é o roteiro operacional CUMPRIDO, documento do serviço
//                          de cada dia. Some do sistema só por decisão explícita,
//                          que este fluxo genérico não deve tomar.
//   pessoal, viaturas, bairros_coordenadas, usuarios, config, avisos
//                       -> cadastro, não histórico: não crescem com o tempo e
//                          apagá-los quebraria registros que continuam vivos.
const TABELAS_ARQUIVAVEIS = ['eventos', 'operacoes', 'escalas', 'alocacoes'];

/** Prova de que o export foi gerado no servidor para AQUELE recorte. Não é
 *  segredo de segurança — é trava de fluxo: sem ele, `executar` recusa, e é o
 *  que impede apagar sem ter baixado. Depende do service_role, que só o servidor
 *  conhece, então o cliente não consegue forjar. */
function comprovanteArquivamento(ate, contagens) {
  const corpo = JSON.stringify({ ate, contagens });
  return crypto.createHmac('sha256', String(process.env.SUPABASE_SERVICE_ROLE_KEY || "sgo-arquivamento")).update(corpo).digest('hex');
}

/** O que seria apagado num recorte "tudo ANTES de `ate`". Devolve os registros e
 *  as contagens; quem chama decide se exporta ou só mostra a prévia. */
async function levantarArquivaveis(ate) {
  const [eventos, operacoes] = await Promise.all([
    readTabela('eventos'), readTabela('operacoes'),
  ]);
  const eventosAntigos = eventos.filter(e => e.data_inicio && e.data_inicio < ate);
  const operacoesAntigas = operacoes.filter(o => o.data_inicio && o.data_inicio < ate);

  const idsEventos = new Set(eventosAntigos.map(e => e.id));
  const idsOperacoes = new Set(operacoesAntigas.map(o => o.id));

  const [escalas, alocacoes] = await Promise.all([
    readTabela('escalas'), readTabela('alocacoes'),
  ]);
  // Dependentes entram pelo VÍNCULO, não por data própria: uma escala sem data
  // preenchida (nullable, ver migration 004) pertence à operação mesmo assim.
  const escalasAntigas = escalas.filter(e => idsOperacoes.has(e.operacao_id));
  const alocacoesAntigas = alocacoes.filter(a =>
    (a.evento_id && idsEventos.has(a.evento_id)) || (a.operacao_id && idsOperacoes.has(a.operacao_id)));

  const dados = {
    eventos: eventosAntigos,
    operacoes: operacoesAntigas,
    escalas: escalasAntigas,
    alocacoes: alocacoesAntigas,
  };
  const contagens = Object.fromEntries(TABELAS_ARQUIVAVEIS.map(t => [t, dados[t].length]));
  return { dados, contagens };
}

function validarDataArquivamento(ate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ate || ''))) {
    return 'Informe a data de corte no formato AAAA-MM-DD.';
  }
  // Guarda contra o dedo escorregar e levar o histórico inteiro junto: só faz
  // sentido arquivar o que já passou, e com folga.
  const limite = new Date();
  limite.setMonth(limite.getMonth() - 6);
  if (new Date(`${ate}T00:00:00Z`) > limite) {
    return 'A data de corte precisa ser anterior a 6 meses atrás — arquivamento é para histórico consolidado.';
  }
  return null;
}

// Prévia: quanto seria apagado. Não gera comprovante — é só para a tela mostrar.
router.get('/arquivamento/previa', exigirP3, asyncRoute(async (req, res) => {
  const ate = String(req.query.ate || '');
  const erro = validarDataArquivamento(ate);
  if (erro) return res.status(400).json({ error: erro });

  const { contagens } = await levantarArquivaveis(ate);
  res.json({ ate, contagens, total: Object.values(contagens).reduce((a, b) => a + b, 0) });
}));

// Export: devolve os registros e o comprovante que `executar` vai exigir.
router.post('/arquivamento/exportar', exigirP3, asyncRoute(async (req, res) => {
  const ate = String(req.body.ate || '');
  const erro = validarDataArquivamento(ate);
  if (erro) return res.status(400).json({ error: erro });

  const { dados, contagens } = await levantarArquivaveis(ate);
  res.json({
    gerado_em: new Date().toISOString(),
    gerado_por: req.user.usuario,
    corte: ate,
    contagens,
    comprovante: comprovanteArquivamento(ate, contagens),
    dados
  });
}));

// Execução: só aceita com o comprovante do export, e só se NADA mudou desde ele.
router.post('/arquivamento/executar', exigirP3, asyncRoute(async (req, res) => {
  const ate = String(req.body.ate || '');
  const erro = validarDataArquivamento(ate);
  if (erro) return res.status(400).json({ error: erro });

  const { dados, contagens } = await levantarArquivaveis(ate);
  const esperado = comprovanteArquivamento(ate, contagens);
  if (String(req.body.comprovante || '') !== esperado) {
    // Ou não houve export, ou o banco mudou depois dele (alguém cadastrou algo no
    // meio). Nos dois casos, apagar seria apagar o que ninguém baixou.
    return res.status(409).json({
      error: 'O arquivo exportado não corresponde ao estado atual do banco. Exporte novamente antes de arquivar.'
    });
  }

  const total = Object.values(contagens).reduce((a, b) => a + b, 0);
  if (total === 0) return res.status(400).json({ error: 'Não há registros anteriores a essa data para arquivar.' });

  // Ordem importa: dependentes primeiro, senão sobram escalas/alocações órfãs
  // apontando para operações e eventos que não existem mais.
  const apagados = {};
  for (const tabela of ['escalas', 'alocacoes', 'eventos', 'operacoes']) {
    const ids = dados[tabela].map(r => r.id);
    apagados[tabela] = 0;
    // Em lotes: uma lista de centenas de ids num `.in()` só estoura o limite de
    // tamanho da URL do PostgREST.
    for (let i = 0; i < ids.length; i += 100) {
      const lote = ids.slice(i, i + 100);
      const { error } = await supabase.from(tabela).delete().in('id', lote);
      if (error) throw new Error(`Falha ao arquivar ${tabela}: ${error.message}`);
      apagados[tabela] += lote.length;
    }
  }

  console.log(`Arquivamento por ${req.user.usuario}: corte ${ate},`, apagados);
  res.json({ message: 'Dados antigos arquivados.', corte: ate, apagados });
}));

  return router;
}

module.exports = criarRouterAdministracao;
