import { CalendarRange, CalendarClock, FileWarning, FileQuestion } from 'lucide-react';
import type { Tables } from '../../../types/supabase';

function getLocalDateStr(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface EventosKpisProps {
  eventosFiltrados: Tables<'eventos'>[];
  todosEventos: Tables<'eventos'>[];
}

// Faixa de KPIs de Listar Eventos — espelha renderEventosKpis() em public/app.js.
// "Próximos 7 dias" sempre olha pra lista inteira, não pro filtro ativo.
export function EventosKpis({ eventosFiltrados, todosEventos }: EventosKpisProps) {
  const hojeStr = getLocalDateStr();
  const daqui7 = new Date();
  daqui7.setDate(daqui7.getDate() + 7);
  const daqui7Str = getLocalDateStr(daqui7);
  const proximos = todosEventos.filter((e) => e.data_inicio >= hojeStr && e.data_inicio <= daqui7Str).length;

  const semOs = eventosFiltrados.filter((e) => !e.num_os_manual).length;
  const semSei = eventosFiltrados.filter((e) => !e.num_sei).length;

  return (
    <div className="kpi-row eventos-kpis">
      <div className="kpi-card kpi-card-horizontal">
        <span className="kpi-icone" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}><CalendarRange /></span>
        <div>
          <div className="kpi-valor">{eventosFiltrados.length}</div>
          <div className="kpi-label-sob">No filtro atual</div>
        </div>
      </div>
      <div className="kpi-card kpi-card-horizontal">
        <span className="kpi-icone" style={{ background: 'var(--success-bg)', color: 'var(--success-fg)' }}><CalendarClock /></span>
        <div>
          <div className="kpi-valor">{proximos}</div>
          <div className="kpi-label-sob">Próximos 7 dias</div>
        </div>
      </div>
      <div className="kpi-card kpi-card-horizontal">
        <span
          className="kpi-icone"
          style={{ background: semOs ? 'var(--warning-bg)' : 'var(--success-bg)', color: semOs ? 'var(--warning-fg)' : 'var(--success-fg)' }}
        >
          <FileWarning />
        </span>
        <div>
          <div className="kpi-valor">{semOs}</div>
          <div className="kpi-label-sob">Sem Nº da OS</div>
        </div>
      </div>
      <div className="kpi-card kpi-card-horizontal">
        <span
          className="kpi-icone"
          style={{ background: semSei ? 'var(--warning-bg)' : 'var(--success-bg)', color: semSei ? 'var(--warning-fg)' : 'var(--success-fg)' }}
        >
          <FileQuestion />
        </span>
        <div>
          <div className="kpi-valor">{semSei}</div>
          <div className="kpi-label-sob">Sem Nº SEI</div>
        </div>
      </div>
    </div>
  );
}
