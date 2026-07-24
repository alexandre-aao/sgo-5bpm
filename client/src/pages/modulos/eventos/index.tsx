import { useState } from 'react';
import { CalendarSearch } from 'lucide-react';
import { useAppData } from '../../../context/useAppData';
import { useAuth } from '../../../context/useAuth';
import { useToast } from '../../../context/useToast';
import { ModalRelatorioPdf } from '../../../components/relatorioPdf/ModalRelatorioPdf';
import { EventosKpis } from './EventosKpis';
import { FiltrosEventosBar } from './FiltrosEventosBar';
import { TabelaEventos } from './TabelaEventos';
import { DrawerEvento } from './DrawerEvento';
import { RelatorioEventosPdf } from './RelatorioEventosPdf';
import { filtrosVazios, getEventosFiltrados, type FiltrosEventos } from './filtros';

// Listar Eventos — consulta geral com filtro de período/texto e paginação
// real (1ª tela do projeto a ter — a API nunca paginou, decisão registrada
// em MIGRACAO.md). Espelha #tab-eventos + renderEventosTab() em public/app.js.
// Fase 4.1 Lote 4 (final): + Relatório (PDF) — 1ª portagem do padrão
// compartilhado de relatório PDF pro React (Fase 5 vai reaproveitar em
// Relatório Diárias).
export default function EventosPage() {
  const { usuario } = useAuth();
  const { dados, recarregar } = useAppData();
  const { toast } = useToast();
  const [filtros, setFiltros] = useState<FiltrosEventos>(filtrosVazios);
  const [pagina, setPagina] = useState(1);
  const [eventoAbertoId, setEventoAbertoId] = useState<string | null>(null);
  const [modalRelatorioAberto, setModalRelatorioAberto] = useState(false);

  const eventosFiltrados = getEventosFiltrados(dados.eventos, filtros);

  function handleAbrirRelatorio() {
    if (eventosFiltrados.length === 0) {
      toast('Nenhum evento no filtro ativo para gerar o relatório.', 'warning');
      return;
    }
    setModalRelatorioAberto(true);
  }

  function handleMudarFiltros(novo: FiltrosEventos) {
    setFiltros(novo);
    setPagina(1);
  }

  function handleLimparFiltros() {
    setFiltros(filtrosVazios());
    setPagina(1);
  }

  return (
    <>
      <EventosKpis eventosFiltrados={eventosFiltrados} todosEventos={dados.eventos} />

      <div className="panel events-panel">
        <div className="panel-header flex-column-mobile">
          <div className="panel-title">
            <CalendarSearch />
            <h2>Listar Eventos</h2>
          </div>
          <FiltrosEventosBar
            filtros={filtros} onMudar={handleMudarFiltros} onLimpar={handleLimparFiltros}
            onRelatorio={handleAbrirRelatorio} podeCriar={usuario?.role === 'P3'}
          />
        </div>

        <TabelaEventos
          eventos={eventosFiltrados} totalGeral={dados.eventos.length}
          pagina={pagina} onMudarPagina={setPagina} onAbrir={setEventoAbertoId}
        />
      </div>

      {eventoAbertoId && (
        <DrawerEvento
          eventoId={eventoAbertoId}
          onFechar={() => setEventoAbertoId(null)}
          onAlterado={() => void recarregar()}
        />
      )}

      {modalRelatorioAberto && (
        <ModalRelatorioPdf onFechar={() => setModalRelatorioAberto(false)}>
          <RelatorioEventosPdf eventos={eventosFiltrados} filtros={filtros} />
        </ModalRelatorioPdf>
      )}
    </>
  );
}
