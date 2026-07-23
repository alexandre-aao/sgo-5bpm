import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { BottomTabs } from './BottomTabs';
import { AppRoutes } from '../routes/AppRoutes';

export function AppLayout() {
  const [drawerAberto, setDrawerAberto] = useState(false);
  const { pathname } = useLocation();

  // Fecha o drawer mobile sempre que a rota muda — mesmo papel do fecharNavDrawer()
  // chamado a cada clique de nav-btn no app antigo, mas genérico (cobre navegação
  // por Sidebar, BottomTabs ou botão "voltar" do navegador). Ajuste de estado
  // durante o render (padrão documentado do React p/ "sincronizar com uma prop que
  // mudou" sem useEffect) em vez de useEffect+setState — ver useAutoRefresh.ts pro
  // mesmo motivo em outro lugar.
  const [pathnameAnterior, setPathnameAnterior] = useState(pathname);
  if (pathname !== pathnameAnterior) {
    setPathnameAnterior(pathname);
    setDrawerAberto(false);
  }

  return (
    <div className="app-container">
      <div
        className={`nav-drawer-overlay${drawerAberto ? ' open' : ''}`}
        onClick={() => setDrawerAberto(false)}
      />
      <Sidebar drawerAberto={drawerAberto} onNavigate={() => setDrawerAberto(false)} />

      <main className="main-content">
        <Topbar onAbrirDrawer={() => setDrawerAberto(true)} />
        {/* .tab-content.active: só uma seção "ativa" por vez (a que o Router
            renderizou), então sempre entra com as duas classes juntas — o
            toggle active/inativo que existia no app antigo (múltiplas seções
            no DOM ao mesmo tempo) não se aplica mais aqui. */}
        <div className="tab-content active">
          <AppRoutes />
        </div>
      </main>

      <BottomTabs onAbrirDrawer={() => setDrawerAberto(true)} />
    </div>
  );
}
