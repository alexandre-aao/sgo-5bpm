import { useCallback, useMemo, useState } from 'react';
import { Car, Check, ChevronDown, ChevronUp, Copy, Eye, FileText, Info, Pencil, Plus, Printer, Search, Shield, UsersRound, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/useAuth';
import { useAppData } from '../../../context/useAppData';
import { useToast } from '../../../context/useToast';
import { apiFetch } from '../../../lib/api';
import type { CartaoViatura } from '../../../lib/cartaoConflitos';
import { useCartaoPrograma } from './useCartaoPrograma';
import { useViaturasCartao } from './useViaturasCartao';
import { useItensRoteiro } from './useItensRoteiro';
import { usePadroesOperacionais, type PadraoOperacional } from './usePadroesOperacionais';
import { useBairros } from '../../../hooks/useBairros';
import { useAvisos } from '../../../hooks/useAvisos';
import { NavegadorData } from './NavegadorData';
import { ModalEditarViatura } from './ModalEditarViatura';
import { ModalSalvarComoPadraoOperacional } from './ModalSalvarComoPadraoOperacional';
import { RoteiroGrid } from './RoteiroGrid';

function categoriaLabel(categoria: string | null | undefined) {
  const valor = String(categoria || 'bairro').toLowerCase();
  if (valor === 'especializado') return 'Especializado';
  if (valor === 'reforco' || valor === 'reforço') return 'Reforço';
  if (valor === 'missao' || valor === 'missão') return 'Missão';
  return 'Bairro';
}

function categoriaClasse(categoria: string | null | undefined) {
  const valor = String(categoria || 'bairro').toLowerCase();
  if (valor.includes('especial')) return 'especializado';
  if (valor.includes('refor')) return 'reforco';
  if (valor.includes('miss')) return 'missao';
  return 'bairro';
}

function hora(horaTexto: string | null | undefined) { return horaTexto ? horaTexto.replace(':', 'h') : ''; }

interface BibliotecaProps {
  padroes: PadraoOperacional[];
  busca: string;
  filtro: string;
  podeEditar: boolean;
  adicionando: string | null;
  onBusca: (valor: string) => void;
  onFiltro: (valor: string) => void;
  onAdicionar: (padrao: PadraoOperacional) => void;
  onVisualizar: (padrao: PadraoOperacional) => void;
  onEditar: (padrao: PadraoOperacional) => void;
}

function BibliotecaPadroes({ padroes, busca, filtro, podeEditar, adicionando, onBusca, onFiltro, onAdicionar, onVisualizar, onEditar }: BibliotecaProps) {
  const filtrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    return padroes.filter((padrao) => {
      const texto = [padrao.nome, padrao.descricao, ...(padrao.bairros || [])].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
      return padrao.ativo && padrao.publicado && (!termo || texto.includes(termo)) && (filtro === 'todos' || categoriaClasse(padrao.categoria) === filtro);
    });
  }, [busca, filtro, padroes]);

  return <aside className="cartao-biblioteca" aria-label="Biblioteca de padrões operacionais">
    <div className="cartao-biblioteca-heading"><div><h2>Biblioteca de Padrões Operacionais</h2><p>Adicione componentes ao cartão do dia.</p></div><span className="cartao-biblioteca-count">{filtrados.length}</span></div>
    <label className="cartao-search"><Search /><input value={busca} onChange={(e) => onBusca(e.target.value)} placeholder="Pesquisar padrão..." aria-label="Pesquisar padrão" /></label>
    <div className="cartao-filtros" role="tablist" aria-label="Filtrar biblioteca">{[['todos', 'Todos'], ['bairro', 'Bairros'], ['especializado', 'Especializado'], ['reforco', 'Reforço'], ['missao', 'Missões']].map(([id, label]) => <button type="button" key={id} className={filtro === id ? 'ativo' : ''} onClick={() => onFiltro(id)}>{label}</button>)}</div>
    <div className="cartao-biblioteca-lista">{filtrados.length === 0 ? <div className="cartao-biblioteca-vazio"><Search /><p>Nenhum padrão ativo encontrado.</p></div> : filtrados.map((padrao) => <article className={`cartao-padrao-item categoria-borda-${categoriaClasse(padrao.categoria)}`} key={padrao.id}><div className="cartao-padrao-item-top"><h3>{padrao.nome}</h3><span className={`cartao-padrao-badge ${categoriaClasse(padrao.categoria)}`}>{categoriaLabel(padrao.categoria)}</span></div><p className="cartao-padrao-line"><strong>Horário:</strong> {hora(padrao.horario_inicio)} às {hora(padrao.horario_fim)}</p>{categoriaClasse(padrao.categoria) === 'bairro' ? <p className="cartao-padrao-line"><strong>PBs:</strong> {padrao.quantidade_pbs || 0}</p> : <p className="cartao-padrao-line"><strong>Missão:</strong> {padrao.descricao || 'Não informada'}</p>}<p className="cartao-padrao-line cartao-padrao-roteiro"><strong>Roteiro:</strong> {padrao.bairros?.join(' / ') || padrao.descricao || 'Não informado'}</p><div className="cartao-padrao-acoes"><button type="button" onClick={() => onVisualizar(padrao)}><Eye /> Visualizar</button>{podeEditar && <button type="button" onClick={() => onEditar(padrao)}><Pencil /> Editar</button>}<button type="button" className="cartao-padrao-adicionar" disabled={adicionando === padrao.id} onClick={() => onAdicionar(padrao)}>{adicionando === padrao.id ? <span className="cartao-spinner" /> : <Plus />} Adicionar</button></div></article>)}</div>
  </aside>;
}

function PadraoPreview({ padrao, onFechar }: { padrao: PadraoOperacional; onFechar: () => void }) {
  return <div className="modal-overlay" role="presentation"><div className="modal-box cartao-padrao-preview" role="dialog" aria-modal="true" aria-labelledby="cartao-padrao-preview-titulo"><div className="modal-header"><h3 id="cartao-padrao-preview-titulo"><Eye /> Visualizar padrão</h3><button type="button" className="btn-close" onClick={onFechar} aria-label="Fechar"><X /></button></div><div className="cartao-padrao-preview-header"><span className={`cartao-padrao-badge ${categoriaClasse(padrao.categoria)}`}>{categoriaLabel(padrao.categoria)}</span><h4>{padrao.nome}</h4><p>{padrao.descricao || 'Sem descrição cadastrada.'}</p></div><dl className="cartao-padrao-preview-dados"><div><dt>Horário</dt><dd>{hora(padrao.horario_inicio)} às {hora(padrao.horario_fim)}</dd></div><div><dt>PBs</dt><dd>{padrao.quantidade_pbs || 0}</dd></div><div><dt>Versão</dt><dd>v{padrao.versao || 1}</dd></div></dl>{padrao.bairros && <div className="cartao-preview-lista"><strong>Locais e roteiro</strong><p>{padrao.bairros.join(' · ') || 'Não informado'}</p></div>}<div className="form-actions form-actions-modal"><button type="button" className="btn btn-secondary" onClick={onFechar}>Fechar</button></div></div></div>;
}

export default function CartaoProgramaPage() {
  const { usuario } = useAuth();
  const { dados } = useAppData();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { bairros } = useBairros();
  const { avisos } = useAvisos();
  const { dataSelecionada, setDataSelecionada, deslocarDia, cartao, temCartao, criarCartao, recarregar } = useCartaoPrograma();
  const { padroes, carregando: carregandoPadroes } = usePadroesOperacionais();
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [bibliotecaAberta, setBibliotecaAberta] = useState(true);
  const [adicionando, setAdicionando] = useState<string | null>(null);
  const [visualizandoPadrao, setVisualizandoPadrao] = useState<PadraoOperacional | null>(null);
  const [editando, setEditando] = useState<CartaoViatura | null>(null);
  const [salvarComoPadraoAberto, setSalvarComoPadraoAberto] = useState(false);
  const podeEditar = usuario?.role === 'P3' || usuario?.role === 'Adjunto';
  const ehP3 = usuario?.role === 'P3';
  const cartaoId = cartao?.id;
  const { editarViatura, removerViatura } = useViaturasCartao(cartao, recarregar);
  const acoesRoteiro = useItensRoteiro(cartao, recarregar);
  const viaturas = useMemo(() => {
    const versoes = new Map(padroes.map((padrao) => [padrao.id, padrao.publicado ? (padrao.versao || 0) : (padrao.versao_publicada || 0)]));
    return (cartao?.viaturas || [])
      .map((viatura) => ({
        ...viatura,
        padrao_desatualizado: !!viatura.padrao_operacional_id
          && (versoes.get(viatura.padrao_operacional_id) || 0) > (viatura.padrao_operacional_versao || 0),
      }))
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  }, [cartao?.viaturas, padroes]);

  const executar = useCallback(async (path: string, init: RequestInit, sucesso: string) => {
    try {
      const res = await apiFetch(path, init);
      if (!res.ok) { const corpo = await res.json().catch(() => ({})) as { error?: string }; toast(corpo.error || 'Não foi possível concluir a ação.', 'danger'); return false; }
      await recarregar(); toast(sucesso, 'success'); return true;
    } catch { toast('Falha na comunicação com o servidor.', 'danger'); return false; }
  }, [recarregar, toast]);

  async function garantirCartao() {
    if (cartaoId) return cartaoId;
    const resultado = await criarCartao();
    if (!resultado.ok) { toast(resultado.mensagem, 'warning'); return null; }
    return resultado.cartao?.id || null;
  }

  async function adicionarPadrao(padrao: PadraoOperacional) {
    setAdicionando(padrao.id);
    let id: string | null = cartaoId ?? null;
    if (!id) id = await garantirCartao();
    if (!id) { setAdicionando(null); return; }
    await executar(`/api/cartoes/${id}/componentes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ padrao_operacional_id: padrao.id }) }, `${padrao.nome} adicionado ao cartão.`);
    setAdicionando(null);
  }

  async function duplicarComponente(vtr: CartaoViatura) {
    if (!cartaoId) return;
    await executar(`/api/cartoes/${cartaoId}/componentes/${vtr.id}/duplicar`, { method: 'POST' }, 'Componente duplicado.');
  }

  async function atualizarPadrao(vtr: CartaoViatura) {
    if (!cartaoId) return;
    const confirmado = window.confirm('Atualizar este componente para a versão publicada mais recente? A equipe e a viatura preenchidas serão preservadas.');
    if (!confirmado) return;
    await executar(`/api/cartoes/${cartaoId}/componentes/${vtr.id}/atualizar-padrao`, { method: 'POST' }, 'Componente atualizado para a versão atual.');
  }

  async function moverComponente(vtr: CartaoViatura, direcao: -1 | 1) {
    if (!cartaoId) return;
    const atual = [...viaturas]; const origem = atual.findIndex((item) => item.id === vtr.id); const destino = origem + direcao;
    if (origem < 0 || destino < 0 || destino >= atual.length) return;
    [atual[origem], atual[destino]] = [atual[destino], atual[origem]];
    await executar(`/api/cartoes/${cartaoId}/componentes/ordem`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ordem: atual.map((item, index) => ({ id: item.id, ordem: index })) }) }, 'Ordem atualizada.');
  }

  async function excluirComponente(vtr: CartaoViatura) {
    if (!window.confirm(`Excluir ${vtr.indicativo || vtr.prefixo || 'este componente'} do cartão?`)) return;
    const resultado = await removerViatura(vtr.id);
    toast(resultado.ok ? 'Componente excluído.' : resultado.mensagem, resultado.ok ? 'info' : 'danger');
  }

  async function criarCartaoDia() {
    const resultado = await criarCartao();
    toast(resultado.ok ? 'Cartão Programa ordinário criado.' : resultado.mensagem, resultado.ok ? 'success' : 'warning');
  }

  return <div className="cartao-ordinario-page"><div className="cartao-ordinario-toolbar"><div className="cartao-ordinario-titulo"><div className="cartao-ordinario-breadcrumb">Planejamento <span>/</span> Cartão Programa</div><h2>Cartão Programa ordinário <span>•</span> {new Date(`${dataSelecionada}T12:00:00`).toLocaleDateString('pt-BR')}</h2><div className="cartao-ordinario-metadados"><span><span className="cartao-meta-icon">☼</span> Turno: Diurno</span><span><UsersRound /> Companhia: 1ª CIA</span><span><Pencil /> Status: <strong>{cartao ? 'Em edição' : 'Não criado'}</strong></span></div></div><div className="cartao-ordinario-toolbar-actions"><NavegadorData dataSelecionada={dataSelecionada} onMudarData={setDataSelecionada} onDeslocarDia={deslocarDia} temCartao={temCartao} />{!cartao && <button type="button" className="btn btn-primary" onClick={() => void criarCartaoDia()}><Plus /> Criar cartão</button>}{cartao && <button type="button" className="btn btn-primary" onClick={() => navigate(`/impressao?cartao=${cartao.id}`)}><Printer /> Emitir cartão</button>}</div></div>{cartao && <div className="cartao-ordinario-info"><Info /><span>O cartão do dia fica aberto ao lado direito. Os componentes podem ser editados sem alterar o padrão original da P3.</span></div>}<div className="cartao-ordinario-layout"><div className={`cartao-biblioteca-wrap${bibliotecaAberta ? ' aberta' : ''}`}><button type="button" className="cartao-biblioteca-mobile-toggle" onClick={() => setBibliotecaAberta((valor) => !valor)}><span><Search /> Biblioteca de Padrões Operacionais</span>{bibliotecaAberta ? <ChevronUp /> : <ChevronDown />}</button><BibliotecaPadroes padroes={padroes} busca={busca} filtro={filtro} podeEditar={ehP3} adicionando={adicionando} onBusca={setBusca} onFiltro={setFiltro} onAdicionar={(padrao) => void adicionarPadrao(padrao)} onVisualizar={setVisualizandoPadrao} onEditar={() => navigate('/padroes')} /></div><main className="cartao-componentes-area">{!cartao ? <div className="cartao-sem-cartao"><FileText /><h3>Nenhum Cartão Programa para esta data</h3><p>Crie o cartão do dia ou selecione um padrão na biblioteca para começar.</p><button type="button" className="btn btn-primary" onClick={() => void criarCartaoDia()}><Plus /> Criar cartão</button></div> : viaturas.length === 0 ? <div className="cartao-sem-cartao"><Car /><h3>Nenhum componente adicionado</h3><p>Escolha um padrão na biblioteca para montar o cartão.</p></div> : <section className="cartao-programa-painel" aria-labelledby="cartao-programa-painel-titulo"><div className="cartao-programa-painel-cabecalho"><div><span className="cartao-programa-painel-kicker"><FileText /> Cartão Programa ordinário</span><h3 id="cartao-programa-painel-titulo">Roteiro operacional do dia</h3><p>Viaturas e roteiros completos, organizados em uma única área de leitura.</p></div><div className="cartao-programa-painel-cabecalho-acoes"><strong className="cartao-programa-painel-contador">{viaturas.length} {viaturas.length === 1 ? 'viatura' : 'viaturas'}</strong>{podeEditar && <button type="button" className="btn btn-primary btn-sm" onClick={() => { document.querySelector('.cartao-biblioteca')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setBibliotecaAberta(true); }}><Plus /> Adicionar componente</button>}</div></div><RoteiroGrid viaturas={viaturas} dataCartao={cartao.data || ''} eventos={dados.eventos} podeEditar={podeEditar} onAdicionarItem={acoesRoteiro.adicionarItem} onExcluirItem={acoesRoteiro.removerItem} onAtualizarItem={acoesRoteiro.atualizarItem} onDuplicarItem={acoesRoteiro.duplicarItem} onCopiarRoteiro={acoesRoteiro.copiarRoteiro} onAplicarAtividade={acoesRoteiro.aplicarAtividade} onEditarViatura={setEditando} onExcluirViatura={(vtr) => void excluirComponente(vtr)} onDuplicarViatura={(vtr) => void duplicarComponente(vtr)} onMoverViatura={(vtr, direcao) => void moverComponente(vtr, direcao)} onAtualizarPadrao={(vtr) => void atualizarPadrao(vtr)} onEmitirViatura={(vtr) => navigate(`/impressao?cartao=${cartao.id}&viatura=${vtr.id}`)} /></section>}<div className="cartao-rodape-acoes">{cartao && <>{ehP3 && <button type="button" className="btn btn-secondary" onClick={() => setSalvarComoPadraoAberto(true)}><Copy /> Salvar como cartão padrão</button>}<button type="button" className="btn btn-secondary" onClick={() => toast('Rascunho salvo.', 'success')}><Check /> Salvar rascunho</button><button type="button" className="btn btn-secondary" onClick={() => navigate(`/impressao?cartao=${cartao.id}`)}><FileText /> Gerar cartão completo</button><button type="button" className="btn btn-primary" onClick={() => navigate(`/impressao?cartao=${cartao.id}`)}><Printer /> Emitir cartão da equipe</button></>}</div></main>{cartao && <aside className="cartao-resumo-lateral"><div className="cartao-resumo-titulo"><span>▱</span><strong>Componentes no cartão</strong><b>{viaturas.length}</b></div><div className="cartao-resumo-linha"><span><Car /> Bairros</span><b>{viaturas.filter((vtr) => categoriaClasse(vtr.padrao_operacional_categoria || vtr.categoria) === 'bairro').length}</b></div><div className="cartao-resumo-linha"><span><Shield /> Especializado</span><b>{viaturas.filter((vtr) => categoriaClasse(vtr.padrao_operacional_categoria || vtr.categoria) === 'especializado').length}</b></div><div className="cartao-resumo-linha"><span><UsersRound /> Reforço</span><b>{viaturas.filter((vtr) => categoriaClasse(vtr.padrao_operacional_categoria || vtr.categoria) === 'reforco').length}</b></div><div className="cartao-resumo-linha"><span><Info /> Padrões ativos</span><b>{carregandoPadroes ? '—' : padroes.filter((padrao) => padrao.ativo).length}</b></div></aside>}</div>{editando && <ModalEditarViatura viatura={editando} pessoal={dados.pessoal} bairros={bairros} avisos={avisos} onFechar={() => setEditando(null)} onSalvar={editarViatura} />}{visualizandoPadrao && <PadraoPreview padrao={visualizandoPadrao} onFechar={() => setVisualizandoPadrao(null)} />}{salvarComoPadraoAberto && cartao && <ModalSalvarComoPadraoOperacional cartao={cartao} bairros={bairros} onFechar={() => setSalvarComoPadraoAberto(false)} onCriado={() => { setSalvarComoPadraoAberto(false); navigate('/padroes'); }} />}</div>;
}
