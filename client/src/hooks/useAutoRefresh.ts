import { useEffect, useRef } from 'react';

// Espelha o setInterval(60s)+visibilitychange de public/app.js (DOMContentLoaded):
// não dispara com a aba em segundo plano (document.hidden), e força um refresh
// imediato ao voltar o foco, pra recuperar o que mudou enquanto a aba estava oculta.
// callback fica numa ref (sempre a versão mais recente) pra não precisar recriar o
// timer a cada render só porque o consumidor passou uma closure nova.
export function useAutoRefresh(callback: () => void, ativo: boolean) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    if (!ativo) return;

    const intervalo = setInterval(() => {
      if (!document.hidden) callbackRef.current();
    }, 60000);

    function aoMudarVisibilidade() {
      if (!document.hidden) callbackRef.current();
    }
    document.addEventListener('visibilitychange', aoMudarVisibilidade);

    return () => {
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
    };
  }, [ativo]);
}
