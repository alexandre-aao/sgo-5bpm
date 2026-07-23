import { KeyRound, LogOut } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { NAV_SECTIONS, type SectionId } from './navConfig';

interface SidebarProps {
  activeSection: SectionId;
  onNavigate: (id: SectionId) => void;
  drawerAberto: boolean;
}

export function Sidebar({ activeSection, onNavigate, drawerAberto }: SidebarProps) {
  const { usuario, logout } = useAuth();
  if (!usuario) return null;

  // Espelha applyRolePermissions(): sigla do avatar (P3 fica "P3", os demais
  // perfis usam as 2 primeiras letras do role em maiúsculo).
  const sigla = usuario.role === 'P3' ? 'P3' : usuario.role.substring(0, 2).toUpperCase();

  return (
    <aside className={`sidebar${drawerAberto ? ' nav-drawer-open' : ''}`}>
      <div className="brand">
        <div className="brand-icon">
          <img src="/img/brasao-5bpm.png" alt="Brasão do 5º BPM" />
        </div>
        <div className="brand-text">
          <h2>SGO 5º BPM</h2>
          <span>Sistema de Gestão Operacional</span>
        </div>
      </div>

      <div className="perfil-card">
        <div className="perfil-avatar">{sigla}</div>
        <div className="perfil-info">
          <div className="perfil-nome">{usuario.nome}</div>
          <div className="perfil-meta">
            <span>Perfil: {usuario.role}</span>
            <span className="perfil-online" /> Online
          </div>
        </div>
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
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`nav-btn${activeSection === item.id ? ' active' : ''}`}
                    onClick={() => onNavigate(item.id)}
                  >
                    <Icone />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Card "Cota Mensal de Diárias" (P3-only) fica pra quando o Dashboard/Planejador
          existirem de verdade (Fase 3) — não faz sentido mostrar zeros aqui. */}

      <div className="sidebar-footer">
        <button className="btn-alterar-senha" disabled title="Em breve">
          <KeyRound />
          <span>Alterar Senha</span>
        </button>
        <button className="btn-logout" onClick={() => logout()}>
          <LogOut />
          <span>Sair do Sistema</span>
        </button>
      </div>
    </aside>
  );
}
