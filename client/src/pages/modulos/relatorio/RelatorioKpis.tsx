import { Users, Wallet, ListChecks, TrendingUp } from 'lucide-react';
import type { RelatorioDiariaItem } from './useRelatorioDiarias';

interface RelatorioKpisProps {
  lista: RelatorioDiariaItem[];
}

export function RelatorioKpis({ lista }: RelatorioKpisProps) {
  const militares = lista.length;
  const diarias = lista.reduce((s, m) => s + (m.total_diarias || 0), 0);
  const escalas = lista.reduce((s, m) => s + (m.escalas_count || 0), 0);
  const media = militares > 0 ? diarias / militares : 0;
  const mediaTexto = Number.isInteger(media) ? String(media) : media.toFixed(1);

  return (
    <div className="kpi-row relatorio-kpis">
      <div className="kpi-card kpi-card-horizontal">
        <span className="kpi-icone" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}><Users /></span>
        <div>
          <div className="kpi-valor">{militares}</div>
          <div className="kpi-label-sob">Militares no mês</div>
        </div>
      </div>
      <div className="kpi-card kpi-card-horizontal">
        <span className="kpi-icone" style={{ background: 'var(--warning-bg)', color: 'var(--warning-fg)' }}><Wallet /></span>
        <div>
          <div className="kpi-valor">{diarias}</div>
          <div className="kpi-label-sob">Total de diárias</div>
        </div>
      </div>
      <div className="kpi-card kpi-card-horizontal">
        <span className="kpi-icone" style={{ background: 'var(--success-bg)', color: 'var(--success-fg)' }}><ListChecks /></span>
        <div>
          <div className="kpi-valor">{escalas}</div>
          <div className="kpi-label-sob">Escalas lançadas</div>
        </div>
      </div>
      <div className="kpi-card kpi-card-horizontal">
        <span className="kpi-icone" style={{ background: 'var(--info-bg)', color: 'var(--info-fg)' }}><TrendingUp /></span>
        <div>
          <div className="kpi-valor">{mediaTexto}</div>
          <div className="kpi-label-sob">Média por militar</div>
        </div>
      </div>
    </div>
  );
}
