import { useState, type FormEvent } from 'react';
import { Pencil, X, Check } from 'lucide-react';
import type { Tables } from '../../../types/supabase';
import { TIPOS_EVENTO } from '../../../lib/tiposEvento';
import { SeletorBairro } from '../../../components/SeletorBairro';
import { useToast } from '../../../context/useToast';
import type { EventoPayload, ResultadoAcao } from './useEventoDrawer';

interface ModalEditarEventoProps {
  evento: Tables<'eventos'>;
  onFechar: () => void;
  onSalvar: (payload: EventoPayload) => Promise<ResultadoAcao>;
}

function formularioDoEvento(evento: Tables<'eventos'>): EventoPayload {
  return {
    num_oficio: evento.num_oficio || '',
    num_os_manual: evento.num_os_manual || '',
    num_sei: evento.num_sei || '',
    tipo_evento: evento.tipo_evento || 'Outros',
    nome_evento: evento.nome_evento || '',
    demandante: evento.demandante || '',
    data_inicio: evento.data_inicio || '',
    data_termino: evento.data_termino || '',
    horario_inicio: evento.horario_inicio || '',
    local_itinerario: evento.local_itinerario || '',
    bairro: evento.bairro || '',
  };
}

// Modal "Editar Evento" — espelha #modal-editar-evento +
// abrirModalEditarEvento()/handleSalvarEdicaoEvento() em public/app.js.
// Ao contrário do formulário de criação, Demandante não é obrigatório aqui
// (mesma diferença do app antigo) e o select de Tipo não tem opção em branco.
export function ModalEditarEvento({ evento, onFechar, onSalvar }: ModalEditarEventoProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<EventoPayload>(() => formularioDoEvento(evento));
  const [enviando, setEnviando] = useState(false);

  function atualizar<K extends keyof EventoPayload>(campo: K, valor: EventoPayload[K]) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    const resultado = await onSalvar({
      num_oficio: form.num_oficio.trim(),
      num_os_manual: form.num_os_manual.trim(),
      num_sei: form.num_sei.trim(),
      tipo_evento: form.tipo_evento,
      nome_evento: form.nome_evento.trim(),
      demandante: form.demandante.trim(),
      data_inicio: form.data_inicio,
      data_termino: form.data_termino,
      horario_inicio: form.horario_inicio,
      local_itinerario: form.local_itinerario.trim(),
      bairro: form.bairro,
    });
    setEnviando(false);
    if (resultado.ok) {
      toast('Evento atualizado com sucesso.', 'success');
      onFechar();
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-box-lg">
        <div className="modal-header">
          <h3><Pencil /> Editar Evento</h3>
          <button className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button>
        </div>
        <form className="styled-form" onSubmit={handleSubmit}>
          <div className="form-section">
            <h3 className="form-section-title">Documentação</h3>
            <div className="form-row">
              <div className="form-group col-md-4">
                <label htmlFor="edit-num_oficio">Número do Ofício</label>
                <input type="text" id="edit-num_oficio" value={form.num_oficio} onChange={(e) => atualizar('num_oficio', e.target.value)} />
              </div>
              <div className="form-group col-md-4">
                <label htmlFor="edit-num_os_manual">Número da OS</label>
                <input type="text" id="edit-num_os_manual" value={form.num_os_manual} onChange={(e) => atualizar('num_os_manual', e.target.value)} />
              </div>
              <div className="form-group col-md-4">
                <label htmlFor="edit-num_sei">Número SEI</label>
                <input type="text" id="edit-num_sei" value={form.num_sei} onChange={(e) => atualizar('num_sei', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">Identificação</h3>
            <div className="form-row">
              <div className="form-group col-md-4">
                <label htmlFor="edit-tipo_evento">Tipo de Evento *</label>
                <select id="edit-tipo_evento" required value={form.tipo_evento} onChange={(e) => atualizar('tipo_evento', e.target.value)}>
                  {TIPOS_EVENTO.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group col-md-4">
                <label htmlFor="edit-nome_evento">Nome do Evento *</label>
                <input type="text" id="edit-nome_evento" required value={form.nome_evento} onChange={(e) => atualizar('nome_evento', e.target.value)} />
              </div>
              <div className="form-group col-md-4">
                <label htmlFor="edit-demandante">Demandante / Solicitante</label>
                <input type="text" id="edit-demandante" value={form.demandante} onChange={(e) => atualizar('demandante', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">Quando e Onde</h3>
            <div className="form-row">
              <div className="form-group col-md-4">
                <label htmlFor="edit-data_inicio">Data de Início *</label>
                <input type="date" id="edit-data_inicio" required value={form.data_inicio} onChange={(e) => atualizar('data_inicio', e.target.value)} />
              </div>
              <div className="form-group col-md-4">
                <label htmlFor="edit-data_termino">Data de Término</label>
                <input type="date" id="edit-data_termino" value={form.data_termino} onChange={(e) => atualizar('data_termino', e.target.value)} />
              </div>
              <div className="form-group col-md-4">
                <label htmlFor="edit-horario_inicio">Horário de Início</label>
                <input type="time" id="edit-horario_inicio" value={form.horario_inicio} onChange={(e) => atualizar('horario_inicio', e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group col-md-8">
                <label htmlFor="edit-local_itinerario">Local / Itinerário *</label>
                <input
                  type="text" id="edit-local_itinerario" required
                  value={form.local_itinerario} onChange={(e) => atualizar('local_itinerario', e.target.value)}
                />
              </div>
              <SeletorBairro idPrefix="edit-bairro" value={form.bairro} onChange={(v) => atualizar('bairro', v)} />
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
            <button type="submit" className={`btn btn-primary${enviando ? ' btn-carregando' : ''}`} disabled={enviando}>
              <Check /> Salvar Alterações
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
