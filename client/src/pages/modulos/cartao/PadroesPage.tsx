import { useMemo, useState } from 'react';
import { Archive, Check, Copy, Edit3, Eye, History, LoaderCircle, Plus, RotateCcw, Search, X } from 'lucide-react';
import { useToast } from '../../../context/useToast';
import { usePadroesOperacionais, type PadraoOperacional, type PadraoPayload, type VersaoPadrao } from './usePadroesOperacionais';

const FILTROS = [
  { id: 'todos', label: 'Todos' },
  { id: 'bairro', label: 'Bairros' },
  { id: 'especializado', label: 'Especializado' },
  { id: 'reforco', label: 'Reforço' },
  { id: 'missao', label: 'Missões' },
] as const;

const VAZIO: PadraoPayload = {
  nome: '', categoria: 'bairro', descricao: '', horario_inicio: '07:00', horario_fim: '19:00', quantidade_pbs: 0, bairros: [],
};

function labelCategoria(categoria: string | null | undefined) {
  return FILTROS.find((item) => item.id === categoria)?.label || categoria || 'Padrão';
}

function hora(hora: string | null | undefined) {
  return hora ? hora.replace(':', 'h') : '—';
}

function dataAtualizada(data: string | null | undefined) {
  if (!data) return 'Sem atualização';
  const valor = new Date(data);
  return Number.isNaN(valor.getTime()) ? 'Sem atualização' : valor.toLocaleDateString('pt-BR');
}

interface FormPadraoProps {
  inicial: PadraoPayload;
  salvando: boolean;
  onFechar: () => void;
  onSalvar: (payload: PadraoPayload) => Promise<void>;
}

function FormPadrao({ inicial, salvando, onFechar, onSalvar }: FormPadraoProps) {
  const [form, setForm] = useState(inicial);
  const [bairrosTexto, setBairrosTexto] = useState(inicial.bairros.join(', '));
  return (
    <div className="modal-overlay" role="presentation">
      <div className="modal-box padrao-form-modal" role="dialog" aria-modal="true" aria-labelledby="titulo-form-padrao">
        <div className="modal-header">
          <h3 id="titulo-form-padrao">{inicial.nome ? 'Editar padrão operacional' : 'Novo padrão operacional'}</h3>
          <button type="button" className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void onSalvar({ ...form, bairros: bairrosTexto.split(',').map((item) => item.trim()).filter(Boolean) }); }}>
          <div className="form-row">
            <div className="form-group col-md-8"><label htmlFor="padrao-nome">Nome *</label><input id="padrao-nome" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Lagoa Nova" /></div>
            <div className="form-group col-md-4"><label htmlFor="padrao-categoria">Categoria</label><input id="padrao-categoria" list="categorias-padrao" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} /><datalist id="categorias-padrao">{FILTROS.filter((item) => item.id !== 'todos').map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</datalist></div>
          </div>
          <div className="form-row">
            <div className="form-group col-md-6"><label htmlFor="padrao-inicio">Horário de início</label><input id="padrao-inicio" type="time" value={form.horario_inicio} onChange={(e) => setForm({ ...form, horario_inicio: e.target.value })} /></div>
            <div className="form-group col-md-6"><label htmlFor="padrao-fim">Horário de fim</label><input id="padrao-fim" type="time" value={form.horario_fim} onChange={(e) => setForm({ ...form, horario_fim: e.target.value })} /></div>
          </div>
          <div className="form-row">
            <div className="form-group col-md-4"><label htmlFor="padrao-pbs">Quantidade de PBs</label><input id="padrao-pbs" type="number" min="0" value={form.quantidade_pbs} onChange={(e) => setForm({ ...form, quantidade_pbs: Number(e.target.value) || 0 })} /></div>
            <div className="form-group col-md-8"><label htmlFor="padrao-bairros">Bairros / locais</label><input id="padrao-bairros" value={bairrosTexto} onChange={(e) => setBairrosTexto(e.target.value)} placeholder="Separe por vírgula" /></div>
          </div>
          <div className="form-group"><label htmlFor="padrao-descricao">Descrição / missão</label><textarea id="padrao-descricao" rows={3} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
          <div className="form-actions form-actions-modal"><button type="button" className="btn btn-secondary" onClick={onFechar}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={salvando}>{salvando ? <LoaderCircle className="spin" /> : <Check />} Salvar padrão</button></div>
        </form>
      </div>
    </div>
  );
}

function payloadDoPadrao(padrao: PadraoOperacional): PadraoPayload {
  return {
    nome: padrao.nome,
    categoria: String(padrao.categoria || 'bairro'),
    descricao: padrao.descricao || '',
    horario_inicio: padrao.horario_inicio || '',
    horario_fim: padrao.horario_fim || '',
    quantidade_pbs: padrao.quantidade_pbs || 0,
    bairros: padrao.bairros || [],
  };
}

function HistoricoPadrao({ nome, versoes, onFechar }: { nome: string; versoes: VersaoPadrao[]; onFechar: () => void }) {
  return (
    <div className="modal-overlay" role="presentation">
      <div className="modal-box padrao-historico-modal" role="dialog" aria-modal="true" aria-labelledby="titulo-historico-padrao">
        <div className="modal-header"><h3 id="titulo-historico-padrao"><History /> Histórico de versões</h3><button type="button" className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button></div>
        <p className="padrao-historico-subtitulo">{nome}</p>
        {versoes.length === 0 ? <div className="padrao-historico-vazio"><Archive /><p>Nenhuma versão publicada ainda.</p></div> : <div className="padrao-versoes-lista">{versoes.map((versao) => <div className="padrao-versao-linha" key={`${versao.id || nome}-${versao.versao}`}><span className="padrao-versao-numero">v{versao.versao}</span><span>{versao.criado_em ? new Date(versao.criado_em).toLocaleString('pt-BR') : 'Data não informada'}</span><span className="padrao-versao-autor">{versao.criado_por || 'P3'}</span></div>)}</div>}
        <div className="form-actions form-actions-modal"><button type="button" className="btn btn-secondary" onClick={onFechar}>Fechar</button></div>
      </div>
    </div>
  );
}

export default function PadroesPage() {
  const { toast } = useToast();
  const { padroes, carregando, erro, criar, atualizar, publicar, duplicar, alterarAtivo, detalhe, versoes } = usePadroesOperacionais();
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['id']>('todos');
  const [form, setForm] = useState<{ modo: 'novo' | 'editar'; padrao?: PadraoOperacional } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [historico, setHistorico] = useState<{ nome: string; versoes: VersaoPadrao[] } | null>(null);

  const padroesFiltrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    return padroes.filter((padrao) => {
      const coincideBusca = !termo || [padrao.nome, padrao.descricao, ...(padrao.bairros || [])].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR').includes(termo);
      return coincideBusca && (filtro === 'todos' || padrao.categoria === filtro);
    });
  }, [busca, filtro, padroes]);

  async function salvar(payload: PadraoPayload) {
    setSalvando(true);
    const resultado = form?.modo === 'editar' && form.padrao ? await atualizar(form.padrao.id, payload) : await criar(payload);
    setSalvando(false);
    if (resultado.ok) { setForm(null); toast('Padrão operacional salvo.', 'success'); } else toast(resultado.mensagem, 'danger');
  }

  async function acao(operacao: () => Promise<{ ok: boolean; mensagem?: string }>, sucesso: string) {
    const resultado = await operacao();
    toast(resultado.ok ? sucesso : resultado.mensagem || 'Não foi possível concluir a ação.', resultado.ok ? 'success' : 'danger');
  }

  async function abrirEdicao(padrao: PadraoOperacional) {
    const completo = await detalhe(padrao.id);
    setForm({ modo: 'editar', padrao: completo || padrao });
  }

  async function abrirHistorico(padrao: PadraoOperacional) {
    setHistorico({ nome: padrao.nome, versoes: await versoes(padrao.id) });
  }

  return (
    <div className="padroes-page">
      <div className="padroes-page-header"><div><div className="padroes-breadcrumb"><span>Cartão Ordinário</span><span>/</span><strong>Padrões Operacionais</strong></div><h2>Padrões Operacionais</h2><p>Cadastre e publique os modelos que podem ser adicionados aos cartões do dia.</p></div><button type="button" className="btn btn-primary" onClick={() => setForm({ modo: 'novo' })}><Plus /> Novo padrão</button></div>
      <div className="padroes-toolbar"><label className="padroes-search"><Search /><input aria-label="Buscar padrão operacional" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar padrão..." /></label><div className="padroes-filtros">{FILTROS.map((item) => <button key={item.id} type="button" className={filtro === item.id ? 'ativo' : ''} onClick={() => setFiltro(item.id)}>{item.label}</button>)}</div></div>
      {erro && <div className="padroes-erro" role="alert">{erro}<button type="button" onClick={() => window.location.reload()}>Tentar novamente</button></div>}
      {carregando ? <div className="padroes-loading"><LoaderCircle className="spin" /><span>Carregando padrões...</span></div> : padroesFiltrados.length === 0 ? <div className="padroes-vazio"><Archive /><h3>Nenhum padrão encontrado</h3><p>Crie o primeiro padrão operacional para montar o Cartão Ordinário.</p><button type="button" className="btn btn-secondary" onClick={() => setForm({ modo: 'novo' })}><Plus /> Criar padrão</button></div> : <div className="padroes-grid">{padroesFiltrados.map((padrao) => <article className={`padrao-management-card${padrao.ativo ? '' : ' inativo'}`} key={padrao.id}><div className="padrao-management-top"><span className={`padrao-categoria categoria-${padrao.categoria || 'bairro'}`}>{labelCategoria(padrao.categoria)}</span><span className={`padrao-status ${padrao.ativo ? 'ativo' : 'inativo'}`}>{padrao.ativo ? 'Ativo' : 'Inativo'}</span></div><h3>{padrao.nome}</h3><p className="padrao-management-descricao">{padrao.descricao || 'Sem descrição cadastrada.'}</p><dl><div><dt>Horário</dt><dd>{hora(padrao.horario_inicio)} às {hora(padrao.horario_fim)}</dd></div><div><dt>PBs</dt><dd>{padrao.quantidade_pbs || 0}</dd></div><div><dt>Versão</dt><dd>v{padrao.versao || 1}{padrao.versao_publicada ? ` · publicada v${padrao.versao_publicada}` : ''}</dd></div></dl>{padrao.bairros && padrao.bairros.length > 0 && <div className="padrao-management-bairros">{padrao.bairros.slice(0, 3).map((bairro) => <span key={bairro}>{bairro}</span>)}{padrao.bairros.length > 3 && <span>+{padrao.bairros.length - 3}</span>}</div>}<div className="padrao-management-meta">Atualizado em {dataAtualizada(padrao.atualizado_em)}</div><div className="padrao-management-actions"><button type="button" className="btn-icon btn-sm" title="Visualizar padrão" onClick={() => void abrirEdicao(padrao)}><Eye /></button><button type="button" className="btn-icon btn-sm" title="Editar padrão" onClick={() => void abrirEdicao(padrao)}><Edit3 /></button><button type="button" className="btn-icon btn-sm" title="Duplicar padrão" onClick={() => void acao(() => duplicar(padrao.id), 'Padrão duplicado.') }><Copy /></button><button type="button" className="btn-icon btn-sm" title="Histórico de versões" onClick={() => void abrirHistorico(padrao)}><History /></button><button type="button" className="btn btn-secondary btn-sm" onClick={() => void acao(() => publicar(padrao.id), 'Padrão publicado.')}>{padrao.publicado ? <RotateCcw /> : <Check />}{padrao.publicado ? ' Republicar' : ' Publicar'}</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => void acao(() => alterarAtivo(padrao.id, !padrao.ativo), padrao.ativo ? 'Padrão inativado.' : 'Padrão ativado.')}>{padrao.ativo ? 'Inativar' : 'Ativar'}</button></div></article>)}</div>}
      {form && <FormPadrao inicial={form.padrao ? payloadDoPadrao(form.padrao) : VAZIO} salvando={salvando} onFechar={() => setForm(null)} onSalvar={salvar} />}
      {historico && <HistoricoPadrao nome={historico.nome} versoes={historico.versoes} onFechar={() => setHistorico(null)} />}
    </div>
  );
}
