import { useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, FileText, Pencil, Plus, UserRound, X } from 'lucide-react';
import { useModalA11y } from '../../../hooks/useModalA11y';
import { useToast } from '../../../context/useToast';
import type { AlteracaoPayload, AlteracaoServico, PessoaServico } from './types';
import { JORNADAS_SERVICO, TIPOS_ALTERACAO, TURNOS_SERVICO, UNIDADES_SERVICO } from './types';
import { dataBr } from './utils';

interface Props {
  alteracao?: AlteracaoServico | null;
  unidades: readonly string[];
  pessoas: PessoaServico[];
  unidadeInicial: string;
  dataInicial: string;
  turnoInicial: string;
  onFechar: () => void;
  onSalvar: (payload: AlteracaoPayload, id?: string) => Promise<{ ok: boolean; mensagem?: string }>;
}

const ETAPAS = ['Contexto', 'Policial', 'Alteração', 'Período', 'Revisão'];
const AUSENCIAS = new Set(['ATESTADO', 'DISPENSA/FOLGA', 'FÉRIAS', 'CURSO', 'LICENÇA', 'AFASTAMENTO', 'FALTA PREVISTA', 'OUTRO']);

function valorInicial(props: Props): AlteracaoPayload {
  const item = props.alteracao;
  return {
    unidade: item?.unidade || props.unidadeInicial,
    data_inicio: item?.data_inicio || props.dataInicial,
    data_fim: item?.data_fim || item?.data_inicio || props.dataInicial,
    data_referencia_servico: item?.data_referencia_servico || item?.data_inicio || props.dataInicial,
    jornada: item?.jornada || (item?.turno === 'DIURNO' || item?.turno === 'NOTURNO' ? '12H' : '24H'),
    turno: item?.turno || props.turnoInicial,
    horario_inicio: item?.horario_inicio || (item?.turno === 'NOTURNO' ? '19:00' : '07:00'),
    horario_fim: item?.horario_fim || (item?.turno === 'NOTURNO' ? '07:00' : '19:00'),
    policial_id: item?.policial_id || null,
    policial_nome: item?.policial_nome || '',
    policial_matricula: item?.policial_matricula || '',
    tipo: item?.tipo || 'ATESTADO',
    substituto_id: item?.substituto_id || null,
    substituto_nome: item?.substituto_nome || '',
    substituto_matricula: item?.substituto_matricula || '',
    motivo: item?.motivo || '',
    observacao: item?.observacao || '',
    numero_sei: item?.numero_sei || item?.documento || '',
    documento: item?.documento || '',
  };
}

export function ModalAlteracao({ alteracao, unidades, pessoas, unidadeInicial, dataInicial, turnoInicial, onFechar, onSalvar }: Props) {
  const { idTitulo, refCaixa, propsOverlay } = useModalA11y(onFechar);
  const { toast } = useToast();
  const [etapa, setEtapa] = useState(0);
  const [form, setForm] = useState<AlteracaoPayload>(() => valorInicial({ alteracao, unidades, pessoas, unidadeInicial, dataInicial, turnoInicial, onFechar, onSalvar }));
  const [enviando, setEnviando] = useState(false);
  const modoEdicao = !!alteracao;
  const tipoAusencia = AUSENCIAS.has(form.tipo);

  const pessoasDaUnidade = useMemo(() => {
    if (!form.unidade) return pessoas;
    return pessoas.filter((pessoa) => !pessoa.subunidade || pessoa.subunidade === form.unidade);
  }, [form.unidade, pessoas]);

  function atualizar<K extends keyof AlteracaoPayload>(campo: K, valor: AlteracaoPayload[K]) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
  }

  function selecionarPessoa(campo: 'policial' | 'substituto', id: string) {
    const pessoa = pessoasDaUnidade.find((item) => item.id === id) || pessoas.find((item) => item.id === id);
    if (campo === 'policial') {
      setForm((atual) => ({ ...atual, policial_id: pessoa?.id || null, policial_nome: pessoa?.nome || '', policial_matricula: pessoa?.matricula || '' }));
    } else {
      setForm((atual) => ({ ...atual, substituto_id: pessoa?.id || null, substituto_nome: pessoa?.nome || '', substituto_matricula: pessoa?.matricula || '' }));
    }
  }

  function validarEtapa(): boolean {
    if (etapa === 0 && (!form.unidade || !form.data_inicio || !form.turno)) {
      toast('Informe unidade, data inicial e turno.', 'warning'); return false;
    }
    if (etapa === 1 && !form.policial_id) {
      toast('Selecione o policial afetado no cadastro de pessoal.', 'warning'); return false;
    }
    if (etapa === 2 && !(form.motivo || '').trim()) {
      toast('Informe o motivo da alteração.', 'warning'); return false;
    }
    if (etapa === 2 && form.tipo === 'PERMUTA' && !form.substituto_id) {
      toast('Uma permuta precisa de policial substituto.', 'warning'); return false;
    }
    if (etapa === 3 && form.data_fim && form.data_fim < form.data_inicio) {
      toast('A data final não pode ser anterior à data inicial.', 'warning'); return false;
    }
    if (etapa === 3 && form.jornada !== '12H' && form.data_fim !== form.data_inicio && !form.data_referencia_servico) {
      toast('Informe uma data de serviço confiável para projetar o ciclo 24x72.', 'warning'); return false;
    }
    if (etapa === 3 && form.jornada === '12H' && (!form.horario_inicio || !form.horario_fim || form.horario_inicio === form.horario_fim)) {
      toast('Informe o intervalo do turno de 12 horas.', 'warning'); return false;
    }
    return true;
  }

  function avancar() {
    if (!validarEtapa()) return;
    setEtapa((atual) => Math.min(ETAPAS.length - 1, atual + 1));
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (!validarEtapa()) return;
    if (!form.policial_nome.trim() || !form.data_inicio) {
      toast('Preencha os campos obrigatórios.', 'warning');
      return;
    }
    setEnviando(true);
    const resultado = await onSalvar({
      ...form,
      data_fim: tipoAusencia ? (form.data_fim || form.data_inicio) : form.data_inicio,
      policial_nome: form.policial_nome.trim(),
      policial_matricula: form.policial_matricula?.trim() || null,
      substituto_nome: form.substituto_nome?.trim() || null,
      substituto_matricula: form.substituto_matricula?.trim() || null,
      motivo: form.motivo?.trim() || null,
      observacao: form.observacao?.trim() || null,
      numero_sei: form.numero_sei?.trim() || null,
      documento: form.documento?.trim() || null,
      policial_pessoal_id: form.policial_id || null,
      substituto_pessoal_id: form.substituto_id || null,
      numero_documento: form.numero_sei?.trim() || form.documento?.trim() || null,
      data_referencia_servico: form.jornada === '24H' ? (form.data_referencia_servico || null) : null,
      jornada: form.jornada || '24H',
      turno: form.jornada === '24H' ? '24H' : (form.turno === 'NOTURNO' ? 'NOTURNO' : 'DIURNO'),
      horario_inicio: form.jornada === '12H' ? form.horario_inicio : null,
      horario_fim: form.jornada === '12H' ? form.horario_fim : null,
    }, alteracao?.id);
    setEnviando(false);
    if (resultado.ok) {
      toast(modoEdicao ? 'Alteração atualizada.' : 'Alteração registrada.', 'success');
      onFechar();
    } else {
      toast(resultado.mensagem || 'Não foi possível salvar a alteração.', 'danger');
    }
  }

  return (
    <div className="modal-overlay" {...propsOverlay}>
      <div
        className="modal-box modal-box-lg"
        ref={refCaixa}
        onMouseDown={(evento) => evento.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id={idTitulo}>{modoEdicao ? <Pencil /> : <Plus />} {modoEdicao ? 'Editar alteração' : 'Nova alteração do serviço'}</h3>
          <button type="button" className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button>
        </div>
        <div className="alteracoes-stepper" aria-label="Etapas do formulário">
          {ETAPAS.map((nome, indice) => (
            <button key={nome} type="button" className={`btn btn-sm ${indice === etapa ? 'btn-primary' : 'btn-secondary'}`} onClick={() => indice <= etapa && setEtapa(indice)} aria-current={indice === etapa ? 'step' : undefined}>
              {indice + 1}. {nome}
            </button>
          ))}
        </div>
        <form onSubmit={salvar}>
          {etapa === 0 && (
            <div className="alteracoes-form-grid">
              <div className="form-group">
                <label htmlFor="alteracao-unidade">Unidade</label>
                <select id="alteracao-unidade" value={form.unidade} onChange={(e) => atualizar('unidade', e.target.value)} disabled={unidades.length === 1} required>
                  <option value="">Selecione</option>
                  {(unidades.length ? unidades : UNIDADES_SERVICO).map((unidade) => <option key={unidade} value={unidade}>{unidade}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="alteracao-jornada">Jornada</label>
                <select id="alteracao-jornada" value={form.jornada || '24H'} onChange={(e) => {
                  const jornada = e.target.value;
                  setForm((atual) => ({ ...atual, jornada, turno: jornada === '24H' ? '24H' : (atual.turno === 'NOTURNO' ? 'NOTURNO' : 'DIURNO') }));
                }} required>
                  {JORNADAS_SERVICO.map((jornada) => <option key={jornada} value={jornada}>{jornada === '24H' ? '24 horas (24x72)' : '12 horas'}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="alteracao-turno">Turno</label>
                {form.jornada === '12H' ? <select id="alteracao-turno" value={form.turno === 'NOTURNO' ? 'NOTURNO' : 'DIURNO'} onChange={(e) => atualizar('turno', e.target.value)} required><option value="DIURNO">Diurno · 07:00–19:00</option><option value="NOTURNO">Noturno · 19:00–07:00</option></select> : <input id="alteracao-turno" value="24H" readOnly />}
                <datalist id="turnos-alteracao">{TURNOS_SERVICO.map((turno) => <option key={turno} value={turno} />)}</datalist>
              </div>
              <div className="form-group">
                <label htmlFor="alteracao-inicio">Data inicial</label>
                <input id="alteracao-inicio" type="date" value={form.data_inicio} onChange={(e) => atualizar('data_inicio', e.target.value)} required />
              </div>
            </div>
          )}

          {etapa === 1 && (
            <div>
              <div className="form-group">
                <label htmlFor="alteracao-policial"><UserRound /> Policial afetado</label>
                <select id="alteracao-policial" value={form.policial_id || ''} onChange={(e) => selecionarPessoa('policial', e.target.value)}>
                  <option value="">Selecione o policial no cadastro</option>
                  {pessoasDaUnidade.map((pessoa) => <option key={pessoa.id || pessoa.nome} value={pessoa.id}>{pessoa.nome}{pessoa.matricula ? ` · Mat. ${pessoa.matricula}` : ''}</option>)}
                </select>
              </div>
              <div className="alteracoes-form-grid alteracoes-form-grid-pessoa">
                <div className="form-group"><label htmlFor="alteracao-policial-nome">Nome</label><input id="alteracao-policial-nome" value={form.policial_nome} readOnly required /></div>
                <div className="form-group"><label htmlFor="alteracao-policial-matricula">Matrícula</label><input id="alteracao-policial-matricula" value={form.policial_matricula || ''} readOnly /></div>
              </div>
              <p className="texto-auxiliar">Nome e matrícula são copiados do cadastro para preservar o histórico do registro.</p>
            </div>
          )}

          {etapa === 2 && (
            <div>
              <div className="form-group"><label htmlFor="alteracao-tipo">Tipo de alteração</label><select id="alteracao-tipo" value={form.tipo} onChange={(e) => atualizar('tipo', e.target.value)} required>{TIPOS_ALTERACAO.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}</select></div>
              <div className="form-group"><label htmlFor="alteracao-motivo">Motivo</label><input id="alteracao-motivo" required value={form.motivo || ''} onChange={(e) => atualizar('motivo', e.target.value)} placeholder="Descreva o motivo principal" /></div>
              {form.tipo === 'PERMUTA' && (
                <div className="panel panel-subsection alteracoes-substituto-panel">
                  <div className="panel-title"><UserRound /><h2>Substituto da permuta</h2></div>
                  <div className="form-group alteracoes-substituto-select"><label htmlFor="alteracao-substituto">Policial substituto</label><select id="alteracao-substituto" value={form.substituto_id || ''} onChange={(e) => selecionarPessoa('substituto', e.target.value)} required><option value="">Selecione</option>{pessoasDaUnidade.filter((pessoa) => pessoa.id !== form.policial_id).map((pessoa) => <option key={pessoa.id || pessoa.nome} value={pessoa.id}>{pessoa.nome}{pessoa.matricula ? ` · Mat. ${pessoa.matricula}` : ''}</option>)}</select></div>
                  <div className="alteracoes-form-grid alteracoes-form-grid-pessoa"><div className="form-group"><label htmlFor="alteracao-substituto-nome">Nome</label><input id="alteracao-substituto-nome" value={form.substituto_nome || ''} readOnly required /></div><div className="form-group"><label htmlFor="alteracao-substituto-matricula">Matrícula</label><input id="alteracao-substituto-matricula" value={form.substituto_matricula || ''} readOnly /></div></div>
                </div>
              )}
            </div>
          )}

          {etapa === 3 && (
            <div>
              <p className="texto-auxiliar">Para ausências prolongadas, informe o período completo. O servidor compara o afastamento com os plantões realmente atingidos.</p>
              <div className="alteracoes-form-grid">
                <div className="form-group"><label htmlFor="alteracao-fim">Data final</label><input id="alteracao-fim" type="date" min={form.data_inicio} value={form.data_fim || form.data_inicio} onChange={(e) => atualizar('data_fim', e.target.value)} disabled={!tipoAusencia} /></div>
                {form.jornada === '24H' ? <div className="form-group"><label htmlFor="alteracao-referencia">Plantão de referência do ciclo 24x72</label><input id="alteracao-referencia" type="date" value={form.data_referencia_servico || ''} onChange={(e) => atualizar('data_referencia_servico', e.target.value)} required={form.data_fim !== form.data_inicio} /><small className="texto-auxiliar">Use uma data em que este policial efetivamente estava previsto para o serviço.</small></div> : <><div className="form-group"><label htmlFor="alteracao-horario-inicio">Início do turno 12h</label><input id="alteracao-horario-inicio" type="time" value={form.horario_inicio || ''} onChange={(e) => atualizar('horario_inicio', e.target.value)} required /></div><div className="form-group"><label htmlFor="alteracao-horario-fim">Fim do turno 12h</label><input id="alteracao-horario-fim" type="time" value={form.horario_fim || ''} onChange={(e) => atualizar('horario_fim', e.target.value)} required /></div></>}
              </div>
              <div className="form-group"><label htmlFor="alteracao-observacao">Observações</label><textarea id="alteracao-observacao" rows={4} value={form.observacao || ''} onChange={(e) => atualizar('observacao', e.target.value)} placeholder="Informações úteis para o Adjunto e o Oficial de Dia" /></div>
            </div>
          )}

          {etapa === 4 && (
            <div>
                <div className="panel panel-subsection alteracoes-documento-panel">
                <div className="panel-title"><FileText /><h2>Documento e revisão</h2></div>
                <div className="form-group alteracoes-documento-campo"><label htmlFor="alteracao-sei">Número do processo / SEI (opcional)</label><input id="alteracao-sei" name="numero_processo" type="text" autoComplete="off" value={form.numero_sei || ''} onChange={(e) => atualizar('numero_sei', e.target.value)} /></div>
              </div>
              <dl className="alteracoes-resumo-dl">
                <dt>Unidade</dt><dd>{form.unidade || '—'} · {form.turno || '—'}</dd>
                <dt>Período</dt><dd>{dataBr(form.data_inicio)}{form.data_fim && form.data_fim !== form.data_inicio ? ` a ${dataBr(form.data_fim)}` : ''}</dd>
                <dt>Policial</dt><dd>{form.policial_nome || '—'}{form.policial_matricula ? ` · Mat. ${form.policial_matricula}` : ''}</dd>
                <dt>Alteração</dt><dd>{form.tipo} · Jornada {form.jornada === '12H' ? '12h' : '24h'}</dd>
                <dt>Substituto</dt><dd>{form.substituto_nome || 'Não informado'}{form.substituto_matricula ? ` · Mat. ${form.substituto_matricula}` : ''}</dd>
                <dt>Observação</dt><dd>{form.observacao || '—'}</dd>
              </dl>
              <p className="panel-nota">A disponibilidade será apresentada como situação projetada, com base na composição informada e nas alterações ativas.</p>
            </div>
          )}
          <div className="form-actions form-actions-modal">
            <button type="button" className="btn btn-secondary" onClick={() => (etapa ? setEtapa((atual) => atual - 1) : onFechar())}>{etapa ? <><ArrowLeft /> Voltar</> : 'Cancelar'}</button>
            {etapa < ETAPAS.length - 1 ? <button type="button" className="btn btn-primary" onClick={avancar}>Continuar <ArrowRight /></button> : <button type="submit" className={`btn btn-primary${enviando ? ' btn-carregando' : ''}`} disabled={enviando}><Check /> Salvar alteração</button>}
          </div>
        </form>
      </div>
    </div>
  );
}
