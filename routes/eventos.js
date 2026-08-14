const express = require('express');

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
  registrarAuditoria,
}) {
  const router = express.Router();

  async function validarTipoNovo(nome) {
    const { data, error } = await supabase.from('tipos_evento').select('id,nome,ativo');
    if (error) throw new Error(`Falha ao consultar Tipos de Evento: ${error.message}`);
    const normalizado = String(nome || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
    return (data || []).find((tipo) => tipo.ativo && String(tipo.nome).trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR') === normalizado) || null;
  }

  router.get('/eventos', asyncRoute(async (_req, res) => {
    res.json(await readTabela('eventos'));
  }));

  router.post('/eventos', exigirP3, asyncRoute(async (req, res) => {
    const v = validarCampos(req.body, {
      nome_evento: { obrigatorio: true, tipo: 'string', max: 200, label: 'Nome do Evento' },
      tipo_evento: { obrigatorio: true, tipo: 'string', max: 100, label: 'Tipo de Evento' },
      local_itinerario: { obrigatorio: true, tipo: 'string', max: 300, label: 'Local/Itinerário' },
      endereco: { obrigatorio: false, tipo: 'string', max: 300, padrao: '', label: 'Endereço' },
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
    const tipoAtivo = await validarTipoNovo(v.valores.tipo_evento);
    if (!tipoAtivo) return res.status(400).json({ error: 'Selecione um Tipo de Evento ativo.' });

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
      endereco: v.valores.endereco,
      bairro: v.valores.bairro
    };

    await writeRow('eventos', novoEvento);
    await registrarAuditoria({ req, acao: 'criou', entidade: 'Evento', entidadeId: novoEvento.id, descricao: `Cadastrou o evento “${novoEvento.nome_evento}”.` });
    res.status(201).json(novoEvento);
  }));

  router.put('/eventos/:id', exigirP3, asyncRoute(async (req, res) => {
    const eventoAtual = await buscarRow('eventos', req.params.id);
    if (!eventoAtual) return res.status(404).json({ error: 'Evento não encontrado' });
    const antes = { ...eventoAtual };

    const v = validarCampos(req.body, {
      nome_evento: { obrigatorio: false, tipo: 'string', max: 200, label: 'Nome do Evento' },
      tipo_evento: { obrigatorio: false, tipo: 'string', max: 100, label: 'Tipo de Evento' },
      local_itinerario: { obrigatorio: false, tipo: 'string', max: 300, label: 'Local/Itinerário' },
      endereco: { obrigatorio: false, tipo: 'string', max: 300, label: 'Endereço' },
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
    if (v.valores.tipo_evento !== undefined && v.valores.tipo_evento !== eventoAtual.tipo_evento) {
      const tipoAtivo = await validarTipoNovo(v.valores.tipo_evento);
      if (!tipoAtivo) return res.status(400).json({ error: 'Selecione um Tipo de Evento ativo.' });
    }

    const eventoAtualizado = { ...eventoAtual, ...v.valores };
    await writeRow('eventos', eventoAtualizado);
    await registrarAuditoria({ req, acao: 'alterou', entidade: 'Evento', entidadeId: eventoAtualizado.id, descricao: `Alterou o evento “${eventoAtualizado.nome_evento}”.`, antes, depois: eventoAtualizado, campos: ['nome_evento', 'tipo_evento', 'data_inicio', 'data_termino', 'horario_inicio', 'local_itinerario', 'endereco', 'bairro', 'demandante', 'num_oficio', 'num_os_manual', 'num_sei'] });
    res.json(eventoAtualizado);
  }));

  router.delete('/eventos/:id', exigirP3, asyncRoute(async (req, res) => {
    await deleteRow('eventos', req.params.id);
    const { error: erroAlocacoes } = await supabase.from('alocacoes').delete().eq('evento_id', req.params.id);
    if (erroAlocacoes) throw new Error(`Falha ao limpar "alocacoes" no Supabase: ${erroAlocacoes.message}`);
    await registrarAuditoria({ req, acao: 'excluiu', entidade: 'Evento', entidadeId: req.params.id, descricao: 'Excluiu evento e alocações relacionadas.' });
    res.json({ message: 'Evento e registros relacionados excluídos' });
  }));

  return router;
};
