const crypto = require('crypto');
const express = require('express');

module.exports = function criarRouterCartoes({
  CATEGORIAS_VIATURA,
  COMPANHIAS_VIATURA,
  MAX_AVISOS_POR_CARTAO,
  asyncRoute,
  buscarCartaoPorId,
  buscarCartoesFiltrados,
  buscarPadraoAtivo,
  deleteRowSeVersao,
  dentroDaJanelaExclusaoAdjunto,
  exigirEdicaoCartao,
  exigirP3,
  formatarDataBr,
  generateId,
  ordenarPorTurno,
  proximoDiaISO,
  readTabela,
  supabase,
  validarCampos,
  writeRow,
  writeRowSeVersao,
  registrarAuditoria,
}) {
  const router = express.Router();
  const CABECALHO_VERSAO_CARTAO = 'x-cartao-atualizado-em';
  const CODIGO_CARTAO_DESATUALIZADO = 'CARTAO_DESATUALIZADO';

  function versaoCarregada(req) {
    return String(req.get(CABECALHO_VERSAO_CARTAO) || '').trim();
  }

  function exigirVersaoCarregada(req, res) {
    const versao = versaoCarregada(req);
    if (versao) return versao;
    res.status(428).json({
      code: 'VERSAO_CARTAO_OBRIGATORIA',
      error: 'Recarregue o Cartão Programa antes de salvar. A versão carregada não foi informada.'
    });
    return null;
  }

  function responderConflito(res) {
    return res.status(409).json({
      code: CODIGO_CARTAO_DESATUALIZADO,
      error: 'Este Cartão Programa foi alterado por outro usuário. Suas alterações não foram salvas; recarregue o cartão para continuar.'
    });
  }

  function copiarSnapshot(cartao) {
    return JSON.parse(JSON.stringify(cartao));
  }

  async function criarVersaoPadrao(cartao, req, versaoInformada = null) {
    const { data: ultima, error: erroUltima } = await supabase
      .from('cartao_padrao_versoes')
      .select('versao')
      .eq('cartao_id', cartao.id)
      .order('versao', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (erroUltima) throw new Error(erroUltima.message);
    const versao = versaoInformada || (ultima?.versao || 0) + 1;
    const snapshot = copiarSnapshot(cartao);
    const { data, error } = await supabase.from('cartao_padrao_versoes').insert({
      id: generateId('cpvrs'),
      cartao_id: cartao.id,
      versao,
      criado_por: req.user.usuario,
      snapshot,
    }).select('*').single();
    if (error) throw new Error(error.message);

    const { data: antigas, error: erroAntigas } = await supabase
      .from('cartao_padrao_versoes')
      .select('id')
      .eq('cartao_id', cartao.id)
      .order('versao', { ascending: false });
    if (erroAntigas) throw new Error(erroAntigas.message);
    const idsParaExcluir = (antigas || []).slice(5).map((item) => item.id);
    if (idsParaExcluir.length) {
      const { error: erroExcluir } = await supabase.from('cartao_padrao_versoes').delete().in('id', idsParaExcluir);
      if (erroExcluir) throw new Error(erroExcluir.message);
    }
    return data || { versao, snapshot };
  }

  async function prepararRascunhoTemplate(cartao, req) {
    if (!cartao.is_template) return;
    const atual = await buscarCartaoPorId(cartao.id);
    if (atual?.estado_template !== 'publicado') return;
    // A publicação já criou o snapshot correspondente a `versao_publicada`.
    // Só criamos um snapshot de entrada para templates antigos que foram
    // migrados sem histórico.
    if (!atual.versao_publicada) {
      const versaoInicial = await criarVersaoPadrao(atual, req);
      cartao.versao_publicada = versaoInicial.versao;
    }
    cartao.estado_template = 'rascunho';
    cartao.publicado_em = null;
    cartao.publicado_por = null;
  }

  async function marcarRascunhoSeDisponivel(id) {
    const { error } = await supabase.from('cartoes').update({ estado_template: 'rascunho' }).eq('id', id);
    // O campo entra pela migration 014. Até ela ser aplicada, o cartão legado
    // continua funcionando com estado implícito (ativo/inativo).
    if (error && !/estado_template|column/i.test(error.message || '')) {
      console.error('Falha ao marcar cartão padrão como rascunho:', error.message);
    }
  }

  async function gravarCartaoSeAtual(req, res, cartao) {
    const versao = exigirVersaoCarregada(req, res);
    if (!versao) return null;
    await prepararRascunhoTemplate(cartao, req);
    const atualizado = await writeRowSeVersao('cartoes', cartao, versao);
    if (!atualizado) responderConflito(res);
    return atualizado;
  }

  // -------------------------------------------------------------
  // ROTAS DO CARTÃO PROGRAMA (PATRULHAMENTO DIÁRIO POR VIATURA)
  // -------------------------------------------------------------

  // Número sequencial do Cartão Programa (000123/2026), atribuído na CRIAÇÃO do
  // cartão — nunca na geração do PDF, pra o número não mudar entre uma versão e
  // outra do mesmo cartão. A corrida é resolvida no banco pela função
  // proximo_numero_cartao (INSERT ... ON CONFLICT DO UPDATE serializa na linha do
  // ano); ver migrations/001_cartao_avisos.sql.
  // Falha na numeração NÃO impede criar o cartão: o operador precisa do roteiro
  // muito mais do que do número, e um cartão sem número é recuperável (o índice
  // único ignora numero null). Só registra no log.
  async function proximoNumeroCartao(dataCartao) {
    const ano = parseInt(String(dataCartao).slice(0, 4), 10);
    if (!Number.isFinite(ano)) return { ano: null, numero: null };
    try {
      const { data, error } = await supabase.rpc('proximo_numero_cartao', { p_ano: ano });
      if (error) throw new Error(error.message);
      return { ano, numero: data };
    } catch (erro) {
      console.error(`Falha ao numerar o Cartão Programa de ${dataCartao}:`, erro.message);
      return { ano, numero: null };
    }
  }

  // Campos de controle de envio/versão que vivem em CADA viatura do JSONB (não no
  // cartão): o PDF é gerado e mandado por viatura, então status, versão e avisos
  // selecionados são por viatura. Ver migrations/001_cartao_avisos.sql.
  function camposEnvioIniciais() {
    return {
      avisos_ids: [],
      comandante_pessoal_id: '',
      comandante_exibicao: '',
      bairro_id: '',
      versao: 1,
      status_envio: 'pendente',
      gerado_em: null,
      // Retrato do conteúdo no momento em que o PDF foi gerado — é a referência
      // para saber se o que o comandante recebeu ainda vale.
      hash_conteudo: null
    };
  }

  // Só o que SAI NO DOCUMENTO entra no hash. Mudar `observacao` ou `setor` (que
  // não são impressos) não invalida um cartão já enviado; mudar horário, local,
  // comandante ou o Delta 07 invalida.
  function hashConteudoCartaoViatura(cartao, viatura) {
    const partes = [
      cartao.numero, cartao.ano, cartao.data,
      cartao.fiscal, cartao.fiscal_pessoal_id, cartao.adjunto, cartao.adjunto_pessoal_id,
      cartao.delta07_viatura,
      viatura.prefixo, viatura.companhia, viatura.categoria, viatura.setor,
      viatura.comandante, viatura.comandante_pessoal_id, viatura.composicao,
      viatura.observacao, viatura.bairro_id, (viatura.bairros_ids || []).join('|'),
      (viatura.avisos_ids || []).join('|'),
      (viatura.itens || []).map(i => `${i.inicio}~${i.fim}~${i.local}~${i.atividade}`).join('|')
    ];
    return crypto.createHash('sha1').update(partes.map(p => String(p ?? '')).join('§')).digest('hex');
  }

  /**
   * Reavalia o status de envio das viaturas depois de QUALQUER escrita no cartão.
   * Uma viatura que já foi gerada ou enviada e cujo conteúdo impresso mudou volta
   * para "alterado" e sobe de versão — é o gatilho do "_v2" e do reenvio.
   *
   * A versão sobe só na TRANSIÇÃO (gerado|enviado -> alterado): sem isso, cada
   * ajuste seguinte viraria v3, v4, v5 antes mesmo de o cartão ser reenviado.
   * Muta o objeto `cartao` recebido; quem chama grava com a pré-condição de versão.
   */
  function reavaliarStatusEnvio(cartao) {
    (cartao.viaturas || []).forEach(viatura => {
      if (viatura.status_envio !== 'gerado' && viatura.status_envio !== 'enviado') return;
      if (!viatura.hash_conteudo) return;
      if (hashConteudoCartaoViatura(cartao, viatura) === viatura.hash_conteudo) return;

      viatura.status_envio = 'alterado';
      viatura.versao = (viatura.versao || 1) + 1;
    });
  }

  // Lista resumida (filtrável por data exata, ou por mês/ano para o histórico) — nunca inclui templates
  router.get('/cartoes', asyncRoute(async (req, res) => {
    const cartoes = await buscarCartoesFiltrados({ data: req.query.data, ano: req.query.ano, mes: req.query.mes });

    const resumo = cartoes
      .sort((a, b) => b.data.localeCompare(a.data))
      .map(c => ({
        id: c.id,
        data: c.data,
        fiscal: c.fiscal,
        adjunto: c.adjunto,
        qtd_viaturas: (c.viaturas || []).length
      }));

    res.json(resumo);
  }));

  // Lista de templates de Cartão Programa, com filtro opcional por período/quantidade de viaturas
  // IMPORTANTE: precisa vir antes de /api/cartoes/:id para o Express não tratar "templates" como :id
  router.get('/cartoes/templates', exigirP3, asyncRoute(async (req, res) => {
    let templates = await readTabela('cartoes', { is_template: true });

    if (req.query.tipo_periodo) {
      templates = templates.filter(c => c.tipo_periodo === req.query.tipo_periodo);
    }
    if (req.query.qtd_viaturas_base) {
      const qtd = parseInt(req.query.qtd_viaturas_base, 10);
      templates = templates.filter(c => c.qtd_viaturas_base === qtd);
    }

    res.json(templates.map(c => ({
      id: c.id,
      nome_template: c.nome_template,
      tipo_periodo: c.tipo_periodo,
      qtd_viaturas_base: c.qtd_viaturas_base,
      qtd_viaturas: (c.viaturas || []).length,
      padrao_ativo: !!c.padrao_ativo,
      estado_template: c.estado_template || (c.padrao_ativo ? 'publicado' : 'rascunho'),
      versao_publicada: c.versao_publicada || null,
      atualizado_em: c.atualizado_em
    })));
  }));

  // Clona um template inteiro (viaturas + itens) como NOVO template. Não mexe no
  // padrão ativo: a cópia nasce inativa e o padrão em vigor continua o mesmo.
  // Registrada antes de /api/cartoes/:id pela mesma razão de /templates acima —
  // aqui o caminho tem 3 segmentos e não colidiria, mas manter as rotas literais
  // juntas e à frente é o que evita a armadilha quando alguém cria a próxima.
  router.post('/cartoes/templates/:id/duplicar', exigirP3, asyncRoute(async (req, res) => {
    const origem = await buscarCartaoPorId(req.params.id);
    if (!origem || !origem.is_template) {
      return res.status(404).json({ error: 'Cartão padrão não encontrado.' });
    }

    const nomeInformado = String(req.body.nome_template || '').trim();
    const nome = (nomeInformado || `Cópia de ${origem.nome_template || 'cartão padrão'}`).slice(0, 120);

    const copia = {
      id: generateId('cp'),
      data: null,
      fiscal: '',
      adjunto: '',
      oficial_sobreaviso: '',
      is_template: true,
      nome_template: nome,
      tipo_periodo: origem.tipo_periodo,
      qtd_viaturas_base: origem.qtd_viaturas_base,
      // Não é um cartão do dia clonado de um padrão: é outro padrão. `origem_template_id`
      // rastreia "de qual padrão veio o cartão do DIA" e ficaria mentindo aqui.
      origem_template_id: null,
      padrao_ativo: false,
      // A estrutura (prefixo/setor/companhia/categoria/observação/bairro) é o que se
      // reaproveita; comandante e controle de envio não pertencem a um padrão.
      viaturas: (origem.viaturas || []).map(v => ({
        id: generateId('cpv'),
        prefixo: v.prefixo,
        setor: v.setor,
        companhia: v.companhia || '',
        categoria: v.categoria || 'Ordinária',
        comandante: '',
        observacao: v.observacao || '',
        ...camposEnvioIniciais(),
        bairro_id: v.bairro_id || '',
        itens: ordenarPorTurno((v.itens || []).map(i => ({
          id: generateId('cpi'),
          inicio: i.inicio,
          fim: i.fim,
          local: i.local,
          atividade: i.atividade
        })))
      }))
    };

    await writeRow('cartoes', copia);
    await marcarRascunhoSeDisponivel(copia.id);
    res.status(201).json(copia);
  }));

  // Histórico curto dos cartões padrão. Mantemos somente as cinco versões mais
  // recentes por padrão para permitir restauração sem transformar a tabela em
  // um espelho infinito do JSONB operacional.
  router.get('/cartoes/:id/versoes', exigirP3, asyncRoute(async (req, res) => {
    const cartao = await buscarCartaoPorId(req.params.id);
    if (!cartao || !cartao.is_template) return res.status(404).json({ error: 'Cartão padrão não encontrado.' });
    const { data, error } = await supabase.from('cartao_padrao_versoes')
      .select('id,cartao_id,versao,criado_em,criado_por,snapshot')
      .eq('cartao_id', cartao.id).order('versao', { ascending: false });
    if (error) throw new Error(error.message);
    res.json(data || []);
  }));

  // Publicação explícita: só o que estiver publicado pode ser usado como fonte
  // de um cartão do dia. O cartão continua editável; a próxima edição o devolve
  // a rascunho e preserva esta fotografia para restauração.
  router.post('/cartoes/:id/publicar', exigirP3, asyncRoute(async (req, res) => {
    const cartao = await buscarCartaoPorId(req.params.id);
    if (!cartao || !cartao.is_template) return res.status(404).json({ error: 'Cartão padrão não encontrado.' });
    const versaoCarregada = exigirVersaoCarregada(req, res);
    if (!versaoCarregada) return;
    // A linha, o snapshot e a retenção das cinco versões são uma única transação
    // no Postgres. Antes, o snapshot era inserido (e versões antigas apagadas)
    // antes do compare-and-swap do cartão; um conflito deixava histórico órfão e
    // podia bloquear definitivamente a próxima publicação.
    const { data: atualizado, error } = await supabase.rpc('publicar_cartao_padrao', {
      p_id: cartao.id,
      p_atualizado_em: versaoCarregada,
      p_usuario: req.user.usuario,
      p_versao_id: generateId('cpvrs'),
    });
    if (error) {
      if (error.code === 'P0001' || String(error.message || '').includes(CODIGO_CARTAO_DESATUALIZADO)) {
        return responderConflito(res);
      }
      throw new Error(`Falha ao publicar cartão padrão: ${error.message}`);
    }
    const publicado = Array.isArray(atualizado) ? atualizado[0] : atualizado;
    if (!publicado) return responderConflito(res);
    await registrarAuditoria({ req, acao: 'publicou', entidade: 'Cartão padrão', entidadeId: cartao.id, descricao: `Publicou o cartão padrão “${cartao.nome_template || cartao.id}” na versão ${publicado.versao_publicada}.` });
    res.json({ ...publicado, snapshot: copiarSnapshot(publicado) });
  }));

  router.post('/cartoes/:id/versoes/:versao/restaurar', exigirP3, asyncRoute(async (req, res) => {
    const cartao = await buscarCartaoPorId(req.params.id);
    if (!cartao || !cartao.is_template) return res.status(404).json({ error: 'Cartão padrão não encontrado.' });
    const versao = Number(req.params.versao);
    if (!Number.isInteger(versao) || versao < 1) return res.status(400).json({ error: 'Versão inválida.' });
    const { data: registro, error } = await supabase.from('cartao_padrao_versoes')
      .select('snapshot').eq('cartao_id', cartao.id).eq('versao', versao).maybeSingle();
    if (error) throw new Error(error.message);
    if (!registro) return res.status(404).json({ error: 'Versão não encontrada.' });
    const versaoCarregada = exigirVersaoCarregada(req, res);
    if (!versaoCarregada) return;
    const restaurado = {
      ...registro.snapshot,
      id: cartao.id,
      data: null,
      is_template: true,
      nome_template: cartao.nome_template,
      estado_template: 'rascunho',
      padrao_ativo: !!cartao.padrao_ativo,
      publicado_em: null,
      publicado_por: null,
    };
    const atualizado = await writeRowSeVersao('cartoes', restaurado, versaoCarregada);
    if (!atualizado) return responderConflito(res);
    await registrarAuditoria({ req, acao: 'restaurou', entidade: 'Cartão padrão', entidadeId: cartao.id, descricao: `Restaurou a versão ${versao} do cartão padrão “${cartao.nome_template || cartao.id}”.` });
    res.json(atualizado);
  }));

  // Biblioteca reutilizável de grupos especiais: aplica uma cópia profunda da
  // configuração ao cartão, sem compartilhar arrays de roteiro entre registros.
  router.post('/cartoes/:id/aplicar-grupo-modelo/:grupoId', exigirEdicaoCartao, asyncRoute(async (req, res) => {
    const cartao = await buscarCartaoPorId(req.params.id);
    if (!cartao) return res.status(404).json({ error: 'Cartão Programa não encontrado.' });
    if (cartao.is_template && req.user.role !== 'P3') return res.status(403).json({ error: 'Apenas o perfil P3 pode editar um cartão padrão.' });
    const { data: grupo, error: erroGrupo } = await supabase.from('cartao_grupos_modelo').select('*').eq('id', req.params.grupoId).eq('ativo', true).maybeSingle();
    if (erroGrupo) throw new Error(erroGrupo.message);
    if (!grupo) return res.status(404).json({ error: 'Grupo de modelo não encontrado ou inativo.' });
    const configuracao = grupo.configuracao && typeof grupo.configuracao === 'object' ? JSON.parse(JSON.stringify(grupo.configuracao)) : {};
    const itens = Array.isArray(configuracao.itens) && configuracao.itens.length
      ? configuracao.itens
      : [{
        inicio: grupo.horario_inicio,
        fim: grupo.horario_fim,
        local: grupo.area || grupo.bairro || grupo.pontos,
        atividade: [grupo.missao || grupo.nome, grupo.pontos ? `Pontos: ${grupo.pontos}` : ''].filter(Boolean).join(' · '),
      }];
    const itensNormalizados = [];
    for (const item of itens) {
      const validado = validarCampos({
        inicio: String(item.inicio || grupo.horario_inicio || ''),
        fim: String(item.fim || grupo.horario_fim || ''),
        local: String(item.local || grupo.area || grupo.bairro || ''),
        atividade: String(item.atividade || grupo.missao || grupo.nome),
      }, {
        inicio: { obrigatorio: true, tipo: 'string', max: 5, label: 'Horário de Início' },
        fim: { obrigatorio: false, tipo: 'string', max: 5, padrao: '', label: 'Horário de Fim' },
        local: { obrigatorio: true, tipo: 'string', max: 150, label: 'Local' },
        atividade: { obrigatorio: true, tipo: 'string', max: 100, label: 'Atividade' },
      });
      if (!validado.ok) return res.status(400).json({ error: `O grupo “${grupo.nome}” contém roteiro inválido: ${validado.erro}` });
      itensNormalizados.push(validado.valores);
    }
    const idsSelecionados = Array.isArray(req.body.viaturas_ids) ? req.body.viaturas_ids : [];
    if (idsSelecionados.length === 0) return res.status(400).json({ error: 'Selecione ao menos uma viatura para aplicar o grupo.' });
    const viaturasCartao = Array.isArray(cartao.viaturas) ? cartao.viaturas : [];
    const viaturasAlvo = viaturasCartao.filter((v) => idsSelecionados.includes(v.id));
    if (!viaturasAlvo.length) return res.status(400).json({ error: 'Selecione ao menos uma viatura para aplicar o grupo.' });
    viaturasAlvo.forEach((viatura) => {
      viatura.itens = ordenarPorTurno(itensNormalizados.map((item) => ({
        id: generateId('cpi'),
        inicio: item.inicio,
        fim: item.fim,
        local: item.local,
        atividade: item.atividade,
      })));
      if (grupo.observacoes && !viatura.observacao) viatura.observacao = grupo.observacoes;
    });
    reavaliarStatusEnvio(cartao);
    const atualizado = await gravarCartaoSeAtual(req, res, cartao);
    if (atualizado) {
      await registrarAuditoria({ req, acao: 'aplicou', entidade: 'Grupo de modelo', entidadeId: grupo.id, descricao: `Aplicou o grupo “${grupo.nome}” ao Cartão Programa ${cartao.data || cartao.nome_template || cartao.id}.` });
      res.json(atualizado);
    }
  }));

  // Transforma o cartão de UM DIA em um novo cartão padrão. O inverso de
  // POST /api/cartoes, que clona o padrão para criar o dia.
  router.post('/cartoes/:id/salvar-como-padrao', exigirP3, asyncRoute(async (req, res) => {
    const origem = await buscarCartaoPorId(req.params.id);
    if (!origem) return res.status(404).json({ error: 'Cartão Programa não encontrado.' });
    if (origem.is_template) {
      return res.status(400).json({ error: 'Este cartão já é um padrão. Use "Duplicar" para criar outro a partir dele.' });
    }

    const nome = String(req.body.nome_template || '').trim();
    if (!nome) return res.status(400).json({ error: 'Informe o nome do novo cartão padrão.' });

    // tipo_periodo é obrigatório no template (o padrão é escolhido por período) e o
    // cartão do dia pode estar sem ele — nesse caso o P3 informa junto.
    const tipoPeriodo = ['semana', 'fim_de_semana'].includes(req.body.tipo_periodo)
      ? req.body.tipo_periodo
      : origem.tipo_periodo;
    if (!['semana', 'fim_de_semana'].includes(tipoPeriodo)) {
      return res.status(400).json({ error: "Informe o tipo de período ('semana' ou 'fim_de_semana')." });
    }

    const qtdViaturas = (origem.viaturas || []).length;
    const novoPadrao = {
      id: generateId('cp'),
      // Tudo que é do DIA é descartado: data, numeração oficial, comandantes
      // escalados e o controle de envio daquele serviço.
      data: null,
      ano: null,
      numero: null,
      fiscal: '',
      adjunto: '',
      oficial_sobreaviso: '',
      fiscal_pessoal_id: '',
      adjunto_pessoal_id: '',
      fiscal_exibicao: '',
      adjunto_exibicao: '',
      delta07_viatura: '',
      is_template: true,
      nome_template: nome.slice(0, 120),
      tipo_periodo: tipoPeriodo,
      qtd_viaturas_base: [5, 6, 7].includes(qtdViaturas) ? qtdViaturas : (origem.qtd_viaturas_base || 5),
      origem_template_id: null,
      // Nasce inativo de propósito: virar padrão em vigor é um segundo ato,
      // explícito, em "Definir como padrão".
      padrao_ativo: false,
      viaturas: (origem.viaturas || []).map(v => ({
        id: generateId('cpv'),
        prefixo: v.prefixo,
        setor: v.setor,
        companhia: v.companhia || '',
        categoria: v.categoria || 'Ordinária',
        comandante: '',
        observacao: v.observacao || '',
        ...camposEnvioIniciais(),
        bairro_id: v.bairro_id || '',
        itens: ordenarPorTurno((v.itens || []).map(i => ({
          id: generateId('cpi'),
          inicio: i.inicio,
          fim: i.fim,
          local: i.local,
          atividade: i.atividade
        })))
      }))
    };

    await writeRow('cartoes', novoPadrao);
    await marcarRascunhoSeDisponivel(novoPadrao.id);
    res.status(201).json(novoPadrao);
  }));

  // Padrão ativo que originaria o cartão de uma data (fonte de todo cartão do dia
  // novo) — precisa vir antes de /api/cartoes/:id pelo mesmo motivo de /templates.
  // `?data=` faz a rota devolver o MESMO padrão que o POST usaria naquele dia, para
  // a tela poder dizer de qual padrão o cartão vai nascer antes do clique.
  router.get('/cartoes/padrao-ativo', asyncRoute(async (req, res) => {
    const padrao = await buscarPadraoAtivo(req.query.data || null);
    if (!padrao) return res.json({ padrao: null });

    res.json({
      padrao: {
        ...padrao,
        viaturas: (padrao.viaturas || []).map(v => ({ ...v, itens: ordenarPorTurno(v.itens || []) }))
      }
    });
  }));

  // Detalhe completo de um cartão (ou template)
  router.get('/cartoes/:id', asyncRoute(async (req, res) => {
    const cartao = await buscarCartaoPorId(req.params.id);
    if (!cartao) return res.status(404).json({ error: 'Cartão Programa não encontrado' });
    if (cartao.is_template && req.user.role !== 'P3') {
      return res.status(403).json({ error: 'Apenas o perfil P3 pode consultar cartões padrão.' });
    }

    // Reordena os itens por turno na leitura — cartões salvos antes desta mudança ainda estão
    // em ordem alfabética simples; isso corrige a exibição sem exigir migração de dados.
    const cartaoOrdenado = {
      ...cartao,
      viaturas: (cartao.viaturas || []).map(v => ({ ...v, itens: ordenarPorTurno(v.itens || []) }))
    };
    res.json(cartaoOrdenado);
  }));

  // Criar o cartão do dia (sempre a partir do padrão ativo — ver ativar_cartao_padrao),
  // ou criar um TEMPLATE nomeado (is_template=true, exclusivo do P3, sem data)
  router.post('/cartoes', asyncRoute(async (req, res) => {
    if (req.body.is_template) {
      if (!req.user || req.user.role !== 'P3') {
        return res.status(403).json({ error: 'Apenas o perfil P3 tem permissão para criar templates.' });
      }
      const { nome_template, tipo_periodo, qtd_viaturas_base } = req.body;
      if (!nome_template) {
        return res.status(400).json({ error: 'O nome do template é obrigatório.' });
      }
      if (!['semana', 'fim_de_semana'].includes(tipo_periodo)) {
        return res.status(400).json({ error: "tipo_periodo deve ser 'semana' ou 'fim_de_semana'." });
      }
      if (![5, 6, 7].includes(parseInt(qtd_viaturas_base, 10))) {
        return res.status(400).json({ error: 'qtd_viaturas_base deve ser 5, 6 ou 7.' });
      }

      const novoTemplate = {
        id: generateId('cp'),
        data: null,
        fiscal: '',
        adjunto: '',
        oficial_sobreaviso: '',
        is_template: true,
        nome_template,
        tipo_periodo,
        qtd_viaturas_base: parseInt(qtd_viaturas_base, 10),
        origem_template_id: null,
        viaturas: [],
        padrao_ativo: false
      };
      await writeRow('cartoes', novoTemplate);
      await marcarRascunhoSeDisponivel(novoTemplate.id);
      return res.status(201).json(novoTemplate);
    }

    const dataCartao = req.body.data;
    if (!dataCartao) {
      return res.status(400).json({ error: 'A data do Cartão Programa é obrigatória.' });
    }

    // SELECT pontual (não readDB) só para checar duplicata da data.
    const existentes = await buscarCartoesFiltrados({ data: dataCartao });
    if (existentes.length > 0) {
      return res.status(409).json({ error: 'Já existe um Cartão Programa para esta data.' });
    }

    // Escolhe pelo dia da semana da data (sáb/dom = fim de semana), com fallback
    // para o padrão do outro período quando não houver do tipo certo.
    const padrao = await buscarPadraoAtivo(dataCartao);
    if (!padrao) {
      return res.status(409).json({
        error: 'Nenhum cartão padrão ativo. Peça ao P3 para definir o padrão antes de criar o cartão do dia.'
      });
    }

    const { ano, numero } = await proximoNumeroCartao(dataCartao);

    const novoCartao = {
      id: generateId('cp'),
      data: dataCartao,
      fiscal: req.body.fiscal || '',
      adjunto: req.body.adjunto || '',
      oficial_sobreaviso: req.body.oficial_sobreaviso || '',
      is_template: false,
      nome_template: null,
      tipo_periodo: ['semana', 'fim_de_semana'].includes(req.body.tipo_periodo)
        ? req.body.tipo_periodo
        : (padrao.tipo_periodo || null),
      qtd_viaturas_base: padrao.qtd_viaturas_base,
      origem_template_id: padrao.id,
      ano,
      numero,
      fiscal_pessoal_id: req.body.fiscal_pessoal_id || '',
      adjunto_pessoal_id: req.body.adjunto_pessoal_id || '',
      fiscal_exibicao: '',
      adjunto_exibicao: '',
      delta07_viatura: req.body.delta07_viatura || '',
      padrao_ativo: false,
      // Clone do padrão ativo: comandante e controle de envio nascem zerados (é um
      // cartão novo, ainda não gerado nem mandado); bairro é estrutural e vem junto.
      // Os avisos selecionados não vêm — a vigência pode ter mudado desde o padrão
      // e são recalculados na data nova (camposEnvioIniciais já zera avisos_ids).
      viaturas: (padrao.viaturas || []).map(v => ({
        id: generateId('cpv'),
        prefixo: v.prefixo,
        setor: v.setor,
        companhia: v.companhia || '',
        categoria: v.categoria || 'Ordinária',
        comandante: '',
        observacao: v.observacao || '',
        ...camposEnvioIniciais(),
        bairro_id: v.bairro_id || '',
        itens: ordenarPorTurno((v.itens || []).map(i => ({
          id: generateId('cpi'),
          inicio: i.inicio,
          fim: i.fim,
          local: i.local,
          atividade: i.atividade
        })))
      }))
    };

    await writeRow('cartoes', novoCartao);
    res.status(201).json(novoCartao);
  }));

  // Define qual template é o padrão único ativo (fonte de todo cartão do dia novo).
  // A troca é atômica no banco (ativar_cartao_padrao) para nunca haver um instante sem padrão.
  router.put('/cartoes/:id/padrao-ativo', exigirP3, asyncRoute(async (req, res) => {
    const template = await buscarCartaoPorId(req.params.id);
    if (!template) return res.status(404).json({ error: 'Cartão padrão não encontrado.' });
    if (!template.is_template) return res.status(400).json({ error: 'Este cartão não é um template.' });
    if (template.estado_template && template.estado_template !== 'publicado') {
      return res.status(409).json({ error: 'Publique o cartão padrão antes de defini-lo como ativo.' });
    }

    const { error } = await supabase.rpc('ativar_cartao_padrao', { p_id: req.params.id });
    if (error) return res.status(500).json({ error: 'Falha ao definir o padrão ativo.' });

    res.json({ ok: true });
  }));

  // Atualizar cabeçalho do cartão (fiscal / adjunto / oficial de sobreaviso)
  router.put('/cartoes/:id', exigirEdicaoCartao, asyncRoute(async (req, res) => {
    const cartao = await buscarCartaoPorId(req.params.id);
    if (!cartao) return res.status(404).json({ error: 'Cartão Programa não encontrado' });
    if (cartao.is_template && req.user.role !== 'P3') {
      return res.status(403).json({ error: 'Apenas o perfil P3 pode editar um cartão padrão.' });
    }

    // padrao:'' de propósito nos três — o frontend manda string vazia para "limpar" a seleção
    // (voltar para "Selecione..."), e isso precisa continuar entrando em valores explicitamente.
    const v = validarCampos(req.body, {
      fiscal: { obrigatorio: false, tipo: 'string', max: 150, padrao: '', label: 'Fiscal de Operações' },
      adjunto: { obrigatorio: false, tipo: 'string', max: 150, padrao: '', label: 'Adjunto' },
      oficial_sobreaviso: { obrigatorio: false, tipo: 'string', max: 150, padrao: '', label: 'Oficial de Sobreaviso' },
      // "Delta 07" é o rótulo operacional do Fiscal de Operações — por isso o id
      // é fiscal_pessoal_id, não delta07_pessoal_id. `delta07_viatura` é a
      // guarnição (prefixo de VTR) em que o Delta 07 está no dia.
      fiscal_pessoal_id: { obrigatorio: false, tipo: 'string', max: 60, padrao: '', label: 'Delta 07 (cadastro)' },
      adjunto_pessoal_id: { obrigatorio: false, tipo: 'string', max: 60, padrao: '', label: 'Adjunto (cadastro)' },
      delta07_viatura: { obrigatorio: false, tipo: 'string', max: 30, padrao: '', label: 'Guarnição do Delta 07' }
    });
    if (!v.ok) return res.status(400).json({ error: v.erro });

    if (req.body.fiscal !== undefined) cartao.fiscal = v.valores.fiscal;
    if (req.body.adjunto !== undefined) cartao.adjunto = v.valores.adjunto;
    if (req.body.oficial_sobreaviso !== undefined) cartao.oficial_sobreaviso = v.valores.oficial_sobreaviso;
    if (req.body.fiscal_pessoal_id !== undefined) cartao.fiscal_pessoal_id = v.valores.fiscal_pessoal_id;
    if (req.body.adjunto_pessoal_id !== undefined) cartao.adjunto_pessoal_id = v.valores.adjunto_pessoal_id;
    if (req.body.delta07_viatura !== undefined) cartao.delta07_viatura = v.valores.delta07_viatura;

    // O cabeçalho sai no documento de TODAS as viaturas: trocar o Delta 07
    // invalida todos os cartões já enviados daquele dia.
    reavaliarStatusEnvio(cartao);

    // tipo_periodo escolhido manualmente (Dia Útil / Fim de Semana). String vazia limpa (null).
    if (req.body.tipo_periodo !== undefined) {
      cartao.tipo_periodo = ['semana', 'fim_de_semana'].includes(req.body.tipo_periodo) ? req.body.tipo_periodo : null;
    }

    const atualizado = await gravarCartaoSeAtual(req, res, cartao);
    if (atualizado) res.json(atualizado);
  }));

  // Excluir cartão. P3 exclui qualquer um, sem prazo. O Adjunto pode excluir o
  // cartão de UM DIA até as 07h00 do dia seguinte à data do serviço — depois
  // disso o roteiro já foi cumprido e vira registro histórico. Template continua
  // sendo exclusividade do P3 em qualquer horário: não é roteiro de um dia, é
  // estrutura reaproveitada por todos os cartões futuros.
  // Oficial não exclui nada (só tem leitura no Cartão Programa).
  router.delete('/cartoes/:id', asyncRoute(async (req, res) => {
    const { data: cartaoAlvo } = await supabase.from('cartoes').select('data, is_template, nome_template, padrao_ativo').eq('id', req.params.id).maybeSingle();
    if (!cartaoAlvo) return res.status(404).json({ error: 'Cartão Programa não encontrado' });

    // Excluir o padrão ATIVO deixaria o sistema sem nenhum, e o Adjunto tomaria 409
    // ao criar o cartão do dia seguinte. Vale inclusive para o P3: ative outro antes.
    if (cartaoAlvo.padrao_ativo) {
      return res.status(409).json({
        error: 'Este é o cartão padrão ativo e não pode ser excluído. Defina outro padrão como ativo antes de excluí-lo.'
      });
    }

    const ehP3 = req.user && req.user.role === 'P3';
    if (!ehP3) {
      if (req.user?.role !== 'Adjunto') {
        return res.status(403).json({ error: 'Você não tem permissão para excluir o Cartão Programa.' });
      }
      if (cartaoAlvo.is_template) {
        return res.status(403).json({ error: 'Apenas o perfil P3 pode excluir um cartão padrão.' });
      }
      if (!dentroDaJanelaExclusaoAdjunto(cartaoAlvo.data)) {
        return res.status(403).json({
          error: `O prazo para excluir o Cartão Programa de ${formatarDataBr(cartaoAlvo.data)} terminou às 07h00 de ${formatarDataBr(proximoDiaISO(cartaoAlvo.data))}. Peça ao P3.`
        });
      }
    }

    const versao = exigirVersaoCarregada(req, res);
    if (!versao) return;
    const apagou = await deleteRowSeVersao('cartoes', req.params.id, versao);
    if (!apagou) return responderConflito(res);
    res.json({ message: 'Cartão Programa excluído' });
  }));

  // Adicionar viatura ao cartão
  router.post('/cartoes/:id/viaturas', exigirEdicaoCartao, asyncRoute(async (req, res) => {
    const cartao = await buscarCartaoPorId(req.params.id);
    if (!cartao) return res.status(404).json({ error: 'Cartão Programa não encontrado' });
    if (cartao.is_template && req.user.role !== 'P3') {
      return res.status(403).json({ error: 'Apenas o perfil P3 pode editar um cartão padrão.' });
    }

    const v = validarCampos(req.body, {
      prefixo: { obrigatorio: true, tipo: 'string', max: 30, label: 'Prefixo da VTR' },
      setor: { obrigatorio: true, tipo: 'string', max: 100, label: 'Setor / Bairro' },
      companhia: { obrigatorio: false, tipo: 'string', valores: COMPANHIAS_VIATURA, padrao: '', label: 'Companhia' },
      categoria: { obrigatorio: false, tipo: 'string', valores: CATEGORIAS_VIATURA, padrao: 'Ordinária', label: 'Categoria' },
      comandante: { obrigatorio: false, tipo: 'string', max: 150, padrao: '', label: 'Comandante' },
      composicao: { obrigatorio: false, tipo: 'string', max: 300, padrao: '', label: 'Composição da guarnição' },
      observacao: { obrigatorio: false, tipo: 'string', max: 300, padrao: '', label: 'Observação' },
      // bairro_id liga a viatura ao cadastro de bairros (é o que traz os Avisos
      // Operacionais do bairro). `setor` continua existindo em paralelo: é texto
      // livre, usado pelo Mapa e pelo Quadro Resumo, e nem todo setor é um bairro.
      bairro_id: { obrigatorio: false, tipo: 'string', max: 60, padrao: '', label: 'Bairro' },
      comandante_pessoal_id: { obrigatorio: false, tipo: 'string', max: 60, padrao: '', label: 'Comandante (cadastro)' }
    });
    if (!v.ok) return res.status(400).json({ error: v.erro });

    const novaViatura = {
      id: generateId('cpv'),
      prefixo: v.valores.prefixo,
      setor: v.valores.setor,
      companhia: v.valores.companhia,
      categoria: v.valores.categoria,
      comandante: v.valores.comandante,
      composicao: v.valores.composicao,
      observacao: v.valores.observacao,
      ...camposEnvioIniciais(),
      bairro_id: v.valores.bairro_id,
      bairros_ids: [...new Set(Array.isArray(req.body.bairros_ids)
        ? req.body.bairros_ids.filter(id => typeof id === 'string' && id)
        : (v.valores.bairro_id ? [v.valores.bairro_id] : []))].slice(0, 12),
      comandante_pessoal_id: v.valores.comandante_pessoal_id,
      // O Adjunto já escolhe os avisos no mesmo formulário em que aloca a viatura
      // no bairro, então eles podem chegar já no POST.
      avisos_ids: Array.isArray(req.body.avisos_ids)
        ? req.body.avisos_ids.filter(id => typeof id === 'string' && id).slice(0, MAX_AVISOS_POR_CARTAO)
        : [],
      itens: []
    };

    cartao.viaturas.push(novaViatura);
    const atualizado = await gravarCartaoSeAtual(req, res, cartao);
    if (atualizado) res.status(201).json(novaViatura);
  }));

  // Atualizar viatura
  router.put('/cartoes/:id/viaturas/:vid', exigirEdicaoCartao, asyncRoute(async (req, res) => {
    const cartao = await buscarCartaoPorId(req.params.id);
    if (!cartao) return res.status(404).json({ error: 'Cartão Programa não encontrado' });
    if (cartao.is_template && req.user.role !== 'P3') {
      return res.status(403).json({ error: 'Apenas o perfil P3 pode editar um cartão padrão.' });
    }

    const viatura = cartao.viaturas.find(v => v.id === req.params.vid);
    if (!viatura) return res.status(404).json({ error: 'Viatura não encontrada neste cartão' });

    if (req.body.companhia !== undefined && req.body.companhia && !COMPANHIAS_VIATURA.includes(req.body.companhia)) {
      return res.status(400).json({ error: 'Companhia inválida.' });
    }
    if (req.body.categoria !== undefined && !CATEGORIAS_VIATURA.includes(req.body.categoria)) {
      return res.status(400).json({ error: 'Categoria de viatura inválida.' });
    }

    // Viaturas gravadas antes da migration 001 não têm os campos de bairro/envio.
    // Não há migração de boot pra preenchê-los: reescrever todos os cartões
    // custaria banco à toa, e todo leitor (frontend e gerador de PDF) trata a
    // ausência com `|| ''`. Aqui eles entram naturalmente na primeira edição.
    ['prefixo', 'setor', 'companhia', 'categoria', 'comandante', 'composicao', 'observacao', 'bairro_id', 'comandante_pessoal_id'].forEach(campo => {
      if (req.body[campo] !== undefined) viatura[campo] = req.body[campo];
    });

    if (req.body.bairros_ids !== undefined) {
      if (!Array.isArray(req.body.bairros_ids)) {
        return res.status(400).json({ error: 'bairros_ids deve ser uma lista de ids de bairro.' });
      }
      viatura.bairros_ids = [...new Set(req.body.bairros_ids.filter(id => typeof id === 'string' && id))].slice(0, 12);
      viatura.bairro_id = viatura.bairros_ids[0] || '';
    }

    // Avisos selecionados para o cartão desta viatura: só os ids, nunca o texto.
    // Teto de 4 aplicado também aqui (o cliente já limita, mas a regra protege o
    // formato de uma página independentemente de quem chamou a API).
    if (req.body.avisos_ids !== undefined) {
      if (!Array.isArray(req.body.avisos_ids)) {
        return res.status(400).json({ error: 'avisos_ids deve ser uma lista de ids de aviso.' });
      }
      viatura.avisos_ids = req.body.avisos_ids
        .filter(id => typeof id === 'string' && id)
        .slice(0, MAX_AVISOS_POR_CARTAO);
    }

    reavaliarStatusEnvio(cartao);

    const atualizado = await gravarCartaoSeAtual(req, res, cartao);
    if (atualizado) res.json(viatura);
  }));

  // Remover viatura do cartão
  router.delete('/cartoes/:id/viaturas/:vid', exigirEdicaoCartao, asyncRoute(async (req, res) => {
    const cartao = await buscarCartaoPorId(req.params.id);
    if (!cartao) return res.status(404).json({ error: 'Cartão Programa não encontrado' });
    if (cartao.is_template && req.user.role !== 'P3') {
      return res.status(403).json({ error: 'Apenas o perfil P3 pode editar um cartão padrão.' });
    }

    const viatura = (cartao.viaturas || []).find(v => v.id === req.params.vid);
    if (!viatura) return res.status(404).json({ error: 'Viatura não encontrada neste cartão' });

    cartao.viaturas = cartao.viaturas.filter(v => v.id !== req.params.vid);
    const atualizado = await gravarCartaoSeAtual(req, res, cartao);
    if (atualizado) res.json({ message: 'Viatura removida do cartão' });
  }));

  // Marcar o cartão de uma viatura como gerado ou enviado. É aqui que o retrato
  // do conteúdo (hash) é tirado: a partir deste ponto, qualquer mudança no que
  // sai no documento devolve a viatura para "alterado" com a versão seguinte.
  // Adjunto pode: é ele quem gera e manda o cartão ao comandante.
  router.put('/cartoes/:id/viaturas/:vid/status', exigirEdicaoCartao, asyncRoute(async (req, res) => {
    const cartao = await buscarCartaoPorId(req.params.id);
    if (!cartao) return res.status(404).json({ error: 'Cartão Programa não encontrado' });
    if (cartao.is_template && req.user.role !== 'P3') {
      return res.status(403).json({ error: 'Apenas o perfil P3 pode editar um cartão padrão.' });
    }

    const viatura = (cartao.viaturas || []).find(v => v.id === req.params.vid);
    if (!viatura) return res.status(404).json({ error: 'Viatura não encontrada neste cartão' });

    const status = req.body.status_envio;
    if (!['gerado', 'enviado'].includes(status)) {
      return res.status(400).json({ error: "status_envio deve ser 'gerado' ou 'enviado'." });
    }

    viatura.status_envio = status;
    viatura.gerado_em = new Date().toISOString();
    viatura.hash_conteudo = hashConteudoCartaoViatura(cartao, viatura);

    const atualizado = await gravarCartaoSeAtual(req, res, cartao);
    if (atualizado) res.json(viatura);
  }));

  // Histórico da Central de Emissão. É leitura operacional, disponível a todos
  // os perfis autenticados que já podem consultar o Cartão Programa.
  router.get('/cartoes/:id/emissoes', asyncRoute(async (req, res) => {
    const { data, error } = await supabase
      .from('emissoes_cartao')
      .select('id, usuario, usuario_nome, emitido_em, modalidade, formato, tipo_documento, agrupamento, com_alertas, viaturas_ids, versao, acao, status')
      .eq('cartao_id', req.params.id)
      .order('emitido_em', { ascending: false })
      .limit(30);
    if (error) throw new Error(`Falha ao ler histórico de emissões: ${error.message}`);
    res.json(data || []);
  }));

  // Porta única de registro de impressão/PDF/compartilhamento. O horário é
  // calculado no servidor e as viaturas selecionadas recebem o mesmo status;
  // assim não existe caminho de emissão que deixe o Cartão como pendente.
  router.post('/cartoes/:id/emissoes', asyncRoute(async (req, res) => {
    const versaoCarregadaCartao = exigirVersaoCarregada(req, res);
    if (!versaoCarregadaCartao) return;
    const cartao = await buscarCartaoPorId(req.params.id);
    if (!cartao || cartao.is_template) {
      return res.status(404).json({ error: 'Cartão Programa do dia não encontrado.' });
    }

    const modalidades = ['guarnicao', 'arquivo_sei', 'consolidado', 'quadro_resumo', 'personalizado'];
    const formatos = ['celular', 'a4'];
    const tipos = ['individual', 'consolidado', 'quadro_resumo'];
    const agrupamentos = ['nenhum', 'companhia', 'categoria'];
    const acao = req.body.acao === 'enviado' ? 'enviado' : 'gerado';
    if (!modalidades.includes(req.body.modalidade) || !formatos.includes(req.body.formato)
        || !tipos.includes(req.body.tipo_documento) || !agrupamentos.includes(req.body.agrupamento)) {
      return res.status(400).json({ error: 'Configuração de emissão inválida.' });
    }

    const ids = [...new Set(Array.isArray(req.body.viaturas_ids) ? req.body.viaturas_ids.filter(id => typeof id === 'string') : [])];
    const selecionadas = (cartao.viaturas || []).filter(v => ids.includes(v.id));
    if (selecionadas.length === 0 || selecionadas.length !== ids.length) {
      return res.status(400).json({ error: 'Selecione ao menos uma viatura válida deste Cartão.' });
    }

    const eraRetificacao = selecionadas.some(v => v.status_envio === 'alterado' || (v.versao || 1) > 1);
    const versao = Math.max(...selecionadas.map(v => v.versao || 1));
    const emitidoEm = new Date().toISOString();
    selecionadas.forEach(viatura => {
      viatura.status_envio = acao;
      viatura.gerado_em = emitidoEm;
      viatura.hash_conteudo = hashConteudoCartaoViatura(cartao, viatura);
    });

    const snapshot = {
      cartao: {
        id: cartao.id,
        data: cartao.data,
        ano: cartao.ano,
        numero: cartao.numero,
        tipo_periodo: cartao.tipo_periodo,
        fiscal: cartao.fiscal,
        fiscal_pessoal_id: cartao.fiscal_pessoal_id,
        adjunto: cartao.adjunto,
        adjunto_pessoal_id: cartao.adjunto_pessoal_id,
        delta07_viatura: cartao.delta07_viatura
      },
      // Deliberadamente não inclui `oficial_sobreaviso`: é dado de controle
      // interno e não pertence ao documento nem ao snapshot documental.
      viaturas: selecionadas.map(v => ({ ...v }))
    };

    const registro = {
      id: generateId('cpe'),
      cartao_id: cartao.id,
      usuario: req.user.usuario,
      usuario_nome: req.user.nome || '',
      emitido_em: emitidoEm,
      modalidade: req.body.modalidade,
      formato: req.body.formato,
      tipo_documento: req.body.tipo_documento,
      agrupamento: req.body.agrupamento,
      com_alertas: !!req.body.com_alertas,
      viaturas_ids: ids,
      versao,
      acao,
      status: eraRetificacao ? 'retificado' : acao,
      snapshot
    };

    // A função Postgres atualiza as viaturas, registra a emissão e substitui
    // versões anteriores na mesma transação, evitando qualquer estado parcial.
    const { error: erroRegistro } = await supabase.rpc('registrar_emissao_cartao', {
      p_cartao_id: cartao.id,
      p_viaturas: cartao.viaturas || [],
      p_emissao: registro,
      p_retificacao: eraRetificacao,
      p_atualizado_em: versaoCarregadaCartao
    });
    if (erroRegistro) {
      if (erroRegistro.code === 'P0001' || erroRegistro.message.includes(CODIGO_CARTAO_DESATUALIZADO)) {
        return responderConflito(res);
      }
      throw new Error(`Falha ao registrar emissão do Cartão Programa: ${erroRegistro.message}`);
    }
    const cartaoAtualizado = await buscarCartaoPorId(cartao.id);
    res.status(201).json({
      emissao: registro,
      viaturas: selecionadas,
      atualizado_em: cartaoAtualizado?.atualizado_em || null
    });
  }));

  // Adicionar item de roteiro à viatura
  router.post('/cartoes/:id/viaturas/:vid/itens', exigirEdicaoCartao, asyncRoute(async (req, res) => {
    const cartao = await buscarCartaoPorId(req.params.id);
    if (!cartao) return res.status(404).json({ error: 'Cartão Programa não encontrado' });
    if (cartao.is_template && req.user.role !== 'P3') {
      return res.status(403).json({ error: 'Apenas o perfil P3 pode editar um cartão padrão.' });
    }

    const viatura = cartao.viaturas.find(v => v.id === req.params.vid);
    if (!viatura) return res.status(404).json({ error: 'Viatura não encontrada neste cartão' });

    const valid = validarCampos(req.body, {
      inicio: { obrigatorio: true, tipo: 'string', max: 5, label: 'Horário de Início' },
      local: { obrigatorio: true, tipo: 'string', max: 150, label: 'Local' },
      fim: { obrigatorio: false, tipo: 'string', max: 5, padrao: '', label: 'Horário de Fim' },
      atividade: { obrigatorio: false, tipo: 'string', max: 100, padrao: 'Patrulhamento', label: 'Atividade' }
    });
    if (!valid.ok) return res.status(400).json({ error: valid.erro });

    const novoItem = {
      id: generateId('cpi'),
      inicio: valid.valores.inicio,
      fim: valid.valores.fim,
      local: valid.valores.local,
      atividade: valid.valores.atividade
    };

    viatura.itens.push(novoItem);
    viatura.itens = ordenarPorTurno(viatura.itens);
    reavaliarStatusEnvio(cartao);
    const atualizado = await gravarCartaoSeAtual(req, res, cartao);
    if (atualizado) res.status(201).json(novoItem);
  }));

  // Atualizar item de roteiro
  router.put('/cartoes/:id/viaturas/:vid/itens/:iid', exigirEdicaoCartao, asyncRoute(async (req, res) => {
    const cartao = await buscarCartaoPorId(req.params.id);
    if (!cartao) return res.status(404).json({ error: 'Cartão Programa não encontrado' });
    if (cartao.is_template && req.user.role !== 'P3') {
      return res.status(403).json({ error: 'Apenas o perfil P3 pode editar um cartão padrão.' });
    }

    const viatura = cartao.viaturas.find(v => v.id === req.params.vid);
    if (!viatura) return res.status(404).json({ error: 'Viatura não encontrada neste cartão' });

    const item = viatura.itens.find(i => i.id === req.params.iid);
    if (!item) return res.status(404).json({ error: 'Item de roteiro não encontrado' });

    const valid = validarCampos(req.body, {
      inicio: { obrigatorio: false, tipo: 'string', max: 5, label: 'Horário de Início' },
      fim: { obrigatorio: false, tipo: 'string', max: 5, label: 'Horário de Fim' },
      local: { obrigatorio: false, tipo: 'string', max: 150, label: 'Local' },
      atividade: { obrigatorio: false, tipo: 'string', max: 100, label: 'Atividade' }
    });
    if (!valid.ok) return res.status(400).json({ error: valid.erro });
    if (valid.valores.inicio !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(valid.valores.inicio)) {
      return res.status(400).json({ error: 'Horário de início inválido.' });
    }
    if (valid.valores.fim !== undefined && valid.valores.fim && !/^([01]\d|2[0-3]):[0-5]\d$/.test(valid.valores.fim)) {
      return res.status(400).json({ error: 'Horário de fim inválido.' });
    }
    Object.assign(item, valid.valores);

    viatura.itens = ordenarPorTurno(viatura.itens);
    reavaliarStatusEnvio(cartao);
    const atualizado = await gravarCartaoSeAtual(req, res, cartao);
    if (atualizado) res.json(item);
  }));

  // Copia o roteiro de outra viatura para a viatura-alvo. Os itens recebem ids
  // novos e são reordenados pela janela 07h→07h, inclusive após a meia-noite.
  router.post('/cartoes/:id/viaturas/:vid/copiar-roteiro', exigirEdicaoCartao, asyncRoute(async (req, res) => {
    const cartao = await buscarCartaoPorId(req.params.id);
    if (!cartao) return res.status(404).json({ error: 'Cartão Programa não encontrado' });
    if (cartao.is_template && req.user.role !== 'P3') {
      return res.status(403).json({ error: 'Apenas o perfil P3 pode editar um cartão padrão.' });
    }
    const alvo = (cartao.viaturas || []).find(v => v.id === req.params.vid);
    const origem = (cartao.viaturas || []).find(v => v.id === req.body.origem_viatura_id);
    if (!alvo || !origem || alvo.id === origem.id) {
      return res.status(400).json({ error: 'Informe uma viatura de origem diferente e válida.' });
    }
    const copiados = (origem.itens || []).map(item => ({ ...item, id: generateId('cpi') }));
    alvo.itens = ordenarPorTurno(req.body.substituir ? copiados : [...(alvo.itens || []), ...copiados]);
    reavaliarStatusEnvio(cartao);
    const atualizado = await gravarCartaoSeAtual(req, res, cartao);
    if (atualizado) res.json({ itens: alvo.itens, copiados: copiados.length });
  }));

  // Aplica uma atividade a todos os itens das viaturas selecionadas em uma única
  // escrita do JSONB, evitando uma sequência de PUTs concorrentes no mesmo cartão.
  router.put('/cartoes/:id/roteiro/atividade', exigirEdicaoCartao, asyncRoute(async (req, res) => {
    const cartao = await buscarCartaoPorId(req.params.id);
    if (!cartao) return res.status(404).json({ error: 'Cartão Programa não encontrado' });
    if (cartao.is_template && req.user.role !== 'P3') {
      return res.status(403).json({ error: 'Apenas o perfil P3 pode editar um cartão padrão.' });
    }
    const ids = new Set(Array.isArray(req.body.viaturas_ids) ? req.body.viaturas_ids : []);
    const atividade = String(req.body.atividade || '').trim();
    if (!atividade || atividade.length > 100 || ids.size === 0) {
      return res.status(400).json({ error: 'Selecione viaturas e informe uma atividade válida.' });
    }
    let alterados = 0;
    (cartao.viaturas || []).forEach(viatura => {
      if (!ids.has(viatura.id)) return;
      (viatura.itens || []).forEach(item => { item.atividade = atividade; alterados += 1; });
    });
    reavaliarStatusEnvio(cartao);
    const atualizado = await gravarCartaoSeAtual(req, res, cartao);
    if (atualizado) res.json({ alterados });
  }));

  // Remover item de roteiro
  router.delete('/cartoes/:id/viaturas/:vid/itens/:iid', exigirEdicaoCartao, asyncRoute(async (req, res) => {
    const cartao = await buscarCartaoPorId(req.params.id);
    if (!cartao) return res.status(404).json({ error: 'Cartão Programa não encontrado' });
    if (cartao.is_template && req.user.role !== 'P3') {
      return res.status(403).json({ error: 'Apenas o perfil P3 pode editar um cartão padrão.' });
    }

    const viatura = cartao.viaturas.find(v => v.id === req.params.vid);
    if (!viatura) return res.status(404).json({ error: 'Viatura não encontrada neste cartão' });

    viatura.itens = viatura.itens.filter(i => i.id !== req.params.iid);
    reavaliarStatusEnvio(cartao);
    const atualizado = await gravarCartaoSeAtual(req, res, cartao);
    if (atualizado) res.json({ message: 'Item de roteiro removido' });
  }));

  return router;
};
