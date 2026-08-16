import type { Tables } from '../../../types/supabase';
import { normalizarTexto } from '../../../lib/cartaoConflitos';
import { periodosSeSobrepoem } from '../../../lib/periodo';

export interface OperacaoComResumo extends Tables<'operacoes'> {
  militares_escalados: number;
  tem_escala: boolean;
  total_diarias: number;
}

export interface FiltrosOperacoes {
  situacao: string;
  busca: string;
  /** Filtro por período (Etapa 1, item 6) — client-side, sobre a lista já
   *  carregada; a rota /api/operacoes não mudou. */
  dataInicio: string;
  dataFim: string;
}

export function filtrosVazios(): FiltrosOperacoes {
  return { situacao: '', busca: '', dataInicio: '', dataFim: '' };
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
  if (filtros.dataInicio || filtros.dataFim) {
    const inicioFiltro = filtros.dataInicio || '0000-01-01';
    const fimFiltro = filtros.dataFim || '9999-12-31';
    lista = lista.filter((op) => periodosSeSobrepoem(op.data_inicio, op.data_termino, inicioFiltro, fimFiltro));
  }
  if (filtros.busca) {
    const termo = normalizarTexto(filtros.busca);
    lista = lista.filter((op) =>
      normalizarTexto(op.nome_operacao || '').includes(termo) ||
      normalizarTexto(op.demandante || '').includes(termo),
    );
  }

  return lista.sort((a, b) => b.data_inicio.localeCompare(a.data_inicio));
}
