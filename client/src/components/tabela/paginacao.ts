import { useState } from 'react';

// Lógica da paginação, separada do componente <Paginacao /> por causa do
// react-refresh/only-export-components — mesmo motivo de ordenacao.ts.
export const ITENS_POR_PAGINA = 20;

/** Página atual da lista, voltando à 1ª sempre que o filtro muda o tamanho da
 *  lista. O ajuste de estado durante o render é o padrão do React para
 *  "sincronizar com uma prop que mudou" — mesmo motivo do AppLayout. */
export function usePaginaLista(totalItens: number) {
  const [pagina, setPagina] = useState(1);
  const [totalAnterior, setTotalAnterior] = useState(totalItens);

  if (totalItens !== totalAnterior) {
    setTotalAnterior(totalItens);
    setPagina(1);
  }

  return { pagina, setPagina };
}

/** Recorta a página atual e devolve os números já normalizados. */
export function paginar<T>(lista: T[], pagina: number, porPagina = ITENS_POR_PAGINA) {
  const totalPaginas = Math.max(1, Math.ceil(lista.length / porPagina));
  const paginaAtual = Math.min(Math.max(1, pagina), totalPaginas);
  const inicio = (paginaAtual - 1) * porPagina;
  return { itens: lista.slice(inicio, inicio + porPagina), paginaAtual, totalPaginas };
}
