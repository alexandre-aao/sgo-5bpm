import { Menu, Sun, Moon, CalendarDays } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { useTheme } from '../hooks/useTheme';
import { SECTION_TITLES, type SectionId } from './navConfig';

const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

function dataHojeFormatada() {
  const agora = new Date();
  const y = agora.getFullYear();
  const m = String(agora.getMonth() + 1).padStart(2, '0');
  const d = String(agora.getDate()).padStart(2, '0');
  return { dia: `${d}/${m}/${y}`, semana: DIAS_SEMANA[agora.getDay()] };
}

interface TopbarProps {
  activeSection: SectionId;
  onAbrirDrawer: () => void;
}

export function Topbar({ activeSection, onAbrirDrawer }: TopbarProps) {
  const { usuario } = useAuth();
  const { tema, definirTema } = useTheme();
  const { dia, semana } = dataHojeFormatada();
  const { title, subtitle } = SECTION_TITLES[activeSection];

  if (!usuario) return null;
  const sigla = usuario.role === 'P3' ? 'P3' : usuario.role.substring(0, 2).toUpperCase();

  return (
    <header className="topbar">
      <div className="header-title">
        <button type="button" className="nav-drawer-toggle btn-icon" aria-label="Abrir menu" onClick={onAbrirDrawer}>
          <Menu />
        </button>
        <div className="header-title-text">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>
      <div className="header-actions">
        <div className="tema-toggle" role="radiogroup" aria-label="Tema de cor">
          <button
            type="button"
            className={`tema-opcao${tema === 'claro' ? ' ativo' : ''}`}
            role="radio"
            aria-checked={tema === 'claro'}
            onClick={() => definirTema('claro')}
          >
            <Sun /> <span>Claro</span>
          </button>
          <button
            type="button"
            className={`tema-opcao${tema === 'escuro' ? ' ativo' : ''}`}
            role="radio"
            aria-checked={tema === 'escuro'}
            onClick={() => definirTema('escuro')}
          >
            <Moon /> <span>Escuro</span>
          </button>
        </div>

        <div className="topbar-data">
          <CalendarDays />
          <div>
            <div className="topbar-data-dia">{dia}</div>
            <div className="topbar-data-semana">{semana}</div>
          </div>
        </div>

        <div className="profile">
          <div className="profile-avatar">{sigla}</div>
          <div className="profile-texto">
            <div className="profile-nome">{usuario.nome}</div>
            <div className="profile-role">{usuario.role === 'P3' ? 'P3 — Planejamento' : usuario.role}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
