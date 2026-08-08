/**
 * Placeholders com as MESMAS dimensões do conteúdo real, para a carga não
 * empurrar o layout quando os dados chegam. Diferente de `<Carregando />`, que é
 * um spinner: use spinner quando não se sabe o formato do que vem, e esqueleto
 * quando o formato já é conhecido (KPIs do Dashboard, linhas de tabela).
 *
 * `aria-hidden`: o leitor de tela não deve narrar caixas vazias. Quem anuncia o
 * carregamento é a região viva ao redor.
 */

interface EsqueletoProps {
  tamanho?: 'linha' | 'linha-curta' | 'linha-media' | 'linha-longa' | 'rotulo' | 'valor' | 'rodape' | 'bloco';
  className?: string;
}

export function Esqueleto({ tamanho = 'linha', className = '' }: EsqueletoProps) {
  return (
    <span
      className={`esqueleto esqueleto-${tamanho} ${className}`.trim()}
      aria-hidden="true"
    />
  );
}

/** Faixa de KPIs do Dashboard: 4 cards com rótulo, número grande e rodapé. */
export function EsqueletoKpis({ quantidade = 4 }: { quantidade?: number }) {
  return (
    <div className="kpi-row" aria-hidden="true">
      {Array.from({ length: quantidade }, (_, i) => (
        <div className="kpi-card" key={i}>
          <Esqueleto tamanho="rotulo" />
          <Esqueleto tamanho="valor" />
          <Esqueleto tamanho="rodape" />
        </div>
      ))}
    </div>
  );
}

/** Linhas de tabela com o número real de colunas, para a grade não saltar. */
export function EsqueletoLinhasTabela({ linhas = 5, colunas }: { linhas?: number; colunas: number }) {
  return (
    <>
      {Array.from({ length: linhas }, (_, l) => (
        <tr key={l} aria-hidden="true">
          {Array.from({ length: colunas }, (_, c) => (
            <td key={c}><Esqueleto tamanho={c === 0 ? 'linha-media' : 'linha-curta'} /></td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Bloco genérico para painel/card cujo conteúdo ainda não chegou. */
export function EsqueletoPainel({ linhas = 3 }: { linhas?: number }) {
  return (
    <div className="esqueleto-painel" aria-hidden="true">
      {Array.from({ length: linhas }, (_, i) => (
        <Esqueleto key={i} tamanho={i === linhas - 1 ? 'linha-media' : 'bloco'} />
      ))}
    </div>
  );
}
