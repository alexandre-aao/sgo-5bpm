import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { BOTTOM_TABS_P3, BOTTOM_TABS_OPERACIONAL, MAIS_ICON } from './navConfig';

interface BottomTabsProps {
  onAbrirDrawer: () => void;
}

const MaisIcone = MAIS_ICON;

// Só visível em @media (max-width:768px) via CSS (.bottom-tabs) — mesmo comportamento
// do app antigo. Destinos por perfil: montarBottomTabs() em public/app.js.
export function BottomTabs({ onAbrirDrawer }: BottomTabsProps) {
  const { usuario } = useAuth();
  if (!usuario) return null;

  const itens = usuario.role === 'P3' ? BOTTOM_TABS_P3 : BOTTOM_TABS_OPERACIONAL;

  return (
    <nav className="bottom-tabs" id="bottom-tabs">
      {itens.map((item) => {
        const Icone = item.icon;
        return (
          <NavLink
            key={item.id}
            to={`/${item.id}`}
            className={({ isActive }) => `bottom-tab${isActive ? ' ativo' : ''}`}
          >
            <Icone />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
      <button type="button" className="bottom-tab" onClick={onAbrirDrawer}>
        <MaisIcone />
        <span>Mais</span>
      </button>
    </nav>
  );
}
