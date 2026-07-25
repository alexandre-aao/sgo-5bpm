import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import type { CartaoDetalhado } from '../lib/cartaoConflitos';

interface UseCartaoPorData {
  cartao: CartaoDetalhado | null;
  carregando: boolean;
}

/** Busca o Cartão Programa ORDINÁRIO de uma data (se existir) — usado por Dashboard,
 * Meu Turno e Mapa como "o cartão do dia". O `tipo=padrao` é obrigatório: sem ele a
 * listagem devolve também os cartões de reforço da data, e um reforço poderia ser
 * exibido no lugar do policiamento ordinário. Descarta a resposta se `data` mudar antes
 * dela chegar (mesmo padrão de useCartaoPrograma.ts/CalendarioDiarias.tsx). */
export function useCartaoPorData(data: string): UseCartaoPorData {
  const [cartao, setCartao] = useState<CartaoDetalhado | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;

    async function buscar() {
      setCarregando(true);
      try {
        const res = await apiFetch(`/api/cartoes?data=${data}&tipo=padrao`);
        const lista = (await res.json()) as { id: string }[];
        let detalhe: CartaoDetalhado | null = null;
        if (Array.isArray(lista) && lista.length > 0) {
          const resDetalhe = await apiFetch(`/api/cartoes/${lista[0].id}`);
          detalhe = (await resDetalhe.json()) as CartaoDetalhado;
        }
        if (!cancelado) setCartao(detalhe);
      } catch (erro) {
        console.error('Erro ao carregar o Cartão Programa da data:', erro);
        if (!cancelado) setCartao(null);
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }

    void buscar();
    return () => {
      cancelado = true;
    };
  }, [data]);

  return { cartao, carregando };
}
