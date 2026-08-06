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
  /** Largura CSS: '100%', '8ch', 120… */
  largura?: string;
  altura?: string;
  className?: string;
}

export function Esqueleto({ largura = '100%', altura = '1em', className = '' }: EsqueletoProps) {
  return (
    <span
      className={`esqueleto ${className}`.trim()}
      style={{ width: largura, height: altura }}
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
          <Esqueleto largura="60%" altura=".75rem" />
          <Esqueleto largura="40%" altura="1.8rem" />
          <Esqueleto largura="80%" altura=".7rem" />
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
            <td key={c}><Esqueleto largura={c === 0 ? '70%' : '55%'} /></td>
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
        <Esqueleto key={i} largura={i === linhas - 1 ? '60%' : '100%'} altura="1.1rem" />
      ))}
    </div>
  );
}
