import { useLocation } from 'react-router-dom';
import { ALL_NAV_ITEMS, type SectionId } from '../layout/navConfig';

/** Seção ativa derivada da URL — usado por Sidebar/Topbar/BottomTabs pra destacar
 * o item corrente e mostrar o título certo, sem duplicar estado. */
export function useActiveSection(): SectionId | null {
  const { pathname } = useLocation();
  const id = pathname.slice(1);
  const encontrado = ALL_NAV_ITEMS.find((item) => item.id === id);
  return encontrado ? encontrado.id : null;
}
