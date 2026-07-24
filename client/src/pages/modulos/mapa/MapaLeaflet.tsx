import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import iconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import type { Tables } from '../../../types/supabase';
import { normalizarTexto, type CartaoDetalhado } from '../../../lib/cartaoConflitos';
import { esc } from '../../../lib/esc';
import type { MapaPrefs } from './useMapaPrefs';
import { criarIconeViatura, itemAtivoAgora } from './viaturasNoMapa';

// Vite não resolve os ícones-padrão do Leaflet a partir do CSS (caminho relativo
// quebra no bundle) — precisa apontar manualmente pros assets importados.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: iconRetina, iconUrl: icon, shadowUrl: iconShadow });

const MAPA_TILES: Record<MapaPrefs['estilo'], string> = {
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  voyager: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
};

export interface MapaLeafletHandle {
  focar: (lat: number, lng: number) => void;
}

interface MapaLeafletProps {
  bairros: Tables<'bairros_coordenadas'>[];
  eventosSemana: Tables<'eventos'>[];
  alocacoes: Tables<'alocacoes'>[];
  viaturasCadastro: Tables<'viaturas'>[];
  cartaoHoje: CartaoDetalhado | null;
  prefs: MapaPrefs;
}

// Instância única do Leaflet, gerenciada imperativamente (fora do ciclo de
// render do React, igual ao app antigo) — espelha renderMapaTab() em
// public/app.js, dividido em efeitos por responsabilidade (tile, marcadores de
// evento, marcadores de viatura) em vez de uma função só que refaz tudo.
export const MapaLeaflet = forwardRef<MapaLeafletHandle, MapaLeafletProps>(function MapaLeaflet(
  { bairros, eventosSemana, alocacoes, viaturasCadastro, cartaoHoje, prefs },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const estiloAtualRef = useRef<string | null>(null);
  const markersEventosRef = useRef<L.Marker[]>([]);
  const markersViaturasRef = useRef<L.Marker[]>([]);

  useImperativeHandle(ref, () => ({
    focar(lat: number, lng: number) {
      // animate:false de propósito — com animate:true o Leaflet descarta a
      // transição quando o salto de posição/zoom é grande.
      mapaRef.current?.setView([lat, lng], 15, { animate: false });
    },
  }), []);

  // Cria o mapa uma única vez. Ao contrário do app antigo (SPA de aba única,
  // o mapa nunca é desmontado), aqui a rota desmonta de verdade ao navegar
  // pra outra tela — sem `.remove()` no cleanup, voltar pro Mapa quebra com
  // "Map container is already initialized".
  useEffect(() => {
    if (!containerRef.current) return;
    const mapa = L.map(containerRef.current).setView([-5.85, -35.21], 12);
    mapaRef.current = mapa;

    const handleResize = () => mapa.invalidateSize();
    window.addEventListener('resize', handleResize);
    // O container só assume o tamanho final depois do primeiro layout da rota.
    const timer = setTimeout(() => mapa.invalidateSize(), 50);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
      mapa.remove();
      mapaRef.current = null;
      // O StrictMode do React (dev) desmonta e remonta este efeito uma vez
      // logo na primeira montagem — sem resetar esta ref, o efeito de tile
      // (que só recria a camada quando o estilo muda) achava que já tinha
      // aplicado o tile na instância nova e pulava, deixando o mapa sem tiles.
      estiloAtualRef.current = null;
    };
  }, []);

  // Troca o tile conforme o estilo salvo — só recria a camada se o estilo
  // realmente mudou (evita descartar/recarregar tiles à toa).
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || estiloAtualRef.current === prefs.estilo) return;
    if (tileLayerRef.current) mapa.removeLayer(tileLayerRef.current);
    tileLayerRef.current = L.tileLayer(MAPA_TILES[prefs.estilo], {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(mapa);
    estiloAtualRef.current = prefs.estilo;
  }, [prefs.estilo]);

  function ajustarEnquadramento() {
    const mapa = mapaRef.current;
    if (!mapa) return;
    const todos = [...markersEventosRef.current, ...markersViaturasRef.current];
    if (todos.length === 0) return;
    const grupo = L.featureGroup(todos);
    mapa.fitBounds(grupo.getBounds().pad(0.3));
  }

  // Marcador por bairro, com todos os eventos daquele bairro na semana no popup.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    markersEventosRef.current.forEach((m) => mapa.removeLayer(m));
    markersEventosRef.current = [];
    if (!prefs.mostrarEventos) return;

    const gruposPorCoordenada = new Map<string, { coordenada: Tables<'bairros_coordenadas'>; eventos: Tables<'eventos'>[] }>();
    eventosSemana.forEach((evt) => {
      const bairroNorm = normalizarTexto(evt.bairro);
      const coordenada = bairroNorm ? bairros.find((b) => normalizarTexto(b.nome_bairro) === bairroNorm) : undefined;
      if (!coordenada) return;
      if (!gruposPorCoordenada.has(coordenada.id)) gruposPorCoordenada.set(coordenada.id, { coordenada, eventos: [] });
      gruposPorCoordenada.get(coordenada.id)!.eventos.push(evt);
    });

    gruposPorCoordenada.forEach((grupo) => {
      const marker = L.marker([grupo.coordenada.latitude, grupo.coordenada.longitude]).addTo(mapa);
      const popupHtml = grupo.eventos
        .map((evt) => {
          const alocacoesEvt = alocacoes.filter((a) => a.evento_id === evt.id);
          const efetivo = alocacoesEvt.reduce((soma, a) => soma + (a.qtd_policiais || 0), 0);
          const viaturas = alocacoesEvt.reduce((soma, a) => soma + (a.qtd_viaturas || 0), 0);
          const dataBr = evt.data_inicio.split('-').reverse().join('/');
          return `
            <div class="mapa-popup-evento">
              <strong>${esc(evt.nome_evento)}</strong> (${esc(evt.tipo_evento)})<br>
              ${dataBr}${evt.horario_inicio ? ' às ' + esc(evt.horario_inicio) : ''}<br>
              Efetivo: ${efetivo} PM(s) · Viaturas: ${viaturas}
            </div>`;
        })
        .join('<hr>');
      marker.bindPopup(`<div class="mapa-popup"><h4>${esc(grupo.coordenada.nome_bairro)}</h4>${popupHtml}</div>`);
      markersEventosRef.current.push(marker);
    });

    ajustarEnquadramento();
  }, [bairros, eventosSemana, alocacoes, prefs.mostrarEventos]);

  // Camada de viaturas: cartão de hoje, uma por viatura, na coordenada do bairro
  // do item de roteiro ativo agora (fallback: setor cadastrado > setor do dia).
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    markersViaturasRef.current.forEach((m) => mapa.removeLayer(m));
    markersViaturasRef.current = [];
    if (!prefs.mostrarViaturas || !cartaoHoje) {
      ajustarEnquadramento();
      return;
    }

    (cartaoHoje.viaturas || []).forEach((vtr) => {
      const ativo = itemAtivoAgora(vtr);
      const viaturaCadastro = viaturasCadastro.find((vc) => normalizarTexto(vc.prefixo) === normalizarTexto(vtr.prefixo));
      const setorReferencia = (viaturaCadastro && viaturaCadastro.setor) || vtr.setor;
      const localReferencia = ativo ? ativo.local : setorReferencia;
      const localNorm = normalizarTexto(localReferencia);
      const setorNorm = normalizarTexto(setorReferencia);

      const coordenada =
        bairros.find((b) => {
          const bNorm = normalizarTexto(b.nome_bairro);
          return bNorm === localNorm || localNorm.includes(bNorm) || bNorm.includes(localNorm);
        }) ||
        bairros.find((b) => {
          const bNorm = normalizarTexto(b.nome_bairro);
          return bNorm === setorNorm || setorNorm.includes(bNorm) || bNorm.includes(setorNorm);
        });

      if (!coordenada) return;

      const marker = L.marker([coordenada.latitude, coordenada.longitude], { icon: criarIconeViatura(vtr.categoria) }).addTo(mapa);
      marker.bindPopup(`
        <div class="mapa-popup">
          <h4>VTR ${esc(vtr.prefixo)}</h4>
          <div class="mapa-popup-evento">
            <strong>Setor:</strong> ${esc(setorReferencia)}<br>
            <strong>Comandante:</strong> ${esc(vtr.comandante) || 'Não informado'}<br>
            ${ativo
              ? `<strong>Atividade agora:</strong> ${esc(ativo.atividade)} — ${esc(ativo.local)} (${esc(ativo.inicio)} às ${esc(ativo.fim)})`
              : '<strong>Sem atividade ativa no momento.</strong>'}
          </div>
        </div>
      `);
      markersViaturasRef.current.push(marker);
    });

    ajustarEnquadramento();
  }, [cartaoHoje, viaturasCadastro, bairros, prefs.mostrarViaturas]);

  return <div ref={containerRef} id="mapa-eventos-semana" className="mapa-container" />;
});
