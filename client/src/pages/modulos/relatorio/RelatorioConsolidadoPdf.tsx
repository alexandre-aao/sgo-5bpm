import { CabecalhoRelatorioPdf } from '../../../components/relatorioPdf/CabecalhoRelatorioPdf';
import type { RelatorioDiariaItem } from './useRelatorioDiarias';

const MESES_NOMES = ['', 'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];

interface RelatorioConsolidadoPdfProps {
  lista: RelatorioDiariaItem[];
  mes: string;
  ano: string;
  busca: string;
}

export function RelatorioConsolidadoPdf({ lista, mes, ano, busca }: RelatorioConsolidadoPdfProps) {
  let sub = `${MESES_NOMES[parseInt(mes, 10)] || ''}/${ano}`;
  if (busca) sub += ` — filtro: "${busca}"`;
  const totalDiarias = lista.reduce((s, m) => s + (Number(m.total_diarias) || 0), 0);

  return (
    <>
      <CabecalhoRelatorioPdf titulo="Relatório Consolidado de Diárias por Militar" subtitulo={sub} />
      <table className="rel-pdf-tabela">
        <thead>
          <tr>
            <th style={{ width: 34 }}>Nº</th>
            <th style={{ width: 110 }}>Matrícula</th>
            <th>Nome do Militar</th>
            <th style={{ width: 90, textAlign: 'center' }}>Escalas</th>
            <th style={{ width: 90, textAlign: 'center' }}>Aparições</th>
            <th style={{ width: 120, textAlign: 'right' }}>Total de Diárias</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((m, i) => (
            <tr key={m.militar_id}>
              <td>{String(i + 1).padStart(2, '0')}</td>
              <td>{m.militar_id || '-'}</td>
              <td>{m.militar_nome}</td>
              <td style={{ textAlign: 'center' }}>{m.escalas_count}</td>
              <td style={{ textAlign: 'center' }}>{m.qtd_aparicoes}</td>
              <td style={{ textAlign: 'right' }}>{m.total_diarias}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="rel-pdf-rodape">Total de militares: {lista.length} — Total de diárias: {totalDiarias}</div>
    </>
  );
}
