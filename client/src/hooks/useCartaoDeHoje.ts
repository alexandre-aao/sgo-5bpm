import { useCartaoPorData } from './useCartaoPorData';

function getLocalDateStr(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface UseCartaoDeHoje {
  cartaoHoje: ReturnType<typeof useCartaoPorData>['cartao'];
  carregando: boolean;
}

/** Busca o Cartão Programa de hoje (se existir) — espelha o início de
 * renderDashboardOperacional() em public/app.js. */
export function useCartaoDeHoje(): UseCartaoDeHoje {
  const { cartao, carregando } = useCartaoPorData(getLocalDateStr());
  return { cartaoHoje: cartao, carregando };
}
