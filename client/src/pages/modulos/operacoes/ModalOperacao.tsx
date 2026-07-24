import { useState, type FormEvent } from 'react';
import { Pencil, ShieldAlert, X, Check } from 'lucide-react';
import type { Tables } from '../../../types/supabase';
import { TIPOS_OPERACAO } from '../../../lib/tiposOperacao';
import { useToast } from '../../../context/useToast';
import type { OperacaoPayload, ResultadoAcao } from './useOperacaoDrawer';

interface ModalOperacaoProps {
  /** undefined/null = modo criação; presente = modo edição, pré-preenchido. */
  operacao?: Tables<'operacoes'> | null;
  onFechar: () => void;
  onSalvar: (payload: OperacaoPayload) => Promise<ResultadoAcao>;
}

function getLocalDateStr(date = new Date()): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

function formularioVazio(): OperacaoPayload {
  return {
    nome_operacao: '',
    tipo_operacao: 'Outras',
    data_inicio: getLocalDateStr(),
    data_termino: '',
    qtd_diarias_estimada: 0,
    horario_inicio: '',
    tipo_recorrencia: '',
    bairro: '',
    local_itinerario: '',
    num_oficio: '',
    num_os_manual: '',
    num_sei: '',
    demandante: '',
  };
}

function formularioDaOperacao(operacao: Tables<'operacoes'>): OperacaoPayload {
  return {
    nome_operacao: operacao.nome_operacao || '',
    tipo_operacao: operacao.tipo_operacao || 'Outras',
    data_inicio: operacao.data_inicio || '',
    data_termino: operacao.data_termino || '',
    qtd_diarias_estimada: operacao.qtd_diarias_estimada ?? 0,
    horario_inicio: operacao.horario_inicio || '',
    tipo_recorrencia: operacao.tipo_recorrencia || '',
    bairro: operacao.bairro || '',
    local_itinerario: operacao.local_itinerario || '',
    num_oficio: operacao.num_oficio || '',
    num_os_manual: operacao.num_os_manual || '',
    num_sei: operacao.num_sei || '',
    demandante: operacao.demandante || '',
  };
}

// Modal "Nova/Editar Operação" — espelha #modal-operacao +
// abrirModalOperacao()/handleSalvarOperacao() em public/app.js. Ao contrário do
// Evento, o Bairro aqui é texto livre (não select do cadastro de bairros).
export function ModalOperacao({ operacao, onFechar, onSalvar }: ModalOperacaoProps) {
  const { toast } = useToast();
  const modoEdicao = !!operacao;
  const [form, setForm] = useState<OperacaoPayload>(() => (operacao ? formularioDaOperacao(operacao) : formularioVazio()));
  const [enviando, setEnviando] = useState(false);

  function atualizar<K extends keyof OperacaoPayload>(campo: K, valor: OperacaoPayload[K]) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const payload: OperacaoPayload = {
      nome_operacao: form.nome_operacao.trim(),
      tipo_operacao: form.tipo_operacao,
      data_inicio: form.data_inicio,
      data_termino: form.data_termino,
      qtd_diarias_estimada: form.qtd_diarias_estimada,
      horario_inicio: form.horario_inicio,
      tipo_recorrencia: form.tipo_recorrencia,
      bairro: form.bairro.trim(),
      local_itinerario: form.local_itinerario.trim(),
      num_oficio: form.num_oficio.trim(),
      num_os_manual: form.num_os_manual.trim(),
      num_sei: form.num_sei.trim(),
      demandante: form.demandante.trim(),
    };

    if (payload.data_termino && payload.data_termino < payload.data_inicio) {
      toast('A data de término não pode ser anterior à data de início.', 'danger');
      return;
    }

    setEnviando(true);
    const resultado = await onSalvar(payload);
    setEnviando(false);
    if (resultado.ok) {
      toast(modoEdicao ? 'Operação atualizada.' : 'Operação criada.', 'success');
      onFechar();
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-box-lg">
        <div className="modal-header">
          <h3>{modoEdicao ? <Pencil /> : <ShieldAlert />} {modoEdicao ? 'Editar Operação' : 'Nova Operação'}</h3>
          <button className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group col-md-8">
              <label htmlFor="op-nome_operacao">Nome da Operação *</label>
              <input
                type="text" id="op-nome_operacao" required placeholder="Ex: Operação Saturação Zona Sul"
                value={form.nome_operacao} onChange={(e) => atualizar('nome_operacao', e.target.value)}
              />
            </div>
            <div className="form-group col-md-4">
              <label htmlFor="op-tipo_operacao">Tipo *</label>
              <select id="op-tipo_operacao" required value={form.tipo_operacao} onChange={(e) => atualizar('tipo_operacao', e.target.value)}>
                {TIPOS_OPERACAO.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group col-md-4">
              <label htmlFor="op-data_inicio">Data de Início *</label>
              <input
                type="date" id="op-data_inicio" required
                value={form.data_inicio} onChange={(e) => atualizar('data_inicio', e.target.value)}
              />
            </div>
            <div className="form-group col-md-4">
              <label htmlFor="op-data_termino">Data de Término</label>
              <input
                type="date" id="op-data_termino"
                value={form.data_termino} onChange={(e) => atualizar('data_termino', e.target.value)}
              />
            </div>
            <div className="form-group col-md-4">
              <label htmlFor="op-qtd_diarias_estimada">Diárias Estimadas *</label>
              <input
                type="number" id="op-qtd_diarias_estimada" min={0} required
                value={form.qtd_diarias_estimada} onChange={(e) => atualizar('qtd_diarias_estimada', e.target.value)}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group col-md-4">
              <label htmlFor="op-horario_inicio">Horário de Início</label>
              <input
                type="time" id="op-horario_inicio"
                value={form.horario_inicio} onChange={(e) => atualizar('horario_inicio', e.target.value)}
              />
            </div>
            <div className="form-group col-md-4">
              <label htmlFor="op-tipo_recorrencia">Recorrência</label>
              <select id="op-tipo_recorrencia" value={form.tipo_recorrencia} onChange={(e) => atualizar('tipo_recorrencia', e.target.value)}>
                <option value="">— Nenhuma —</option>
                <option value="dia_unico">Dia Único</option>
                <option value="fim_de_semana">Fim de Semana</option>
                <option value="diaria">Diária</option>
              </select>
            </div>
            <div className="form-group col-md-4">
              <label htmlFor="op-bairro">Bairro</label>
              <input
                type="text" id="op-bairro" placeholder="Ex: Ponta Negra"
                value={form.bairro} onChange={(e) => atualizar('bairro', e.target.value)}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group col-md-12">
              <label htmlFor="op-local_itinerario">Local / Itinerário</label>
              <input
                type="text" id="op-local_itinerario" placeholder="Opcional — completável depois"
                value={form.local_itinerario} onChange={(e) => atualizar('local_itinerario', e.target.value)}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group col-md-4">
              <label htmlFor="op-num_oficio">Nº do Ofício</label>
              <input
                type="text" id="op-num_oficio" placeholder="Opcional"
                value={form.num_oficio} onChange={(e) => atualizar('num_oficio', e.target.value)}
              />
            </div>
            <div className="form-group col-md-4">
              <label htmlFor="op-num_os_manual">Nº da OS</label>
              <input
                type="text" id="op-num_os_manual" placeholder="Opcional"
                value={form.num_os_manual} onChange={(e) => atualizar('num_os_manual', e.target.value)}
              />
            </div>
            <div className="form-group col-md-4">
              <label htmlFor="op-num_sei">Nº SEI</label>
              <input
                type="text" id="op-num_sei" placeholder="Opcional"
                value={form.num_sei} onChange={(e) => atualizar('num_sei', e.target.value)}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group col-md-12">
              <label htmlFor="op-demandante">Demandante</label>
              <input
                type="text" id="op-demandante" placeholder="Opcional"
                value={form.demandante} onChange={(e) => atualizar('demandante', e.target.value)}
              />
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
            <button type="submit" className={`btn btn-primary${enviando ? ' btn-carregando' : ''}`} disabled={enviando}>
              <Check /> Salvar Operação
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
