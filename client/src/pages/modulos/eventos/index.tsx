import { useState } from 'react';
import { CalendarSearch } from 'lucide-react';
import { useAppData } from '../../../context/useAppData';
import { useParametroInicial } from '../../../hooks/useParametroInicial';
import { useAuth } from '../../../context/useAuth';
import { useToast } from '../../../context/useToast';
import { ModalRelatorioPdf } from '../../../components/relatorioPdf/ModalRelatorioPdf';
import { FiltrosAtivos, type FiltroAtivo } from '../../../components/tabela/FiltrosAtivos';
import { paraDataBr } from '../../../lib/periodo';
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

  // Destino da paleta de comandos: /eventos?evento=<id> abre a gaveta daquele
  // evento. O parâmetro é consumido uma vez e some da URL.
  useParametroInicial('evento', setEventoAbertoId);
  // Destino do KPI "Eventos (7 dias)" do Dashboard: chega com o mesmo recorte
  // que o card contou, senão o número clicado não bateria com a lista aberta.
  useParametroInicial('de', (valor) => setFiltros((f) => ({ ...f, dataInicio: valor })));
  useParametroInicial('ate', (valor) => setFiltros((f) => ({ ...f, dataFim: valor })));

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

  // Chips do indicador de filtros ativos (Etapa 1, item 6)
  const filtrosAtivos: FiltroAtivo[] = [
    filtros.dataInicio && {
      rotulo: `A partir de ${paraDataBr(filtros.dataInicio)}`,
      onRemover: () => handleMudarFiltros({ ...filtros, dataInicio: '' }),
    },
    filtros.dataFim && {
      rotulo: `Até ${paraDataBr(filtros.dataFim)}`,
      onRemover: () => handleMudarFiltros({ ...filtros, dataFim: '' }),
    },
    filtros.busca.trim() && {
      rotulo: `Texto: "${filtros.busca.trim()}"`,
      onRemover: () => handleMudarFiltros({ ...filtros, busca: '' }),
    },
  ].filter(Boolean) as FiltroAtivo[];

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
            filtros={filtros} onMudar={handleMudarFiltros}
            onRelatorio={handleAbrirRelatorio} podeCriar={usuario?.role === 'P3'}
          />
        </div>

        <FiltrosAtivos filtros={filtrosAtivos} onLimparTudo={handleLimparFiltros} />

        <TabelaEventos
          eventos={eventosFiltrados} totalGeral={dados.eventos.length}
          pagina={pagina} temFiltro={filtrosAtivos.length > 0}
          onMudarPagina={setPagina} onAbrir={setEventoAbertoId}
          onLimparFiltros={handleLimparFiltros}
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
