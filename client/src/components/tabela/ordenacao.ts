import { useCallback, useState } from 'react';

// Ordenação por coluna compartilhada pelas listas navegáveis (Etapa 1, item 6).
// Client-side de propósito: a API não pagina nem ordena, e mudar isso seria
// alteração de rota — fora do escopo desta etapa.
export type Direcao = 'asc' | 'desc';

export interface Ordenacao<C extends string> {
  coluna: C;
  direcao: Direcao;
}

/** Valor comparável de cada coluna ordenável. */
export type Acessores<T, C extends string> = Record<C, (item: T) => string | number>;

export function useOrdenacao<C extends string>(inicial: Ordenacao<C>) {
  const [ordenacao, setOrdenacao] = useState<Ordenacao<C>>(inicial);

  // Clicar na coluna já ordenada inverte a direção; em outra coluna, começa
  // ascendente (texto) — o chamador decide o padrão pelo estado inicial.
  const alternar = useCallback((coluna: C) => {
    setOrdenacao((atual) =>
      atual.coluna === coluna
        ? { coluna, direcao: atual.direcao === 'asc' ? 'desc' : 'asc' }
        : { coluna, direcao: 'asc' },
    );
  }, []);

  return { ordenacao, alternar };
}

export function ordenarLista<T, C extends string>(
  lista: T[],
  ordenacao: Ordenacao<C>,
  acessores: Acessores<T, C>,
): T[] {
  const acessor = acessores[ordenacao.coluna];
  if (!acessor) return lista;

  const sinal = ordenacao.direcao === 'asc' ? 1 : -1;
  return [...lista].sort((a, b) => {
    const va = acessor(a);
    const vb = acessor(b);
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sinal;
    // localeCompare para respeitar acento na ordem alfabética em português
    return String(va).localeCompare(String(vb), 'pt-BR') * sinal;
  });
}
