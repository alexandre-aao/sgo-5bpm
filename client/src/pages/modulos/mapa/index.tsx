import { useRef, useState } from 'react';
import { Map as MapIcon, AlertTriangle, MapPinPlus } from 'lucide-react';
import { useAppData } from '../../../context/useAppData';
import { useAuth } from '../../../context/useAuth';
import { useBairros } from '../../../hooks/useBairros';
import { useCartaoDeHoje } from '../../../hooks/useCartaoDeHoje';
import { normalizarTexto } from '../../../lib/cartaoConflitos';
import { DrawerEvento } from '../eventos/DrawerEvento';
import { MapaLeaflet, type MapaLeafletHandle } from './MapaLeaflet';
import { OcorrenciasPanel } from './OcorrenciasPanel';
import { GerenciarBairrosPanel } from './GerenciarBairrosPanel';
import { useMapaPrefs } from './useMapaPrefs';
import type { Tables } from '../../../types/supabase';

function calcularEventosDaSemana(eventos: Tables<'eventos'>[]): Tables<'eventos'>[] {
  const hoje = new Date();
  const primeiroDiaSemana = new Date(hoje);
  primeiroDiaSemana.setDate(hoje.getDate() - hoje.getDay() + (hoje.getDay() === 0 ? -6 : 1));
  primeiroDiaSemana.setHours(0, 0, 0, 0);
  const ultimoDiaSemana = new Date(primeiroDiaSemana);
  ultimoDiaSemana.setDate(primeiroDiaSemana.getDate() + 6);
  ultimoDiaSemana.setHours(23, 59, 59, 999);
  return eventos.filter((e) => {
    const dataEvt = new Date(e.data_inicio + 'T00:00:00');
    return dataEvt >= primeiroDiaSemana && dataEvt <= ultimoDiaSemana;
  });
}

// Aba Mapa — mapa de eventos da semana (Leaflet) + camada de viaturas do
// Cartão Programa de hoje + painel lateral de ocorrências. Espelha
// #tab-mapa + renderMapaTab()/renderMapaOcorrencias() em public/app.js.
export default function MapaPage() {
  const { usuario } = useAuth();
  const { dados, recarregar } = useAppData();
  const { bairros, criarBairro, atualizarBairro, excluirBairro } = useBairros();
  const { cartaoHoje } = useCartaoDeHoje();
  const { prefs, setPrefs } = useMapaPrefs();
  const mapaRef = useRef<MapaLeafletHandle>(null);
  const [eventoAbertoId, setEventoAbertoId] = useState<string | null>(null);
  const [gerenciarBairrosAberto, setGerenciarBairrosAberto] = useState(false);
  const podeGerenciarBairros = usuario?.role === 'P3';

  const eventosSemana = calcularEventosDaSemana(dados.eventos);

  const semCoordenada = eventosSemana.filter((evt) => {
    const bairroNorm = normalizarTexto(evt.bairro);
    return !bairroNorm || !bairros.some((b) => normalizarTexto(b.nome_bairro) === bairroNorm);
  });
  const nomesSemCoordenada = [...new Set(semCoordenada.map((e) => e.bairro || 'Sem bairro informado'))];

  function handleFocarOcorrencia(coordenada: Tables<'bairros_coordenadas'> | null, eventoId: string) {
    if (coordenada) {
      mapaRef.current?.focar(coordenada.latitude, coordenada.longitude);
    } else {
      setEventoAbertoId(eventoId);
    }
  }

  return (
    <>
      <div className="panel">
        <div className="panel-header flex-column-mobile">
          <div className="panel-title">
            <MapIcon />
            <h2>Mapa de Eventos da Semana</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Eventos da pauta com data dentro da semana corrente (segunda a domingo), agrupados por bairro.
            </p>
            {podeGerenciarBairros && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setGerenciarBairrosAberto((v) => !v)}>
                <MapPinPlus /> Gerenciar Bairros
              </button>
            )}
          </div>
        </div>

        <div className="mapa-controles">
          <label className="mapa-toggle">
            <input
              type="checkbox" checked={prefs.mostrarEventos}
              onChange={(e) => setPrefs({ ...prefs, mostrarEventos: e.target.checked })}
            />
            <span>Eventos</span>
          </label>
          <label className="mapa-toggle">
            <input
              type="checkbox" checked={prefs.mostrarViaturas}
              onChange={(e) => setPrefs({ ...prefs, mostrarViaturas: e.target.checked })}
            />
            <span>Viaturas (Cartão Programa de hoje)</span>
          </label>
          <div className="filter-group" style={{ marginLeft: 'auto' }}>
            <label htmlFor="mapa-select-estilo">Estilo do Mapa</label>
            <select
              id="mapa-select-estilo" value={prefs.estilo}
              onChange={(e) => setPrefs({ ...prefs, estilo: e.target.value as typeof prefs.estilo })}
            >
              <option value="dark">Escuro</option>
              <option value="voyager">Colorido</option>
            </select>
          </div>
        </div>

        {nomesSemCoordenada.length > 0 && (
          <div className="mapa-aviso">
            <AlertTriangle />
            <span>
              <strong>{semCoordenada.length}</strong> evento(s) desta semana em bairro(s) sem coordenada cadastrada:{' '}
              {nomesSemCoordenada.join(', ')}. Não aparecem no mapa. Cadastre a coordenada em{' '}
              <code>bairros_coordenadas</code> para incluí-los.
            </span>
          </div>
        )}

        <div className="mapa-layout">
          <MapaLeaflet
            ref={mapaRef}
            bairros={bairros}
            eventosSemana={eventosSemana}
            alocacoes={dados.alocacoes}
            viaturasCadastro={dados.viaturas}
            cartaoHoje={cartaoHoje}
            prefs={prefs}
          />
          <OcorrenciasPanel
            eventosSemana={eventosSemana}
            bairros={bairros}
            alocacoes={dados.alocacoes}
            onFocar={handleFocarOcorrencia}
          />
        </div>
      </div>

      {podeGerenciarBairros && gerenciarBairrosAberto && (
        <GerenciarBairrosPanel
          bairros={bairros}
          criarBairro={criarBairro}
          atualizarBairro={atualizarBairro}
          excluirBairro={excluirBairro}
        />
      )}

      {eventoAbertoId && (
        <DrawerEvento
          eventoId={eventoAbertoId}
          onFechar={() => setEventoAbertoId(null)}
          onAlterado={() => void recarregar()}
        />
      )}
    </>
  );
}
