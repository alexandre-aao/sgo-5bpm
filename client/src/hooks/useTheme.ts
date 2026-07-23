import { useCallback, useState } from 'react';

// Espelha aplicarTema/carregarPrefsTema de public/app.js: light-first (padrão sem
// classe), 'padrao' é valor legado do localStorage e cai em 'claro'.
export type Tema = 'claro' | 'escuro';

const TEMA_PREFS_KEY = 'sgo_tema';

function carregarPrefsTema(): Tema {
  return localStorage.getItem(TEMA_PREFS_KEY) === 'escuro' ? 'escuro' : 'claro';
}

function aplicarTemaNoBody(tema: Tema) {
  document.body.classList.toggle('tema-escuro', tema === 'escuro');
}

// Sem useEffect: aplica o tema salvo assim que o módulo carrega (antes do primeiro
// paint do React), pra minimizar o flash do tema errado — mesmo objetivo do
// aplicarTema(carregarPrefsTema()) que roda logo no topo do app.js antigo.
const temaInicial = carregarPrefsTema();
aplicarTemaNoBody(temaInicial);

export function useTheme() {
  const [tema, setTema] = useState<Tema>(temaInicial);

  const definirTema = useCallback((novoTema: Tema) => {
    localStorage.setItem(TEMA_PREFS_KEY, novoTema);
    aplicarTemaNoBody(novoTema);
    setTema(novoTema);
  }, []);

  return { tema, definirTema };
}
