const express = require('express');

const PRIORIDADES_AVISO = ['informativa', 'atencao', 'alta', 'critica'];
const VIGENCIA_PADRAO_DIAS = 30;
const MAX_AVISOS_POR_CARTAO = 4;

function somarDiasISO(dataISO, dias) {
  const [ano, mes, dia] = String(dataISO).split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

function hojeISO() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function avisoVigente(aviso, hoje = hojeISO()) {
  if (!aviso.ativo) return false;
  if (aviso.data_inicio && aviso.data_inicio > hoje) return false;
  if (aviso.permanente) return true;
  if (aviso.data_fim && aviso.data_fim < hoje) return false;
  return true;
}

function criarRouterAvisos({
  COMPANHIAS_VALIDAS,
  asyncRoute,
  buscarRow,
  deleteRow,
  exigirP3,
  generateId,
  readTabela,
  validarCampos,
  writeRow,
}) {
  const router = express.Router();

  function validarCorpoAviso(body) {
    const v = validarCampos(body, {
      texto: { obrigatorio: true, tipo: 'string', max: 240, label: 'Texto do alerta' },
      categoria: { obrigatorio: false, tipo: 'string', max: 60, padrao: '', label: 'Categoria' },
      prioridade: { obrigatorio: false, tipo: 'string', valores: PRIORIDADES_AVISO, padrao: 'informativa', label: 'Prioridade' },
      bairro_id: { obrigatorio: false, tipo: 'string', max: 60, padrao: '', label: 'Bairro' },
      companhia: { obrigatorio: false, tipo: 'string', valores: COMPANHIAS_VALIDAS, padrao: '', label: 'Companhia' },
      data_inicio: { obrigatorio: false, tipo: 'string', max: 10, padrao: '', label: 'Início da vigência' },
      data_fim: { obrigatorio: false, tipo: 'string', max: 10, padrao: '', label: 'Fim da vigência' }
    });
    if (!v.ok) return v;
    if (!v.valores.bairro_id && !v.valores.companhia) {
      return { ok: false, erro: 'O alerta precisa ter ao menos um escopo: bairro, Companhia, ou os dois.' };
    }
    return v;
  }

  router.get('/avisos', asyncRoute(async (req, res) => {
    let avisos = await readTabela('avisos');
    if (req.query.vigentes === '1') avisos = avisos.filter(a => avisoVigente(a));
    if (req.query.bairro_id) avisos = avisos.filter(a => a.bairro_id === req.query.bairro_id);
    if (req.query.companhia) avisos = avisos.filter(a => a.companhia === req.query.companhia);

    avisos.sort((a, b) => {
      const peso = PRIORIDADES_AVISO.indexOf(b.prioridade) - PRIORIDADES_AVISO.indexOf(a.prioridade);
      if (peso !== 0) return peso;
      return String(b.criado_em || '').localeCompare(String(a.criado_em || ''));
    });
    res.json(avisos);
  }));

  router.post('/avisos', exigirP3, asyncRoute(async (req, res) => {
    const v = validarCorpoAviso(req.body);
    if (!v.ok) return res.status(400).json({ error: v.erro });
    const permanente = !!req.body.permanente;
    const dataInicio = v.valores.data_inicio || hojeISO();
    const novoAviso = {
      id: generateId('avs'),
      bairro_id: v.valores.bairro_id || null,
      companhia: v.valores.companhia || null,
      categoria: v.valores.categoria,
      prioridade: v.valores.prioridade,
      texto: v.valores.texto,
      data_inicio: dataInicio,
      data_fim: permanente ? null : (v.valores.data_fim || somarDiasISO(dataInicio, VIGENCIA_PADRAO_DIAS)),
      permanente,
      ativo: true,
      criado_por: req.user ? req.user.usuario : null,
      criado_em: new Date().toISOString(),
      atualizado_em: null
    };
    await writeRow('avisos', novoAviso);
    res.status(201).json(novoAviso);
  }));

  router.put('/avisos/:id', exigirP3, asyncRoute(async (req, res) => {
    const aviso = await buscarRow('avisos', req.params.id);
    if (!aviso) return res.status(404).json({ error: 'Alerta não encontrado.' });
    const v = validarCorpoAviso({ ...aviso, ...req.body });
    if (!v.ok) return res.status(400).json({ error: v.erro });

    aviso.texto = v.valores.texto;
    aviso.categoria = v.valores.categoria;
    aviso.prioridade = v.valores.prioridade;
    aviso.bairro_id = v.valores.bairro_id || null;
    aviso.companhia = v.valores.companhia || null;
    if (req.body.permanente !== undefined) aviso.permanente = !!req.body.permanente;
    if (req.body.ativo !== undefined) aviso.ativo = !!req.body.ativo;
    if (v.valores.data_inicio) aviso.data_inicio = v.valores.data_inicio;
    aviso.data_fim = aviso.permanente ? null : (v.valores.data_fim || aviso.data_fim || null);
    aviso.atualizado_em = new Date().toISOString();
    await writeRow('avisos', aviso);
    res.json(aviso);
  }));

  router.post('/avisos/:id/renovar', exigirP3, asyncRoute(async (req, res) => {
    const aviso = await buscarRow('avisos', req.params.id);
    if (!aviso) return res.status(404).json({ error: 'Alerta não encontrado.' });
    const dias = parseInt(req.body.dias, 10) || VIGENCIA_PADRAO_DIAS;
    aviso.ativo = true;
    aviso.permanente = false;
    aviso.data_fim = somarDiasISO(hojeISO(), dias);
    aviso.atualizado_em = new Date().toISOString();
    await writeRow('avisos', aviso);
    res.json(aviso);
  }));

  router.delete('/avisos/:id', exigirP3, asyncRoute(async (req, res) => {
    const aviso = await buscarRow('avisos', req.params.id);
    if (!aviso) return res.status(404).json({ error: 'Alerta não encontrado.' });
    await deleteRow('avisos', req.params.id);
    res.json({ message: 'Alerta excluído.' });
  }));

  return router;
}

module.exports = { criarRouterAvisos, MAX_AVISOS_POR_CARTAO };
