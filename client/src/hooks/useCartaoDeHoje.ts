import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import type { CartaoDetalhado } from '../lib/cartaoConflitos';

function getLocalDateStr(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface UseCartaoDeHoje {
  cartaoHoje: CartaoDetalhado | null;
  carregando: boolean;
}

/** Busca o Cartão Programa de hoje (se existir) — espelha o início de
 * renderDashboardOperacional() em public/app.js (lista por data + detalhe). */
export function useCartaoDeHoje(): UseCartaoDeHoje {
  const [cartaoHoje, setCartaoHoje] = useState<CartaoDetalhado | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;

    async function buscar() {
      setCarregando(true);
      try {
        const hojeStr = getLocalDateStr();
        const res = await apiFetch(`/api/cartoes?data=${hojeStr}`);
        const lista = (await res.json()) as { id: string }[];
        let detalhe: CartaoDetalhado | null = null;
        if (Array.isArray(lista) && lista.length > 0) {
          const resDetalhe = await apiFetch(`/api/cartoes/${lista[0].id}`);
          detalhe = (await resDetalhe.json()) as CartaoDetalhado;
        }
        if (!cancelado) setCartaoHoje(detalhe);
      } catch (erro) {
        console.error('Erro ao verificar o Cartão Programa de hoje:', erro);
        if (!cancelado) setCartaoHoje(null);
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }

    void buscar();
    return () => {
      cancelado = true;
    };
  }, []);

  return { cartaoHoje, carregando };
}
