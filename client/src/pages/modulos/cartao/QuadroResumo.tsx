import { Table2 } from 'lucide-react';
import type { CartaoViatura } from '../../../lib/cartaoConflitos';
import { formatHoraCartao } from '../../../lib/cartaoConflitos';

const ORDEM_COMPANHIA: Record<string, number> = { '1ª Companhia': 1, '2ª Companhia': 2, '3ª Companhia': 3 };

function horarioQtl(item: CartaoViatura['itens'][number] | undefined): string {
  if (!item) return '-';
  return `${formatHoraCartao(item.inicio)}${item.fim ? ' às ' + formatHoraCartao(item.fim) : ''}`;
}

interface QuadroResumoProps {
  viaturas: CartaoViatura[];
}

// Tabela oficial de impressão: Companhia x Viatura x Setor x QTL Almoço x QTL
// Jantar x Observação (Madrugada Segura) — espelha renderQuadroResumo().
export function QuadroResumo({ viaturas }: QuadroResumoProps) {
  const ordenadas = [...viaturas].sort((a, b) => {
    const oa = ORDEM_COMPANHIA[a.companhia] || 99;
    const ob = ORDEM_COMPANHIA[b.companhia] || 99;
    if (oa !== ob) return oa - ob;
    return (a.prefixo || '').localeCompare(b.prefixo || '');
  });

  return (
    <div className="panel cartao-resumo-panel">
      <div className="panel-header">
        <div className="panel-title">
          <Table2 />
          <h2>Quadro Resumo</h2>
        </div>
      </div>
      <div className="table-responsive">
        <table className="styled-table table-cards-mobile">
          <thead>
            <tr>
              <th>Companhia</th>
              <th>Viatura</th>
              <th>Setor</th>
              <th>QTL Almoço</th>
              <th>QTL Jantar</th>
              <th>Madrugada Segura / Observação</th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 16 }}>
                  Nenhuma viatura no cartão.
                </td>
              </tr>
            ) : (
              ordenadas.map((vtr) => (
                <tr key={vtr.id}>
                  <td data-label="Companhia">{vtr.companhia || '-'}</td>
                  <td className="card-title-cell">{vtr.prefixo}</td>
                  <td data-label="Setor">{vtr.setor}</td>
                  <td data-label="QTL Almoço">{horarioQtl(vtr.itens.find((i) => i.atividade === 'QTL Almoço'))}</td>
                  <td data-label="QTL Jantar">{horarioQtl(vtr.itens.find((i) => i.atividade === 'QTL Jantar'))}</td>
                  <td data-label="Observação">{vtr.observacao || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
