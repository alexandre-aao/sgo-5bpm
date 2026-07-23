import { Calendar, ShieldAlert, Wallet, AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { DashboardStats } from './useDashboardStats';

// Espelha renderTendencia() em public/app.js: "novo" quando não havia nada no
// período anterior, seta + variação % nos demais casos, nada quando os dois são 0.
function Tendencia({ atual, anterior }: { atual: number; anterior: number }) {
  if (anterior === 0) {
    if (atual === 0) return <span className="stat-tendencia" />;
    return (
      <span className="stat-tendencia tendencia-alta">
        <TrendingUp /> novo
      </span>
    );
  }

  const variacao = ((atual - anterior) / anterior) * 100;
  const Icone = variacao > 0 ? TrendingUp : variacao < 0 ? TrendingDown : Minus;
  const classe = variacao > 0 ? 'tendencia-alta' : variacao < 0 ? 'tendencia-baixa' : 'tendencia-estavel';
  const sinal = variacao > 0 ? '+' : '';

  return (
    <span className={`stat-tendencia ${classe}`}>
      <Icone /> {sinal}
      {variacao.toFixed(0)}% vs. período anterior
    </span>
  );
}

interface KpiRowProps {
  stats: DashboardStats;
  conflitosHoje: number;
  cartaoHojeResumo: string;
}

export function KpiRow({ stats, conflitosHoje, cartaoHojeResumo }: KpiRowProps) {
  const pctCota = stats.cota > 0 ? Math.min(100, Math.round((stats.consumidoMes / stats.cota) * 100)) : 0;
  const semConflito = conflitosHoje === 0;

  return (
    <div className="kpi-row">
      <div className="kpi-card">
        <div className="kpi-topo">
          <span className="kpi-label" style={{ color: 'var(--primary)' }}>Eventos (7 dias)</span>
          <span className="kpi-icone" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
            <Calendar />
          </span>
        </div>
        <div className="kpi-valor-linha">
          <span className="kpi-valor">{stats.eventosSemana}</span>
        </div>
        <div className="kpi-rodape">
          <Tendencia atual={stats.eventosSemana} anterior={stats.eventosSemanaAnterior} />
        </div>
      </div>

      <div className="kpi-card">
        <div className="kpi-topo">
          <span className="kpi-label" style={{ color: 'var(--success-fg)' }}>Operações (período)</span>
          <span className="kpi-icone" style={{ background: 'var(--success-bg)', color: 'var(--success-fg)' }}>
            <ShieldAlert />
          </span>
        </div>
        <div className="kpi-valor-linha">
          <span className="kpi-valor">{stats.operacoesMes}</span>
        </div>
        <div className="kpi-rodape">
          <span className="stat-sub">
            {stats.operacoesMes
              ? `${stats.operacoesMesExecutadas} executada(s) · ${stats.operacoesMes - stats.operacoesMesExecutadas} planejada(s)`
              : 'nenhuma no mês'}
          </span>
        </div>
      </div>

      <div className="kpi-card">
        <div className="kpi-topo">
          <span className="kpi-label" style={{ color: 'var(--warning-fg)' }}>Diárias Consumidas</span>
          <span className="kpi-icone" style={{ background: 'var(--warning-bg)', color: 'var(--warning-fg)' }}>
            <Wallet />
          </span>
        </div>
        <div className="kpi-valor-linha">
          <span className="kpi-valor" style={{ color: stats.cota > 0 && stats.consumidoMes > stats.cota ? 'var(--danger-fg)' : undefined }}>
            {stats.consumidoMes}
          </span>
          <span className="kpi-sufixo">de {stats.cota}</span>
        </div>
        <div className="kpi-rodape kpi-rodape-barra">
          <div className="mini-bar-track">
            <div className="mini-bar-fill" style={{ width: `${pctCota}%` }} />
          </div>
          <span className="kpi-pct">{pctCota}%</span>
        </div>
      </div>

      <Link
        to="/cartao"
        className="kpi-card kpi-card-clicavel"
        title="Ir para o Cartão Programa de hoje"
      >
        <div className="kpi-topo">
          <span
            className="kpi-label"
            style={{ color: semConflito ? 'var(--success-fg)' : 'var(--danger-fg)' }}
          >
            Conflitos Hoje
          </span>
          <span
            className="kpi-icone"
            style={{
              background: semConflito ? 'var(--success-bg)' : 'var(--danger-bg)',
              color: semConflito ? 'var(--success-fg)' : 'var(--danger-fg)',
            }}
          >
            <AlertTriangle />
          </span>
        </div>
        <div className="kpi-valor-linha">
          <span className="kpi-valor">{conflitosHoje}</span>
        </div>
        <div className="kpi-rodape">
          <span className="kpi-link">{cartaoHojeResumo}</span>
        </div>
      </Link>
    </div>
  );
}
