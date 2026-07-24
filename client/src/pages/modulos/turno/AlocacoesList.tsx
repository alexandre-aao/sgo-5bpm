import { Trash } from 'lucide-react';
import type { Tables } from '../../../types/supabase';

interface AlocacoesListProps {
  alocacoes: Tables<'alocacoes'>[];
  podeEditar: boolean;
  onRemover: (alocacao: Tables<'alocacoes'>) => void;
}

// Lista "Modalidades Alocadas" da gaveta de Evento — espelha renderAlocacoesList()
// em public/app.js.
export function AlocacoesList({ alocacoes, podeEditar, onRemover }: AlocacoesListProps) {
  if (alocacoes.length === 0) {
    return (
      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>
        Nenhuma modalidade alocada.
      </p>
    );
  }

  return (
    <div className="sub-list">
      {alocacoes.map((item) => (
        <div className="sub-list-item" key={item.id}>
          <div className="sub-list-item-info">
            <h5>{item.modalidade} ({item.qtd_policiais} Policiais / {item.qtd_viaturas} VTRs)</h5>
            <p>
              <strong>Comando:</strong> {item.comando_servico || '-'} | <strong>Prefixos:</strong> {item.prefixos_vtr || '-'}
            </p>
          </div>
          {podeEditar && (
            <button
              className="btn-icon btn-danger btn-sm" title="Remover alocação" aria-label="Remover alocação"
              onClick={() => onRemover(item)}
            >
              <Trash style={{ width: 12, height: 12 }} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
