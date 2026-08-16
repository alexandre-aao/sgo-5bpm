/** "2026-07-30" → "30/07/2026". Usado nos chips de filtro ativo das listas. */
export function paraDataBr(data: string): string {
  return data.split('-').reverse().join('/');
}

/** Mês/ano corrente no formato usado pelos filtros de período (mês com 2 dígitos). */
export function periodoInicial(): { mes: string; ano: string } {
  const agora = new Date();
  return {
    mes: String(agora.getMonth() + 1).padStart(2, '0'),
    ano: String(agora.getFullYear()),
  };
}

/** Considera fim ausente como atividade de um único dia. As datas do domínio
 * usam ISO (AAAA-MM-DD), portanto a comparação lexicográfica preserva a ordem. */
export function fimDoPeriodo(inicio: string, fim?: string | null): string {
  return fim || inicio;
}

/** Verdadeiro quando dois períodos fechados compartilham ao menos um dia. */
export function periodosSeSobrepoem(
  inicioA: string,
  fimA: string | null | undefined,
  inicioB: string,
  fimB: string | null | undefined,
): boolean {
  if (!inicioA || !inicioB) return false;
  return inicioA <= fimDoPeriodo(inicioB, fimB) && fimDoPeriodo(inicioA, fimA) >= inicioB;
}

/** Verdadeiro inclusive no primeiro e no último dia da atividade. */
export function ocorreNaData(inicio: string, fim: string | null | undefined, data: string): boolean {
  return periodosSeSobrepoem(inicio, fim, data, data);
}
