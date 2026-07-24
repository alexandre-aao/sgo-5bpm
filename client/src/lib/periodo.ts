/** Mês/ano corrente no formato usado pelos filtros de período (mês com 2 dígitos). */
export function periodoInicial(): { mes: string; ano: string } {
  const agora = new Date();
  return {
    mes: String(agora.getMonth() + 1).padStart(2, '0'),
    ano: String(agora.getFullYear()),
  };
}
