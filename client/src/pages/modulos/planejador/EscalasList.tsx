import { Trash } from 'lucide-react';
import type { Tables } from '../../../types/supabase';

interface EscalasListProps {
  escalas: Tables<'escalas'>[];
  onRemover: (escala: Tables<'escalas'>) => void;
}

// Lista do Efetivo Escalado — espelha renderEscalasList() em public/app.js.
export function EscalasList({ escalas, onRemover }: EscalasListProps) {
  if (escalas.length === 0) {
    return (
      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>
        Nenhum militar escalado para diárias.
      </p>
    );
  }

  return (
    <div className="sub-list">
      {escalas.map((item) => (
        <div className="sub-list-item" key={item.id}>
          <div className="sub-list-item-info">
            <h5>{item.militar_nome} ({item.militar_id})</h5>
            <p>
              <strong>Aparições:</strong> {item.qtd_aparicoes} | <strong>Total de Diárias:</strong>{' '}
              <span style={{ color: 'var(--warning-fg)', fontWeight: 700 }}>{item.total_diarias} un.</span>
            </p>
          </div>
          <button
            className="btn-icon btn-danger btn-sm" title="Remover militar da escala" aria-label="Remover militar da escala"
            onClick={() => onRemover(item)}
          >
            <Trash style={{ width: 12, height: 12 }} />
          </button>
        </div>
      ))}
    </div>
  );
}
