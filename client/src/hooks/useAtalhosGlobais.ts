import { useEffect } from 'react';

/** Evento que a tela ativa escuta para abrir o "novo" dela (tecla N). Existe
 *  porque o botão de criar vive dentro de cada página, com estado próprio — um
 *  atalho global não tem como chamá-lo direto sem levantar esse estado para o
 *  layout, que acoplaria todas as telas ao shell. */
export const EVENTO_NOVO = 'sgo:novo';

/** Escuta a tecla N na tela ativa. `ativo` permite ignorar quando a criação não
 *  faz sentido no momento (sem permissão, modal já aberto). */
export function useAtalhoNovo(aoAbrirNovo: () => void, ativo = true) {
  useEffect(() => {
    if (!ativo) return;
    const handler = () => aoAbrirNovo();
    window.addEventListener(EVENTO_NOVO, handler);
    return () => window.removeEventListener(EVENTO_NOVO, handler);
  }, [aoAbrirNovo, ativo]);
}

/** Alvo de digitação: nesses elementos as teclas simples pertencem ao usuário,
 *  não ao app. `isContentEditable` cobre editores ricos. */
function estaDigitando(alvo: EventTarget | null): boolean {
  const el = alvo as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/**
 * Setas ← → para telas com navegação por dia. Hook SEPARADO de propósito: se a
 * tela registrasse `useAtalhosGlobais` só para receber as setas, passariam a
 * existir dois listeners tratando `N`, e o CustomEvent seria disparado duas
 * vezes — o "novo" da tela abriria e fecharia, ou abriria em duplicidade.
 */
export function useAtalhoSetasDia(
  onDiaAnterior: () => void,
  onProximoDia: () => void,
  suspenso = false,
) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (suspenso || estaDigitando(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onDiaAnterior();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onProximoDia();
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onDiaAnterior, onProximoDia, suspenso]);
}

interface AtalhosGlobaisProps {
  onAbrirPaleta: () => void;
  onAbrirAjuda: () => void;
  /** Desliga tudo enquanto um modal está aberto — o modal tem o próprio teclado. */
  suspenso?: boolean;
}

/**
 * Atalhos de teclado do app. Regra que vale para todos: **nunca capturar tecla
 * simples enquanto o foco está num campo de digitação** — só combinações com
 * modificador (Ctrl/Cmd+K) valem ali.
 */
export function useAtalhosGlobais({
  onAbrirPaleta,
  onAbrirAjuda,
  suspenso = false,
}: AtalhosGlobaisProps) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Ctrl+K / Cmd+K funciona mesmo digitando: tem modificador, não conflita
      // com a escrita, e é o atalho que o usuário espera de qualquer lugar.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onAbrirPaleta();
        return;
      }

      if (suspenso || estaDigitando(e.target)) return;
      // Outros modificadores são atalhos do navegador/SO — não interceptar.
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === '?') {
        e.preventDefault();
        onAbrirAjuda();
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent(EVENTO_NOVO));
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onAbrirPaleta, onAbrirAjuda, suspenso]);
}
