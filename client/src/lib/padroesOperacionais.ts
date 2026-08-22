import type { ComponentePadrao, ItemRoteiroPadrao } from '../pages/modulos/cartao/usePadroesOperacionais';

export function atividadeEhPB(atividade: string | null | undefined) {
  return String(atividade || '').trim().toLocaleUpperCase('pt-BR') === 'PB';
}

export function contarPbsItens(itens: ItemRoteiroPadrao[] | undefined) {
  return (itens || []).filter((item) => atividadeEhPB(item.atividade)).length;
}

export function contarPbsComponentes(componentes: ComponentePadrao[] | undefined) {
  return (componentes || []).reduce((total, componente) => total + contarPbsItens(componente.itens), 0);
}
