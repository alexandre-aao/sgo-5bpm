import { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Pencil, Plus, Tags, Trash2, X } from 'lucide-react';
import { apiFetch } from '../../../lib/api';
import { useToast } from '../../../context/useToast';
import { useAppData } from '../../../context/useAppData';
import type { TipoEvento } from '../../../lib/tiposEvento';

export function TiposEventoPanel() {
  const { toast } = useToast();
  const { recarregar } = useAppData();
  const [aberto, setAberto] = useState(false);
  const [tipos, setTipos] = useState<TipoEvento[]>([]);
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [editando, setEditando] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function carregar() {
    setCarregando(true);
    try {
      const res = await apiFetch('/api/tipos-evento');
      const lista = await res.json() as TipoEvento[];
      if (res.ok && Array.isArray(lista)) setTipos(lista);
    } catch (erro) {
      console.error('Erro ao carregar Tipos de Evento:', erro);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    // O painel recarrega o cadastro somente quando é aberto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (aberto) void carregar();
  }, [aberto]);

  function iniciarEdicao(tipo: TipoEvento) {
    setEditando(tipo.id);
    setNome(tipo.nome);
    setDescricao(tipo.descricao || '');
  }

  function limparFormulario() {
    setEditando(null);
    setNome('');
    setDescricao('');
  }

  async function salvar() {
    const payload = { nome: nome.trim(), descricao: descricao.trim() };
    if (!payload.nome) {
      toast('Informe o nome do Tipo de Evento.', 'warning');
      return;
    }
    const res = await apiFetch(editando ? `/api/tipos-evento/${editando}` : '/api/tipos-evento', {
      method: editando ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const corpo = await res.json().catch(() => ({})) as { error?: string };
    if (!res.ok) {
      toast(corpo.error || 'Não foi possível salvar o Tipo de Evento.', 'danger');
      return;
    }
    toast(editando ? 'Tipo de Evento atualizado.' : 'Tipo de Evento criado.', 'success');
    limparFormulario();
    await Promise.all([carregar(), recarregar()]);
  }

  async function alternar(tipo: TipoEvento) {
    const res = await apiFetch(`/api/tipos-evento/${tipo.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ativo: !tipo.ativo }),
    });
    const corpo = await res.json().catch(() => ({})) as { error?: string };
    if (!res.ok) toast(corpo.error || 'Não foi possível alterar o status.', 'danger');
    else { toast(tipo.ativo ? 'Tipo de Evento desativado.' : 'Tipo de Evento ativado.', 'success'); await Promise.all([carregar(), recarregar()]); }
  }

  async function excluir(tipo: TipoEvento) {
    if (!window.confirm(`Excluir o Tipo de Evento “${tipo.nome}”?`)) return;
    const res = await apiFetch(`/api/tipos-evento/${tipo.id}`, { method: 'DELETE' });
    const corpo = await res.json().catch(() => ({})) as { error?: string };
    if (!res.ok) toast(corpo.error || 'Não foi possível excluir o Tipo de Evento.', 'danger');
    else { toast('Tipo de Evento excluído.', 'info'); await Promise.all([carregar(), recarregar()]); }
  }

  return (
    <section className="panel cadastro-tipos-panel">
      <button type="button" className="central-historico-toggle" aria-expanded={aberto} onClick={() => setAberto((atual) => !atual)}>
        {aberto ? <ChevronDown /> : <ChevronRight />}<Tags /><span>Tipos de Evento</span><small>Cadastro administrável pela P3</small>
      </button>
      {aberto && (
        <div className="cadastro-tipos-conteudo">
          <div className="cadastro-tipos-form form-row">
            <div className="form-group"><label htmlFor="tipo-evento-nome">Nome</label><input id="tipo-evento-nome" value={nome} maxLength={100} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Evento Esportivo" /></div>
            <div className="form-group"><label htmlFor="tipo-evento-descricao">Descrição opcional</label><input id="tipo-evento-descricao" value={descricao} maxLength={300} onChange={(e) => setDescricao(e.target.value)} /></div>
            <div className="form-actions form-actions-modal">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void salvar()}><Check /> {editando ? 'Salvar' : 'Adicionar'}</button>
              {editando && <button type="button" className="btn btn-secondary btn-sm" onClick={limparFormulario}><X /> Cancelar</button>}
            </div>
          </div>
          <div className="table-responsive"><table className="styled-table table-cards-mobile"><thead><tr><th>Tipo</th><th>Descrição</th><th>Status</th><th className="text-right">Ações</th></tr></thead><tbody>
            {carregando ? <tr><td colSpan={4}>Carregando…</td></tr> : tipos.length === 0 ? <tr><td colSpan={4}>Nenhum Tipo de Evento cadastrado.</td></tr> : tipos.map((tipo) => (
              <tr key={tipo.id}><td className="card-title-cell">{tipo.nome}</td><td data-label="Descrição">{tipo.descricao || '-'}</td><td data-label="Status"><span className={`badge ${tipo.ativo ? 'status-ativa' : 'status-inativa'}`}>{tipo.ativo ? 'Ativo' : 'Inativo'}</span></td><td className="text-right"><div className="acoes-linha"><button type="button" className="btn-icon" title="Editar" aria-label={`Editar ${tipo.nome}`} onClick={() => iniciarEdicao(tipo)}><Pencil /></button><button type="button" className="btn-icon" title={tipo.ativo ? 'Desativar' : 'Ativar'} aria-label={`${tipo.ativo ? 'Desativar' : 'Ativar'} ${tipo.nome}`} onClick={() => void alternar(tipo)}>{tipo.ativo ? <X /> : <Check />}</button><button type="button" className="btn-icon btn-icon-danger" title="Excluir" aria-label={`Excluir ${tipo.nome}`} onClick={() => void excluir(tipo)}><Trash2 /></button></div></td></tr>
            ))}
          </tbody></table></div>
          <p className="texto-auxiliar"><Plus /> Tipos desativados continuam preservados nos eventos antigos e não aparecem em novos cadastros.</p>
        </div>
      )}
    </section>
  );
}
