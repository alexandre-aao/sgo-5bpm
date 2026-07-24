import { AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react';
import type { AvisoExibicao } from './avisos';

interface AvisosDoTurnoProps {
  avisos: AvisoExibicao[];
}

// Trilho "Avisos do Turno" do Meu Turno — espelha #turno-avisos em
// renderTurnoTab() (public/app.js).
export function AvisosDoTurno({ avisos }: AvisosDoTurnoProps) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <AlertTriangle />
          <h2>Avisos do Turno</h2>
        </div>
      </div>
      <div className="dash-alertas-lista">
        {avisos.length === 0 ? (
          <div className="dash-alertas-vazio">
            <CheckCircle />
            <span>Nenhum aviso para este turno.</span>
          </div>
        ) : (
          avisos.map((a, i) => {
            const cor = a.deCartao ? 'var(--warning-fg)' : 'var(--danger-fg)';
            const bg = a.deCartao ? 'var(--warning-bg)' : 'var(--danger-bg)';
            const Icone = a.deCartao ? AlertTriangle : AlertCircle;
            const titulo = a.deCartao ? 'Conflito no Cartão Programa' : 'Evento com pendência';
            return (
              <div className="dash-alerta-item" key={i}>
                <span className="dash-alerta-icone" style={{ background: bg, color: cor }}><Icone /></span>
                <div className="dash-alerta-texto">
                  <div className="dash-alerta-titulo">{titulo}</div>
                  <div className="dash-alerta-sub">{a.mensagem}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
