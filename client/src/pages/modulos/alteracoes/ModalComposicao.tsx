import { useMemo, useState, type FormEvent } from 'react';
import { Calculator, Check, Plus, X } from 'lucide-react';
import { useModalA11y } from '../../../hooks/useModalA11y';
import { useToast } from '../../../context/useToast';
import type { ComposicaoPayload, ComposicaoServico } from './types';
import { TURNOS_SERVICO, UNIDADES_SERVICO } from './types';

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
    viaturas_previstas: composicao?.viaturas_previstas || 0,
    policiais_por_viatura: composicao?.policiais_por_viatura || 3,
    extras: composicao?.extras || 0,
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
              <input id="composicao-turno" list="turnos-composicao" value={form.turno} onChange={(e) => atualizar('turno', e.target.value)} placeholder="Ex.: 24h" required />
              <datalist id="turnos-composicao">{TURNOS_SERVICO.map((turno) => <option key={turno} value={turno} />)}</datalist>
            </div>
          </div>
          <div className="alteracoes-form-grid alteracoes-form-grid-numeros">
            <div className="form-group">
              <label htmlFor="composicao-viaturas">Viaturas completas previstas</label>
              <input id="composicao-viaturas" type="number" min="0" step="1" value={form.viaturas_previstas} onChange={(e) => atualizar('viaturas_previstas', Number(e.target.value))} required />
            </div>
            <div className="form-group">
              <label htmlFor="composicao-policiais-vtr">Policiais por viatura</label>
              <input id="composicao-policiais-vtr" type="number" min="1" step="1" value={form.policiais_por_viatura} onChange={(e) => atualizar('policiais_por_viatura', Number(e.target.value))} required />
            </div>
            <div className="form-group">
              <label htmlFor="composicao-extras">Extras/disponíveis</label>
              <input id="composicao-extras" type="number" min="0" step="1" value={form.extras} onChange={(e) => atualizar('extras', Number(e.target.value))} required />
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
