import { Calendar, MapPin } from 'lucide-react';
import type { Tables } from '../../../types/supabase';
import { slugBadge } from '../../../lib/slug';

interface EventosDoDiaProps {
  eventos: Tables<'eventos'>[];
  alocacoes: Tables<'alocacoes'>[];
  dataBr: string;
  diaLabel: string;
  onAbrir?: (id: string) => void;
}

// Lista "Eventos do Dia" do Meu Turno — espelha o trecho de renderTurnoTab()
// que monta #turno-eventos-lista. Clicar numa linha abre a gaveta de detalhes
// do evento (chega no Lote 3).
export function EventosDoDia({ eventos, alocacoes, dataBr, diaLabel, onAbrir }: EventosDoDiaProps) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <Calendar />
          <h2>Eventos do Dia</h2>
        </div>
        <span className="panel-header-sub">{dataBr} · {diaLabel}</span>
      </div>
      <div className="turno-lista">
        {eventos.length === 0 ? (
          <p className="turno-vazio">Nenhum evento agendado para este dia.</p>
        ) : (
          eventos.map((evt) => {
            const modalidades = alocacoes.filter((a) => a.evento_id === evt.id).map((a) => a.modalidade).filter(Boolean).join(', ');
            return (
              <div
                className="turno-linha" role="button" tabIndex={0} key={evt.id}
                onClick={() => onAbrir?.(evt.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') onAbrir?.(evt.id); }}
              >
                <div className="turno-linha-hora">{evt.horario_inicio || '--:--'}</div>
                <div className="turno-linha-info">
                  <div className="turno-linha-nome">{evt.nome_evento}</div>
                  <div className="turno-linha-sub">
                    <MapPin />{evt.bairro || 'Sem bairro'}{modalidades ? ` · ${modalidades}` : ''}
                  </div>
                </div>
                <div className="turno-linha-fim">
                  <div className="turno-linha-os">OS {evt.num_os_manual || '—'}</div>
                  <span className={`badge ${slugBadge(evt.tipo_evento)}`}>{evt.tipo_evento}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
