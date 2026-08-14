// Registro mínimo de atividade administrativa/operacional.
// Este módulo nunca recebe senha, hash, token ou o corpo bruto da requisição.

const RETENCAO_AUDITORIA_MS = 30 * 24 * 60 * 60 * 1000;

function limitarTexto(valor, limite = 240) {
  return String(valor || '').trim().slice(0, limite);
}

function camposAlterados(antes, depois, campos) {
  const resultado = {};
  for (const campo of campos || []) {
    const anterior = antes?.[campo] ?? null;
    const novo = depois?.[campo] ?? null;
    if (JSON.stringify(anterior) !== JSON.stringify(novo)) {
      resultado[campo] = { antes: anterior, depois: novo };
    }
  }
  return resultado;
}

/**
 * Auditoria é best effort: uma falha no log não pode impedir o cadastro ou a
 * edição operacional. A primeira tentativa usa os campos novos; o fallback
 * mantém compatibilidade com a tabela `auditoria` que já existia no banco antes
 * da migration 013.
 */
async function registrarAuditoria({ supabase, generateId, req, acao, entidade, entidadeId, descricao, antes, depois, campos }) {
  const usuario = req?.user?.usuario || 'sistema';
  const base = {
    id: generateId('aud'),
    usuario,
    criado_em: Date.now(),
    acao: limitarTexto(acao, 60),
    entidade: limitarTexto(entidade, 80),
    entidade_id: entidadeId ? limitarTexto(entidadeId, 120) : null,
    descricao_resumida: limitarTexto(descricao, 300),
  };
  const alterados = camposAlterados(antes, depois, campos);
  try {
    const { error } = await supabase.from('auditoria').insert({
      ...base,
      usuario_id: usuario,
      usuario_nome: limitarTexto(req?.user?.nome, 160),
      campos_alterados: alterados,
    });
    if (error) throw error;
  } catch (erro) {
    // Compatibilidade transitória até a migration 013 ser aplicada.
    try {
      const { error } = await supabase.from('auditoria').insert(base);
      if (error) throw error;
    } catch (erroFallback) {
      console.error('Falha ao registrar histórico de atividades:', erroFallback.message || erro.message);
    }
  }
}

async function limparAuditoriaExpirada(supabase) {
  const corte = Date.now() - RETENCAO_AUDITORIA_MS;
  const { error } = await supabase.from('auditoria').delete().lt('criado_em', corte);
  if (error) throw new Error(`Falha ao limpar histórico expirado: ${error.message}`);
}

module.exports = { RETENCAO_AUDITORIA_MS, camposAlterados, limparAuditoriaExpirada, registrarAuditoria };
