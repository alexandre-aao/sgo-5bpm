import { useCallback, useEffect, useState } from 'react';

// Light-first: sem classe no body = claro. 'padrao' é valor legado do
// localStorage do app antigo e cai em 'claro'.
// 'auto' (2026-08) segue o prefers-color-scheme do sistema e continua seguindo
// enquanto estiver escolhido — trocar o tema do SO reflete na hora, sem recarregar.
export type Tema = 'claro' | 'escuro' | 'auto';
/** O que de fato vai para o body: 'auto' sempre resolve para um dos dois. */
type TemaEfetivo = 'claro' | 'escuro';

const TEMA_PREFS_KEY = 'sgo_tema';
const CONSULTA_ESCURO = '(prefers-color-scheme: dark)';

function sistemaPrefereEscuro(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(CONSULTA_ESCURO).matches;
}

function carregarPrefsTema(): Tema {
  const salvo = localStorage.getItem(TEMA_PREFS_KEY);
  if (salvo === 'escuro' || salvo === 'claro' || salvo === 'auto') return salvo;
  // Sem preferência salva o padrão continua sendo claro, e não 'auto': mudar o
  // padrão de quem nunca escolheu alteraria a aparência do app sem pedido.
  return 'claro';
}

function resolverTema(tema: Tema): TemaEfetivo {
  if (tema === 'auto') return sistemaPrefereEscuro() ? 'escuro' : 'claro';
  return tema;
}

function aplicarTemaNoBody(tema: Tema) {
  document.body.classList.toggle('tema-escuro', resolverTema(tema) === 'escuro');
}

// Sem useEffect: aplica o tema salvo assim que o módulo carrega (antes do
// primeiro paint do React), para minimizar o flash do tema errado.
const temaInicial = carregarPrefsTema();
aplicarTemaNoBody(temaInicial);

export function useTheme() {
  const [tema, setTema] = useState<Tema>(temaInicial);

  const definirTema = useCallback((novoTema: Tema) => {
    localStorage.setItem(TEMA_PREFS_KEY, novoTema);
    aplicarTemaNoBody(novoTema);
    setTema(novoTema);
  }, []);

  // Só em 'auto' vale escutar o sistema. Nos modos manuais o usuário já decidiu,
  // e reagir ao SO desfaria a escolha dele.
  useEffect(() => {
    if (tema !== 'auto') return;
    const consulta = window.matchMedia(CONSULTA_ESCURO);
    const aoMudar = () => aplicarTemaNoBody('auto');
    consulta.addEventListener('change', aoMudar);
    return () => consulta.removeEventListener('change', aoMudar);
  }, [tema]);

  return { tema, definirTema, temaEfetivo: resolverTema(tema) };
}
