import type { Role } from '../types/auth';
import { horaParaMinutos } from './cartaoConflitos';

// Fuso do batalhão. America/Fortaleza é UTC-3 FIXO (o Brasil aboliu o horário de
// verão em 2019), então o offset pode ser literal — o cliente pode estar em
// qualquer fuso e o prazo continua sendo o das 07h de Natal.
// Espelha FUSO_BATALHAO / dentroDaJanelaExclusaoAdjunto em server.js. Aqui é só
// para esconder o botão: quem decide de verdade é o servidor, no DELETE.
const FUSO_BATALHAO = '-03:00';

export function proximoDiaISO(dataISO: string): string {
  const [ano, mes, dia] = dataISO.split('-').map(Number);
  // Date.UTC normaliza virada de mês/ano sozinho (31 + 1 -> dia 1 do mês seguinte).
  return new Date(Date.UTC(ano, mes - 1, dia + 1)).toISOString().slice(0, 10);
}

export function dataBr(dataISO: string | null | undefined): string {
  return dataISO ? dataISO.split('-').reverse().join('/') : '';
}

/** O Adjunto pode excluir o cartão de um dia até as 07h00 do dia seguinte à data
 *  do serviço. Depois disso o roteiro já foi cumprido e vira registro histórico. */
export function dentroDaJanelaExclusaoAdjunto(dataServico: string | null | undefined, agora = new Date()): boolean {
  if (!dataServico) return false;
  const limite = new Date(`${proximoDiaISO(dataServico)}T07:00:00${FUSO_BATALHAO}`);
  return agora.getTime() <= limite.getTime();
}

/** Quem pode excluir este cartão agora: P3 sempre; Adjunto só cartão do dia
 *  dentro do prazo (template é estrutura reaproveitável, segue P3-only). */
export function podeExcluirCartao(
  role: Role | undefined,
  cartao: { data: string | null; is_template: boolean } | null,
  agora = new Date(),
): boolean {
  if (!cartao) return false;
  if (role === 'P3') return true;
  if (role !== 'Adjunto' || cartao.is_template) return false;
  return dentroDaJanelaExclusaoAdjunto(cartao.data, agora);
}

/** Janela de 24h do cartão, no formato completo exigido em cabeçalho de tela e de
 *  impressão: "05/08/2026 07h00 às 06/08/2026 07h00". Nunca exibir a data isolada
 *  — a ordenação do roteiro (server.js, ordenarPorTurno) já usa essa mesma âncora
 *  das 07h, então o rótulo precisa deixar a janela real explícita. */
export function janela24h(dataISO: string | null | undefined): string {
  if (!dataISO) return '';
  return `${dataBr(dataISO)} 07h00 às ${dataBr(proximoDiaISO(dataISO))} 07h00`;
}

/** Intercala os itens já ordenados por turno (ordenarPorTurno, ancorado nas 07h)
 *  com um marcador textual na virada de dia — entre o último item de hoje
 *  (>=07h00) e o primeiro de amanhã (<07h00). Não agrupa nem reordena: só marca
 *  a fronteira. Cartão sem itens de madrugada não tem marcador nenhum. */
export function marcarViradaDeDia<T extends { inicio: string }>(
  itens: T[],
  dataISO: string,
): Array<{ tipo: 'item'; item: T } | { tipo: 'virada'; rotulo: string }> {
  const rotulo = `— ${dataBr(proximoDiaISO(dataISO)).slice(0, 5)} —`;

  return itens.reduce<Array<{ tipo: 'item'; item: T } | { tipo: 'virada'; rotulo: string }>>((acc, item, i) => {
    if (i > 0) {
      const anterior = horaParaMinutos(itens[i - 1].inicio);
      const atual = horaParaMinutos(item.inicio);
      if (anterior >= 420 && atual < 420) acc.push({ tipo: 'virada', rotulo });
    }
    acc.push({ tipo: 'item', item });
    return acc;
  }, []);
}
