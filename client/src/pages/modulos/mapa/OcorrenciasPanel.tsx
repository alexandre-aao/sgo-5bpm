import { MapPin, Car, Users } from 'lucide-react';
import type { Tables } from '../../../types/supabase';
import { normalizarTexto } from '../../../lib/cartaoConflitos';
import { slugBadge } from '../../../lib/slug';

interface OcorrenciasPanelProps {
  eventosSemana: Tables<'eventos'>[];
  bairros: Tables<'bairros_coordenadas'>[];
  alocacoes: Tables<'alocacoes'>[];
  onFocar: (coordenada: Tables<'bairros_coordenadas'> | null, eventoId: string) => void;
}

// Lista de ocorrências ao lado do mapa — espelha renderMapaOcorrencias() em
// public/app.js. Clicar centraliza o mapa quando o bairro tem coordenada
// cadastrada; sem coordenada, abre a gaveta do evento (decidido pelo pai).
export function OcorrenciasPanel({ eventosSemana, bairros, alocacoes, onFocar }: OcorrenciasPanelProps) {
  const ordenados = [...eventosSemana].sort(
    (a, b) => (a.data_inicio || '').localeCompare(b.data_inicio || '') || (a.horario_inicio || '').localeCompare(b.horario_inicio || ''),
  );

  return (
    <aside className="mapa-ocorrencias">
      <div className="mapa-ocorrencias-topo">
        <span className="mapa-ocorrencias-titulo">Ocorrências no Mapa</span>
        <span className="panel-header-sub">{eventosSemana.length} {eventosSemana.length === 1 ? 'ponto' : 'pontos'}</span>
      </div>
      <div>
        {ordenados.length === 0 ? (
          <p className="turno-vazio">Nenhum evento nesta semana.</p>
        ) : (
          ordenados.map((evt) => {
            const alocacoesEvt = alocacoes.filter((a) => a.evento_id === evt.id);
            const efetivo = alocacoesEvt.reduce((soma, a) => soma + (a.qtd_policiais || 0), 0);
            const viaturas = alocacoesEvt.reduce((soma, a) => soma + (a.qtd_viaturas || 0), 0);
            const bairroNorm = normalizarTexto(evt.bairro);
            const coord = bairroNorm ? bairros.find((b) => normalizarTexto(b.nome_bairro) === bairroNorm) : undefined;
            const [, mes, dia] = (evt.data_inicio || '--').split('-');

            return (
              <div
                key={evt.id}
                className={`mapa-ocorrencia${coord ? '' : ' mapa-ocorrencia-sem-coord'}`}
                role="button" tabIndex={0}
                title={coord ? 'Centralizar o mapa neste bairro' : 'Bairro sem coordenada cadastrada'}
                onClick={() => onFocar(coord || null, evt.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onFocar(coord || null, evt.id); }}
              >
                <span className={`mapa-ocorrencia-icone badge ${slugBadge(evt.tipo_evento)}`}><MapPin /></span>
                <div className="mapa-ocorrencia-info">
                  <div className="mapa-ocorrencia-topo">
                    <span className="mapa-ocorrencia-nome">{evt.nome_evento}</span>
                    <span className={`badge ${slugBadge(evt.tipo_evento)}`}>{evt.tipo_evento}</span>
                  </div>
                  <div className="mapa-ocorrencia-sub">
                    <MapPin />{evt.bairro || 'Sem bairro'} · {dia}/{mes}{evt.horario_inicio ? ' ' + evt.horario_inicio : ''}
                  </div>
                  <div className="mapa-ocorrencia-nums">
                    <span><Car />{viaturas} vtr</span>
                    <span><Users />{efetivo} pol</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
