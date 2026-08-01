import type { Tables } from '../../../types/supabase';
import type { CartaoDetalhado } from '../../../lib/cartaoConflitos';
import { formatHoraCartao } from '../../../lib/cartaoConflitos';
import { janela24h, marcarViradaDeDia } from '../../../lib/janelaCartao';
import { resolverNome } from '../cartao/pdf/cartaoPdfDados';
import { CabecalhoImpressao } from './CabecalhoImpressao';

interface SaidaConsolidadoDiaProps {
  cartao: CartaoDetalhado;
  pessoal: Tables<'pessoal'>[];
  agora: Date;
}

const ORDEM_COMPANHIA: Record<string, number> = { '1ª Companhia': 1, '2ª Companhia': 2, '3ª Companhia': 3 };

function horarioQtl(item: { inicio: string; fim: string; atividade: string } | undefined): string {
  if (!item) return '-';
  return `${formatHoraCartao(item.inicio)}${item.fim ? ' às ' + formatHoraCartao(item.fim) : ''}`;
}

/**
 * Saída 2 — Consolidado da operação/dia, para o Cmt BPM / CPC: retrato, folha
 * contínua com Quadro Resumo + roteiro completo de cada viatura + assinatura
 * do Chefe da 3ª Seção. Sem rota nova no backend — usa o mesmo GET
 * /api/cartoes/:id da tela cheia e dos dois modos.
 *
 * "Totais de efetivo e diárias" do documento original não se aplica ao
 * domínio do Cartão Programa: diárias são de operações/escalas, um cadastro
 * totalmente separado do patrulhamento diário, e o cartão não registra a
 * guarnição completa (só o comandante). Os totais aqui são os que o cartão
 * de fato tem: viaturas e itens de roteiro.
 */
export function SaidaConsolidadoDia({ cartao, pessoal, agora }: SaidaConsolidadoDiaProps) {
  const viaturas = [...cartao.viaturas].sort((a, b) => {
    const oa = ORDEM_COMPANHIA[a.companhia] || 99;
    const ob = ORDEM_COMPANHIA[b.companhia] || 99;
    if (oa !== ob) return oa - ob;
    return (a.prefixo || '').localeCompare(b.prefixo || '');
  });
  const totalItens = viaturas.reduce((soma, v) => soma + v.itens.length, 0);

  return (
    <div className="folha">
      <CabecalhoImpressao
        tipoDocumento="Consolidado do Cartão Programa"
        periodo={janela24h(cartao.data)}
        numeroDocumento={cartao.numero ? `${String(cartao.numero).padStart(6, '0')}/${cartao.ano}` : undefined}
        agora={agora}
      />

      <table className="rel-pdf-tabela" style={{ marginBottom: '6mm' }}>
        <thead>
          <tr>
            <th>Companhia</th>
            <th>Viatura</th>
            <th>Setor</th>
            <th>QTL Almoço</th>
            <th>QTL Jantar</th>
            <th>Madrugada Segura / Observação</th>
          </tr>
        </thead>
        <tbody>
          {viaturas.map((vtr) => (
            <tr key={vtr.id}>
              <td>{vtr.companhia || '-'}</td>
              <td>{vtr.prefixo}</td>
              <td>{vtr.setor}</td>
              <td>{horarioQtl(vtr.itens.find((i) => i.atividade === 'QTL Almoço'))}</td>
              <td>{horarioQtl(vtr.itens.find((i) => i.atividade === 'QTL Jantar'))}</td>
              <td>{vtr.observacao || '-'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="rel-pdf-total-linha">
            <td colSpan={6}>{viaturas.length} viatura(s) · {totalItens} item(ns) de roteiro no dia</td>
          </tr>
        </tfoot>
      </table>

      {viaturas.map((vtr) => (
        <table className="rel-pdf-tabela" key={vtr.id} style={{ marginBottom: '6mm', breakInside: 'avoid' }}>
          <thead>
            <tr>
              <th colSpan={3}>
                VTR {vtr.prefixo} — {vtr.setor} — {resolverNome(vtr.comandante_pessoal_id, vtr.comandante, pessoal) || 'Sem comandante'}
              </th>
            </tr>
            <tr>
              <th>Horário</th>
              <th>Local / Itinerário</th>
              <th>Atividade</th>
            </tr>
          </thead>
          <tbody>
            {vtr.itens.length === 0 ? (
              <tr><td colSpan={3}>Sem itens de roteiro.</td></tr>
            ) : (
              marcarViradaDeDia(vtr.itens, cartao.data || '').map((entrada) => {
                if (entrada.tipo === 'virada') {
                  return (
                    <tr className="rel-pdf-grupo-linha" key={`virada-${vtr.id}`}>
                      <td colSpan={3} style={{ textAlign: 'center' }}>{entrada.rotulo}</td>
                    </tr>
                  );
                }
                const item = entrada.item;
                return (
                  <tr key={item.id}>
                    <td>{formatHoraCartao(item.inicio)}{item.fim ? ` às ${formatHoraCartao(item.fim)}` : ''}</td>
                    <td>{item.local}</td>
                    <td>{item.atividade}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      ))}

      <div className="assinatura">
        <div className="linha" />
        <div>Chefe da 3ª Seção (P3)</div>
      </div>
    </div>
  );
}
