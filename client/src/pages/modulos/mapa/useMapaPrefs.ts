import { useState } from 'react';

export interface MapaPrefs {
  mostrarEventos: boolean;
  mostrarViaturas: boolean;
  estilo: 'dark' | 'voyager';
}

const MAPA_PREFS_KEY = 'sgo_mapa_prefs';
const TEMA_PREFS_KEY = 'sgo_tema';

function carregarPrefsMapa(): MapaPrefs {
  // Sem preferência de mapa salva ainda: sugere o tile pelo tema global (claro ->
  // colorido, escuro/padrão -> escuro). Só influencia o padrão da primeira vez —
  // depois que o usuário mexe manualmente no seletor, a escolha salva prevalece.
  // Espelha carregarPrefsMapa() em public/app.js.
  const semPrefsSalvas = localStorage.getItem(MAPA_PREFS_KEY) === null;
  const temaAtual = localStorage.getItem(TEMA_PREFS_KEY) === 'escuro' ? 'escuro' : 'claro';
  const estiloPadrao = semPrefsSalvas && temaAtual === 'claro' ? 'voyager' : 'dark';
  try {
    const salvo = JSON.parse(localStorage.getItem(MAPA_PREFS_KEY) || '{}') as Partial<MapaPrefs>;
    return {
      mostrarEventos: salvo.mostrarEventos !== false,
      mostrarViaturas: salvo.mostrarViaturas !== false,
      estilo: salvo.estilo === 'voyager' ? 'voyager' : salvo.estilo === 'dark' ? 'dark' : estiloPadrao,
    };
  } catch {
    return { mostrarEventos: true, mostrarViaturas: true, estilo: estiloPadrao };
  }
}

function salvarPrefsMapa(prefs: MapaPrefs) {
  localStorage.setItem(MAPA_PREFS_KEY, JSON.stringify(prefs));
}

export function useMapaPrefs() {
  const [prefs, setPrefsState] = useState<MapaPrefs>(carregarPrefsMapa);

  function setPrefs(novo: MapaPrefs) {
    salvarPrefsMapa(novo);
    setPrefsState(novo);
  }

  return { prefs, setPrefs };
}
