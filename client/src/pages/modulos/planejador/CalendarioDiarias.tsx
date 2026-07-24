import { useEffect, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { apiFetch } from '../../../lib/api';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface DiaComDiaria {
  dia: string;
  total_diarias: number;
  eventos: { id: string; nome_evento: string; tipo_evento: string; total_diarias: number }[];
}

interface CalendarioDiariasProps {
  /** Muda sempre que uma Missão Avulsa é criada em outra parte da tela —
   * dispara um refetch mesmo que o mês exibido no calendário seja outro. */
  recarregarSinal: number;
  onClickDia: (dataStr: string) => void;
}

function classeCalor(qtd: number): string {
  if (qtd > 24) return ' heat-alto';
  if (qtd > 12) return ' heat-medio';
  if (qtd > 0) return ' heat-leve';
  return '';
}

// Calendário heatmap de diárias — espelha renderCalendarioDiarias() em
// public/app.js. Navegação de mês independente do filtro mês/ano do Planejador
// (mesmo comportamento do app antigo: state.calendarDiariasMonth/Year à parte).
export function CalendarioDiarias({ recarregarSinal, onClickDia }: CalendarioDiariasProps) {
  const hoje = new Date();
  const [mesIndice, setMesIndice] = useState(hoje.getMonth());
  const [ano, setAno] = useState(hoje.getFullYear());
  const [diasComDiaria, setDiasComDiaria] = useState<Map<string, DiaComDiaria>>(new Map());
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let cancelado = false;
    async function buscar() {
      setCarregando(true);
      setErro(false);
      const mesStr = String(mesIndice + 1).padStart(2, '0');
      try {
        const res = await apiFetch(`/api/diarias-calendario?mes=${mesStr}&ano=${ano}`);
        const lista = (await res.json()) as DiaComDiaria[];
        if (cancelado) return;
        if (!res.ok || !Array.isArray(lista)) throw new Error('resposta inesperada da API');
        setDiasComDiaria(new Map(lista.map((d) => [d.dia, d])));
      } catch (erroReq) {
        console.error('Erro ao carregar o calendário de diárias:', erroReq);
        if (!cancelado) setErro(true);
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }
    void buscar();
    return () => {
      cancelado = true;
    };
  }, [mesIndice, ano, recarregarSinal]);

  function irMesAnterior() {
    if (mesIndice === 0) {
      setMesIndice(11);
      setAno((a) => a - 1);
    } else {
      setMesIndice((m) => m - 1);
    }
  }

  function irProximoMes() {
    if (mesIndice === 11) {
      setMesIndice(0);
      setAno((a) => a + 1);
    } else {
      setMesIndice((m) => m + 1);
    }
  }

  const primeiroDiaSemana = new Date(ano, mesIndice, 1).getDay();
  const totalDiasMes = new Date(ano, mesIndice + 1, 0).getDate();
  const celulasVazias = Array.from({ length: primeiroDiaSemana });
  const dias = Array.from({ length: totalDiasMes }, (_, i) => i + 1);

  return (
    <div className="panel calendario-diarias-panel">
      <div className="panel-header">
        <div className="panel-title">
          <CalendarDays />
          <h2>Calendário de Diárias</h2>
        </div>
        <div className="calendar-nav">
          <button type="button" className="btn-icon" aria-label="Mês anterior" title="Mês anterior" onClick={irMesAnterior}>
            <ChevronLeft />
          </button>
          <span>{MESES[mesIndice]} {ano}</span>
          <button type="button" className="btn-icon" aria-label="Próximo mês" title="Próximo mês" onClick={irProximoMes}>
            <ChevronRight />
          </button>
        </div>
      </div>
      <div className="calendar-container heatmap-container">
        <div className="calendar-weekdays heatmap-weekdays">
          {DIAS_SEMANA.map((d) => <div key={d}>{d}</div>)}
        </div>
        {erro ? (
          <p className="turno-vazio" style={{ gridColumn: '1/-1' }}>
            Não foi possível carregar o calendário. Tente de novo em instantes.
          </p>
        ) : (
          <div className="heatmap-grid">
            {celulasVazias.map((_, i) => (
              <div className="heat-cell heat-vazia" key={`vazia-${i}`} />
            ))}
            {carregando ? null : dias.map((dia) => {
              const diaFormatado = String(dia).padStart(2, '0');
              const mesStr = String(mesIndice + 1).padStart(2, '0');
              const dataStr = `${ano}-${mesStr}-${diaFormatado}`;
              const infoDia = diasComDiaria.get(dataStr);
              const qtd = infoDia ? infoDia.total_diarias : 0;
              const ehHoje = hoje.getDate() === dia && hoje.getMonth() === mesIndice && hoje.getFullYear() === ano;
              const detalhe = infoDia
                ? infoDia.eventos.map((e) => `${e.nome_evento} (${e.total_diarias} diária(s))`).join('\n') + '\n'
                : '';
              return (
                <div
                  key={dataStr}
                  className={`heat-cell${ehHoje ? ' heat-hoje' : ''}${classeCalor(qtd)}`}
                  title={`${detalhe}Clique para lançar uma Missão Avulsa em ${diaFormatado}/${mesStr}`}
                  onClick={() => onClickDia(dataStr)}
                >
                  <span className="heat-dia">{dia}</span>
                  <span className="heat-qtd">{qtd || ''}</span>
                </div>
              );
            })}
          </div>
        )}
        <div className="heatmap-legenda">
          <span><i className="heat-amostra heat-leve" /> Leve (≤12)</span>
          <span><i className="heat-amostra heat-medio" /> Médio (≤24)</span>
          <span><i className="heat-amostra heat-alto" /> Alto (&gt;24)</span>
        </div>
      </div>
      <p className="calendario-diarias-dica">
        <Info />
        Clique em um dia para lançar uma Missão Avulsa.
      </p>
    </div>
  );
}
