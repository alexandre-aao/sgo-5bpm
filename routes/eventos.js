const express = require('express');

const TIPOS_EVENTO = ['Show', 'Futebol', 'Ato Público', 'Religioso', 'Cultural', 'Evento Junino', 'Missão Avulsa', 'Outros'];

module.exports = function criarRouterEventos({
  asyncRoute,
  buscarRow,
  deleteRow,
  exigirP3,
  generateId,
  readTabela,
  supabase,
  validarCampos,
  writeRow,
}) {
  const router = express.Router();

  router.get('/eventos', asyncRoute(async (_req, res) => {
    res.json(await readTabela('eventos'));
  }));

  router.post('/eventos', exigirP3, asyncRoute(async (req, res) => {
    const v = validarCampos(req.body, {
      nome_evento: { obrigatorio: true, tipo: 'string', max: 200, label: 'Nome do Evento' },
      tipo_evento: { obrigatorio: true, tipo: 'string', max: 50, valores: TIPOS_EVENTO, label: 'Tipo de Evento' },
      local_itinerario: { obrigatorio: true, tipo: 'string', max: 300, label: 'Local/Itinerário' },
      data_inicio: { obrigatorio: true, tipo: 'string', max: 10, label: 'Data de Início' },
      data_termino: { obrigatorio: false, tipo: 'string', max: 10, label: 'Data de Término' },
      horario_inicio: { obrigatorio: false, tipo: 'string', max: 5, padrao: '', label: 'Horário de Início' },
      num_oficio: { obrigatorio: false, tipo: 'string', max: 100, padrao: '', label: 'Número do Ofício' },
      num_os_manual: { obrigatorio: false, tipo: 'string', max: 100, padrao: '', label: 'Número da OS' },
      num_sei: { obrigatorio: false, tipo: 'string', max: 100, padrao: '', label: 'Número SEI' },
      demandante: { obrigatorio: false, tipo: 'string', max: 200, padrao: 'Não Informado', label: 'Demandante' },
      bairro: { obrigatorio: false, tipo: 'string', max: 100, padrao: '', label: 'Bairro' }
    });
    if (!v.ok) return res.status(400).json({ error: v.erro });

    const novoEvento = {
      id: generateId('evt'),
      num_oficio: v.valores.num_oficio,
      num_os_manual: v.valores.num_os_manual,
      num_sei: v.valores.num_sei,
      nome_evento: v.valores.nome_evento,
      tipo_evento: v.valores.tipo_evento,
      demandante: v.valores.demandante,
      data_inicio: v.valores.data_inicio,
      data_termino: v.valores.data_termino || v.valores.data_inicio,
      horario_inicio: v.valores.horario_inicio,
      local_itinerario: v.valores.local_itinerario,
      bairro: v.valores.bairro
    };

    await writeRow('eventos', novoEvento);
    res.status(201).json(novoEvento);
  }));

  router.put('/eventos/:id', exigirP3, asyncRoute(async (req, res) => {
    const eventoAtual = await buscarRow('eventos', req.params.id);
    if (!eventoAtual) return res.status(404).json({ error: 'Evento não encontrado' });

    const v = validarCampos(req.body, {
      nome_evento: { obrigatorio: false, tipo: 'string', max: 200, label: 'Nome do Evento' },
      tipo_evento: { obrigatorio: false, tipo: 'string', max: 50, valores: TIPOS_EVENTO, label: 'Tipo de Evento' },
      local_itinerario: { obrigatorio: false, tipo: 'string', max: 300, label: 'Local/Itinerário' },
      data_inicio: { obrigatorio: false, tipo: 'string', max: 10, label: 'Data de Início' },
      data_termino: { obrigatorio: false, tipo: 'string', max: 10, label: 'Data de Término' },
      horario_inicio: { obrigatorio: false, tipo: 'string', max: 5, label: 'Horário de Início' },
      num_oficio: { obrigatorio: false, tipo: 'string', max: 100, label: 'Número do Ofício' },
      num_os_manual: { obrigatorio: false, tipo: 'string', max: 100, label: 'Número da OS' },
      num_sei: { obrigatorio: false, tipo: 'string', max: 100, label: 'Número SEI' },
      demandante: { obrigatorio: false, tipo: 'string', max: 200, label: 'Demandante' },
      bairro: { obrigatorio: false, tipo: 'string', max: 100, label: 'Bairro' }
    });
    if (!v.ok) return res.status(400).json({ error: v.erro });

    const eventoAtualizado = { ...eventoAtual, ...v.valores };
    await writeRow('eventos', eventoAtualizado);
    res.json(eventoAtualizado);
  }));

  router.delete('/eventos/:id', exigirP3, asyncRoute(async (req, res) => {
    await deleteRow('eventos', req.params.id);
    const { error: erroAlocacoes } = await supabase.from('alocacoes').delete().eq('evento_id', req.params.id);
    if (erroAlocacoes) throw new Error(`Falha ao limpar "alocacoes" no Supabase: ${erroAlocacoes.message}`);
    res.json({ message: 'Evento e registros relacionados excluídos' });
  }));

  return router;
};
