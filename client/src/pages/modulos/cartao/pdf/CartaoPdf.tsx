import type { DadosCartaoPdf } from './cartaoPdfDados';
import { siglaAtividade, horaCurta } from './cartaoPdfDados';

export type LayoutCartaoPdf = 'celular' | 'a4';

export interface AvisoDoCartao {
  id: string;
  prioridade: 'informativa' | 'atencao' | 'alta' | 'critica';
  categoria: string;
  texto: string;
  bairro: string;
}

interface CartaoPdfProps {
  dados: DadosCartaoPdf;
  layout: LayoutCartaoPdf;
  avisos: AvisoDoCartao[];
}

const ROTULO_PRIORIDADE: Record<AvisoDoCartao['prioridade'], string> = {
  informativa: 'INFORMATIVA',
  atencao: 'ATENÇÃO',
  alta: 'ALTA',
  critica: 'CRÍTICA',
};

/** Linha rótulo/valor. Campo vazio não imprime rótulo órfão: some do cartão. */
function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  if (!valor) return null;
  return (
    <div className="cp-linha">
      <span className="cp-rotulo">{rotulo}</span>
      <span className="cp-valor">{valor}</span>
    </div>
  );
}

/**
 * Cartão Programa de UMA viatura, no formato que o comandante recebe pelo
 * WhatsApp e lê na tela do celular em serviço.
 *
 * Design deliberadamente diferente dos outros relatórios PDF do projeto (estilo
 * SGEPM, A4 paisagem, tabela zebrada): este é pedido explícito do usuário —
 * página de 100x180mm, coluna única, sem caixas, uma cor institucional só.
 * Mudanças aqui NÃO devem ser propagadas para os relatórios de Eventos,
 * Diário e Consolidado, nem o contrário.
 */
export function CartaoPdf({ dados, layout, avisos }: CartaoPdfProps) {
  const temRoteiro = dados.itens.length > 0;

  // Agrupa por bairro sem repetir o cabeçalho quando a viatura cobre mais de um.
  const avisosPorBairro = avisos.reduce<Map<string, AvisoDoCartao[]>>((mapa, aviso) => {
    const chave = aviso.bairro || dados.bairro;
    if (!mapa.has(chave)) mapa.set(chave, []);
    mapa.get(chave)!.push(aviso);
    return mapa;
  }, new Map());

  return (
    <div className={`cp-pdf cp-pdf--${layout}`}>
      <div className="cp-topo">
        <div className="cp-orgao">POLÍCIA MILITAR DO RN — 5º BPM</div>
        {dados.numero && <div className="cp-numero">CARTÃO PROGRAMA Nº {dados.numero}</div>}
      </div>
      <div className="cp-regua-dupla" />

      <div className="cp-bloco">
        <Linha rotulo="PERÍODO" valor={dados.janela} />
        <Linha rotulo="DELTA 07" valor={dados.delta07} />
        <Linha rotulo="ADJUNTO" valor={dados.adjunto} />
        <Linha rotulo="GUARNIÇÃO" valor={dados.delta07Viatura} />
      </div>

      <div className="cp-regua" />

      <div className="cp-bloco">
        <Linha rotulo="VIATURA" valor={dados.prefixo} />
        <Linha rotulo="GUARNIÇÃO" valor={dados.companhia} />
        <Linha rotulo="COMANDANTE" valor={dados.comandante} />
        <Linha rotulo="BAIRRO" valor={dados.bairro} />
      </div>

      {temRoteiro && (
        <>
          <div className="cp-regua" />
          <div className="cp-bloco">
            <div className="cp-secao">ROTEIRO</div>
            <table className="cp-roteiro">
              <tbody>
                {dados.itens.map((item) => (
                  <tr key={item.id}>
                    <td className="cp-hora">
                      {horaCurta(item.inicio)}{item.fim ? `-${horaCurta(item.fim)}` : ''}
                    </td>
                    <td className="cp-sigla">{siglaAtividade(item.atividade)}</td>
                    <td className="cp-local">{item.local}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {avisos.length > 0 && (
        <>
          <div className="cp-regua" />
          <div className="cp-bloco">
            {[...avisosPorBairro.entries()].map(([bairro, lista]) => (
              <div key={bairro} className="cp-avisos-grupo">
                <div className="cp-secao">ALERTAS{bairro ? ` — ${bairro}` : ''}</div>
                {lista.map((aviso) => (
                  <div key={aviso.id} className="cp-aviso">
                    {/* A prioridade vem ESCRITA, não só colorida: o cartão é
                        lido em tela pequena, às vezes impresso em preto e branco. */}
                    <div className="cp-aviso-cabecalho">
                      {ROTULO_PRIORIDADE[aviso.prioridade]}
                      {aviso.categoria ? ` · ${aviso.categoria}` : ''}
                    </div>
                    <div className="cp-aviso-texto">{aviso.texto}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="cp-regua" />
      <div className="cp-rodape">
        {dados.legenda && <div>{dados.legenda}</div>}
        <div>v{dados.versao} · gerado {dados.geradoEm}</div>
      </div>
    </div>
  );
}
