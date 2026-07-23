import { useState } from 'react';
import { useAuth } from '../context/useAuth';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { BottomTabs } from './BottomTabs';
import { secaoInicialDoPerfil, type SectionId } from './navConfig';

// Sem React Router ainda (vem no próximo lote) — a "seção ativa" é estado local,
// no mesmo papel do data-target/classList('active') do app antigo. Trocar por
// rotas de verdade é refatoração pequena: a estrutura de Sidebar/Topbar/BottomTabs
// já recebe activeSection/onNavigate de fora, só a fonte muda (useParams em vez de useState).
export function AppLayout() {
  const { usuario } = useAuth();
  const [activeSection, setActiveSection] = useState<SectionId>(() =>
    secaoInicialDoPerfil(usuario!.role),
  );
  const [drawerAberto, setDrawerAberto] = useState(false);

  function navegarPara(id: SectionId) {
    setActiveSection(id);
    setDrawerAberto(false); // fecha o drawer mobile ao trocar de aba — sem efeito em desktop
  }

  return (
    <div className="app-container">
      <div
        className={`nav-drawer-overlay${drawerAberto ? ' open' : ''}`}
        onClick={() => setDrawerAberto(false)}
      />
      <Sidebar activeSection={activeSection} onNavigate={navegarPara} drawerAberto={drawerAberto} />

      <main className="main-content">
        <Topbar activeSection={activeSection} onAbrirDrawer={() => setDrawerAberto(true)} />

        <section className="tab-content active">
          <p style={{ padding: 24, color: 'var(--text-muted)' }}>
            Em construção — conteúdo desta aba chega na Fase 3/4 da migração.
          </p>
        </section>
      </main>

      <BottomTabs activeSection={activeSection} onNavigate={navegarPara} onAbrirDrawer={() => setDrawerAberto(true)} />
    </div>
  );
}
