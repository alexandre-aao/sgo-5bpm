import { useState, type FormEvent } from 'react';
import { FilePlus, FileText, Info, MapPin, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../../lib/api';
import { TIPOS_EVENTO } from '../../../lib/tiposEvento';
import { useAppData } from '../../../context/useAppData';
import { useToast } from '../../../context/useToast';
import { SeletorBairro } from '../../../components/SeletorBairro';

function dataHojeStr(): string {
  const hoje = new Date();
  const m = String(hoje.getMonth() + 1).padStart(2, '0');
  const d = String(hoje.getDate()).padStart(2, '0');
  return `${hoje.getFullYear()}-${m}-${d}`;
}

interface FormularioEvento {
  numOficio: string;
  numOsManual: string;
  numSei: string;
  tipoEvento: string;
  nomeEvento: string;
  demandante: string;
  dataInicio: string;
  dataTermino: string;
  horarioInicio: string;
  localItinerario: string;
  bairro: string;
}

function formularioVazio(): FormularioEvento {
  return {
    numOficio: '', numOsManual: '', numSei: '',
    tipoEvento: '', nomeEvento: '', demandante: '',
    dataInicio: dataHojeStr(), dataTermino: '', horarioInicio: '',
    localItinerario: '', bairro: '',
  };
}

// Novo Evento (P3-only) — cadastro de eventos civis. Espelha #tab-cadastro +
// handleCreateEvento() em public/app.js. O stepper de 4 passos do protótipo
// não foi implementado de propósito (mudaria o fluxo de envio único pra
// wizard) — decisão já registrada no CLAUDE.md.
export default function CadastroPage() {
  const navigate = useNavigate();
  const { recarregar } = useAppData();
  const { toast } = useToast();
  const [form, setForm] = useState<FormularioEvento>(formularioVazio);
  const [enviando, setEnviando] = useState(false);

  function atualizar<K extends keyof FormularioEvento>(campo: K, valor: FormularioEvento[K]) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (form.dataTermino && form.dataTermino < form.dataInicio) {
      toast('A data de término não pode ser anterior à data de início.', 'danger');
      return;
    }

    const payload = {
      num_oficio: form.numOficio.trim(),
      num_os_manual: form.numOsManual.trim(),
      num_sei: form.numSei.trim(),
      tipo_evento: form.tipoEvento,
      nome_evento: form.nomeEvento.trim(),
      demandante: form.demandante.trim(),
      data_inicio: form.dataInicio,
      data_termino: form.dataTermino,
      horario_inicio: form.horarioInicio,
      local_itinerario: form.localItinerario.trim(),
      bairro: form.bairro,
    };

    setEnviando(true);
    try {
      const res = await apiFetch('/api/eventos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast('Evento cadastrado com sucesso!', 'success');
        setForm(formularioVazio());
        await recarregar();
        navigate('/dashboard');
      } else {
        const corpo = (await res.json().catch(() => ({}))) as { error?: string };
        toast(corpo.error || 'Falha ao cadastrar evento no servidor.', 'danger');
      }
    } catch (erro) {
      console.error('Erro ao cadastrar evento:', erro);
      toast('Falha ao cadastrar evento no servidor.', 'danger');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="form-container">
      <div className="panel form-panel">
        <div className="panel-header">
          <div className="panel-title">
            <FilePlus />
            <h2>Entrada de Novo Evento</h2>
          </div>
        </div>
        <form className="styled-form" onSubmit={handleSubmit}>
          <div className="form-section">
            <h3 className="form-section-title"><span className="form-section-icone"><FileText /></span>Documentação</h3>
            <div className="form-row">
              <div className="form-group col-md-4">
                <label htmlFor="num_oficio">Número do Ofício</label>
                <input
                  type="text" id="num_oficio" placeholder="Ex: Of. nº 123/2026-GAB/Prefeitura"
                  value={form.numOficio} onChange={(e) => atualizar('numOficio', e.target.value)}
                />
              </div>
              <div className="form-group col-md-4">
                <label htmlFor="num_os_manual">Número da OS (se já conhecido)</label>
                <input
                  type="text" id="num_os_manual" placeholder="Ex: OS Nº 045/2026 - P3/5º BPM"
                  value={form.numOsManual} onChange={(e) => atualizar('numOsManual', e.target.value)}
                />
              </div>
              <div className="form-group col-md-4">
                <label htmlFor="num_sei">Número SEI</label>
                <input
                  type="text" id="num_sei" placeholder="Ex: 23100.000000/2026-00"
                  value={form.numSei} onChange={(e) => atualizar('numSei', e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title"><span className="form-section-icone"><Info /></span>Identificação</h3>
            <div className="form-row">
              <div className="form-group col-md-4">
                <label htmlFor="tipo_evento">Tipo de Evento *</label>
                <select id="tipo_evento" required value={form.tipoEvento} onChange={(e) => atualizar('tipoEvento', e.target.value)}>
                  <option value="" disabled>Selecione o tipo...</option>
                  {TIPOS_EVENTO.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group col-md-4">
                <label htmlFor="nome_evento">Nome do Evento *</label>
                <input
                  type="text" id="nome_evento" required placeholder="Ex: Carnaval de Rua / Bloco da Segurança"
                  value={form.nomeEvento} onChange={(e) => atualizar('nomeEvento', e.target.value)}
                />
              </div>
              <div className="form-group col-md-4">
                <label htmlFor="demandante">Demandante / Solicitante *</label>
                <input
                  type="text" id="demandante" required placeholder="Ex: Prefeitura Municipal, Paróquia de São Jorge"
                  value={form.demandante} onChange={(e) => atualizar('demandante', e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title"><span className="form-section-icone"><MapPin /></span>Quando e Onde</h3>
            <div className="form-row">
              <div className="form-group col-md-4">
                <label htmlFor="data_inicio">Data de Início *</label>
                <input
                  type="date" id="data_inicio" required
                  value={form.dataInicio} onChange={(e) => atualizar('dataInicio', e.target.value)}
                />
              </div>
              <div className="form-group col-md-4">
                <label htmlFor="data_termino">Data de Término</label>
                <input
                  type="date" id="data_termino"
                  value={form.dataTermino} onChange={(e) => atualizar('dataTermino', e.target.value)}
                />
              </div>
              <div className="form-group col-md-4">
                <label htmlFor="horario_inicio">Horário de Início</label>
                <input
                  type="time" id="horario_inicio"
                  value={form.horarioInicio} onChange={(e) => atualizar('horarioInicio', e.target.value)}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group col-md-8">
                <label htmlFor="local_itinerario">Local / Itinerário *</label>
                <input
                  type="text" id="local_itinerario" required placeholder="Ex: Avenida Principal, do número 10 ao 500"
                  value={form.localItinerario} onChange={(e) => atualizar('localItinerario', e.target.value)}
                />
              </div>
              <SeletorBairro idPrefix="bairro" value={form.bairro} onChange={(v) => atualizar('bairro', v)} />
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setForm(formularioVazio())}>Limpar</button>
            <button type="submit" className={`btn btn-primary${enviando ? ' btn-carregando' : ''}`} disabled={enviando}>
              <Check /> Salvar Evento
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
