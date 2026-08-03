import { useEffect, useId, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

const SELETOR_FOCAVEL =
  'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

// Acessibilidade de modal, num só lugar. Nenhum dos 12 modais do app tinha
// role="dialog"/aria-modal/aria-labelledby, e nenhum fechava com Esc: para
// leitor de tela eram <div> sem semântica e, no teclado, a única saída era
// acertar o "X".
//
// Uso:
//   const { idTitulo, refCaixa, propsOverlay } = useModalA11y(onFechar);
//   <div className="modal-overlay" {...propsOverlay}>
//     <div className="modal-box" ref={refCaixa}>
//       <div className="modal-header"><h3 id={idTitulo}>…</h3>
export function useModalA11y(onFechar: () => void) {
  const idTitulo = `${useId()}-titulo`;
  const refCaixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const caixa = refCaixa.current;
    const focoAnterior = document.activeElement as HTMLElement | null;

    const focaveis = () =>
      caixa
        ? [...caixa.querySelectorAll<HTMLElement>(SELETOR_FOCAVEL)].filter(
            (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
          )
        : [];

    // Só move o foco se ainda não estiver dentro da caixa — respeita o autoFocus
    // que alguns modais já colocam no campo certo (ex.: confirmação de exclusão).
    if (!caixa?.contains(document.activeElement)) {
      (focaveis()[0] ?? caixa)?.focus();
    }

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onFechar();
        return;
      }
      // Prende o Tab dentro do modal: sem isso o foco caminha para a página
      // atrás do overlay, que continua rolável e clicável para o teclado.
      if (e.key !== 'Tab' || !caixa) return;
      const lista = focaveis();
      if (lista.length === 0) return;
      const primeiro = lista[0];
      const ultimo = lista[lista.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };

    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      focoAnterior?.focus?.();
    };
  }, [onFechar]);

  return {
    idTitulo,
    refCaixa,
    propsOverlay: {
      role: 'dialog',
      'aria-modal': true,
      'aria-labelledby': idTitulo,
      // Fecha só no clique do próprio backdrop; clique dentro da caixa não conta.
      onMouseDown: (e: ReactMouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) onFechar();
      },
    } as const,
  };
}
