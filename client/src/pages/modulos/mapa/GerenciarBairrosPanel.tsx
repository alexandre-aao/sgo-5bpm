import { useState, type FormEvent } from 'react';
import { MapPinPlus, Plus, Check, Pencil, Trash2 } from 'lucide-react';
import type { Tables } from '../../../types/supabase';
import { useToast } from '../../../context/useToast';
import type { BairroPayload, ResultadoAcao } from '../../../hooks/useBairros';

interface GerenciarBairrosPanelProps {
  bairros: Tables<'bairros_coordenadas'>[];
  criarBairro: (payload: BairroPayload) => Promise<ResultadoAcao>;
  atualizarBairro: (id: string, payload: BairroPayload) => Promise<ResultadoAcao>;
  excluirBairro: (id: string) => Promise<ResultadoAcao>;
}

function formularioVazio(): BairroPayload {
  return { nome_bairro: '', latitude: '', longitude: '' };
}

// Cadastro de Bairros (P3) — alimenta o Mapa e o select de Bairro em Novo
// Evento. Espelha #gerenciar-bairros-panel + renderGerenciarBairrosTab()/
// handleSalvarBairro()/handleExcluirBairro() em public/app.js.
export function GerenciarBairrosPanel({ bairros, criarBairro, atualizarBairro, excluirBairro }: GerenciarBairrosPanelProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<BairroPayload>(formularioVazio);
  const [bairroEmEdicao, setBairroEmEdicao] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function atualizar<K extends keyof BairroPayload>(campo: K, valor: BairroPayload[K]) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
  }

  function iniciarEdicao(bairro: Tables<'bairros_coordenadas'>) {
    setBairroEmEdicao(bairro.id);
    setForm({ nome_bairro: bairro.nome_bairro, latitude: String(bairro.latitude), longitude: String(bairro.longitude) });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const payload: BairroPayload = {
      nome_bairro: form.nome_bairro.trim(),
      latitude: form.latitude,
      longitude: form.longitude,
    };

    setEnviando(true);
    const resultado = bairroEmEdicao ? await atualizarBairro(bairroEmEdicao, payload) : await criarBairro(payload);
    setEnviando(false);

    if (resultado.ok) {
      toast(bairroEmEdicao ? 'Bairro atualizado.' : 'Bairro cadastrado.', 'success');
      setBairroEmEdicao(null);
      setForm(formularioVazio());
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  async function handleExcluir(bairro: Tables<'bairros_coordenadas'>) {
    if (!window.confirm('Excluir este bairro do cadastro? Eventos que já usam esse nome não são afetados.')) return;
    const resultado = await excluirBairro(bairro.id);
    if (resultado.ok) {
      toast('Bairro excluído.', 'info');
    } else {
      toast(resultado.mensagem, 'danger');
    }
  }

  return (
    <div className="panel cartao-historico-panel">
      <div className="panel-header flex-column-mobile">
        <div className="panel-title">
          <MapPinPlus />
          <h2>Cadastro de Bairros</h2>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Alimenta o Mapa e a lista de Bairro em Novo Evento.</p>
      </div>

      <form className="styled-form" style={{ padding: '0 20px 16px' }} onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group col-md-5">
            <label htmlFor="bairro-nome">Nome do Bairro</label>
            <input
              type="text" id="bairro-nome" required placeholder="Ex: Nova Descoberta"
              value={form.nome_bairro} onChange={(e) => atualizar('nome_bairro', e.target.value)}
            />
          </div>
          <div className="form-group col-md-3">
            <label htmlFor="bairro-lat">Latitude</label>
            <input
              type="text" id="bairro-lat" required placeholder="Ex: -5.8080"
              value={form.latitude} onChange={(e) => atualizar('latitude', e.target.value)}
            />
          </div>
          <div className="form-group col-md-3">
            <label htmlFor="bairro-lon">Longitude</label>
            <input
              type="text" id="bairro-lon" required placeholder="Ex: -35.2250"
              value={form.longitude} onChange={(e) => atualizar('longitude', e.target.value)}
            />
          </div>
          <div className="form-group col-md-1" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              type="submit" className={`btn btn-primary btn-sm${enviando ? ' btn-carregando' : ''}`} disabled={enviando}
              style={{ width: '100%' }}
            >
              {bairroEmEdicao ? <Check /> : <Plus />}
            </button>
          </div>
        </div>
      </form>

      <div className="table-responsive">
        <table className="styled-table">
          <thead>
            <tr>
              <th>Nome do Bairro</th>
              <th>Latitude</th>
              <th>Longitude</th>
              <th className="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {bairros.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                  Nenhum bairro cadastrado ainda.
                </td>
              </tr>
            ) : (
              bairros.map((b) => (
                <tr key={b.id}>
                  <td><strong>{b.nome_bairro}</strong></td>
                  <td>{b.latitude}</td>
                  <td>{b.longitude}</td>
                  <td className="text-right">
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button
                        type="button" className="btn-icon btn-sm" title="Editar" aria-label="Editar"
                        onClick={() => iniciarEdicao(b)}
                      >
                        <Pencil style={{ width: 14, height: 14 }} />
                      </button>
                      <button
                        type="button" className="btn-icon btn-danger btn-sm" title="Excluir" aria-label="Excluir"
                        onClick={() => void handleExcluir(b)}
                      >
                        <Trash2 style={{ width: 14, height: 14 }} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
