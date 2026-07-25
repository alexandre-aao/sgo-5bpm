import { Plus, ShieldPlus } from 'lucide-react';
import type { Tables } from '../../../types/supabase';
import type { CartaoResumo } from './useCartaoPrograma';

interface FaixaReforcosProps {
  reforcos: CartaoResumo[];
  selecionadoId: string | null;
  operacoes: Tables<'operacoes'>[];
  podeCriar: boolean;
  onSelecionar: (id: string) => void;
  onNovo: () => void;
}

/** Vários cartões de reforço podem existir na mesma data — esta faixa lista os da data
 * e escolhe qual está aberto no editor. Um chip por reforço, com título e operação
 * vinculada (quando houver). */
export function FaixaReforcos({
  reforcos,
  selecionadoId,
  operacoes,
  podeCriar,
  onSelecionar,
  onNovo,
}: FaixaReforcosProps) {
  return (
    <div className="panel cartao-reforcos-faixa">
      <div className="cartao-reforcos-lista">
        <span className="cartao-reforcos-rotulo">
          <ShieldPlus /> Reforços desta data
        </span>
        {reforcos.length === 0 ? (
          <span className="cartao-reforcos-vazio">Nenhum reforço lançado.</span>
        ) : (
          reforcos.map((r) => {
            const operacao = operacoes.find((op) => op.id === r.operacao_id);
            return (
              <button
                key={r.id}
                type="button"
                className={`cartao-reforco-chip${r.id === selecionadoId ? ' ativo' : ''}`}
                aria-pressed={r.id === selecionadoId}
                onClick={() => onSelecionar(r.id)}
              >
                <strong>{r.titulo || 'Reforço sem título'}</strong>
                <span>
                  {r.qtd_viaturas} VTR{r.qtd_viaturas === 1 ? '' : 's'}
                  {operacao ? ` · ${operacao.nome_operacao}` : ''}
                </span>
              </button>
            );
          })
        )}
      </div>
      {podeCriar && (
        <button type="button" className="btn btn-primary btn-sm" onClick={onNovo}>
          <Plus /> Novo Reforço
        </button>
      )}
    </div>
  );
}
