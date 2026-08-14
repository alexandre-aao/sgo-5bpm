const express = require('express');

const CAMPOS_TEXTO = ['nome', 'tipo', 'area', 'bairro', 'missao', 'pontos', 'horario_inicio', 'horario_fim', 'observacoes'];
const LIMITES_TEXTO = {
  nome: 120,
  tipo: 80,
  area: 150,
  bairro: 100,
  missao: 100,
  pontos: 150,
  horario_inicio: 5,
  horario_fim: 5,
  observacoes: 300,
};

function validarItensConfiguracao(configuracao) {
  if (configuracao.itens === undefined) return null;
  if (!Array.isArray(configuracao.itens) || configuracao.itens.length > 50) {
    return 'A configuração pode conter no máximo 50 itens de roteiro.';
  }
  for (const item of configuracao.itens) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return 'Cada item da configuração deve ser um objeto.';
    if (String(item.inicio || '').length > 5 || String(item.fim || '').length > 5) return 'Os horários da configuração são inválidos.';
    if (String(item.local || '').length > 150) return 'O local de um item deve ter no máximo 150 caracteres.';
    if (String(item.atividade || '').length > 100) return 'A atividade de um item deve ter no máximo 100 caracteres.';
  }
  return null;
}

function normalizarGrupo(body, atual = {}) {
  const grupo = { ...atual };
  CAMPOS_TEXTO.forEach((campo) => {
    if (body[campo] !== undefined) grupo[campo] = String(body[campo] ?? '').trim();
  });
  for (const campo of CAMPOS_TEXTO) {
    if (grupo[campo] && grupo[campo].length > LIMITES_TEXTO[campo]) {
      return { erro: `O campo ${campo.replace('_', ' ')} deve ter no máximo ${LIMITES_TEXTO[campo]} caracteres.` };
    }
  }
  if (body.configuracao !== undefined) {
    if (!body.configuracao || typeof body.configuracao !== 'object' || Array.isArray(body.configuracao)) {
      return { erro: 'A configuração do grupo deve ser um objeto JSON.' };
    }
    if (JSON.stringify(body.configuracao).length > 50_000) return { erro: 'A configuração do grupo é muito grande.' };
    const erroItens = validarItensConfiguracao(body.configuracao);
    if (erroItens) return { erro: erroItens };
    grupo.configuracao = body.configuracao;
  }
  if (body.ativo !== undefined) {
    if (typeof body.ativo !== 'boolean') return { erro: 'O status do grupo é inválido.' };
    grupo.ativo = body.ativo;
  }
  if (body.ordem !== undefined) {
    const ordem = Number(body.ordem);
    if (!Number.isInteger(ordem) || ordem < 0) return { erro: 'A ordem do grupo deve ser um número inteiro não negativo.' };
    grupo.ordem = ordem;
  }
  if (!grupo.nome) return { erro: 'O nome do grupo é obrigatório.' };
  if (!grupo.tipo) grupo.tipo = 'Especial';
  const itensConfigurados = Array.isArray(grupo.configuracao?.itens) && grupo.configuracao.itens.length > 0;
  if (!itensConfigurados) {
    if (!grupo.horario_inicio) return { erro: 'Informe o horário de início do grupo.' };
    if (!grupo.area && !grupo.bairro && !grupo.pontos) return { erro: 'Informe a área, o bairro ou os pontos do grupo.' };
    const atividade = [grupo.missao || grupo.nome, grupo.pontos ? `Pontos: ${grupo.pontos}` : ''].filter(Boolean).join(' · ');
    if (atividade.length > 100) return { erro: 'A missão e os pontos do grupo devem totalizar no máximo 100 caracteres.' };
  }
  return { grupo };
}

function criarRouterGruposModelo({ asyncRoute, exigirP3, generateId, registrarAuditoria, supabase }) {
  const router = express.Router();

  router.get('/grupos-modelo', asyncRoute(async (req, res) => {
    let query = supabase.from('cartao_grupos_modelo').select('*').order('ordem', { ascending: true }).order('nome', { ascending: true });
    if (req.user.role !== 'P3' || req.query.todos !== '1') query = query.eq('ativo', true);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: 'Não foi possível carregar a biblioteca de grupos.' });
    res.json(data || []);
  }));

  router.post('/grupos-modelo', exigirP3, asyncRoute(async (req, res) => {
    const validado = normalizarGrupo(req.body);
    if (validado.erro) return res.status(400).json({ error: validado.erro });
    const grupo = {
      id: generateId('gm'),
      ...validado.grupo,
      configuracao: validado.grupo.configuracao || {},
      ativo: validado.grupo.ativo !== false,
      ordem: validado.grupo.ordem || 0,
      criado_por: req.user.usuario,
    };
    const { data, error } = await supabase.from('cartao_grupos_modelo').insert(grupo).select('*').single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Já existe um grupo com esse nome.' });
      throw new Error(error.message);
    }
    await registrarAuditoria({ req, acao: 'criou', entidade: 'Grupo de modelo', entidadeId: grupo.id, descricao: `Criou o grupo “${grupo.nome}”.` });
    res.status(201).json(data || grupo);
  }));

  router.put('/grupos-modelo/:id', exigirP3, asyncRoute(async (req, res) => {
    const { data: atual, error: erroBusca } = await supabase.from('cartao_grupos_modelo').select('*').eq('id', req.params.id).maybeSingle();
    if (erroBusca) throw new Error(erroBusca.message);
    if (!atual) return res.status(404).json({ error: 'Grupo de modelo não encontrado.' });
    const validado = normalizarGrupo(req.body, atual);
    if (validado.erro) return res.status(400).json({ error: validado.erro });
    const { data, error } = await supabase.from('cartao_grupos_modelo')
      .update({ ...validado.grupo, atualizado_em: new Date().toISOString() }).eq('id', atual.id).select('*').single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Já existe um grupo com esse nome.' });
      throw new Error(error.message);
    }
    await registrarAuditoria({ req, acao: 'alterou', entidade: 'Grupo de modelo', entidadeId: atual.id, descricao: `Atualizou o grupo “${validado.grupo.nome}”.`, antes: atual, depois: data || validado.grupo });
    res.json(data || validado.grupo);
  }));

  router.delete('/grupos-modelo/:id', exigirP3, asyncRoute(async (req, res) => {
    const { data: atual, error: erroBusca } = await supabase.from('cartao_grupos_modelo').select('id,nome').eq('id', req.params.id).maybeSingle();
    if (erroBusca) throw new Error(erroBusca.message);
    if (!atual) return res.status(404).json({ error: 'Grupo de modelo não encontrado.' });
    const { error } = await supabase.from('cartao_grupos_modelo').delete().eq('id', atual.id);
    if (error) throw new Error(error.message);
    await registrarAuditoria({ req, acao: 'excluiu', entidade: 'Grupo de modelo', entidadeId: atual.id, descricao: `Excluiu o grupo “${atual.nome}”.` });
    res.json({ ok: true });
  }));

  return router;
}

module.exports = { criarRouterGruposModelo };
