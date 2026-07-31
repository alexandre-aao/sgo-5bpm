import type { Tables } from '../../../../types/supabase';
import type { CartaoViatura } from '../../../../lib/cartaoConflitos';
import type { AvisoDoCartao } from './CartaoPdf';
import { ordenarPorPrioridade, avisoVigente, MAX_AVISOS_POR_CARTAO, type PrioridadeAviso } from '../../../../lib/avisos';

/**
 * Resolve os ids gravados na viatura (`avisos_ids`) para o que o documento
 * imprime. É aqui que o texto do aviso entra no cartão — ele nunca é copiado
 * para dentro do JSONB da viatura, então o cartão sempre reflete o texto atual.
 *
 * Avisos que deixaram de ser vigentes desde a seleção são descartados: não faz
 * sentido mandar ao comandante uma orientação que a P3 já encerrou.
 */
export function avisosSelecionadosParaPdf(
  viatura: CartaoViatura,
  avisos: Tables<'avisos'>[],
  bairros: Tables<'bairros_coordenadas'>[],
): AvisoDoCartao[] {
  const ids = viatura.avisos_ids || [];
  if (ids.length === 0) return [];

  const selecionados = avisos.filter((a) => ids.includes(a.id) && avisoVigente(a));

  return ordenarPorPrioridade(selecionados)
    .slice(0, MAX_AVISOS_POR_CARTAO)
    .map((aviso) => ({
      id: aviso.id,
      prioridade: aviso.prioridade as PrioridadeAviso,
      categoria: aviso.categoria || '',
      texto: aviso.texto,
      bairro: (bairros.find((b) => b.id === aviso.bairro_id)?.nome_bairro || '').toUpperCase(),
    }));
}
