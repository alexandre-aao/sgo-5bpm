import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import type { Tables } from '../../../types/supabase';

interface OperacoesRecentesProps {
  operacoes: Tables<'operacoes'>[];
  escalas: Tables<'escalas'>[];
}

// 5 operações mais recentes por data, montadas do state — sem fetch novo. Espelha
// renderDashboardOperacoesRecentes() em public/app.js.
export function OperacoesRecentes({ operacoes, escalas }: OperacoesRecentesProps) {
  const recentes = [...operacoes]
    .sort((a, b) => (b.data_inicio || '').localeCompare(a.data_inicio || ''))
    .slice(0, 5);

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <ShieldAlert />
          <h2>Operações Recentes</h2>
        </div>
      </div>
      <div className="table-responsive">
        <table className="styled-table table-cards-mobile">
          <thead>
            <tr>
              <th>Data</th>
              <th>Operação</th>
              <th>Tipo</th>
              <th>Situação</th>
              <th className="text-center">Diárias</th>
              <th className="text-center">Escalados</th>
            </tr>
          </thead>
          <tbody>
            {recentes.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center" style={{ color: 'var(--text-muted)', padding: 20 }}>
                  Nenhuma operação cadastrada.
                </td>
              </tr>
            ) : (
              recentes.map((op) => {
                const escalasOp = escalas.filter((s) => s.operacao_id === op.id);
                const temEscala = escalasOp.length > 0;
                const diarias = temEscala
                  ? escalasOp.reduce((sum, s) => sum + (s.total_diarias || 0), 0)
                  : op.qtd_diarias_estimada || 0;
                return (
                  <tr key={op.id}>
                    <td data-label="Data">{(op.data_inicio || '').split('-').reverse().join('/')}</td>
                    <td className="card-title-cell"><strong>{op.nome_operacao}</strong></td>
                    <td data-label="Tipo">{op.tipo_operacao || '-'}</td>
                    <td data-label="Situação">
                      <span className={`badge ${op.situacao === 'Executada' ? 'situacao-executada' : 'situacao-planejada'}`}>
                        {op.situacao || 'Planejada'}
                      </span>
                    </td>
                    <td className="text-center" data-label="Diárias" style={{ color: 'var(--warning-fg)', fontWeight: 700 }}>
                      {diarias}
                      {!temEscala && <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.72rem' }}> (est.)</span>}
                    </td>
                    <td className="text-center" data-label="Escalados">{escalasOp.length}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="panel-rodape-link">
        <Link to="/operacoes" className="link-btn">Ver todas as operações</Link>
      </div>
    </div>
  );
}
