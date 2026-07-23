import { Link } from 'react-router-dom';
import { CalendarDays, Zap, CalendarPlus, ShieldPlus, ClipboardList, FileText, Map } from 'lucide-react';
import type { Tables } from '../../../types/supabase';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function getLocalDateStr(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface DashRailProps {
  eventos: Tables<'eventos'>[];
}

// Trilho lateral do Dashboard: Eventos Próximos (client-side, sem fetch novo) +
// Atalhos Rápidos — espelha renderDashboardEventosProximos() e o painel
// "Atalhos Rápidos" de public/index.html.
export function DashRail({ eventos }: DashRailProps) {
  const hojeStr = getLocalDateStr();
  const proximos = eventos
    .filter((e) => (e.data_inicio || '') >= hojeStr)
    .sort((a, b) => (a.data_inicio || '').localeCompare(b.data_inicio || ''))
    .slice(0, 5);

  return (
    <aside className="dash-rail">
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <CalendarDays />
            <h2>Eventos Próximos</h2>
          </div>
          <Link to="/eventos" className="link-btn">Ver todos</Link>
        </div>
        <div className="table-responsive">
          <table className="styled-table styled-table-compacta">
            <thead>
              <tr>
                <th>Data</th>
                <th>Evento</th>
                <th>Nº OS</th>
              </tr>
            </thead>
            <tbody>
              {proximos.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-center" style={{ color: 'var(--text-muted)', padding: 20 }}>
                    Nenhum evento futuro.
                  </td>
                </tr>
              ) : (
                proximos.map((evt) => {
                  const [, mes, dia] = evt.data_inicio.split('-');
                  const diaSemana = DIAS[new Date(evt.data_inicio + 'T00:00:00').getDay()];
                  return (
                    <tr key={evt.id}>
                      <td>{dia}/{mes} ({diaSemana})</td>
                      <td title={evt.nome_evento}>
                        <strong>{evt.nome_evento}</strong>
                        <span className="celula-sub">{evt.bairro || 'Bairro não informado'}</span>
                      </td>
                      <td title={evt.num_os_manual || ''}>
                        <code style={{ color: 'var(--primary)' }}>{evt.num_os_manual || '-'}</code>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <Zap />
            <h2>Atalhos Rápidos</h2>
          </div>
        </div>
        <div className="atalhos-lista">
          <Link to="/cadastro" className="atalho"><CalendarPlus /> Novo Evento</Link>
          <Link to="/operacoes" className="atalho"><ShieldPlus /> Nova Operação</Link>
          <Link to="/cartao" className="atalho"><ClipboardList /> Cartão Programa de Hoje</Link>
          <Link to="/planejador" className="atalho"><Zap /> Lançamento — Missão Avulsa</Link>
          <Link to="/relatorio" className="atalho"><FileText /> Relatório de Diárias</Link>
          <Link to="/mapa" className="atalho"><Map /> Mapa de Eventos</Link>
        </div>
      </div>
    </aside>
  );
}
