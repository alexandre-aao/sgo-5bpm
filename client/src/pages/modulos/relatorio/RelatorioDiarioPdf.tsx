import { Fragment } from 'react';
import { CabecalhoRelatorioPdf } from '../../../components/relatorioPdf/CabecalhoRelatorioPdf';
import { dataBrHifen, nomeMes } from './mesesNomes';
import { nomeExibicaoMilitarDiario } from './nomeExibicaoMilitar';
import type { RelatorioDiarioResponse } from './useRelatorioDiario';

interface RelatorioDiarioPdfProps {
  dados: RelatorioDiarioResponse;
}

export function RelatorioDiarioPdf({ dados }: RelatorioDiarioPdfProps) {
  const sub = `${nomeMes(dados.mes)}/${dados.ano} — ${dados.agrupar === 'operacao' ? 'por operação' : 'por data'}`;

  return (
    <>
      <CabecalhoRelatorioPdf titulo="Relatório Diário de Diárias" subtitulo={sub} />
      <table className="rel-pdf-tabela">
        <thead>
          <tr>
            <th className="rel-col-40">Nº</th>
            <th>Militar</th>
            <th className="rel-col-130">Diárias</th>
          </tr>
        </thead>
        <tbody>
          {dados.grupos.map((g) => (
            <Fragment key={`${g.data}-${g.operacao || ''}`}>
              <tr className="rel-pdf-grupo-linha">
                <td colSpan={3}>
                  {dados.agrupar === 'operacao'
                    ? `${g.operacao} — ${dataBrHifen(g.data)}${g.tipo ? ' (' + g.tipo + ')' : ''}`
                    : dataBrHifen(g.data)}
                </td>
              </tr>
              {g.militares.map((m, i) => (
                <tr key={`${g.data}-${g.operacao || ''}-${m.matricula}-${i}`}>
                  <td>{String(i + 1).padStart(2, '0')}</td>
                  <td>{nomeExibicaoMilitarDiario(m)}</td>
                  <td>{m.diarias} diárias</td>
                </tr>
              ))}
              <tr className="rel-pdf-total-linha">
                <td></td>
                <td>{dados.agrupar === 'operacao' ? 'Total da operação' : 'Total do dia'}</td>
                <td>{g.total} diárias</td>
              </tr>
            </Fragment>
          ))}
          <tr className="rel-pdf-total-linha rel-pdf-total-mes">
            <td></td>
            <td>TOTAL DO MÊS</td>
            <td>{dados.total_mes} diárias</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
