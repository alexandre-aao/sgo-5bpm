import type { Tables } from '../types/supabase';

// A coluna `viaturas` de `cartoes` é Json no Supabase — tipos manuais espelhando o
// shape gravado por POST/PUT /api/cartoes/:id/viaturas(/:vid/itens) em server.js.
export interface CartaoItem {
  id: string;
  inicio: string;
  fim: string;
  local: string;
  atividade: string;
}

export interface CartaoViatura {
  id: string;
  prefixo: string;
  setor: string;
  companhia: string;
  categoria: string;
  comandante: string;
  observacao: string;
  itens: CartaoItem[];
}

export type CartaoDetalhado = Tables<'cartoes'> & { viaturas: CartaoViatura[] };

export interface AlertaConflito {
  tipo: 'sobreaviso-pendente' | 'sobreposicao' | 'cobertura';
  mensagem: string;
}

export function horaParaMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function minutosParaHora(min: number): string {
  const m = ((min % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function formatHoraCartao(hora: string | undefined | null): string {
  if (!hora) return '';
  return hora.replace(':', 'h');
}

/** Minúsculas, sem acentos — para comparação de texto (ex.: setor vs. bairro). */
export function normalizarTexto(texto: string | undefined | null): string {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

/** Dois itens de roteiro (mesma viatura) se sobrepõem no tempo? Sem horário de fim
 * em algum dos dois, não dá pra afirmar sobreposição com segurança. Aceita só
 * {inicio,fim} (não o CartaoItem inteiro) pra dar pra checar um item ainda não
 * salvo (form de novo item) contra um já existente. */
export function itensSobrepostos(
  itemA: Pick<CartaoItem, 'inicio' | 'fim'>,
  itemB: Pick<CartaoItem, 'inicio' | 'fim'>,
): boolean {
  if (!itemA.fim || !itemB.fim) return false;

  const aIni = horaParaMinutos(itemA.inicio);
  let aFim = horaParaMinutos(itemA.fim);
  if (aFim <= aIni) aFim += 24 * 60; // roteiro que atravessa a meia-noite

  const bIni = horaParaMinutos(itemB.inicio);
  let bFim = horaParaMinutos(itemB.fim);
  if (bFim <= bIni) bFim += 24 * 60;

  return aIni < bFim && bIni < aFim;
}

/** Todos os alertas de conflito de um cartão: Fiscal Praça sem Sobreaviso,
 * sobreposição de horário por viatura, e setores com 2+ viaturas simultaneamente
 * sem cobertura (todas em QTL ao mesmo tempo). Espelha calcularAlertasCartao()
 * em public/app.js — `pessoal` entra por parâmetro em vez de ler state global. */
export function calcularAlertasCartao(
  cartao: CartaoDetalhado,
  pessoal: Tables<'pessoal'>[],
): AlertaConflito[] {
  const alertas: AlertaConflito[] = [];

  if (!cartao.is_template && cartao.fiscal) {
    const fiscalPessoa = pessoal.find((p) => p.nome === cartao.fiscal);
    if (fiscalPessoa && fiscalPessoa.tipo === 'Praça' && !cartao.oficial_sobreaviso) {
      alertas.push({
        tipo: 'sobreaviso-pendente',
        mensagem: `O Fiscal de Operações (${cartao.fiscal}) é uma Praça — é necessário vincular o Oficial de Sobreaviso desta escala.`,
      });
    }
  }

  (cartao.viaturas || []).forEach((vtr) => {
    const itens = vtr.itens || [];
    for (let i = 0; i < itens.length; i++) {
      for (let j = i + 1; j < itens.length; j++) {
        if (itensSobrepostos(itens[i], itens[j])) {
          alertas.push({
            tipo: 'sobreposicao',
            mensagem: `VTR ${vtr.prefixo}: horários sobrepostos — "${formatHoraCartao(itens[i].inicio)} às ${formatHoraCartao(itens[i].fim)}" (${itens[i].atividade}) conflita com "${formatHoraCartao(itens[j].inicio)} às ${formatHoraCartao(itens[j].fim)}" (${itens[j].atividade}).`,
          });
        }
      }
    }
  });

  const gruposSetor = new Map<string, { nomeSetor: string; viaturas: CartaoViatura[] }>();
  (cartao.viaturas || []).forEach((vtr) => {
    const chave = normalizarTexto(vtr.setor);
    if (!chave) return;
    if (!gruposSetor.has(chave)) gruposSetor.set(chave, { nomeSetor: vtr.setor, viaturas: [] });
    gruposSetor.get(chave)!.viaturas.push(vtr);
  });

  gruposSetor.forEach((grupo) => {
    if (grupo.viaturas.length < 2) return; // setor com 1 só viatura: QTL dela é inevitável

    (['QTL Almoço', 'QTL Jantar'] as const).forEach((tipoQtl) => {
      const janelas = grupo.viaturas
        .map((v) => (v.itens || []).find((i) => i.atividade === tipoQtl))
        .filter((item): item is CartaoItem => !!item && !!item.fim);

      if (janelas.length < grupo.viaturas.length) return; // nem todas lançaram esse QTL ainda

      let iniMax = -Infinity;
      let fimMin = Infinity;
      janelas.forEach((item) => {
        const ini = horaParaMinutos(item.inicio);
        let fim = horaParaMinutos(item.fim);
        if (fim <= ini) fim += 24 * 60;
        if (ini > iniMax) iniMax = ini;
        if (fim < fimMin) fimMin = fim;
      });

      if (iniMax < fimMin) {
        alertas.push({
          tipo: 'cobertura',
          mensagem: `Setor ${grupo.nomeSetor}: todas as viaturas em ${tipoQtl} simultaneamente entre ${formatHoraCartao(minutosParaHora(iniMax))} e ${formatHoraCartao(minutosParaHora(fimMin))} — setor sem cobertura.`,
        });
      }
    });
  });

  return alertas;
}
