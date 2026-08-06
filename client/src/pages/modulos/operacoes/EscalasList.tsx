import { CalendarRange, Trash } from 'lucide-react';
import type { Tables } from '../../../types/supabase';
import { chaveMilitar, ocorrenciasDoMilitar, type OperacaoDoGrupo } from '../../../lib/escalaLote';

interface EscalasListProps {
  escalas: Tables<'escalas'>[];
  /** Ocorrências do grupo de recorrência, ou null se a operação é avulsa. */
  grupo: OperacaoDoGrupo[] | null;
  onRemover: (escala: Tables<'escalas'>) => void;
  onRemoverDoGrupo: (escala: Tables<'escalas'>, ocorrencias: number) => void;
}

// Efetivo escalado nesta operação. Quando a operação pertence a um grupo de
// recorrência, cada militar mostra em quantas ocorrências está escalado e ganha a
// opção de sair do grupo inteiro — sem isso, desfazer uma replicação de 26 dias
// seria 26 remoções manuais.
export function EscalasList({ escalas, grupo, onRemover, onRemoverDoGrupo }: EscalasListProps) {
  if (escalas.length === 0) {
    return (
      <p className="texto-auxiliar escala-lista-vazia">
        Nenhum militar escalado para diárias.
      </p>
    );
  }

  return (
    <div className="sub-list">
      {escalas.map((item) => {
        const ocorrencias = grupo ? ocorrenciasDoMilitar(grupo, chaveMilitar(item.militar_id, item.militar_nome)) : 1;
        const emVarias = ocorrencias > 1;
        return (
          <div className="sub-list-item" key={item.id}>
            <div className="sub-list-item-info">
              <h5>
                {item.militar_nome} ({item.militar_id || 'sem matrícula'})
                {emVarias && (
                  <span className="badge-tint badge-tint-ok escala-badge-ocorrencias">
                    <CalendarRange /> {ocorrencias} ocorrências
                  </span>
                )}
              </h5>
              <p>
                <strong>Aparições:</strong> {item.qtd_aparicoes} | <strong>Total de Diárias:</strong>{' '}
                <span className="escala-diarias-total">{item.total_diarias} un.</span>
              </p>
            </div>
            <div className="sub-list-item-acoes">
              {emVarias && (
                <button
                  className="btn btn-secondary btn-sm"
                  title={`Remover ${item.militar_nome} das ${ocorrencias} ocorrências do grupo`}
                  onClick={() => onRemoverDoGrupo(item, ocorrencias)}
                >
                  Remover do grupo
                </button>
              )}
              <button
                className="btn-icon btn-danger btn-sm"
                title="Remover militar apenas desta operação"
                aria-label={`Remover ${item.militar_nome} desta operação`}
                onClick={() => onRemover(item)}
              >
                <Trash />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
