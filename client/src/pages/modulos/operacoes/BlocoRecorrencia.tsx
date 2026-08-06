import { useState, type Dispatch, type SetStateAction } from 'react';
import { CalendarClock, Plus, TriangleAlert, X } from 'lucide-react';
import {
  DIAS_SEMANA,
  OPCOES_RECORRENCIA,
  ehRecorrente,
  rotuloDataCompleto,
  rotuloDataCurto,
  type FormRecorrencia,
  type TipoRecorrencia,
} from '../../../lib/recorrencia';
import { paraDataBr } from '../../../lib/periodo';

interface BlocoRecorrenciaProps {
  form: FormRecorrencia;
  /** Recebe o setState do pai e é sempre chamado com FUNÇÃO ATUALIZADORA. Passar
   *  o objeto pronto perderia cliques: dois toques nos dias da semana dentro do
   *  mesmo lote de renderização leriam o mesmo `form` antigo e o segundo
   *  sobrescreveria o primeiro. */
  onMudar: Dispatch<SetStateAction<FormRecorrencia>>;
  /** Datas devolvidas pelo servidor, SEM as exclusões aplicadas — as desmarcadas
   *  continuam na lista, só que sem seleção, para poderem voltar. */
  preview: { datas: string[]; carregando: boolean; erro: string };
  datasSelecionadas: string[];
  qtdDiariasPorOcorrencia: number;
}

// Bloco de recorrência do modal Nova Operação: escolhe a regra e mostra a prévia
// conferível das datas antes de salvar. Só aparece na CRIAÇÃO — editar uma
// ocorrência existente não recria o lote.
export function BlocoRecorrencia({
  form,
  onMudar,
  preview,
  datasSelecionadas,
  qtdDiariasPorOcorrencia,
}: BlocoRecorrenciaProps) {
  const [dataAvulsa, setDataAvulsa] = useState('');

  // Toda mudança de regra zera as exclusões: elas apontavam para datas da regra
  // anterior, que podem nem existir mais na nova.
  function trocarTipo(tipo: TipoRecorrencia) {
    onMudar((atual) => ({ ...atual, tipo, datasExcluidas: [] }));
  }

  function alternarDiaSemana(valor: number) {
    onMudar((atual) => ({
      ...atual,
      diasSemana: atual.diasSemana.includes(valor)
        ? atual.diasSemana.filter((d) => d !== valor)
        : [...atual.diasSemana, valor],
      datasExcluidas: [],
    }));
  }

  function alternarData(data: string) {
    onMudar((atual) => ({
      ...atual,
      datasExcluidas: atual.datasExcluidas.includes(data)
        ? atual.datasExcluidas.filter((d) => d !== data)
        : [...atual.datasExcluidas, data],
    }));
  }

  function adicionarDataAvulsa() {
    if (!dataAvulsa) return;
    onMudar((atual) => (atual.datasAvulsas.includes(dataAvulsa) ? atual : {
      ...atual,
      datasAvulsas: [...atual.datasAvulsas, dataAvulsa].sort(),
      datasExcluidas: [],
    }));
    setDataAvulsa('');
  }

  function removerDataAvulsa(data: string) {
    onMudar((atual) => ({
      ...atual,
      datasAvulsas: atual.datasAvulsas.filter((d) => d !== data),
      datasExcluidas: atual.datasExcluidas.filter((d) => d !== data),
    }));
  }

  const total = datasSelecionadas.length;
  const totalDiarias = total * qtdDiariasPorOcorrencia;

  return (
    <div className="recorrencia-bloco">
      <div className="form-row">
        <div className="form-group col-md-4">
          <label htmlFor="op-recorrencia-tipo">Recorrência</label>
          <select
            id="op-recorrencia-tipo"
            value={form.tipo}
            onChange={(e) => trocarTipo(e.target.value as TipoRecorrencia)}
          >
            {OPCOES_RECORRENCIA.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
          </select>
        </div>

        {form.tipo === 'semanal' && (
          <div className="form-group col-md-8">
            <label id="rot-dias-semana">Dias da Semana *</label>
            <div className="dias-semana-grupo" role="group" aria-labelledby="rot-dias-semana">
              {DIAS_SEMANA.map((dia) => {
                const ativo = form.diasSemana.includes(dia.valor);
                return (
                  <button
                    key={dia.valor} type="button"
                    className={`dia-semana-btn${ativo ? ' ativo' : ''}`}
                    aria-pressed={ativo} aria-label={dia.nome} title={dia.nome}
                    onClick={() => alternarDiaSemana(dia.valor)}
                  >
                    {dia.curto}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {form.tipo === 'intervalo' && (
          <div className="form-group col-md-4">
            <label htmlFor="op-intervalo-dias">A cada quantos dias? *</label>
            <input
              type="number" id="op-intervalo-dias" min={1} max={365}
              value={form.intervaloDias}
              onChange={(e) => onMudar((atual) => ({ ...atual, intervaloDias: e.target.value, datasExcluidas: [] }))}
            />
          </div>
        )}

        {form.tipo === 'avulsa' && (
          <div className="form-group col-md-8">
            <label htmlFor="op-data-avulsa">Datas Selecionadas *</label>
            <div className="recorrencia-avulsa-add">
              <input
                type="date" id="op-data-avulsa" value={dataAvulsa}
                onChange={(e) => setDataAvulsa(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarDataAvulsa(); } }}
              />
              <button type="button" className="btn btn-secondary btn-sm" onClick={adicionarDataAvulsa} disabled={!dataAvulsa}>
                <Plus /> Adicionar
              </button>
            </div>
            {form.datasAvulsas.length > 0 && (
              <div className="recorrencia-avulsa-lista">
                {form.datasAvulsas.map((data) => (
                  <span className="recorrencia-avulsa-chip" key={data}>
                    {paraDataBr(data)}
                    <button
                      type="button" className="btn-chip-remover"
                      aria-label={`Remover ${paraDataBr(data)}`} title="Remover data"
                      onClick={() => removerDataAvulsa(data)}
                    >
                      <X />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {ehRecorrente(form.tipo) && (
        <div className="recorrencia-preview">
          {preview.erro ? (
            <p className="recorrencia-erro"><TriangleAlert /> {preview.erro}</p>
          ) : preview.carregando ? (
            <p className="texto-auxiliar">Calculando as datas…</p>
          ) : preview.datas.length === 0 ? (
            <p className="texto-auxiliar">
              Complete os campos acima para ver as datas que serão criadas.
            </p>
          ) : (
            <>
              <div className="recorrencia-preview-cabecalho">
                <strong><CalendarClock /> {total} {total === 1 ? 'operação será criada' : 'operações serão criadas'}</strong>
                <span className="texto-auxiliar">Desmarque feriados ou dias sem efetivo.</span>
              </div>
              <div className="recorrencia-datas">
                {preview.datas.map((data) => {
                  const marcada = !form.datasExcluidas.includes(data);
                  return (
                    <label className={`recorrencia-data${marcada ? '' : ' desmarcada'}`} key={data}>
                      <input
                        type="checkbox" checked={marcada}
                        aria-label={rotuloDataCompleto(data)}
                        onChange={() => alternarData(data)}
                      />
                      <span>{rotuloDataCurto(data)}</span>
                    </label>
                  );
                })}
              </div>
              <p className="recorrencia-resumo">
                {total} {total === 1 ? 'ocorrência' : 'ocorrências'} × {qtdDiariasPorOcorrencia} diária(s) por ocorrência ={' '}
                <strong>{totalDiarias} diária(s) estimada(s)</strong> no grupo.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
