import { Gauge, AlertTriangle } from 'lucide-react';
import type { PlanejadorResumo } from './usePlanejadorDiarias';

interface OcupacaoCotaProps {
  resumo: PlanejadorResumo;
}

// Barra segmentada consumido | planejado | disponível — espelha o bloco
// "Ocupação da Cota" de renderPlanejadorTab() em public/app.js.
export function OcupacaoCota({ resumo }: OcupacaoCotaProps) {
  const totalPlanejado = resumo.total_planejado || 0;
  const pctConsumido = resumo.cota_mensal > 0
    ? (resumo.total_consumido / resumo.cota_mensal) * 100
    : (resumo.total_consumido > 0 ? 101 : 0);
  const pctPlanejado = resumo.cota_mensal > 0
    ? (totalPlanejado / resumo.cota_mensal) * 100
    : (totalPlanejado > 0 ? 101 : 0);
  const pctTotal = pctConsumido + pctPlanejado;

  const larguraConsumido = Math.min(pctConsumido, 100);
  const larguraPlanejado = Math.max(0, Math.min(pctPlanejado, 100 - larguraConsumido));

  const classeFill = pctTotal > 100 ? ' danger' : pctTotal >= 75 ? ' warning' : '';

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <Gauge />
          <h2>Ocupação da Cota</h2>
        </div>
        <span className="panel-header-sub">
          {resumo.total_consumido + totalPlanejado} de {resumo.cota_mensal} diárias · {Math.round(pctTotal)}%
        </span>
      </div>
      <div className="budget-bar-section">
        <div className="budget-bar">
          <div className={`budget-bar-fill${classeFill}`} style={{ width: `${larguraConsumido}%` }} />
          <div className="budget-bar-fill-planejado" style={{ width: `${larguraPlanejado}%` }} />
        </div>
        <div className="budget-bar-legenda">
          <span><i className="legenda-dot legenda-consumido" /> Consumido (escalas reais) <strong>{resumo.total_consumido}</strong></span>
          <span><i className="legenda-dot legenda-planejado-cota" /> Planejado (estimado) <strong>{totalPlanejado}</strong></span>
          <span><i className="legenda-dot legenda-disponivel" /> Disponível <strong>{Math.max(0, resumo.saldo)}</strong></span>
        </div>
        {resumo.saldo < 0 && (
          <p className="budget-alert">
            <AlertTriangle />
            <span>Cota mensal excedida em {Math.abs(resumo.saldo)} diária(s), somando consumido e planejado.</span>
          </p>
        )}
      </div>
    </div>
  );
}
