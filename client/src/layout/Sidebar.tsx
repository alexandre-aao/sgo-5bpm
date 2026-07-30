import { KeyRound, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useAppData } from '../context/useAppData';
import { calcularAlertasEventosUrgentes } from '../lib/alertasEventos';
import { NAV_SECTIONS, type SectionId } from './navConfig';

interface SidebarProps {
  drawerAberto: boolean;
  recolhida: boolean;
  onAlternarRecolhida: () => void;
  onNavigate: () => void;
}

export function Sidebar({ drawerAberto, recolhida, onAlternarRecolhida, onNavigate }: SidebarProps) {
  const { usuario, logout } = useAuth();
  const { dados } = useAppData();

  if (!usuario) return null;

  // Espelha applyRolePermissions(): sigla do avatar (P3 fica "P3", os demais
  // perfis usam as 2 primeiras letras do role em maiúsculo).
  const sigla = usuario.role === 'P3' ? 'P3' : usuario.role.substring(0, 2).toUpperCase();

  // Contador só onde há pendência de fato (Etapa 1, item 5): eventos em andamento
  // ou nos próximos 3 dias ainda sem Nº da OS / Nº SEI. Sai de `dados.eventos`,
  // que já está carregado — nenhuma chamada nova à API.
  const pendenciasEventos = calcularAlertasEventosUrgentes(dados.eventos).length;
  const contadores: Partial<Record<SectionId, number>> = { eventos: pendenciasEventos };

  const classesAside = [
    'sidebar',
    drawerAberto ? 'nav-drawer-open' : '',
    recolhida ? 'sidebar-recolhida' : '',
  ].filter(Boolean).join(' ');

  return (
    <aside className={classesAside}>
      <div className="brand">
        <div className="brand-icon">
          <img src="/img/brasao-5bpm.png" alt="Brasão do 5º BPM" />
        </div>
        <div className="brand-text">
          <h2>SGO 5º BPM</h2>
          <span>Sistema de Gestão Operacional</span>
        </div>
        <button
          type="button"
          className="btn-recolher-sidebar"
          onClick={onAlternarRecolhida}
          aria-label={recolhida ? 'Expandir menu' : 'Recolher menu'}
          title={recolhida ? 'Expandir menu' : 'Recolher menu'}
        >
          {recolhida ? <PanelLeftOpen /> : <PanelLeftClose />}
        </button>
      </div>

      <nav className="nav-menu">
        {NAV_SECTIONS.map((secao, i) => {
          const itensVisiveis = secao.items.filter((item) => item.roles.includes(usuario.role));
          if (itensVisiveis.length === 0) return null;

          return (
            <div key={secao.label ?? `sem-secao-${i}`}>
              {secao.label && <div className="nav-section-label">{secao.label}</div>}
              {itensVisiveis.map((item) => {
                const Icone = item.icon;
                const contador = contadores[item.id] ?? 0;
                return (
                  <NavLink
                    key={item.id}
                    to={`/${item.id}`}
                    onClick={onNavigate}
                    title={recolhida ? item.label : undefined}
                    className={({ isActive }) => `nav-btn${isActive ? ' active' : ''}`}
                  >
                    <Icone />
                    <span className="nav-btn-label">{item.label}</span>
                    {contador > 0 && (
                      <span className="nav-contador" title={`${contador} pendência(s)`}>
                        {contador}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Usuário e sair no rodapé (Etapa 1, item 5) — o card de perfil ficava no
          topo, empurrando o menu pra baixo. */}
      <div className="sidebar-footer">
        <div className="perfil-card">
          <div className="perfil-avatar">{sigla}</div>
          <div className="perfil-info">
            <div className="perfil-nome">{usuario.nome}</div>
            <div className="perfil-meta">
              <span>Perfil: {usuario.role}</span>
            </div>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm btn-sidebar-acao" disabled title="Em breve">
          <KeyRound />
          <span className="nav-btn-label">Alterar Senha</span>
        </button>
        <button
          className="btn btn-ghost btn-sm btn-sidebar-acao"
          onClick={() => logout()}
          title="Sair do Sistema"
        >
          <LogOut />
          <span className="nav-btn-label">Sair do Sistema</span>
        </button>
      </div>
    </aside>
  );
}
