const express = require('express');

// A biblioteca de padrões nasceu como `cartao_grupos_modelo`.  O nome da
// tabela é mantido de propósito: há cartões antigos que ainda apontam para o
// id de um grupo.  A API nova usa o termo padrão operacional, mas os aliases
// /grupos-modelo continuam válidos durante a transição.

const CAMPOS_TEXTO = [
  'nome', 'tipo', 'area', 'bairro', 'missao', 'pontos',
  'horario_inicio', 'horario_fim', 'observacoes', 'descricao',
];
const LIMITES_TEXTO = {
  nome: 120, tipo: 80, area: 150, bairro: 100, missao: 100,
  pontos: 150, horario_inicio: 5, horario_fim: 5,
  observacoes: 300, descricao: 500,
};
const MAX_COMPONENTES = 100;
const MAX_JSON = 200_000;

function clonar(valor) {
  return valor == null ? valor : JSON.parse(JSON.stringify(valor));
}

function booleanoQuery(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  if (['1', 'true', 'sim', 'yes'].includes(String(valor).toLowerCase())) return true;
  if (['0', 'false', 'nao', 'não', 'no'].includes(String(valor).toLowerCase())) return false;
  return null;
}

function normalizarComponentes(valor) {
  if (valor === undefined) return null;
  if (!Array.isArray(valor) || valor.length > MAX_COMPONENTES) {
    return { erro: `O padrão pode conter no máximo ${MAX_COMPONENTES} componentes.` };
  }
  for (const componente of valor) {
    if (!componente || typeof componente !== 'object' || Array.isArray(componente)) {
      return { erro: 'Cada componente do padrão deve ser um objeto JSON.' };
    }
  }
  if (JSON.stringify(valor).length > MAX_JSON) return { erro: 'Os componentes do padrão são muito grandes.' };
  return { valor: clonar(valor) };
}

function normalizarPadrao(body = {}, atual = {}, { criacao = false } = {}) {
  const padrao = { ...atual };
  let configuracaoAtual = padrao.configuracao && typeof padrao.configuracao === 'object' ? clonar(padrao.configuracao) : {};
  let metadadosAtuais = padrao.metadados && typeof padrao.metadados === 'object' ? clonar(padrao.metadados) : {};
  if (body.categoria !== undefined && body.tipo === undefined) body = { ...body, tipo: body.categoria };
  if (body.descricao !== undefined && body.missao === undefined) body = { ...body, missao: body.descricao };
  for (const campo of CAMPOS_TEXTO) {
    if (body[campo] !== undefined) padrao[campo] = String(body[campo] ?? '').trim();
    if (padrao[campo] && padrao[campo].length > LIMITES_TEXTO[campo]) {
      return { erro: `O campo ${campo.replaceAll('_', ' ')} deve ter no máximo ${LIMITES_TEXTO[campo]} caracteres.` };
    }
  }
  if (body.configuracao !== undefined) {
    if (!body.configuracao || typeof body.configuracao !== 'object' || Array.isArray(body.configuracao)) {
      return { erro: 'A configuração do padrão deve ser um objeto JSON.' };
    }
    if (JSON.stringify(body.configuracao).length > MAX_JSON) return { erro: 'A configuração do padrão é muito grande.' };
    padrao.configuracao = clonar(body.configuracao);
    configuracaoAtual = clonar(padrao.configuracao);
  }
  if (body.bairros !== undefined) {
    if (!Array.isArray(body.bairros) || body.bairros.some((item) => typeof item !== 'string')) {
      return { erro: 'Os bairros do padrão devem ser uma lista de textos.' };
    }
    configuracaoAtual.bairros = body.bairros.map((item) => item.trim()).filter(Boolean).slice(0, 30);
    padrao.bairro = configuracaoAtual.bairros.join(' + ').slice(0, LIMITES_TEXTO.bairro);
    padrao.configuracao = configuracaoAtual;
  }
  if (body.quantidade_pbs !== undefined) {
    const quantidade = Number(body.quantidade_pbs);
    if (!Number.isInteger(quantidade) || quantidade < 0 || quantidade > 100) return { erro: 'A quantidade de PBs deve ser um inteiro entre 0 e 100.' };
    metadadosAtuais.quantidade_pbs = quantidade;
    padrao.metadados = metadadosAtuais;
  }
  const componentes = normalizarComponentes(body.componentes);
  if (componentes?.erro) return componentes;
  if (componentes) padrao.componentes = componentes.valor;

  if (body.metadados !== undefined) {
    if (!body.metadados || typeof body.metadados !== 'object' || Array.isArray(body.metadados)) {
      return { erro: 'Os metadados do padrão devem ser um objeto JSON.' };
    }
    if (JSON.stringify(body.metadados).length > MAX_JSON) return { erro: 'Os metadados do padrão são muito grandes.' };
    padrao.metadados = clonar(body.metadados);
    metadadosAtuais = clonar(padrao.metadados);
  }
  if (body.ativo !== undefined) {
    if (typeof body.ativo !== 'boolean') return { erro: 'O status do padrão é inválido.' };
    padrao.ativo = body.ativo;
  }
  if (body.ordem !== undefined) {
    const ordem = Number(body.ordem);
    if (!Number.isInteger(ordem) || ordem < 0) return { erro: 'A ordem deve ser um número inteiro não negativo.' };
    padrao.ordem = ordem;
  }
  if (body.tipo_padrao !== undefined) padrao.tipo_padrao = String(body.tipo_padrao || '').trim().slice(0, 40);
  if (!padrao.nome) return { erro: 'O nome do padrão é obrigatório.' };
  if (!padrao.tipo) padrao.tipo = 'Especial';
  if (!padrao.configuracao || typeof padrao.configuracao !== 'object') padrao.configuracao = {};
  if (!Array.isArray(padrao.componentes)) padrao.componentes = [];
  if (!padrao.metadados || typeof padrao.metadados !== 'object') padrao.metadados = {};

  // A validação antiga exigia horário/local para grupos sem itens. Isso não é
  // aplicável a um padrão ainda em montagem: Adjunto pode criar o esqueleto e
  // completar os componentes em seguida.
  if (criacao && padrao.nome.length === 0) return { erro: 'O nome do padrão é obrigatório.' };
  return { padrao };
}

function patchPadraoInformado(body, padrao) {
  const patch = {};
  for (const campo of CAMPOS_TEXTO) {
    if (Object.prototype.hasOwnProperty.call(body, campo)) patch[campo] = padrao[campo];
  }
  for (const campo of ['configuracao', 'componentes', 'metadados', 'ativo', 'ordem', 'tipo_padrao']) {
    if (Object.prototype.hasOwnProperty.call(body, campo)) patch[campo] = padrao[campo];
  }
  if (Object.prototype.hasOwnProperty.call(body, 'categoria')) patch.tipo = padrao.tipo;
  if (Object.prototype.hasOwnProperty.call(body, 'bairros')) {
    patch.bairro = padrao.bairro;
    patch.configuracao = padrao.configuracao;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'quantidade_pbs')) patch.metadados = padrao.metadados;
  if (Object.prototype.hasOwnProperty.call(body, 'descricao')) patch.missao = padrao.missao;
  return patch;
}

function respostaErro(res, status, error) {
  return res.status(status).json({ error });
}

function permissaoP3(req, res, next) {
  if (!req.user || req.user.role !== 'P3') {
    return respostaErro(res, 403, 'Apenas o perfil P3 tem permissão para esta ação.');
  }
  return next();
}

function criarRouterPadroesOperacionais({
  asyncRoute,
  exigirP3,
  generateId,
  registrarAuditoria,
  supabase,
}) {
  const router = express.Router();
  const administrar = exigirP3 || permissaoP3;
  const prefixos = ['/padroes-operacionais', '/grupos-modelo'];

  async function listarTudo() {
    const { data, error } = await supabase.from('cartao_grupos_modelo').select('*');
    if (error) throw new Error(error.message);
    return data || [];
  }

  async function buscar(id) {
    const { data, error } = await supabase.from('cartao_grupos_modelo')
      .select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data || null;
  }

  async function listarVersoes(id) {
    const { data, error } = await supabase.from('cartao_grupos_modelo_versoes')
      .select('*').eq('grupo_id', id).order('versao', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  }

  async function atualizar(id, patch) {
    const consulta = supabase.from('cartao_grupos_modelo')
      .update(patch).eq('id', id).select('*').single();
    const { data, error } = await consulta;
    if (error) {
      if (error.code === '23505') return { conflito: true };
      throw new Error(error.message);
    }
    return { data: data || { id, ...patch } };
  }

  function registrar(req, acao, grupo, descricao) {
    if (!registrarAuditoria) return Promise.resolve();
    return registrarAuditoria({ req, acao, entidade: 'Padrão Operacional', entidadeId: grupo.id, descricao });
  }

  function montarRotas(caminho) {
    // Lista e busca: a filtragem fica no backend mesmo quando a instalação
    // ainda está com uma versão antiga do schema sem os novos índices.
    router.get(caminho, asyncRoute(async (req, res) => {
      let dados = await listarTudo();
      const q = String(req.query.q ?? req.query.busca ?? '').trim().toLocaleLowerCase('pt-BR');
      const tipo = String(req.query.tipo ?? '').trim().toLocaleLowerCase('pt-BR');
      const bairro = String(req.query.bairro ?? '').trim().toLocaleLowerCase('pt-BR');
      const ativo = booleanoQuery(req.query.ativo);
      const publicado = booleanoQuery(req.query.publicado);
      if (q) dados = dados.filter((item) => [item.nome, item.tipo, item.area, item.bairro, item.missao, item.descricao]
        .some((valor) => String(valor || '').toLocaleLowerCase('pt-BR').includes(q)));
      if (tipo) dados = dados.filter((item) => String(item.tipo || '').toLocaleLowerCase('pt-BR') === tipo);
      if (bairro) dados = dados.filter((item) => String(item.bairro || '').toLocaleLowerCase('pt-BR').includes(bairro));
      if (ativo !== null) dados = dados.filter((item) => item.ativo !== false === ativo);
      if (publicado !== null) dados = dados.filter((item) => !!item.publicado === publicado);
      if (req.user?.role !== 'P3' && caminho === '/padroes-operacionais') {
        dados = dados.filter((item) => item.ativo !== false && item.publicado === true);
      }
      // O alias antigo sempre ocultou grupos inativos para perfis
      // operacionais. Mantemos esse contrato; a API nova permite filtrar
      // explicitamente o catálogo inteiro.
      if (caminho === '/grupos-modelo' && req.user?.role !== 'P3' && req.query.todos !== '1') {
        dados = dados.filter((item) => item.ativo !== false);
      }
      dados.sort((a, b) => (Number(a.ordem || 0) - Number(b.ordem || 0)) || String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
      res.json(dados);
    }));

    router.get(`${caminho}/:id`, asyncRoute(async (req, res) => {
      const grupo = await buscar(req.params.id);
      if (!grupo) return respostaErro(res, 404, 'Padrão operacional não encontrado.');
      const incluirVersoes = req.query.versoes === '1' || req.query.detalhe === '1';
      if (!incluirVersoes) return res.json(grupo);
      const versoes = await listarVersoes(grupo.id);
      return res.json({ ...grupo, versoes });
    }));
    router.get(`${caminho}/:id/detalhe`, asyncRoute(async (req, res) => {
      const grupo = await buscar(req.params.id);
      if (!grupo) return respostaErro(res, 404, 'Padrão operacional não encontrado.');
      return res.json({ ...grupo, versoes: await listarVersoes(grupo.id) });
    }));

    router.get(`${caminho}/:id/versoes`, asyncRoute(async (req, res) => {
      const grupo = await buscar(req.params.id);
      if (!grupo) return respostaErro(res, 404, 'Padrão operacional não encontrado.');
      res.json(await listarVersoes(grupo.id));
    }));
    router.get(`${caminho}/:id/historico`, asyncRoute(async (req, res) => {
      const grupo = await buscar(req.params.id);
      if (!grupo) return respostaErro(res, 404, 'Padrão operacional não encontrado.');
      res.json(await listarVersoes(grupo.id));
    }));

    router.get(`${caminho}/:id/versoes/:versao`, asyncRoute(async (req, res) => {
      const grupo = await buscar(req.params.id);
      if (!grupo) return respostaErro(res, 404, 'Padrão operacional não encontrado.');
      const versao = Number(req.params.versao);
      if (!Number.isInteger(versao) || versao < 1) return respostaErro(res, 400, 'Versão inválida.');
      const { data, error } = await supabase.from('cartao_grupos_modelo_versoes')
        .select('*').eq('grupo_id', grupo.id).eq('versao', versao).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return respostaErro(res, 404, 'Versão não encontrada.');
      res.json(data);
    }));

    router.post(caminho, administrar, asyncRoute(async (req, res) => {
      const validado = normalizarPadrao(req.body, {}, { criacao: true });
      if (validado.erro) return respostaErro(res, 400, validado.erro);
      const grupo = {
        id: generateId('pop'),
        ...validado.padrao,
        configuracao: validado.padrao.configuracao || {},
        componentes: validado.padrao.componentes || [],
        metadados: validado.padrao.metadados || {},
        ativo: validado.padrao.ativo !== false,
        ordem: validado.padrao.ordem || 0,
        versao: 0,
        publicado: false,
        publicado_em: null,
        publicado_por: null,
        criado_por: req.user.usuario,
      };
      const { data, error } = await supabase.from('cartao_grupos_modelo').insert(grupo).select('*').single();
      if (error) {
        if (error.code === '23505') return respostaErro(res, 409, 'Já existe um padrão com esse nome.');
        throw new Error(error.message);
      }
      await registrar(req, 'criou', grupo, `Criou o padrão “${grupo.nome}”.`);
      res.status(201).json(data || grupo);
    }));

    router.put(`${caminho}/:id`, administrar, asyncRoute(async (req, res) => {
      const atual = await buscar(req.params.id);
      if (!atual) return respostaErro(res, 404, 'Padrão operacional não encontrado.');
      const validado = normalizarPadrao(req.body, atual);
      if (validado.erro) return respostaErro(res, 400, validado.erro);
      const patch = { ...patchPadraoInformado(req.body, validado.padrao), atualizado_em: new Date().toISOString() };
      // Uma edição cria um rascunho. A fotografia publicada segue disponível
      // no histórico até que alguém publique a nova composição.
      if (atual.publicado) {
        patch.publicado = false;
        patch.publicado_em = null;
        patch.publicado_por = null;
      }
      const resultado = await atualizar(atual.id, patch);
      if (resultado.conflito) return respostaErro(res, 409, 'Já existe um padrão com esse nome.');
      await registrar(req, 'alterou', atual, `Atualizou o padrão “${patch.nome}”.`);
      res.json(resultado.data);
    }));
    router.patch(`${caminho}/:id`, administrar, asyncRoute(async (req, res) => {
      const atual = await buscar(req.params.id);
      if (!atual) return respostaErro(res, 404, 'Padrão operacional não encontrado.');
      const validado = normalizarPadrao(req.body, atual);
      if (validado.erro) return respostaErro(res, 400, validado.erro);
      const patch = { ...patchPadraoInformado(req.body, validado.padrao), atualizado_em: new Date().toISOString() };
      if (atual.publicado) {
        patch.publicado = false;
        patch.publicado_em = null;
        patch.publicado_por = null;
      }
      const resultado = await atualizar(atual.id, patch);
      if (resultado.conflito) return respostaErro(res, 409, 'Já existe um padrão com esse nome.');
      res.json(resultado.data);
    }));

    router.delete(`${caminho}/:id`, administrar, asyncRoute(async (req, res) => {
      const grupo = await buscar(req.params.id);
      if (!grupo) return respostaErro(res, 404, 'Padrão operacional não encontrado.');
      const { error } = await supabase.from('cartao_grupos_modelo').delete().eq('id', grupo.id);
      if (error) throw new Error(error.message);
      await registrar(req, 'excluiu', grupo, `Excluiu o padrão “${grupo.nome}”.`);
      res.json({ ok: true });
    }));

    // Ativação/inativação é diferente de publicação: ativo controla se o
    // padrão aparece na biblioteca; publicado controla a fotografia usada para
    // gerar componentes em cartões futuros.
    const alterarAtivo = asyncRoute(async (req, res) => {
      const grupo = await buscar(req.params.id);
      if (!grupo) return respostaErro(res, 404, 'Padrão operacional não encontrado.');
      const ativo = req.body?.ativo === undefined ? req.path.endsWith('/ativar') : req.body.ativo;
      if (typeof ativo !== 'boolean') return respostaErro(res, 400, 'O status do padrão é inválido.');
      const resultado = await atualizar(grupo.id, { ativo, atualizado_em: new Date().toISOString() });
      await registrar(req, ativo ? 'ativou' : 'inativou', grupo, `${ativo ? 'Ativou' : 'Inativou'} o padrão “${grupo.nome}”.`);
      res.json(resultado.data);
    });
    router.patch(`${caminho}/:id/ativo`, administrar, alterarAtivo);
    router.put(`${caminho}/:id/ativo`, administrar, alterarAtivo);
    router.put(`${caminho}/:id/status`, administrar, alterarAtivo);
    router.post(`${caminho}/:id/ativar`, administrar, asyncRoute(async (req, res, next) => {
      req.body = { ...(req.body || {}), ativo: true };
      return alterarAtivo(req, res, next);
    }));
    router.post(`${caminho}/:id/inativar`, administrar, asyncRoute(async (req, res, next) => {
      req.body = { ...(req.body || {}), ativo: false };
      return alterarAtivo(req, res, next);
    }));
    router.put(`${caminho}/:id/ativar`, administrar, asyncRoute(async (req, res, next) => {
      req.body = { ...(req.body || {}), ativo: true };
      return alterarAtivo(req, res, next);
    }));
    router.put(`${caminho}/:id/inativar`, administrar, asyncRoute(async (req, res, next) => {
      req.body = { ...(req.body || {}), ativo: false };
      return alterarAtivo(req, res, next);
    }));

    router.post(`${caminho}/:id/duplicar`, administrar, asyncRoute(async (req, res) => {
      const origem = await buscar(req.params.id);
      if (!origem) return respostaErro(res, 404, 'Padrão operacional não encontrado.');
      const nome = String(req.body?.nome || req.body?.nome_padrao || `Cópia de ${origem.nome || 'padrão operacional'}`).trim().slice(0, 120);
      if (!nome) return respostaErro(res, 400, 'Informe o nome do padrão duplicado.');
      const copia = {
        ...clonar(origem), id: generateId('pop'), nome, nome_padrao: undefined,
        versao: 0, publicado: false, publicado_em: null, publicado_por: null,
        ativo: req.body?.ativo === true, criado_por: req.user.usuario,
        criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString(),
      };
      delete copia.nome_padrao;
      const { data, error } = await supabase.from('cartao_grupos_modelo').insert(copia).select('*').single();
      if (error) {
        if (error.code === '23505') return respostaErro(res, 409, 'Já existe um padrão com esse nome.');
        throw new Error(error.message);
      }
      await registrar(req, 'duplicou', copia, `Duplicou o padrão “${origem.nome}” como “${nome}”.`);
      res.status(201).json(data || copia);
    }));

    const reordenarPadroes = asyncRoute(async (req, res) => {
      const atuais = await listarTudo();
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
      const ordens = new Map(ids.map((id, indice) => [id, indice]));
      const entradas = Array.isArray(req.body?.ordens) ? req.body.ordens : [];
      entradas.forEach((entrada) => {
        if (entrada && entrada.id !== undefined && Number.isInteger(Number(entrada.ordem))) ordens.set(String(entrada.id), Number(entrada.ordem));
      });
      const alterados = [];
      for (const grupo of atuais) {
        if (!ordens.has(String(grupo.id))) continue;
        const ordem = ordens.get(String(grupo.id));
        if (ordem < 0 || !Number.isInteger(ordem)) return respostaErro(res, 400, 'A ordem deve ser um número inteiro não negativo.');
        const resultado = await atualizar(grupo.id, { ordem, atualizado_em: new Date().toISOString() });
        alterados.push(resultado.data);
      }
      res.json(alterados);
    });
    router.post(`${caminho}/reordenar`, administrar, reordenarPadroes);
    router.put(`${caminho}/reordenar`, administrar, reordenarPadroes);

    const publicarPadrao = asyncRoute(async (req, res) => {
      const grupo = await buscar(req.params.id);
      if (!grupo) return respostaErro(res, 404, 'Padrão operacional não encontrado.');
      const versoes = await listarVersoes(grupo.id);
      const versao = Math.max(0, ...versoes.map((item) => Number(item.versao) || 0)) + 1;
      const agora = new Date().toISOString();
      const snapshot = { ...clonar(grupo), versao, publicado: true, publicado_em: agora, publicado_por: req.user.usuario };
      const registro = {
        id: generateId('popv'), grupo_id: grupo.id, versao,
        criado_por: req.user.usuario, snapshot,
      };
      const { error: erroVersao } = await supabase.from('cartao_grupos_modelo_versoes').insert(registro);
      if (erroVersao) throw new Error(erroVersao.message);
      const resultado = await atualizar(grupo.id, {
        versao, publicado: true, publicado_em: agora, publicado_por: req.user.usuario,
        atualizado_em: agora,
      });
      await registrar(req, 'publicou', grupo, `Publicou o padrão “${grupo.nome}” na versão ${versao}.`);
      res.json({ ...(resultado.data || { ...grupo, ...snapshot }), versao, publicado: true, snapshot });
    });
    router.post(`${caminho}/:id/publicar`, administrar, publicarPadrao);
    router.put(`${caminho}/:id/publicar`, administrar, publicarPadrao);

    // Componentes são mantidos no padrão como uma lista pequena e versionada.
    // A operação seletiva evita que uma edição de um componente apague os
    // demais, algo que era fácil de fazer com o PUT legado de configuração.
    router.post(`${caminho}/:id/componentes`, administrar, asyncRoute(async (req, res) => {
      const grupo = await buscar(req.params.id);
      if (!grupo) return respostaErro(res, 404, 'Padrão operacional não encontrado.');
      const componente = req.body?.componente || req.body;
      if (!componente || typeof componente !== 'object' || Array.isArray(componente)) return respostaErro(res, 400, 'Informe um componente válido.');
      const componentes = Array.isArray(grupo.componentes) ? clonar(grupo.componentes) : [];
      if (componentes.length >= MAX_COMPONENTES) return respostaErro(res, 400, `O padrão pode conter no máximo ${MAX_COMPONENTES} componentes.`);
      const novo = { id: String(componente.id || generateId('pcomp')), ...clonar(componente), ordem: componentes.length };
      componentes.push(novo);
      const resultado = await atualizar(grupo.id, { componentes, publicado: false, atualizado_em: new Date().toISOString() });
      res.status(201).json({ padrao: resultado.data, componente: novo });
    }));

    router.put(`${caminho}/:id/componentes/:componenteId`, administrar, asyncRoute(async (req, res) => {
      const grupo = await buscar(req.params.id);
      if (!grupo) return respostaErro(res, 404, 'Padrão operacional não encontrado.');
      const componentes = Array.isArray(grupo.componentes) ? clonar(grupo.componentes) : [];
      const indice = componentes.findIndex((item) => String(item.id) === req.params.componenteId);
      if (indice < 0) return respostaErro(res, 404, 'Componente não encontrado.');
      const patch = req.body?.componente || req.body;
      componentes[indice] = { ...componentes[indice], ...clonar(patch), id: componentes[indice].id };
      const resultado = await atualizar(grupo.id, { componentes, publicado: false, atualizado_em: new Date().toISOString() });
      res.json({ padrao: resultado.data, componente: componentes[indice] });
    }));

    router.delete(`${caminho}/:id/componentes/:componenteId`, administrar, asyncRoute(async (req, res) => {
      const grupo = await buscar(req.params.id);
      if (!grupo) return respostaErro(res, 404, 'Padrão operacional não encontrado.');
      const componentes = (Array.isArray(grupo.componentes) ? grupo.componentes : []).filter((item) => String(item.id) !== req.params.componenteId);
      if (componentes.length === (grupo.componentes || []).length) return respostaErro(res, 404, 'Componente não encontrado.');
      componentes.forEach((item, indice) => { item.ordem = indice; });
      const resultado = await atualizar(grupo.id, { componentes, publicado: false, atualizado_em: new Date().toISOString() });
      res.json(resultado.data);
    }));

    const reordenarComponentes = asyncRoute(async (req, res) => {
      const grupo = await buscar(req.params.id);
      if (!grupo) return respostaErro(res, 404, 'Padrão operacional não encontrado.');
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
      const atuais = Array.isArray(grupo.componentes) ? clonar(grupo.componentes) : [];
      const porId = new Map(atuais.map((item) => [String(item.id), item]));
      const ordenados = [...ids.map((id) => porId.get(id)).filter(Boolean), ...atuais.filter((item) => !ids.includes(String(item.id)))];
      ordenados.forEach((item, indice) => { item.ordem = indice; });
      const resultado = await atualizar(grupo.id, { componentes: ordenados, publicado: false, atualizado_em: new Date().toISOString() });
      res.json(resultado.data);
    });
    router.post(`${caminho}/:id/componentes/reordenar`, administrar, reordenarComponentes);
    router.put(`${caminho}/:id/componentes/reordenar`, administrar, reordenarComponentes);
  }

  // `/grupos-modelo` é registrado primeiro/por último sem diferença funcional;
  // Express diferencia os caminhos completos e mantém compatibilidade com os
  // clientes da primeira versão do módulo.
  for (const caminho of prefixos) montarRotas(caminho);
  return router;
}

module.exports = {
  criarRouterPadroesOperacionais,
  criarRouterGruposModelo: criarRouterPadroesOperacionais,
  normalizarPadrao,
  normalizarComponentes,
};
