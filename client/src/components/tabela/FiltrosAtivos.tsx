import { FilterX, X } from 'lucide-react';

export interface FiltroAtivo {
  /** Rótulo já formatado, ex.: "A partir de 01/07/2026" */
  rotulo: string;
  /** Remove só este filtro; sem isso o chip não fica clicável. */
  onRemover?: () => void;
}

interface FiltrosAtivosProps {
  filtros: FiltroAtivo[];
  onLimparTudo: () => void;
}

// Indicador de filtros ativos + limpar (Etapa 1, item 6). Não renderiza nada
// quando não há filtro — sem faixa vazia ocupando espaço na tela.
export function FiltrosAtivos({ filtros, onLimparTudo }: FiltrosAtivosProps) {
  if (filtros.length === 0) return null;

  return (
    <div className="filtros-ativos">
      <span className="filtros-ativos-titulo">
        {filtros.length === 1 ? '1 filtro ativo' : `${filtros.length} filtros ativos`}
      </span>
      {filtros.map((f) => (
        <span key={f.rotulo} className="filtro-chip">
          {f.rotulo}
          {f.onRemover && (
            <button type="button" onClick={f.onRemover} aria-label={`Remover filtro: ${f.rotulo}`}>
              <X />
            </button>
          )}
        </span>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" onClick={onLimparTudo}>
        <FilterX /> Limpar filtros
      </button>
    </div>
  );
}
