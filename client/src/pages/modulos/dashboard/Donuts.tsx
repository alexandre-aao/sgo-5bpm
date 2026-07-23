import { Wallet, PieChart } from 'lucide-react';
import type { DashboardResumo } from './useDashboardResumo';

// Mesmas variáveis dos badges de tipo_evento (Listar Eventos), pra consistência
// visual automática entre as telas — espelha CORES_TIPO_EVENTO em public/app.js.
const CORES_TIPO_EVENTO: Record<string, string> = {
  Show: 'var(--badge-evento-1)',
  Futebol: 'var(--badge-evento-2)',
  Religioso: 'var(--badge-evento-3)',
  'Ato Público': 'var(--warning)',
  Cultural: 'var(--badge-evento-4)',
  'Evento Junino': 'var(--badge-evento-6)',
  'Missão Avulsa': 'var(--badge-evento-5)',
  Outros: 'var(--badge-neutro)',
};
function corTipoEvento(tipo: string): string {
  return CORES_TIPO_EVENTO[tipo] || 'var(--badge-neutro)';
}

interface DonutDiariasProps {
  periodo: string;
  consumido: number;
  planejado: number;
  cota: number;
}

// Donut "Diárias — Visão Geral": consumido (escalas reais) x planejado (estimado)
// x disponível — espelha renderDashboardDonutDiarias() em public/app.js.
export function DonutDiarias({ periodo, consumido, planejado, cota }: DonutDiariasProps) {
  const usado = consumido + planejado;

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <Wallet />
          <h2>Diárias — Visão Geral</h2>
        </div>
        <span className="panel-header-sub">{periodo}</span>
      </div>
      <div className="dashboard-donut-wrap">
        {cota <= 0 && usado === 0 ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>
            Sem cota nem diárias lançadas neste período.
          </p>
        ) : (
          <DonutDiariasSvg consumido={consumido} planejado={planejado} cota={cota} />
        )}
      </div>
    </div>
  );
}

function DonutDiariasSvg({ consumido, planejado, cota }: { consumido: number; planejado: number; cota: number }) {
  const usado = consumido + planejado;
  const base = Math.max(cota, usado) || 1;
  const disponivel = Math.max(0, cota - usado);
  const r = 40, cx = 50, cy = 50, traco = 16;
  const circ = 2 * Math.PI * r;

  const fatias = [
    { valor: consumido, cor: 'var(--success)', rotulo: 'Consumido (escalas reais)' },
    { valor: planejado, cor: 'var(--primary-solid)', rotulo: 'Planejado (estimado)' },
    { valor: disponivel, cor: 'var(--border-color)', rotulo: 'Disponível' },
  ].filter((f) => f.valor > 0);

  const arcos = fatias.reduce<Array<(typeof fatias)[number] & { comprimento: number; offset: number }>>(
    (acc, f) => {
      const comprimento = (f.valor / base) * circ;
      const acumulado = acc.reduce((sum, a) => sum + a.comprimento, 0);
      return [...acc, { ...f, comprimento, offset: -acumulado }];
    },
    [],
  );

  return (
    <>
      <svg
        viewBox="0 0 100 100"
        className="dashboard-donut-svg"
        role="img"
        aria-label={`Diárias do período: ${consumido} consumidas, ${planejado} planejadas, cota ${cota}`}
      >
        {arcos.map((a) => (
          <circle
            key={a.rotulo}
            cx={cx} cy={cy} r={r} fill="none" stroke={a.cor} strokeWidth={traco}
            strokeDasharray={`${a.comprimento} ${circ - a.comprimento}`}
            strokeDashoffset={a.offset}
            transform={`rotate(-90 ${cx} ${cy})`}
          >
            <title>{a.rotulo}: {a.valor}</title>
          </circle>
        ))}
        <text x="50" y="49" textAnchor="middle" className="dashboard-donut-total">{consumido}</text>
        <text x="50" y="59" textAnchor="middle" className="dashboard-donut-sub">Consumidas</text>
      </svg>
      <div className="dashboard-donut-legenda">
        {arcos.map((a) => {
          const pct = base > 0 ? Math.round((a.valor / base) * 100) : 0;
          return (
            <span key={a.rotulo}>
              <i className="legenda-dot" style={{ background: a.cor }} />
              {a.rotulo} — <strong>{a.valor} ({pct}%)</strong>
            </span>
          );
        })}
      </div>
    </>
  );
}

interface DonutTipoProps {
  distribuicaoTipo: DashboardResumo['distribuicao_tipo'];
}

// Distribuição por tipo de missão/evento — espelha renderDashboardDonut().
export function DonutTipo({ distribuicaoTipo }: DonutTipoProps) {
  const total = distribuicaoTipo.reduce((sum, t) => sum + t.total_eventos, 0);
  const r = 40, cx = 50, cy = 50, larguraTraco = 16;
  const circunferencia = 2 * Math.PI * r;

  const fatias = distribuicaoTipo.reduce<Array<(typeof distribuicaoTipo)[number] & { comprimento: number; offset: number }>>(
    (acc, t) => {
      const comprimento = (t.total_eventos / total) * circunferencia;
      const acumulado = acc.reduce((sum, f) => sum + f.comprimento, 0);
      return [...acc, { ...t, comprimento, offset: -acumulado }];
    },
    [],
  );

  return (
    <div className="panel dashboard-donut-panel">
      <div className="panel-header">
        <div className="panel-title">
          <PieChart />
          <h2>Distribuição por Tipo de Missão</h2>
        </div>
      </div>
      <div className="dashboard-donut-wrap">
        {total === 0 ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>Sem eventos neste período.</p>
        ) : (
          <>
            <svg viewBox="0 0 100 100" className="dashboard-donut-svg">
              {fatias.map((f) => (
                <circle
                  key={f.tipo_evento}
                  cx={cx} cy={cy} r={r} fill="none" stroke={corTipoEvento(f.tipo_evento)} strokeWidth={larguraTraco}
                  strokeDasharray={`${f.comprimento} ${circunferencia - f.comprimento}`}
                  strokeDashoffset={f.offset}
                  transform={`rotate(-90 ${cx} ${cy})`}
                >
                  <title>{f.tipo_evento}: {f.total_eventos} evento(s)</title>
                </circle>
              ))}
              <text x="50" y="55" textAnchor="middle" className="dashboard-donut-total">{total}</text>
            </svg>
            <div className="dashboard-donut-legenda">
              {fatias.map((f) => (
                <span key={f.tipo_evento}>
                  <i className="legenda-dot" style={{ background: corTipoEvento(f.tipo_evento) }} />
                  {' '}{f.tipo_evento} ({f.total_eventos})
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
