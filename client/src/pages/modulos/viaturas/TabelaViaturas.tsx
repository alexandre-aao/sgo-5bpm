import { Pencil, Trash2 } from 'lucide-react';
import type { Tables } from '../../../types/supabase';
import { statusViaturaBadgeClass } from '../../../lib/categoriasViatura';

interface TabelaViaturasProps {
  viaturas: Tables<'viaturas'>[];
  filtroAtivo: boolean;
  podeExcluir: boolean;
  onEditar: (viatura: Tables<'viaturas'>) => void;
  onExcluir: (viatura: Tables<'viaturas'>) => void;
}

// Tabela do Cadastro de Viaturas — espelha renderViaturasTab() em public/app.js.
export function TabelaViaturas({ viaturas, filtroAtivo, podeExcluir, onEditar, onExcluir }: TabelaViaturasProps) {
  return (
    <div className="table-responsive">
      <table className="styled-table">
        <thead>
          <tr>
            <th>Prefixo</th>
            <th>Companhia</th>
            <th>Categoria</th>
            <th>Status</th>
            <th>Observação</th>
            <th className="text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {viaturas.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                Nenhuma viatura cadastrada{filtroAtivo ? ' com este status' : ''}.
              </td>
            </tr>
          ) : (
            viaturas.map((v) => (
              <tr key={v.id}>
                <td><strong>{v.prefixo}</strong></td>
                <td>{v.companhia || '-'}</td>
                <td>{v.categoria}</td>
                <td><span className={`badge ${statusViaturaBadgeClass(v.status)}`}>{v.status}</span></td>
                <td>{v.observacao || '-'}</td>
                <td className="text-right">
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button type="button" className="btn-icon btn-sm" title="Editar" aria-label="Editar" onClick={() => onEditar(v)}>
                      <Pencil style={{ width: 14, height: 14 }} />
                    </button>
                    {podeExcluir && (
                      <button type="button" className="btn-icon btn-danger btn-sm" title="Excluir" aria-label="Excluir" onClick={() => onExcluir(v)}>
                        <Trash2 style={{ width: 14, height: 14 }} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
