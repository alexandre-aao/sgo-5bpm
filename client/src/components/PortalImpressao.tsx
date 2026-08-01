import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

const ID_RAIZ = 'sgo-modal-root';

/** A raiz é declarada em index.html; criar sob demanda cobre o caso de um
 *  HTML antigo em cache, onde a ausência do nó derrubaria a tela inteira. */
function obterRaiz(): HTMLElement {
  const existente = document.getElementById(ID_RAIZ);
  if (existente) return existente;
  const criada = document.createElement('div');
  criada.id = ID_RAIZ;
  document.body.appendChild(criada);
  return criada;
}

/**
 * Move o modal para fora de `.app-container`, como filho direto de `<body>`.
 *
 * Por que existe: o gate de impressão do Cartão em PDF e dos Relatórios SGEPM
 * é `body:has(#modal-x) .app-container { display: none }`. No app vanilla os
 * modais eram irmãos de `.app-container` e a regra funcionava; na migração para
 * React eles passaram a ser renderizados dentro da rota — ou seja, DENTRO do
 * elemento que a regra esconde. Um ancestral com `display: none` não é anulado
 * por regra no descendente, então o documento inteiro sumia e a impressão saía
 * em branco. O portal devolve a relação de irmãos que a regra pressupõe.
 *
 * Só os modais que vão para a impressora precisam disto — os demais podem
 * continuar onde estão.
 */
export function PortalImpressao({ children }: { children: ReactNode }) {
  return createPortal(children, obterRaiz());
}
