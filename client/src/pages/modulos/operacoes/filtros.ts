import type { Tables } from '../../../types/supabase';
import { normalizarTexto } from '../../../lib/cartaoConflitos';

export interface OperacaoComResumo extends Tables<'operacoes'> {
  militares_escalados: number;
  tem_escala: boolean;
  total_diarias: number;
}

export interface FiltrosOperacoes {
  situacao: string;
  busca: string;
}

export function filtrosVazios(): FiltrosOperacoes {
  return { situacao: '', busca: '' };
}

/** Diária de cada operação (real se há escala, estimada se não) + filtro de
 * situação/texto + ordenação mais recente primeiro — espelha o corpo de
 * renderOperacoesTab() em public/app.js. */
export function getOperacoesFiltradas(
  operacoes: Tables<'operacoes'>[],
  escalas: Tables<'escalas'>[],
  filtros: FiltrosOperacoes,
): OperacaoComResumo[] {
  let lista: OperacaoComResumo[] = operacoes.map((op) => {
    const escalasOp = escalas.filter((s) => s.operacao_id === op.id);
    const temEscala = escalasOp.length > 0;
    const totalDiarias = temEscala
      ? escalasOp.reduce((soma, s) => soma + (s.total_diarias || 0), 0)
      : (op.qtd_diarias_estimada || 0);
    return { ...op, militares_escalados: escalasOp.length, tem_escala: temEscala, total_diarias: totalDiarias };
  });

  if (filtros.situacao) lista = lista.filter((op) => op.situacao === filtros.situacao);
  if (filtros.busca) {
    const termo = normalizarTexto(filtros.busca);
    lista = lista.filter((op) =>
      normalizarTexto(op.nome_operacao || '').includes(termo) ||
      normalizarTexto(op.demandante || '').includes(termo),
    );
  }

  return lista.sort((a, b) => b.data_inicio.localeCompare(a.data_inicio));
}
