import { useState, type FormEvent } from 'react';
import { CalendarPlus, X, Check } from 'lucide-react';
import { apiFetch } from '../../../lib/api';
import { useToast } from '../../../context/useToast';

interface ModalMissaoAvulsaProps {
  dataPreenchida: string;
  onFechar: () => void;
  onCriada: (operacaoId: string) => void;
}

// Lançamento rápido de "Missão Avulsa": cria uma OPERAÇÃO Planejada com diária
// zerada (a diária real vem do efetivo escalado depois) — espelha
// abrirModalMissaoAvulsa()/handleCriarMissaoAvulsa() em public/app.js.
export function ModalMissaoAvulsa({ dataPreenchida, onFechar, onCriada }: ModalMissaoAvulsaProps) {
  const { toast } = useToast();
  const [nome, setNome] = useState('');
  const [data, setData] = useState(dataPreenchida);
  const [horario, setHorario] = useState('');
  const [local, setLocal] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      nome_operacao: nome.trim(),
      tipo_operacao: 'Outras',
      situacao: 'Planejada',
      qtd_diarias_estimada: 0,
      demandante: 'Interno / Diária Avulsa',
      data_inicio: data,
      horario_inicio: horario,
      local_itinerario: local.trim(),
    };

    setEnviando(true);
    try {
      const res = await apiFetch('/api/operacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const criado = (await res.json()) as { id: string; error?: string };
      if (res.ok) {
        toast('Operação avulsa criada! Agora escale o(s) militar(es) para gerar a diária.', 'success');
        onCriada(criado.id);
      } else {
        toast(criado.error || 'Falha ao criar a operação avulsa.', 'danger');
      }
    } catch (erro) {
      console.error('Erro ao criar operação avulsa:', erro);
      toast('Falha na comunicação com o servidor.', 'danger');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h3><CalendarPlus /> Lançar Missão Avulsa</h3>
          <button className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button>
        </div>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>
          Registro rápido para diárias avulsas (Missa, Bar, etc.), sem o cadastro completo de evento.
          Depois de criar, você poderá escalar o(s) militar(es) na gaveta de detalhes.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="missao-nome">Nome da Missão *</label>
            <input
              type="text" id="missao-nome" required placeholder="Ex: Missa Dominical - Paróquia São Jorge"
              value={nome} onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div className="form-row">
            <div className="form-group col-md-6">
              <label htmlFor="missao-data">Data *</label>
              <input type="date" id="missao-data" required value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="form-group col-md-6">
              <label htmlFor="missao-horario">Horário</label>
              <input type="time" id="missao-horario" value={horario} onChange={(e) => setHorario(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="missao-local">Local (opcional)</label>
            <input
              type="text" id="missao-local" placeholder="Ex: Bar do Zé, Av. Principal, 123"
              value={local} onChange={(e) => setLocal(e.target.value)}
            />
          </div>
          <div className="form-actions" style={{ border: 'none', paddingTop: 8, marginTop: 0 }}>
            <button type="button" className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
            <button type="submit" className={`btn btn-primary${enviando ? ' btn-carregando' : ''}`} disabled={enviando}>
              <Check /> Criar e Escalar Militares
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
