import { CalendarPlus, SearchX } from 'lucide-react';
import type { Tables } from '../../../types/supabase';
import { slugBadge } from '../../../lib/slug';
import { SemDados } from '../../../components/estado/SemDados';
import { ThOrdenavel } from '../../../components/tabela/ThOrdenavel';
import { useOrdenacao, ordenarLista, type Acessores } from '../../../components/tabela/ordenacao';
import { BarraPaginacao } from '../../../components/tabela/BarraPaginacao';
import { paginar } from '../../../components/tabela/paginacao';

type ColunaEvento = 'data' | 'nome' | 'tipo' | 'demandante' | 'bairro';

const ACESSORES: Acessores<Tables<'eventos'>, ColunaEvento> = {
  data: (e) => e.data_inicio,
  nome: (e) => e.nome_evento || '',
  tipo: (e) => e.tipo_evento || '',
  demandante: (e) => e.demandante || '',
  bairro: (e) => e.bairro || '',
};

interface TabelaEventosProps {
  eventos: Tables<'eventos'>[];
  totalGeral: number;
  pagina: number;
  temFiltro: boolean;
  onMudarPagina: (pagina: number) => void;
  onAbrir: (id: string) => void;
  onLimparFiltros: () => void;
}

// Tabela "Listar Eventos": paginação client-side (a API nunca paginou),
// ordenação por coluna e cabeçalho fixo — Etapa 1, item 6. A ordem padrão
// continua sendo a de antes: data de início, mais recente primeiro.
export function TabelaEventos({
  eventos, totalGeral, pagina, temFiltro, onMudarPagina, onAbrir, onLimparFiltros,
}: TabelaEventosProps) {
  const { ordenacao, alternar } = useOrdenacao<ColunaEvento>({ coluna: 'data', direcao: 'desc' });

  const ordenados = ordenarLista(eventos, ordenacao, ACESSORES);
  const { itens, paginaAtual, totalPaginas } = paginar(ordenados, pagina);

  const info = ordenados.length === totalGeral
    ? `${totalGeral} evento(s) cadastrado(s).`
    : `Mostrando ${ordenados.length} de ${totalGeral} evento(s).`;

  return (
    <>
      <div className="table-responsive tabela-scroll">
        <table className="styled-table table-cards-mobile">
          <thead>
            <tr>
              <ThOrdenavel coluna="data" ordenacao={ordenacao} onAlternar={alternar}>Data</ThOrdenavel>
              <ThOrdenavel coluna="nome" ordenacao={ordenacao} onAlternar={alternar}>Nome do Evento</ThOrdenavel>
              <ThOrdenavel coluna="tipo" ordenacao={ordenacao} onAlternar={alternar}>Tipo</ThOrdenavel>
              <ThOrdenavel coluna="demandante" ordenacao={ordenacao} onAlternar={alternar}>Demandante</ThOrdenavel>
              <ThOrdenavel coluna="bairro" ordenacao={ordenacao} onAlternar={alternar}>Bairro / Local</ThOrdenavel>
              <th>Nº OS</th>
              <th>Nº SEI</th>
            </tr>
          </thead>
          <tbody>
            {itens.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  {temFiltro ? (
                    <SemDados
                      icone={SearchX}
                      titulo="Nenhum evento para estes filtros"
                      orientacao="Amplie o período ou revise o texto da busca. Limpar os filtros mostra a pauta inteira."
                      acao={{ rotulo: 'Limpar filtros', onClick: onLimparFiltros }}
                    />
                  ) : (
                    <SemDados
                      icone={CalendarPlus}
                      titulo="Nenhum evento cadastrado"
                      orientacao="Os eventos civis da pauta aparecem aqui. Comece cadastrando o primeiro em Novo Evento."
                    />
                  )}
                </td>
              </tr>
            ) : (
              itens.map((evt) => (
                <tr key={evt.id} className="linha-clicavel" onClick={() => onAbrir(evt.id)}>
                  <td data-label="Data"><strong>{evt.data_inicio.split('-').reverse().join('/')}</strong></td>
                  <td className="card-title-cell">{evt.nome_evento}</td>
                  <td data-label="Tipo"><span className={`badge ${slugBadge(evt.tipo_evento)}`}>{evt.tipo_evento}</span></td>
                  <td data-label="Demandante">{evt.demandante || '-'}</td>
                  <td data-label="Bairro / Local">{evt.bairro || 'Centro'}</td>
                  <td data-label="Nº OS"><code>{evt.num_os_manual || '-'}</code></td>
                  <td data-label="Nº SEI"><code>{evt.num_sei || '-'}</code></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <BarraPaginacao info={info} pagina={paginaAtual} totalPaginas={totalPaginas} onMudarPagina={onMudarPagina} />
    </>
  );
}
