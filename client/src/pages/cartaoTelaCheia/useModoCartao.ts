import { useEffect, useState } from 'react';

export type ModoCartao = 'edicao' | 'operacao';

const CHAVE_LOCALSTORAGE = 'sgo_cartao_modo';
const BREAKPOINT_MOBILE = '(max-width: 768px)';

function lerPreferenciaSalva(): ModoCartao | null {
  try {
    const valor = localStorage.getItem(CHAVE_LOCALSTORAGE);
    return valor === 'edicao' || valor === 'operacao' ? valor : null;
  } catch {
    return null;
  }
}

/** Modo de renderização do Cartão em tela cheia: automático pelo viewport (mesmo
 *  breakpoint do shell mobile, max-width:768px), com override manual que sempre
 *  vence e persiste em localStorage — mesmo padrão de tolerância a falha (modo
 *  privado etc.) de pdf/geracaoCartao.ts. */
export function useModoCartao() {
  const [modo, setModoState] = useState<ModoCartao>(() => {
    const salvo = lerPreferenciaSalva();
    if (salvo) return salvo;
    return window.matchMedia(BREAKPOINT_MOBILE).matches ? 'operacao' : 'edicao';
  });

  useEffect(() => {
    // Só acompanha o viewport enquanto não houver escolha manual salva.
    if (lerPreferenciaSalva()) return;
    const mq = window.matchMedia(BREAKPOINT_MOBILE);
    const handler = (e: MediaQueryListEvent) => setModoState(e.matches ? 'operacao' : 'edicao');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  function setModo(novo: ModoCartao) {
    setModoState(novo);
    try {
      localStorage.setItem(CHAVE_LOCALSTORAGE, novo);
    } catch {
      // localStorage indisponível — a escolha só não persiste entre sessões.
    }
  }

  return { modo, setModo };
}
