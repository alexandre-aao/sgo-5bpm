import type { ReactNode } from 'react';

interface LinhaTabelaVaziaProps {
  /** Quantidade de colunas da tabela, para o colSpan cobrir a linha inteira. */
  colunas: number;
  children: ReactNode;
}

// Linha de "nada a mostrar" dentro de um <tbody>. Existia solta em 11 tabelas,
// cada uma com o seu <td colSpan> e estilo inline — e com cinco paddings
// diferentes (16/20/22/24/32px) para o mesmo estado. Aqui o espaçamento é um só.
//
// Para o vazio de uma TELA inteira (com título, orientação e ação), use SemDados;
// este componente é só para a linha dentro de uma tabela já renderizada.
export function LinhaTabelaVazia({ colunas, children }: LinhaTabelaVaziaProps) {
  return (
    <tr>
      <td colSpan={colunas} className="celula-tabela-vazia">{children}</td>
    </tr>
  );
}
