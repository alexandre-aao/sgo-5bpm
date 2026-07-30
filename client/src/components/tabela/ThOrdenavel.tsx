import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type { Ordenacao } from './ordenacao';

interface ThOrdenavelProps<C extends string> {
  coluna: C;
  ordenacao: Ordenacao<C>;
  onAlternar: (coluna: C) => void;
  children: React.ReactNode;
  className?: string;
}

// Cabeçalho de coluna ordenável (Etapa 1, item 6). É um <button> dentro do <th>
// para funcionar no teclado; o aria-sort deixa a ordem legível no leitor de tela.
export function ThOrdenavel<C extends string>({
  coluna, ordenacao, onAlternar, children, className,
}: ThOrdenavelProps<C>) {
  const ativa = ordenacao.coluna === coluna;
  const Icone = !ativa ? ChevronsUpDown : ordenacao.direcao === 'asc' ? ArrowUp : ArrowDown;

  return (
    <th
      className={className}
      aria-sort={ativa ? (ordenacao.direcao === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className={`th-ordenavel${ativa ? ' ativa' : ''}`}
        onClick={() => onAlternar(coluna)}
      >
        <span>{children}</span>
        <Icone />
      </button>
    </th>
  );
}
