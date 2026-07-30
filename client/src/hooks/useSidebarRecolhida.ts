import { useCallback, useState } from 'react';

// Menu lateral recolhível (Etapa 1, item 5). A preferência mora no localStorage,
// no mesmo padrão de useTheme — o app não tem nenhuma coluna de preferência de
// usuário no banco e criar uma sairia do escopo (e custaria escrita por toggle).
const RECOLHIDA_PREFS_KEY = 'sgo_sidebar_recolhida';

function carregarPrefs(): boolean {
  return localStorage.getItem(RECOLHIDA_PREFS_KEY) === '1';
}

export function useSidebarRecolhida() {
  const [recolhida, setRecolhida] = useState<boolean>(carregarPrefs);

  const alternar = useCallback(() => {
    setRecolhida((atual) => {
      const nova = !atual;
      localStorage.setItem(RECOLHIDA_PREFS_KEY, nova ? '1' : '0');
      return nova;
    });
  }, []);

  return { recolhida, alternar };
}
