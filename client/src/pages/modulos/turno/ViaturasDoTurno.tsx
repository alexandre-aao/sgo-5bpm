import { Route } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CartaoViatura } from '../../../lib/cartaoConflitos';
import { categoriaBadgeClass } from '../cartao/constantes';

interface ViaturasDoTurnoProps {
  viaturas: CartaoViatura[];
}

// Tabela "Cartão Programa — Viaturas do Turno" do Meu Turno — espelha o
// trecho de renderTurnoTab() que monta #turno-viaturas-lista.
export function ViaturasDoTurno({ viaturas }: ViaturasDoTurnoProps) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <Route />
          <h2>Cartão Programa — Viaturas do Turno</h2>
        </div>
        <Link to="/cartao" className="link-btn">Ver cartão completo</Link>
      </div>
      <div className="table-responsive">
        <table className="styled-table table-cards-mobile">
          <thead>
            <tr>
              <th>Prefixo</th>
              <th>Setor</th>
              <th>Categoria</th>
              <th>Companhia</th>
              <th>Comandante</th>
            </tr>
          </thead>
          <tbody>
            {viaturas.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center" style={{ color: 'var(--text-muted)', padding: 22 }}>
                  Nenhuma viatura lançada para este dia.
                </td>
              </tr>
            ) : (
              viaturas.map((v) => (
                <tr key={v.id}>
                  <td className="card-title-cell"><strong>{v.prefixo}</strong></td>
                  <td data-label="Setor">{v.setor || '-'}</td>
                  <td data-label="Categoria">
                    {v.categoria ? <span className={`badge ${categoriaBadgeClass(v.categoria)}`}>{v.categoria}</span> : '-'}
                  </td>
                  <td data-label="Companhia">{v.companhia || '-'}</td>
                  <td data-label="Comandante">{v.comandante || 'Não informado'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
