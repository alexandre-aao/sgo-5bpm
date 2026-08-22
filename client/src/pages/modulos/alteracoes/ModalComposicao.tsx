import { useMemo, useState, type FormEvent } from 'react';
import { Calculator, Check, Plus, X } from 'lucide-react';
import { useModalA11y } from '../../../hooks/useModalA11y';
import { useToast } from '../../../context/useToast';
import type { ComposicaoPayload, ComposicaoServico } from './types';
import { JORNADAS_SERVICO, TURNOS_SERVICO, UNIDADES_SERVICO } from './types';

interface Props {
  composicao?: ComposicaoServico | null;
  unidadeInicial: string;
  dataInicial: string;
  turnoInicial: string;
  unidades: readonly string[];
  onFechar: () => void;
  onSalvar: (payload: ComposicaoPayload, id?: string) => Promise<{ ok: boolean; mensagem?: string }>;
}

export function ModalComposicao({
  composicao, unidadeInicial, dataInicial, turnoInicial, unidades, onFechar, onSalvar,
}: Props) {
  const { idTitulo, refCaixa, propsOverlay } = useModalA11y(onFechar);
  const { toast } = useToast();
  const [form, setForm] = useState<ComposicaoPayload>(() => ({
    unidade: composicao?.unidade || unidadeInicial,
    data: composicao?.data || dataInicial,
    turno: composicao?.turno || turnoInicial,
    jornada: composicao?.jornada || (composicao?.turno === 'DIURNO' || composicao?.turno === 'NOTURNO' ? '12H' : '24H'),
    horario_inicio: composicao?.horario_inicio || (composicao?.turno === 'NOTURNO' ? '19:00' : '07:00'),
    horario_fim: composicao?.horario_fim || (composicao?.turno === 'NOTURNO' ? '07:00' : '19:00'),
    viaturas_previstas: composicao?.viaturas_previstas || 0,
    policiais_por_viatura: composicao?.policiais_por_viatura || 3,
    extras: composicao?.extras || 0,
    qtd_viaturas_completas: composicao?.qtd_viaturas_completas ?? 0,
    qtd_policiais_disponiveis: composicao?.qtd_policiais_disponiveis ?? 0,
    observacao: composicao?.observacao || '',
  }));
  const [enviando, setEnviando] = useState(false);

  const total = useMemo(
    () => Math.max(0, Number(form.viaturas_previstas) || 0) * Math.max(0, Number(form.policiais_por_viatura) || 0) + Math.max(0, Number(form.extras) || 0),
    [form.extras, form.policiais_por_viatura, form.viaturas_previstas],
  );

  function atualizar<K extends keyof ComposicaoPayload>(campo: K, valor: ComposicaoPayload[K]) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (!form.unidade || !form.data || !form.turno) {
      toast('Informe unidade, data e turno.', 'warning');
      return;
    }
    setEnviando(true);
    const resultado = await onSalvar({
      ...form,
      viaturas_previstas: Math.max(0, Number(form.viaturas_previstas) || 0),
      policiais_por_viatura: Math.max(0, Number(form.policiais_por_viatura) || 0),
      extras: Math.max(0, Number(form.extras) || 0),
      jornada: form.jornada || '24H',
      turno: form.jornada === '24H' ? '24H' : (form.turno === 'NOTURNO' ? 'NOTURNO' : 'DIURNO'),
      horario_inicio: form.jornada === '12H' ? form.horario_inicio : null,
      horario_fim: form.jornada === '12H' ? form.horario_fim : null,
      qtd_viaturas_completas: Math.max(0, Number(form.qtd_viaturas_completas) || 0),
      qtd_policiais_disponiveis: Math.max(0, Number(form.qtd_policiais_disponiveis) || 0),
      qtd_viaturas_previstas: Math.max(0, Number(form.viaturas_previstas) || 0),
      qtd_extras: Math.max(0, Number(form.extras) || 0),
      observacao: form.observacao?.trim() || '',
    }, composicao?.id);
    setEnviando(false);
    if (resultado.ok) {
      toast(composicao ? 'Composição atualizada.' : 'Composição registrada.', 'success');
      onFechar();
    } else {
      toast(resultado.mensagem || 'Não foi possível salvar a composição.', 'danger');
    }
  }

  return (
    <div className="modal-overlay" {...propsOverlay}>
      <div className="modal-box modal-box-lg" ref={refCaixa}>
        <div className="modal-header">
          <h3 id={idTitulo}>{composicao ? <Calculator /> : <Plus />} {composicao ? 'Editar composição prevista' : 'Nova composição prevista'}</h3>
          <button type="button" className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button>
        </div>
        <form onSubmit={salvar}>
          <p className="texto-auxiliar">Informação fornecida pela Sargenteação. O total é uma projeção operacional para planejamento.</p>
          <div className="alteracoes-form-grid">
            <div className="form-group">
              <label htmlFor="composicao-unidade">Unidade</label>
              <select id="composicao-unidade" value={form.unidade} onChange={(e) => atualizar('unidade', e.target.value)} disabled={unidades.length === 1} required>
                <option value="">Selecione</option>
                {(unidades.length ? unidades : UNIDADES_SERVICO).map((unidade) => <option key={unidade} value={unidade}>{unidade}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="composicao-data">Data</label>
              <input id="composicao-data" type="date" value={form.data} onChange={(e) => atualizar('data', e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="composicao-turno">Turno</label>
              {form.jornada === '12H' ? <select id="composicao-turno" value={form.turno === 'NOTURNO' ? 'NOTURNO' : 'DIURNO'} onChange={(e) => atualizar('turno', e.target.value)} required><option value="DIURNO">Diurno · 07:00–19:00</option><option value="NOTURNO">Noturno · 19:00–07:00</option></select> : <input id="composicao-turno" value="24H" readOnly required />}
              <datalist id="turnos-composicao">{TURNOS_SERVICO.map((turno) => <option key={turno} value={turno} />)}</datalist>
            </div>
            <div className="form-group">
              <label htmlFor="composicao-jornada">Jornada</label>
              <select id="composicao-jornada" value={form.jornada || '24H'} onChange={(e) => {
                const jornada = e.target.value;
                setForm((atual) => ({ ...atual, jornada, turno: jornada === '24H' ? '24H' : (atual.turno === 'NOTURNO' ? 'NOTURNO' : 'DIURNO') }));
              }} required>{JORNADAS_SERVICO.map((jornada) => <option key={jornada} value={jornada}>{jornada === '24H' ? '24 horas (24x72)' : '12 horas'}</option>)}</select>
            </div>
            {form.jornada === '12H' && <><div className="form-group"><label htmlFor="composicao-horario-inicio">Início do turno</label><input id="composicao-horario-inicio" type="time" value={form.horario_inicio || ''} onChange={(e) => atualizar('horario_inicio', e.target.value)} required /></div><div className="form-group"><label htmlFor="composicao-horario-fim">Fim do turno</label><input id="composicao-horario-fim" type="time" value={form.horario_fim || ''} onChange={(e) => atualizar('horario_fim', e.target.value)} required /></div></>}
          </div>
          <div className="alteracoes-form-grid alteracoes-form-grid-numeros">
            <div className="form-group">
              <label htmlFor="composicao-viaturas">Viaturas previstas (base)</label>
              <input id="composicao-viaturas" type="number" min="0" step="1" value={form.viaturas_previstas} onChange={(e) => atualizar('viaturas_previstas', Number(e.target.value))} required />
            </div>
            <div className="form-group">
              <label htmlFor="composicao-policiais-vtr">Policiais por viatura</label>
              <input id="composicao-policiais-vtr" type="number" min="1" step="1" value={form.policiais_por_viatura} onChange={(e) => atualizar('policiais_por_viatura', Number(e.target.value))} required />
            </div>
            <div className="form-group">
              <label htmlFor="composicao-extras">Policiais extras previstos</label>
              <input id="composicao-extras" type="number" min="0" step="1" value={form.extras} onChange={(e) => atualizar('extras', Number(e.target.value))} required />
            </div>
          </div>
          <div className="panel panel-subsection alteracoes-capacidade-final-panel">
            <div className="panel-title"><Calculator /><h2>Após as alterações deste serviço</h2></div>
            <p className="texto-auxiliar">Informe uma fotografia final da Companhia. Esses números não serão somados por alteração.</p>
            <div className="alteracoes-form-grid alteracoes-form-grid-numeros">
              <div className="form-group"><label htmlFor="composicao-viaturas-completas">Viaturas completas</label><input id="composicao-viaturas-completas" type="number" min="0" step="1" value={form.qtd_viaturas_completas ?? 0} onChange={(e) => atualizar('qtd_viaturas_completas', Number(e.target.value))} required /></div>
              <div className="form-group"><label htmlFor="composicao-policiais-disponiveis">Policiais disponíveis fora de guarnição</label><input id="composicao-policiais-disponiveis" type="number" min="0" step="1" value={form.qtd_policiais_disponiveis ?? 0} onChange={(e) => atualizar('qtd_policiais_disponiveis', Number(e.target.value))} required /></div>
            </div>
          </div>
          <div className="panel panel-subsection alteracoes-total-panel">
            <div className="panel-title"><Calculator /><h2>Total previsto</h2></div>
            <div className="kpi-valor alteracoes-total-valor">{total} policiais</div>
            <p className="texto-auxiliar">{form.viaturas_previstas || 0} viatura(s) × {form.policiais_por_viatura || 0} + {form.extras || 0} extra(s)</p>
          </div>
          <div className="form-group">
            <label htmlFor="composicao-observacao">Observação (opcional)</label>
            <textarea id="composicao-observacao" rows={3} value={form.observacao} onChange={(e) => atualizar('observacao', e.target.value)} placeholder="Ex.: reforço previsto para evento local." />
          </div>
          <div className="form-actions form-actions-modal">
            <button type="button" className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
            <button type="submit" className={`btn btn-primary${enviando ? ' btn-carregando' : ''}`} disabled={enviando}><Check /> Salvar composição</button>
          </div>
        </form>
      </div>
    </div>
  );
}
