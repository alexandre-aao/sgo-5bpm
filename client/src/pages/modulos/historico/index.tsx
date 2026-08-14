import { useEffect, useState } from 'react';
import { History, Search } from 'lucide-react';
import { apiFetch } from '../../../lib/api';
import { useToast } from '../../../context/useToast';

interface RegistroAtividade {
  id: string;
  usuario: string;
  usuario_nome?: string | null;
  criado_em: number;
  acao: string;
  entidade: string;
  entidade_id?: string | null;
  descricao_resumida?: string | null;
  campos_alterados?: Record<string, { antes: unknown; depois: unknown }>;
}

function dataHora(valor: number) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(valor));
}

export default function HistoricoPage() {
  const { toast } = useToast();
  const [registros, setRegistros] = useState<RegistroAtividade[]>([]);
  const [busca, setBusca] = useState('');
  const [acao, setAcao] = useState('');
  const [entidade, setEntidade] = useState('');
  const [carregando, setCarregando] = useState(true);

  async function carregar() {
    setCarregando(true);
    try {
      const params = new URLSearchParams();
      if (busca.trim()) params.set('busca', busca.trim());
      if (acao) params.set('acao', acao);
      if (entidade) params.set('entidade', entidade);
      const res = await apiFetch(`/api/historico-atividades?${params}`);
      const corpo = await res.json().catch(() => ({})) as RegistroAtividade[] | { error?: string };
      if (!res.ok) throw new Error('error' in corpo ? corpo.error : 'Falha ao carregar histórico.');
      setRegistros(Array.isArray(corpo) ? corpo : []);
    } catch (erro) {
      toast(erro instanceof Error ? erro.message : 'Falha ao carregar histórico.', 'danger');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    // Filtros são sincronizados com a consulta do histórico.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar();
    // A função captura apenas os filtros atuais; não precisa disparar por identidade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acao, entidade]);

  return (
    <div className="panel historico-panel">
      <div className="panel-header flex-column-mobile"><div className="panel-title"><History /><h2>Histórico de Atividades</h2></div><div className="events-filters-bar"><div className="filter-search"><label htmlFor="historico-busca">Pesquisar</label><input id="historico-busca" value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void carregar(); }} placeholder="Usuário, módulo ou descrição..." /></div><label className="filter-group">Ação<select value={acao} onChange={(e) => setAcao(e.target.value)}><option value="">Todas</option><option value="entrou">Login</option><option value="saiu">Logout</option><option value="criou">Criação</option><option value="alterou">Alteração</option><option value="desativou">Desativação</option><option value="excluiu">Exclusão</option><option value="redefiniu senha">Redefinição de senha</option><option value="publicou">Publicação</option><option value="restaurou">Restauração</option><option value="aplicou">Aplicação</option><option value="tentou acessar">Tentativa de acesso</option></select></label><label className="filter-group">Módulo<select value={entidade} onChange={(e) => setEntidade(e.target.value)}><option value="">Todos</option><option value="Evento">Evento</option><option value="Tipo de Evento">Tipo de Evento</option><option value="Viatura">Viatura</option><option value="Cartão Programa">Cartão Programa</option><option value="Cartão padrão">Cartão padrão</option><option value="Grupo de modelo">Grupo de modelo</option><option value="Usuário">Usuário</option><option value="Sessão">Sessão</option></select></label><button type="button" className="btn btn-primary btn-sm" onClick={() => void carregar()}><Search /> Filtrar</button></div></div>
      <div className="table-responsive"><table className="styled-table table-cards-mobile"><thead><tr><th>Data/hora</th><th>Usuário</th><th>Ação</th><th>Módulo</th><th>Descrição</th></tr></thead><tbody>{carregando ? <tr><td colSpan={5}>Carregando histórico…</td></tr> : registros.length === 0 ? <tr><td colSpan={5}>Nenhuma atividade encontrada nos últimos 30 dias.</td></tr> : registros.map((registro) => <tr key={registro.id}><td data-label="Data/hora">{dataHora(Number(registro.criado_em))}</td><td data-label="Usuário"><strong>{registro.usuario_nome || registro.usuario}</strong><small className="texto-auxiliar">{registro.usuario}</small></td><td data-label="Ação"><span className="badge">{registro.acao}</span></td><td data-label="Módulo">{registro.entidade}</td><td data-label="Descrição">{registro.descricao_resumida || '-'}</td></tr>)}</tbody></table></div>
    </div>
  );
}
