import { useAuth } from '../context/useAuth';
import { BOTTOM_TABS_P3, BOTTOM_TABS_OPERACIONAL, MAIS_ICON, type SectionId } from './navConfig';

interface BottomTabsProps {
  activeSection: SectionId;
  onNavigate: (id: SectionId) => void;
  onAbrirDrawer: () => void;
}

const MaisIcone = MAIS_ICON;

// Só visível em @media (max-width:768px) via CSS (.bottom-tabs) — mesmo comportamento
// do app antigo. Destinos por perfil: montarBottomTabs() em public/app.js.
export function BottomTabs({ activeSection, onNavigate, onAbrirDrawer }: BottomTabsProps) {
  const { usuario } = useAuth();
  if (!usuario) return null;

  const itens = usuario.role === 'P3' ? BOTTOM_TABS_P3 : BOTTOM_TABS_OPERACIONAL;

  return (
    <nav className="bottom-tabs" id="bottom-tabs">
      {itens.map((item) => {
        const Icone = item.icon;
        const ativo = activeSection === item.id;
        return (
          <button
            key={item.id}
            type="button"
            className={`bottom-tab${ativo ? ' ativo' : ''}`}
            aria-current={ativo ? 'page' : 'false'}
            onClick={() => onNavigate(item.id)}
          >
            <Icone />
            <span>{item.label}</span>
          </button>
        );
      })}
      <button type="button" className="bottom-tab" onClick={onAbrirDrawer}>
        <MaisIcone />
        <span>Mais</span>
      </button>
    </nav>
  );
}
