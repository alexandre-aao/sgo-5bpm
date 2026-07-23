import { Trophy } from 'lucide-react';
import type { DashboardResumo } from './useDashboardResumo';

interface TopMilitaresProps {
  topMilitares: DashboardResumo['top_militares'];
}

// Espelha renderTopMilitares() em public/app.js.
export function TopMilitares({ topMilitares }: TopMilitaresProps) {
  return (
    <div className="panel dashboard-ranking-panel">
      <div className="panel-header">
        <div className="panel-title">
          <Trophy />
          <h2>Top 10 — Ranking de Empenho</h2>
        </div>
      </div>
      <div className="table-responsive">
        <table className="styled-table table-cards-mobile">
          <thead>
            <tr>
              <th style={{ width: 56 }}>#</th>
              <th>Policial</th>
              <th className="text-center">Escalas</th>
              <th className="text-center">Diárias</th>
            </tr>
          </thead>
          <tbody>
            {topMilitares.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                  Nenhuma escala lançada neste período.
                </td>
              </tr>
            ) : (
              topMilitares.map((m, i) => (
                <tr key={`${m.militar_nome}-${i}`}>
                  <td data-label="Posição">{i + 1}º</td>
                  <td className="card-title-cell">
                    <strong>{m.militar_nome}</strong>
                    {m.posto_graduacao && <span className="rank-posto">{m.posto_graduacao}</span>}
                  </td>
                  <td className="text-center" data-label="Escalas">{m.escalas_count}</td>
                  <td className="text-center" data-label="Diárias">{m.total_diarias}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
