import { CabecalhoRelatorioPdf } from '../../../components/relatorioPdf/CabecalhoRelatorioPdf';
import { nomeMes } from './mesesNomes';
import type { RelatorioDiariaItem } from './useRelatorioDiarias';

interface RelatorioConsolidadoPdfProps {
  lista: RelatorioDiariaItem[];
  mes: string;
  ano: string;
  busca: string;
}

export function RelatorioConsolidadoPdf({ lista, mes, ano, busca }: RelatorioConsolidadoPdfProps) {
  let sub = `${nomeMes(mes)}/${ano}`;
  if (busca) sub += ` — filtro: "${busca}"`;
  const totalDiarias = lista.reduce((s, m) => s + (Number(m.total_diarias) || 0), 0);

  return (
    <>
      <CabecalhoRelatorioPdf titulo="Relatório Consolidado de Diárias por Militar" subtitulo={sub} />
      <table className="rel-pdf-tabela">
        <thead>
          <tr>
            <th className="rel-col-34">Nº</th>
            <th className="rel-col-110">Matrícula</th>
            <th>Nome do Militar</th>
            <th className="rel-col-90 texto-centro">Escalas</th>
            <th className="rel-col-90 texto-centro">Aparições</th>
            <th className="rel-col-120 texto-direita">Total de Diárias</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((m, i) => (
            <tr key={m.militar_id}>
              <td>{String(i + 1).padStart(2, '0')}</td>
              <td>{m.militar_id || '-'}</td>
              <td>{m.militar_nome}</td>
              <td className="texto-centro">{m.escalas_count}</td>
              <td className="texto-centro">{m.qtd_aparicoes}</td>
              <td className="texto-direita">{m.total_diarias}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="rel-pdf-rodape">Total de militares: {lista.length} — Total de diárias: {totalDiarias}</div>
    </>
  );
}
