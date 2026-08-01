interface CabecalhoImpressaoProps {
  tipoDocumento: string;
  periodo: string;
  numeroDocumento?: string;
  agora: Date;
}

function formatarEmissao(agora: Date): string {
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${p2(agora.getDate())}/${p2(agora.getMonth() + 1)}/${agora.getFullYear()} ${p2(agora.getHours())}h${p2(agora.getMinutes())}`;
}

/**
 * Cabeçalho institucional da Central de Impressão — elementos obrigatórios da
 * especificação (brasão, identificação, tipo de documento, período completo
 * da janela de 24h, número quando houver, data/hora de emissão).
 *
 * Design próprio (.impressao-*), distinto tanto do .rel-pdf- (relatórios
 * estilo SGEPM) quanto do .cp- (Cartão Programa em PDF por viatura, exceção
 * documentada no CLAUDE.md) — nenhum dos dois é tocado por este componente.
 */
export function CabecalhoImpressao({ tipoDocumento, periodo, numeroDocumento, agora }: CabecalhoImpressaoProps) {
  return (
    <div className="impressao-cabecalho-bloco">
      <div className="impressao-cabecalho">
        <img src="/img/brasao-5bpm.png" alt="Brasão do 5º BPM" />
        <div>
          <div className="orgao">POLÍCIA MILITAR DO RIO GRANDE DO NORTE</div>
          <div className="unidade">5º BATALHÃO DE POLÍCIA MILITAR</div>
        </div>
      </div>
      <div className="impressao-titulo">{tipoDocumento}</div>
      <div className="impressao-periodo">
        {periodo}
        {numeroDocumento && <> · Nº {numeroDocumento}</>}
      </div>
      <div className="impressao-emissao">Emitido em {formatarEmissao(agora)}</div>
    </div>
  );
}
