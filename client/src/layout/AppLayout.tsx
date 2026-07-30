import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { BottomTabs } from './BottomTabs';
import { AppRoutes } from '../routes/AppRoutes';
import { useSidebarRecolhida } from '../hooks/useSidebarRecolhida';
import { useAppData } from '../context/useAppData';
import { Carregando } from '../components/estado/Carregando';
import { ErroAoCarregar } from '../components/estado/ErroAoCarregar';

export function AppLayout() {
  const [drawerAberto, setDrawerAberto] = useState(false);
  const { recolhida, alternar } = useSidebarRecolhida();
  const { carregandoNucleo, erro, recarregar } = useAppData();
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
      <Sidebar
        drawerAberto={drawerAberto}
        recolhida={recolhida}
        onAlternarRecolhida={alternar}
        onNavigate={() => setDrawerAberto(false)}
      />

      <main className="main-content">
        <Topbar onAbrirDrawer={() => setDrawerAberto(true)} />
        {/* .tab-content.active: só uma seção "ativa" por vez (a que o Router
            renderizou), então sempre entra com as duas classes juntas — o
            toggle active/inativo que existia no app antigo (múltiplas seções
            no DOM ao mesmo tempo) não se aplica mais aqui. */}
        <div className="tab-content active">
          {/* Estados explícitos (Etapa 1, item 7): o erro é uma faixa acima do
              conteúdo — os dados anteriores continuam válidos e visíveis, só
              possivelmente desatualizados. */}
          {erro && <ErroAoCarregar mensagem={erro} onTentarDeNovo={() => void recarregar()} />}
          {carregandoNucleo ? <Carregando mensagem="Carregando dados do batalhão..." /> : <AppRoutes />}
        </div>
      </main>

      <BottomTabs onAbrirDrawer={() => setDrawerAberto(true)} />
    </div>
  );
}
