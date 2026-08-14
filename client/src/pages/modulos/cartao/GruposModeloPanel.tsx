import { useEffect, useState } from 'react';
import { ClipboardList, Plus, WandSparkles } from 'lucide-react';
import { apiFetch } from '../../../lib/api';
import type { CartaoDetalhado } from '../../../lib/cartaoConflitos';
import { cabecalhosVersaoCartao } from '../../../lib/concorrenciaCartao';
import { useAuth } from '../../../context/useAuth';
import { useToast } from '../../../context/useToast';

interface GrupoModelo {
  id: string;
  nome: string;
  tipo: string;
  area: string;
  bairro: string;
  missao: string;
  pontos: string;
  horario_inicio: string;
  horario_fim: string;
  observacoes: string;
}

const VAZIO: Partial<GrupoModelo> = {
  nome: '', tipo: 'Especial', area: '', bairro: '', missao: '', pontos: '',
  horario_inicio: '', horario_fim: '', observacoes: '',
};

interface Props {
  cartao: CartaoDetalhado | null;
  podeEditar: boolean;
  onAtualizado: () => Promise<void>;
}

export function GruposModeloPanel({ cartao, podeEditar, onAtualizado }: Props) {
  const { usuario } = useAuth();
  const { toast } = useToast();
  const [grupos, setGrupos] = useState<GrupoModelo[]>([]);
  const [grupoId, setGrupoId] = useState('');
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [aberto, setAberto] = useState(false);
  const [criando, setCriando] = useState(false);
  const [form, setForm] = useState<Partial<GrupoModelo>>(VAZIO);

  async function carregar() {
    const res = await apiFetch('/api/grupos-modelo');
    if (res.ok) setGrupos((await res.json()) as GrupoModelo[]);
  }

  useEffect(() => {
    // O catálogo vem da API quando um cartão entra no editor.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cartao) void carregar();
    // A identidade da função é local ao componente; o id é a dependência real.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartao?.id]);

  function alternarViatura(id: string) {
    setSelecionadas((atual) => atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id]);
  }

  async function aplicar() {
    if (!cartao || !grupoId) return;
    const res = await apiFetch(`/api/cartoes/${cartao.id}/aplicar-grupo-modelo/${grupoId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...cabecalhosVersaoCartao(cartao) },
      body: JSON.stringify({ viaturas_ids: selecionadas }),
    });
    const corpo = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast(corpo.error || 'Não foi possível aplicar o grupo.', 'danger');
      return;
    }
    toast('Grupo aplicado ao roteiro selecionado.', 'success');
    setSelecionadas([]);
    await onAtualizado();
  }

  async function criarGrupo() {
    if (!form.nome?.trim()) return;
    const res = await apiFetch('/api/grupos-modelo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    });
    const corpo = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast(corpo.error || 'Não foi possível criar o grupo.', 'danger');
      return;
    }
    toast('Grupo de modelo criado.', 'success');
    setForm(VAZIO);
    setCriando(false);
    await carregar();
  }

  if (!cartao) return null;

  return (
    <div className="panel cartao-historico-panel">
      <div className="panel-header flex-column-mobile">
        <div className="panel-title"><ClipboardList /><h2>Biblioteca de Grupos de Modelo</h2></div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAberto((atual) => !atual)}>
          {aberto ? 'Ocultar biblioteca' : 'Abrir biblioteca'}
        </button>
      </div>
      {aberto && (
        <div className="grupos-modelo-conteudo">
          <p className="texto-auxiliar">Aplique conjuntos de missão, área, horário e pontos ao cartão atual. O roteiro é copiado para as viaturas marcadas.</p>
          <div className="form-row">
            <div className="form-group col-md-5">
              <label htmlFor="grupo-modelo-select">Grupo especial</label>
              <select id="grupo-modelo-select" value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
                <option value="">Selecione um grupo…</option>
                {grupos.map((grupo) => <option key={grupo.id} value={grupo.id}>{grupo.nome} · {grupo.tipo}</option>)}
              </select>
            </div>
            <div className="form-group col-md-7 grupos-modelo-vtrs">
              <span className="form-label">Aplicar nas viaturas</span>
              <div className="chips-selecao">
                {(cartao.viaturas || []).map((viatura) => (
                  <label key={viatura.id} className="chip-checkbox">
                    <input type="checkbox" checked={selecionadas.includes(viatura.id)} onChange={() => alternarViatura(viatura.id)} />
                    {viatura.prefixo}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="section-actions">
            <button type="button" className="btn btn-primary btn-sm" disabled={!podeEditar || !grupoId || selecionadas.length === 0} onClick={() => void aplicar()}>
              <WandSparkles className="icone-inline-sm" /> Aplicar ao cartão
            </button>
            {usuario?.role === 'P3' && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCriando((atual) => !atual)}><Plus className="icone-inline-sm" /> Novo grupo</button>}
          </div>
          {criando && usuario?.role === 'P3' && (
            <div className="panel-subsection">
              <div className="form-row">
                {(['nome', 'tipo', 'area', 'bairro', 'missao', 'pontos', 'horario_inicio', 'horario_fim', 'observacoes'] as const).map((campo) => (
                  <div className="form-group col-md-4" key={campo}>
                    <label htmlFor={`grupo-${campo}`}>{campo.replace('_', ' ')}</label>
                    <input id={`grupo-${campo}`} type="text" value={form[campo] || ''} onChange={(e) => setForm((atual) => ({ ...atual, [campo]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void criarGrupo()}><Plus className="icone-inline-sm" /> Salvar grupo</button>
            </div>
          )}
          {grupos.length === 0 && <p className="texto-auxiliar">Nenhum grupo ativo cadastrado. O P3 pode criar o primeiro aqui.</p>}
        </div>
      )}
    </div>
  );
}
