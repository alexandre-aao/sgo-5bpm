import { useEffect, useMemo, useState } from 'react';
import type { Tables } from '../../../types/supabase';
import { apiFetch } from '../../../lib/api';
import type { CartaoDetalhado, CartaoViatura } from '../../../lib/cartaoConflitos';
import { diariasDaViatura, formatHoraCartao, tipoDoCartao } from '../../../lib/cartaoConflitos';
import { ModalRelatorioPdf } from '../../../components/relatorioPdf/ModalRelatorioPdf';
import { CabecalhoRelatorioPdf } from '../../../components/relatorioPdf/CabecalhoRelatorioPdf';
import { COMPANHIAS } from '../../../lib/categoriasViatura';
import { orientacoesDoTipo, type OrientacaoCartao } from '../../../hooks/useOrientacoesCartao';
import type { CartaoResumo } from './useCartaoPrograma';

type Conteudo = 'ordinario' | 'reforco' | 'completo';
type Recorte = 'geral' | 'companhia' | 'viatura';

interface CartaoProgramaPdfProps {
  dataSelecionada: string;
  cartaoOrdinario: CartaoDetalhado | null;
  reforcos: CartaoResumo[];
  orientacoes: OrientacaoCartao[];
  operacoes: Tables<'operacoes'>[];
  onFechar: () => void;
}

/** PDF do Cartão Programa, no mesmo padrão SGEPM dos demais relatórios (reusa
 * ModalRelatorioPdf + CabecalhoRelatorioPdf + classes .rel-pdf-*).
 *
 * Escolhe CONTEÚDO (ordinário / reforço / completo) e RECORTE (geral / Companhia /
 * viatura). O layout é compacto, mas o roteiro sai INTEIRO — horário, local e atividade
 * de cada item —, porque o cartão é entregue ao policial pra seguir o patrulhamento.
 * No recorte por viatura o documento sai em retrato (folha de bolso). */
export function CartaoProgramaPdf({
  dataSelecionada,
  cartaoOrdinario,
  reforcos,
  orientacoes,
  operacoes,
  onFechar,
}: CartaoProgramaPdfProps) {
  const [conteudo, setConteudo] = useState<Conteudo>('ordinario');
  const [recorte, setRecorte] = useState<Recorte>('geral');
  const [companhia, setCompanhia] = useState<string>(COMPANHIAS[0]);
  const [viaturaId, setViaturaId] = useState<string>('');
  const [detalhesReforco, setDetalhesReforco] = useState<CartaoDetalhado[]>([]);

  // Os reforços chegam como resumo (a lista da data); o PDF precisa do roteiro completo,
  // então busca o detalhe de cada um — só quando o conteúdo escolhido inclui reforço.
  const precisaReforcos = conteudo !== 'ordinario' && reforcos.length > 0;
  useEffect(() => {
    let cancelado = false;
    // Sem limpar o estado aqui de propósito: o `cartoes` abaixo já ignora os detalhes
    // quando o conteúdo escolhido não inclui reforço, e limpar sincronamente dentro do
    // efeito dispara render em cascata (react-hooks/set-state-in-effect).
    if (!precisaReforcos) return;
    async function carregar() {
      const detalhes = await Promise.all(
        reforcos.map(async (r) => {
          try {
            const res = await apiFetch(`/api/cartoes/${r.id}`);
            if (!res.ok) return null;
            return (await res.json()) as CartaoDetalhado;
          } catch {
            return null;
          }
        }),
      );
      if (!cancelado) setDetalhesReforco(detalhes.filter((d): d is CartaoDetalhado => d !== null));
    }
    void carregar();
    return () => { cancelado = true; };
  }, [precisaReforcos, reforcos]);

  const cartoes = useMemo(() => {
    const lista: CartaoDetalhado[] = [];
    if (conteudo !== 'reforco' && cartaoOrdinario) lista.push(cartaoOrdinario);
    if (conteudo !== 'ordinario') lista.push(...detalhesReforco);
    return lista;
  }, [conteudo, cartaoOrdinario, detalhesReforco]);

  // Opções do recorte por viatura: todas as viaturas dos cartões selecionados.
  const viaturasDisponiveis = useMemo(
    () => cartoes.flatMap((c) => (c.viaturas || []).map((v) => ({ cartaoId: c.id, vtr: v }))),
    [cartoes],
  );

  function viaturasDoRecorte(cartao: CartaoDetalhado): CartaoViatura[] {
    const viaturas = cartao.viaturas || [];
    if (recorte === 'companhia') return viaturas.filter((v) => v.companhia === companhia);
    if (recorte === 'viatura') return viaturas.filter((v) => v.id === viaturaId);
    return viaturas;
  }

  const cartoesComConteudo = cartoes
    .map((c) => ({ cartao: c, viaturas: viaturasDoRecorte(c) }))
    .filter((c) => c.viaturas.length > 0);

  const dataBr = dataSelecionada.split('-').reverse().join('/');
  const rotuloConteudo =
    conteudo === 'ordinario' ? 'Policiamento Ordinário'
      : conteudo === 'reforco' ? 'Reforço Operacional'
        : 'Ordinário + Reforço';
  const rotuloRecorte =
    recorte === 'geral' ? 'Geral'
      : recorte === 'companhia' ? companhia
        : viaturasDisponiveis.find((v) => v.vtr.id === viaturaId)?.vtr.prefixo || 'Viatura';

  const controles = (
    <div className="form-row" style={{ marginBottom: 0 }}>
      <div className="form-group col-md-4">
        <label htmlFor="pdf-conteudo">Conteúdo</label>
        <select id="pdf-conteudo" value={conteudo} onChange={(e) => setConteudo(e.target.value as Conteudo)}>
          <option value="ordinario">Policiamento ordinário</option>
          <option value="reforco">Reforço operacional</option>
          <option value="completo">Completo (ordinário + reforço)</option>
        </select>
      </div>
      <div className="form-group col-md-4">
        <label htmlFor="pdf-recorte">Recorte</label>
        <select
          id="pdf-recorte"
          value={recorte}
          onChange={(e) => {
            const novo = e.target.value as Recorte;
            setRecorte(novo);
            if (novo === 'viatura' && !viaturaId) setViaturaId(viaturasDisponiveis[0]?.vtr.id || '');
          }}
        >
          <option value="geral">Geral (todas as viaturas)</option>
          <option value="companhia">Por Companhia</option>
          <option value="viatura">Por viatura</option>
        </select>
      </div>
      {recorte === 'companhia' && (
        <div className="form-group col-md-4">
          <label htmlFor="pdf-companhia">Companhia</label>
          <select id="pdf-companhia" value={companhia} onChange={(e) => setCompanhia(e.target.value)}>
            {COMPANHIAS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}
      {recorte === 'viatura' && (
        <div className="form-group col-md-4">
          <label htmlFor="pdf-viatura">Viatura</label>
          <select id="pdf-viatura" value={viaturaId} onChange={(e) => setViaturaId(e.target.value)}>
            <option value="">Selecione...</option>
            {viaturasDisponiveis.map(({ vtr }) => (
              <option key={vtr.id} value={vtr.id}>{vtr.prefixo} — {vtr.setor}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );

  return (
    <ModalRelatorioPdf titulo="Imprimir Cartão Programa (PDF)" controles={controles} onFechar={onFechar}>
      <div className={recorte === 'viatura' ? 'cartao-pdf-retrato' : undefined}>
        <CabecalhoRelatorioPdf
          titulo={`CARTÃO PROGRAMA DE PATRULHAMENTO — ${dataBr}`}
          subtitulo={`${rotuloConteudo} · Recorte: ${rotuloRecorte}`}
        />

        {cartoesComConteudo.length === 0 ? (
          <p className="rel-pdf-rodape">Nenhuma viatura no recorte selecionado.</p>
        ) : (
          cartoesComConteudo.map(({ cartao, viaturas }) => (
            <BlocoCartaoPdf
              key={cartao.id}
              cartao={cartao}
              viaturas={viaturas}
              orientacoes={orientacoes}
              operacoes={operacoes}
            />
          ))
        )}
      </div>
    </ModalRelatorioPdf>
  );
}

function BlocoCartaoPdf({
  cartao,
  viaturas,
  orientacoes,
  operacoes,
}: {
  cartao: CartaoDetalhado;
  viaturas: CartaoViatura[];
  orientacoes: OrientacaoCartao[];
  operacoes: Tables<'operacoes'>[];
}) {
  const tipo = tipoDoCartao(cartao);
  const operacao = operacoes.find((op) => op.id === cartao.operacao_id);
  const textosOrientacoes = orientacoesDoTipo(orientacoes, tipo).map((o) => o.texto);

  return (
    <div className="cartao-pdf-bloco">
      <div className="cartao-pdf-identificacao">
        <div className="cartao-pdf-id-titulo">
          {tipo === 'reforco'
            ? `REFORÇO OPERACIONAL${cartao.titulo ? ` — ${cartao.titulo}` : ''}`
            : 'POLICIAMENTO ORDINÁRIO'}
        </div>
        <div className="cartao-pdf-id-linha">
          <span><strong>Fiscal de Operações:</strong> {cartao.fiscal || '-'}</span>
          <span><strong>Adjunto:</strong> {cartao.adjunto || '-'}</span>
          <span><strong>Oficial de Sobreaviso:</strong> {cartao.oficial_sobreaviso || '-'}</span>
          {operacao && <span><strong>Operação vinculada:</strong> {operacao.nome_operacao}</span>}
        </div>
      </div>

      {viaturas.map((vtr) => (
        <div className="cartao-pdf-vtr" key={vtr.id}>
          <div className="cartao-pdf-vtr-header">
            <strong>VTR {vtr.prefixo} — {vtr.setor}</strong>
            <span>
              {vtr.companhia || 'Companhia não informada'} · {vtr.categoria || 'Ordinária'} ·
              {' '}Cmt: {vtr.comandante || '__________________'} · Diárias: {diariasDaViatura(vtr)}
            </span>
          </div>

          <table className="rel-pdf-tabela">
            <thead>
              <tr>
                <th style={{ width: '18%' }}>Horário</th>
                <th style={{ width: '57%' }}>Local / Itinerário</th>
                <th style={{ width: '25%' }}>Atividade</th>
              </tr>
            </thead>
            <tbody>
              {vtr.itens.length === 0 ? (
                <tr><td colSpan={3}>Sem itens de roteiro lançados.</td></tr>
              ) : (
                vtr.itens.map((item) => (
                  <tr key={item.id}>
                    <td>{formatHoraCartao(item.inicio)}{item.fim ? ` às ${formatHoraCartao(item.fim)}` : ''}</td>
                    <td>{item.local}</td>
                    <td>{item.atividade}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Observações da viatura + orientações permanentes da P3 + observações do
              cartão. Tudo aqui, nunca dentro da linha do roteiro. */}
          {(vtr.observacao || cartao.observacoes || textosOrientacoes.length > 0) && (
            <div className="cartao-pdf-obs">
              <strong>OBSERVAÇÕES</strong>
              {vtr.observacao && <div>• {vtr.observacao}</div>}
              {cartao.observacoes && <div>• {cartao.observacoes}</div>}
              {textosOrientacoes.map((texto, i) => <div key={i}>• {texto}</div>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
