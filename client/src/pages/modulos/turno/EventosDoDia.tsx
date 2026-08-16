import { Calendar, MapPin } from 'lucide-react';
import type { Tables } from '../../../types/supabase';
import { slugBadge } from '../../../lib/slug';

export type AtividadeDoTurno =
  | { origem: 'evento'; item: Tables<'eventos'> }
  | { origem: 'operacao'; item: Tables<'operacoes'> };

interface AtividadesDoDiaProps {
  atividades: AtividadeDoTurno[];
  alocacoes: Tables<'alocacoes'>[];
  dataBr: string;
  diaLabel: string;
  onAbrirEvento?: (id: string) => void;
  onAbrirOperacao?: (id: string) => void;
}

export function AtividadesDoDia({
  atividades, alocacoes, dataBr, diaLabel, onAbrirEvento, onAbrirOperacao,
}: AtividadesDoDiaProps) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <Calendar />
          <h2>Eventos e Operações do Dia</h2>
        </div>
        <span className="panel-header-sub">{dataBr} · {diaLabel}</span>
      </div>
      <div className="turno-lista">
        {atividades.length === 0 ? (
          <p className="turno-vazio">Nenhuma atividade agendada para este dia.</p>
        ) : (
          atividades.map((atividade) => {
            const ehEvento = atividade.origem === 'evento';
            const item = atividade.item;
            const nome = atividade.origem === 'evento' ? atividade.item.nome_evento : atividade.item.nome_operacao;
            const tipo = atividade.origem === 'evento' ? atividade.item.tipo_evento : atividade.item.tipo_operacao;
            const modalidades = alocacoes
              .filter((a) => atividade.origem === 'evento'
                ? a.evento_id === atividade.item.id
                : a.operacao_id === atividade.item.id)
              .map((a) => a.modalidade).filter(Boolean).join(', ');
            const abrir = () => ehEvento ? onAbrirEvento?.(item.id) : onAbrirOperacao?.(item.id);
            return (
              <div
                className="turno-linha" role="button" tabIndex={0} key={`${atividade.origem}-${item.id}`}
                onClick={abrir}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') abrir(); }}
              >
                <div className="turno-linha-hora">{item.horario_inicio || '--:--'}</div>
                <div className="turno-linha-info">
                  <div className="turno-linha-nome">{nome}</div>
                  <div className="turno-linha-sub">
                    <MapPin />{item.bairro || 'Sem bairro'}{modalidades ? ` · ${modalidades}` : ''}
                  </div>
                </div>
                <div className="turno-linha-fim">
                  <div className="turno-linha-os">OS {item.num_os_manual || '—'}</div>
                  <div className="turno-linha-badges">
                    <span className={`badge turno-badge-origem turno-badge-${atividade.origem}`}>
                      {ehEvento ? 'Evento' : 'Operação'}
                    </span>
                    <span className={`badge ${slugBadge(tipo)}`}>{tipo}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
