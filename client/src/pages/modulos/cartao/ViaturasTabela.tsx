import { Pencil, Trash2 } from 'lucide-react';
import type { CartaoViatura } from '../../../lib/cartaoConflitos';

function slugBadge(valor: string): string {
  return valor
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

interface ViaturasTabelaProps {
  viaturas: CartaoViatura[];
  podeEditar: boolean;
  onEditar: (vtr: CartaoViatura) => void;
  onExcluir: (vtr: CartaoViatura) => void;
}

// Tabela enxuta da sub-aba "Viaturas" — espelha renderCartaoViaturasTabela().
export function ViaturasTabela({ viaturas, podeEditar, onEditar, onExcluir }: ViaturasTabelaProps) {
  return (
    <div className="table-responsive">
      <table className="styled-table table-cards-mobile">
        <thead>
          <tr>
            <th>Prefixo</th>
            <th>Setor</th>
            <th>Companhia</th>
            <th>Categoria</th>
            <th>Comandante</th>
            <th>Observação</th>
            <th className="text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {viaturas.length === 0 ? (
            <tr>
              <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                Nenhuma viatura adicionada. Use o formulário abaixo para montar o cartão.
              </td>
            </tr>
          ) : (
            viaturas.map((vtr) => (
              <tr key={vtr.id}>
                <td className="card-title-cell"><strong>{vtr.prefixo}</strong></td>
                <td data-label="Setor">{vtr.setor || '-'}</td>
                <td data-label="Companhia">{vtr.companhia || '-'}</td>
                <td data-label="Categoria">
                  {vtr.categoria ? <span className={`badge ${slugBadge('cat-' + vtr.categoria)}`}>{vtr.categoria}</span> : '-'}
                </td>
                <td data-label="Comandante">{vtr.comandante || 'Não informado'}</td>
                <td data-label="Observação" style={{ color: 'var(--text-muted)' }}>{vtr.observacao || '-'}</td>
                <td className="text-right" data-label="Ações">
                  {podeEditar ? (
                    <div className="acoes-linha">
                      <button className="btn-icon" title="Editar viatura" aria-label="Editar viatura" onClick={() => onEditar(vtr)}>
                        <Pencil />
                      </button>
                      <button className="btn-icon btn-icon-danger" title="Excluir viatura" aria-label="Excluir viatura" onClick={() => onExcluir(vtr)}>
                        <Trash2 />
                      </button>
                    </div>
                  ) : '—'}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
