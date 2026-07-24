import type { Tables } from '../../../types/supabase';
import { CabecalhoRelatorioPdf } from '../../../components/relatorioPdf/CabecalhoRelatorioPdf';
import type { FiltrosEventos } from './filtros';

interface RelatorioEventosPdfProps {
  eventos: Tables<'eventos'>[];
  filtros: FiltrosEventos;
}

function dataBr(iso: string): string {
  return iso ? iso.split('-').reverse().join('/') : '';
}

// Conteúdo do Relatório de Eventos (PDF) — colunas Nº/Data/Nº OS/Nome do
// Evento/Endereço-Local/Nº SEI, respeitando o filtro ativo (mesma lista de
// getEventosFiltrados(), ordenada por data ascendente). Espelha
// gerarRelatorioPdfEventos() em public/app.js.
export function RelatorioEventosPdf({ eventos, filtros }: RelatorioEventosPdfProps) {
  const ordenados = [...eventos].sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));

  let periodo = 'Todos os eventos cadastrados';
  if (filtros.dataInicio && filtros.dataFim) periodo = `Período: ${dataBr(filtros.dataInicio)} a ${dataBr(filtros.dataFim)}`;
  else if (filtros.dataInicio) periodo = `A partir de ${dataBr(filtros.dataInicio)}`;
  else if (filtros.dataFim) periodo = `Até ${dataBr(filtros.dataFim)}`;

  return (
    <>
      <CabecalhoRelatorioPdf titulo="Relatório de Eventos" subtitulo={periodo} />
      <table className="rel-pdf-tabela">
        <thead>
          <tr>
            <th style={{ width: 34 }}>Nº</th>
            <th style={{ width: 78 }}>Data</th>
            <th style={{ width: 150 }}>Nº OS</th>
            <th>Nome do Evento</th>
            <th>Endereço/Local</th>
            <th style={{ width: 150 }}>Nº SEI</th>
          </tr>
        </thead>
        <tbody>
          {ordenados.map((evt, i) => (
            <tr key={evt.id}>
              <td>{String(i + 1).padStart(2, '0')}</td>
              <td>{dataBr(evt.data_inicio)}</td>
              <td>{evt.num_os_manual || '-'}</td>
              <td>{evt.nome_evento}</td>
              <td>{evt.local_itinerario || evt.bairro || '-'}</td>
              <td>{evt.num_sei || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="rel-pdf-rodape">Total de eventos: {ordenados.length}</div>
    </>
  );
}
