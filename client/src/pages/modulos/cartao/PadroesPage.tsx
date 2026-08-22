import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Archive, ArrowDown, ArrowUp, Check, Copy, Eye, History, LoaderCircle, Pencil, Plus, RotateCcw,
  Search, Trash2, X,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../../../context/useToast';
import { useBairros } from '../../../hooks/useBairros';
import { ModalConfirmarExclusaoForte } from '../../../components/ModalConfirmarExclusaoForte';
import {
  usePadroesOperacionais,
  type ComponentePadrao,
  type ItemRoteiroPadrao,
  type PadraoOperacional,
  type PadraoPayload,
  type VersaoPadrao,
} from './usePadroesOperacionais';
import { contarPbsComponentes } from '../../../lib/padroesOperacionais';

const FILTROS = [
  { id: 'todos', label: 'Todos' },
  { id: 'bairro', label: 'Bairros' },
  { id: 'especializado', label: 'Especializado' },
  { id: 'reforco', label: 'Reforço' },
  { id: 'missao', label: 'Missões' },
] as const;

const ATIVIDADES_PADRAO = ['CPB', 'QTL', 'PB', 'Patrulhamento', 'Outros'];

const VAZIO: PadraoPayload = {
  nome: '', categoria: 'bairro', descricao: '', horario_inicio: '07:00', horario_fim: '19:00', bairros: [], componentes: [],
};

function labelCategoria(categoria: string | null | undefined) {
  return FILTROS.find((item) => item.id === categoria)?.label || categoria || 'Padrão';
}

function hora(valor: string | null | undefined) {
  return valor ? valor.replace(':', 'h') : '—';
}

function dataAtualizada(data: string | null | undefined) {
  if (!data) return 'Sem atualização';
  const valor = new Date(data);
  return Number.isNaN(valor.getTime()) ? 'Sem atualização' : valor.toLocaleDateString('pt-BR');
}

function idLocal(prefixo: string) {
  return `${prefixo}-${Date.now()}-${Math.round(Math.random() * 10000)}`;
}

function novoItem(): ItemRoteiroPadrao {
  return { id: idLocal('item'), inicio: '', fim: '', local: '', atividade: 'CPB' };
}

function novaComponente(indice: number, bairro = ''): ComponentePadrao {
  return {
    id: idLocal('componente'),
    prefixo: `VTR ${String(indice + 1).padStart(2, '0')}`,
    setor: bairro,
    companhia: '',
    categoria: 'Ordinária',
    observacao: '',
    bairros_ids: [],
    itens: [],
  };
}

function clonarComponentes(componentes: ComponentePadrao[] | undefined) {
  return (componentes || []).map((componente, indice) => ({
    ...componente,
    id: componente.id || idLocal(`componente-${indice}`),
    itens: (componente.itens || []).map((item, indiceItem) => ({
      ...item,
      id: item.id || idLocal(`item-${indice}-${indiceItem}`),
    })),
  }));
}

interface FormPadraoProps {
  inicial: PadraoPayload;
  modo: 'novo' | 'editar';
  bairrosDisponiveis: { id: string; nome_bairro: string; ativo?: boolean }[];
  salvando: boolean;
  onFechar: () => void;
  onSalvar: (payload: PadraoPayload) => Promise<void>;
}

function FormPadrao({ inicial, modo, bairrosDisponiveis, salvando, onFechar, onSalvar }: FormPadraoProps) {
  const [form, setForm] = useState(() => ({ ...inicial, componentes: clonarComponentes(inicial.componentes) }));
  const bairrosNomes = bairrosDisponiveis.filter((bairro) => bairro.ativo !== false).map((bairro) => bairro.nome_bairro);
  const [bairrosSelecionados, setBairrosSelecionados] = useState(() => inicial.bairros.filter((bairro) => bairrosNomes.includes(bairro)));
  const [bairrosLivres, setBairrosLivres] = useState(() => inicial.bairros.filter((bairro) => !bairrosNomes.includes(bairro)).join(', '));
  const [erroForm, setErroForm] = useState<string | null>(null);
  const bairrosLivresNormalizados = bairrosLivres.split(',').map((item) => item.trim()).filter(Boolean);
  const bairrosTotais = [...new Set([...bairrosSelecionados, ...bairrosLivresNormalizados])];
  const quantidadePbs = contarPbsComponentes(form.componentes);

  function atualizarComponente(indice: number, patch: Partial<ComponentePadrao>) {
    setForm((atual) => ({ ...atual, componentes: (atual.componentes || []).map((item, itemIndice) => itemIndice === indice ? { ...item, ...patch } : item) }));
  }

  function atualizarItem(indiceComponente: number, indiceItem: number, patch: Partial<ItemRoteiroPadrao>) {
    setForm((atual) => ({
      ...atual,
      componentes: (atual.componentes || []).map((componente, componenteIndice) => componenteIndice !== indiceComponente ? componente : {
        ...componente,
        itens: componente.itens.map((item, itemIndice) => itemIndice === indiceItem ? { ...item, ...patch } : item),
      }),
    }));
  }

  function alternarBairro(bairro: string) {
    if (!bairrosSelecionados.includes(bairro) && bairrosTotais.length >= 3) {
      setErroForm('O padrão pode possuir no máximo 3 bairros relacionados.');
      return;
    }
    setErroForm(null);
    setBairrosSelecionados((atual) => atual.includes(bairro) ? atual.filter((item) => item !== bairro) : [...atual, bairro]);
  }

  function adicionarComponente() {
    setForm((atual) => ({ ...atual, componentes: [...(atual.componentes || []), novaComponente(atual.componentes?.length || 0, bairrosSelecionados[0] || '')] }));
  }

  function removerComponente(indice: number) {
    setForm((atual) => ({ ...atual, componentes: (atual.componentes || []).filter((_, itemIndice) => itemIndice !== indice) }));
  }

  function moverComponente(indice: number, direcao: -1 | 1) {
    setForm((atual) => {
      const componentes = [...(atual.componentes || [])];
      const destino = indice + direcao;
      if (destino < 0 || destino >= componentes.length) return atual;
      [componentes[indice], componentes[destino]] = [componentes[destino], componentes[indice]];
      return { ...atual, componentes };
    });
  }

  function adicionarItem(indiceComponente: number) {
    setForm((atual) => ({
      ...atual,
      componentes: (atual.componentes || []).map((componente, indice) => indice === indiceComponente ? { ...componente, itens: [...componente.itens, novoItem()] } : componente),
    }));
  }

  function removerItem(indiceComponente: number, indiceItem: number) {
    setForm((atual) => ({
      ...atual,
      componentes: (atual.componentes || []).map((componente, indice) => indice === indiceComponente ? { ...componente, itens: componente.itens.filter((_, itemIndice) => itemIndice !== indiceItem) } : componente),
    }));
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (bairrosTotais.length > 3) {
      setErroForm('O padrão pode possuir no máximo 3 bairros relacionados.');
      return;
    }
    if (form.categoria.trim().toLocaleLowerCase('pt-BR') === 'bairro' && bairrosTotais.length === 0) {
      setErroForm('Padrões da categoria Bairro exigem pelo menos um bairro relacionado.');
      return;
    }
    setErroForm(null);
    void onSalvar({
      ...form,
      bairros: bairrosTotais,
      componentes: form.componentes || [],
    });
  }

  return (
    <section className="padroes-detalhe padrao-edicao-inline" aria-label={modo === 'editar' ? `Editando o padrão ${inicial.nome}` : 'Novo cartão padrão'}>
      <div className="padroes-detalhe-cabecalho">
        <div><div className="padrao-detalhe-kicker"><span className="padrao-status ativo">Edição inline</span></div><h2 id="titulo-form-padrao">{modo === 'editar' ? 'Editar cartão padrão' : 'Novo cartão padrão'}</h2><p>Altere o padrão diretamente neste painel. Cancelar descarta todas as mudanças locais.</p></div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onFechar}><X /> Cancelar</button>
      </div>
        <form onSubmit={enviar}>
          <div className="padrao-form-secao">
            <div className="padrao-form-secao-titulo"><strong>Identificação do padrão</strong><span>O padrão é uma base independente para futuros cartões de serviço.</span></div>
            <div className="form-row">
              <div className="form-group col-md-8"><label htmlFor="padrao-nome">Nome *</label><input id="padrao-nome" required maxLength={120} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Lagoa Nova ou Força Tática" /></div>
              <div className="form-group col-md-4"><label htmlFor="padrao-categoria">Tipo / categoria</label><input id="padrao-categoria" list="categorias-padrao" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} /><datalist id="categorias-padrao">{FILTROS.filter((item) => item.id !== 'todos').map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</datalist></div>
            </div>
            <div className="form-row">
              <div className="form-group col-md-6"><label htmlFor="padrao-inicio">Horário de início</label><input id="padrao-inicio" type="time" value={form.horario_inicio} onChange={(e) => setForm({ ...form, horario_inicio: e.target.value })} /></div>
              <div className="form-group col-md-6"><label htmlFor="padrao-fim">Horário de fim</label><input id="padrao-fim" type="time" value={form.horario_fim} onChange={(e) => setForm({ ...form, horario_fim: e.target.value })} /></div>
            </div>
            <fieldset className="padrao-bairros-checkboxes"><legend>Bairros relacionados ({bairrosTotais.length}/3)</legend><div>{bairrosNomes.map((bairro) => <label className="checkbox-inline" key={bairro}><input type="checkbox" checked={bairrosSelecionados.includes(bairro)} disabled={!bairrosSelecionados.includes(bairro) && bairrosTotais.length >= 3} onChange={() => alternarBairro(bairro)} /><span>{bairro}</span></label>)}</div><span className="texto-auxiliar">Marque até 3 bairros. Não é necessário usar Ctrl/Cmd.</span></fieldset>
            <div className="form-row">
              <div className="form-group col-md-4"><label htmlFor="padrao-pbs">PBs calculados</label><output id="padrao-pbs" className="padrao-pbs-calculados"><strong>{quantidadePbs}</strong><span>dos itens do roteiro</span></output></div>
              <div className="form-group col-md-8"><label htmlFor="padrao-outros-bairros">Outros bairros / locais</label><input id="padrao-outros-bairros" value={bairrosLivres} onChange={(e) => setBairrosLivres(e.target.value)} placeholder="Separe por vírgula" /></div>
            </div>
            <div className="form-group"><label htmlFor="padrao-descricao">Observações / missão</label><textarea id="padrao-descricao" rows={3} maxLength={500} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
          </div>

          <div className="padrao-form-secao">
            <div className="padrao-form-secao-cabecalho"><div className="padrao-form-secao-titulo"><strong>Componentes e roteiros</strong><span>Configure viaturas, bairros relacionados e todos os itens do roteiro neste mesmo painel.</span></div><button type="button" className="btn btn-secondary btn-sm" onClick={adicionarComponente}><Plus /> Adicionar viatura</button></div>
            {(form.componentes || []).length === 0 ? <div className="padrao-editor-vazio"><Archive /><span>Nenhuma viatura configurada. Adicione a primeira acima.</span></div> : <div className="padrao-componentes-editor">{(form.componentes || []).map((componente, indice) => <div className="padrao-componente-editor" key={componente.id}>
              <div className="padrao-componente-editor-cabecalho"><strong>Viatura {indice + 1}</strong><div className="acoes-linha"><button type="button" className="btn-icon btn-sm" title="Mover viatura para cima" disabled={indice === 0} onClick={() => moverComponente(indice, -1)}><ArrowUp /></button><button type="button" className="btn-icon btn-sm" title="Mover viatura para baixo" disabled={indice === (form.componentes || []).length - 1} onClick={() => moverComponente(indice, 1)}><ArrowDown /></button><button type="button" className="btn-icon btn-sm btn-icon-danger" title="Remover viatura" onClick={() => removerComponente(indice)}><Trash2 /></button></div></div>
              <div className="form-row">
                <div className="form-group col-md-3"><label>Prefixo / identificação *</label><input required value={componente.prefixo} onChange={(e) => atualizarComponente(indice, { prefixo: e.target.value })} placeholder="VTR 01" /></div>
                <div className="form-group col-md-3"><label>Setor / bairro</label><input value={componente.setor} onChange={(e) => atualizarComponente(indice, { setor: e.target.value })} /></div>
                <div className="form-group col-md-3"><label>Companhia</label><input value={componente.companhia} onChange={(e) => atualizarComponente(indice, { companhia: e.target.value })} /></div>
                <div className="form-group col-md-3"><label>Categoria</label><input value={componente.categoria} onChange={(e) => atualizarComponente(indice, { categoria: e.target.value })} /></div>
              </div>
              <div className="form-group"><label>Observação da viatura</label><input value={componente.observacao} onChange={(e) => atualizarComponente(indice, { observacao: e.target.value })} /></div>
              <div className="padrao-roteiro-editor"><div className="padrao-roteiro-editor-cabecalho"><strong>Itens de roteiro ({componente.itens.length})</strong><button type="button" className="btn btn-secondary btn-sm" onClick={() => adicionarItem(indice)}><Plus /> Adicionar item</button></div>{componente.itens.length === 0 ? <p className="texto-auxiliar">Nenhum item. Adicione local, horário e tipo de patrulhamento.</p> : <div className="padrao-roteiro-linhas">{componente.itens.map((item, indiceItem) => <div className="padrao-roteiro-linha" key={item.id}><input aria-label={`Início do item ${indiceItem + 1}`} required type="time" value={item.inicio} onChange={(e) => atualizarItem(indice, indiceItem, { inicio: e.target.value })} /><input aria-label={`Fim do item ${indiceItem + 1}`} required type="time" value={item.fim} onChange={(e) => atualizarItem(indice, indiceItem, { fim: e.target.value })} /><input aria-label={`Local do item ${indiceItem + 1}`} required placeholder="Local / itinerário" value={item.local} onChange={(e) => atualizarItem(indice, indiceItem, { local: e.target.value })} /><select aria-label={`Atividade do item ${indiceItem + 1}`} value={item.atividade} onChange={(e) => atualizarItem(indice, indiceItem, { atividade: e.target.value })}>{ATIVIDADES_PADRAO.map((atividade) => <option key={atividade}>{atividade}</option>)}</select><button type="button" className="btn-icon btn-sm btn-icon-danger" title="Remover item" onClick={() => removerItem(indice, indiceItem)}><Trash2 /></button></div>)}</div>}</div>
            </div>)}</div>}
          </div>
          {erroForm && <div className="padroes-erro" role="alert">{erroForm}</div>}
          <div className="form-actions form-actions-modal"><button type="button" className="btn btn-secondary" onClick={onFechar} disabled={salvando}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={salvando}>{salvando ? <LoaderCircle className="spin" /> : <Check />} Salvar padrão</button></div>
        </form>
    </section>
  );
}

function payloadDoPadrao(padrao: PadraoOperacional): PadraoPayload {
  return {
    nome: padrao.nome,
    categoria: String(padrao.categoria || 'bairro'),
    descricao: padrao.descricao || '',
    horario_inicio: padrao.horario_inicio || '',
    horario_fim: padrao.horario_fim || '',
    bairros: padrao.bairros || [],
    componentes: clonarComponentes(padrao.componentes),
  };
}

function RoteiroVisualizacao({ itens }: { itens: ItemRoteiroPadrao[] }) {
  if (!itens.length) return <p className="texto-auxiliar">Sem itens de roteiro.</p>;
  return <div className="padrao-roteiro-visualizacao"><div className="padrao-roteiro-visualizacao-cabecalho"><span>Horário</span><span>Local / itinerário</span><span>Patrulhamento</span></div>{itens.map((item) => <div className="padrao-roteiro-visualizacao-linha" key={item.id}><strong>{hora(item.inicio)}{item.fim ? `–${hora(item.fim)}` : ''}</strong><span>{item.local || 'Local não informado'}</span><span className="padrao-atividade-badge">{item.atividade || 'CPB'}</span></div>)}</div>;
}

function HistoricoPadrao({ nome, versoes, onFechar }: { nome: string; versoes: VersaoPadrao[]; onFechar: () => void }) {
  return <div className="modal-overlay" role="presentation"><div className="modal-box padrao-historico-modal" role="dialog" aria-modal="true" aria-labelledby="titulo-historico-padrao"><div className="modal-header"><h3 id="titulo-historico-padrao"><History /> Histórico de versões</h3><button type="button" className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button></div><p className="padrao-historico-subtitulo">{nome}</p>{versoes.length === 0 ? <div className="padrao-historico-vazio"><Archive /><p>Nenhuma versão publicada ainda.</p></div> : <div className="padrao-versoes-lista">{versoes.map((versao) => <div className="padrao-versao-linha" key={`${versao.id || nome}-${versao.versao}`}><span className="padrao-versao-numero">v{versao.versao}</span><span>{versao.criado_em ? new Date(versao.criado_em).toLocaleString('pt-BR') : 'Data não informada'}</span><span className="padrao-versao-autor">{versao.criado_por || 'P3'}</span></div>)}</div>}<div className="form-actions form-actions-modal"><button type="button" className="btn btn-secondary" onClick={onFechar}>Fechar</button></div></div></div>;
}

function DetalhePadrao({
  padrao, onEditar, onDuplicar, onPublicar, onAlternarAtivo, onHistorico, onExcluir,
}: {
  padrao: PadraoOperacional;
  onEditar: () => void;
  onDuplicar: () => void;
  onPublicar: () => void;
  onAlternarAtivo: () => void;
  onHistorico: () => void;
  onExcluir: () => void;
}) {
  const componentes = padrao.componentes || [];
  const quantidadePbs = contarPbsComponentes(componentes);
  return <section className="padroes-detalhe" aria-label={`Detalhes do padrão ${padrao.nome}`}>
    <div className="padroes-detalhe-cabecalho"><div><div className="padrao-detalhe-kicker"><span className={`padrao-categoria categoria-${padrao.categoria || 'bairro'}`}>{labelCategoria(padrao.categoria)}</span><span className={`padrao-status ${padrao.ativo ? 'ativo' : 'inativo'}`}>{padrao.ativo ? 'Ativo' : 'Inativo'}</span><span className={`padrao-status ${padrao.publicado ? 'ativo' : 'inativo'}`}>{padrao.publicado ? `Publicado · v${padrao.versao || 1}` : 'Rascunho'}</span></div><h2>{padrao.nome}</h2><p>{padrao.descricao || 'Sem observações cadastradas.'}</p></div><div className="padroes-detalhe-acoes"><button type="button" className="btn btn-primary btn-sm" onClick={onEditar}><Pencil /> Editar</button><button type="button" className="btn btn-secondary btn-sm" onClick={onDuplicar}><Copy /> Duplicar</button><button type="button" className="btn btn-secondary btn-sm" onClick={onPublicar}>{padrao.publicado ? <RotateCcw /> : <Check />} {padrao.publicado ? 'Republicar' : 'Publicar'}</button><button type="button" className="btn btn-ghost btn-sm" onClick={onAlternarAtivo}>{padrao.ativo ? 'Inativar' : 'Ativar'}</button><button type="button" className="btn-icon btn-sm btn-icon-danger" title="Excluir padrão" onClick={onExcluir}><Trash2 /></button></div></div>
    <div className="padroes-detalhe-metadados"><span><strong>Horário</strong>{hora(padrao.horario_inicio)} às {hora(padrao.horario_fim)}</span><span><strong>Viaturas</strong>{componentes.length}</span><span><strong>PBs</strong>{quantidadePbs}</span><span><strong>Itens de roteiro</strong>{componentes.reduce((total, componente) => total + componente.itens.length, 0)}</span><span><strong>Atualizado</strong>{dataAtualizada(padrao.atualizado_em)}</span></div>
    {padrao.bairros && padrao.bairros.length > 0 && <div className="padroes-detalhe-bairros"><strong>Bairros relacionados</strong><div>{padrao.bairros.map((bairro) => <span key={bairro}>{bairro}</span>)}</div></div>}
    <div className="padroes-detalhe-roteiros"><div className="padroes-detalhe-roteiros-cabecalho"><div><h3>Viaturas e roteiros</h3><p>Fotografia atual deste cartão padrão. Os cartões de serviço recebem uma cópia independente.</p></div><button type="button" className="btn btn-secondary btn-sm" onClick={onHistorico}><History /> Histórico</button></div>{componentes.length === 0 ? <div className="padrao-editor-vazio"><Archive /><span>Este padrão ainda não possui viaturas ou roteiro.</span></div> : <div className="padrao-viaturas-visualizacao">{componentes.map((componente, indice) => <article className="padrao-viatura-visualizacao" key={componente.id}><div className="padrao-viatura-visualizacao-cabecalho"><div><strong>{componente.prefixo || `VTR ${indice + 1}`}</strong><span>{componente.setor || 'Setor não informado'}{componente.companhia ? ` · ${componente.companhia}` : ''}</span></div><span className="padrao-viatura-contador">{componente.itens.length} item(ns)</span></div>{componente.observacao && <p className="texto-auxiliar">Obs.: {componente.observacao}</p>}<RoteiroVisualizacao itens={componente.itens} /></article>)}</div>}</div>
  </section>;
}

export default function PadroesPage() {
  const { toast } = useToast();
  const { bairros } = useBairros();
  const { padroes, carregando, erro, criar, atualizar, publicar, duplicar, alterarAtivo, excluir, detalhe, versoes } = usePadroesOperacionais();
  const [parametros] = useSearchParams();
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['id']>('todos');
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [detalheAberto, setDetalheAberto] = useState<PadraoOperacional | null>(null);
  const [form, setForm] = useState<{ modo: 'novo' | 'editar'; padrao?: PadraoOperacional } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [historico, setHistorico] = useState<{ nome: string; versoes: VersaoPadrao[] } | null>(null);
  const [aExcluir, setAExcluir] = useState<PadraoOperacional | null>(null);

  const padroesFiltrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    return padroes.filter((padrao) => {
      const texto = [padrao.nome, padrao.descricao, ...(padrao.bairros || [])].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
      return (!termo || texto.includes(termo)) && (filtro === 'todos' || padrao.categoria === filtro);
    });
  }, [busca, filtro, padroes]);

  const selecionar = useCallback(async (padrao: PadraoOperacional) => {
    setSelecionadoId(padrao.id);
    const completo = await detalhe(padrao.id);
    setDetalheAberto(completo || padrao);
  }, [detalhe]);

  useEffect(() => {
    const idSolicitado = parametros.get('padraoId');
    const padraoSolicitado = idSolicitado ? padroes.find((padrao) => padrao.id === idSolicitado) : null;
    if (!selecionadoId && padraoSolicitado) {
      // A ação Editar da biblioteca do Cartão Ordinário chega aqui com o id do
      // padrão: o mesmo painel é selecionado e já abre no modo inline.
      void (async () => {
        const completo = await detalhe(padraoSolicitado.id);
        const atual = completo || padraoSolicitado;
        setSelecionadoId(atual.id);
        setDetalheAberto(atual);
        if (parametros.get('editar') === '1') setForm({ modo: 'editar', padrao: atual });
      })();
      return;
    }
    if (!selecionadoId && padroesFiltrados[0]) {
      // A seleção inicial acompanha a primeira lista recebida da API.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void selecionar(padroesFiltrados[0]);
    }
    if (selecionadoId && !padroes.some((padrao) => padrao.id === selecionadoId)) {
      setSelecionadoId(null);
      setDetalheAberto(null);
    }
  }, [detalhe, padroes, padroesFiltrados, parametros, selecionadoId, selecionar]);

  async function salvar(payload: PadraoPayload) {
    setSalvando(true);
    const resultado = form?.modo === 'editar' && form.padrao ? await atualizar(form.padrao.id, payload) : await criar(payload);
    setSalvando(false);
    if (!resultado.ok) {
      toast(resultado.mensagem, 'danger');
      return;
    }
    setForm(null);
    toast('Cartão padrão salvo como rascunho.', 'success');
    if (resultado.padrao) {
      setSelecionadoId(resultado.padrao.id);
      setDetalheAberto(resultado.padrao);
    }
  }

  async function abrirEdicao(padrao: PadraoOperacional) {
    const completo = await detalhe(padrao.id);
    setForm({ modo: 'editar', padrao: completo || padrao });
  }

  async function executarAcao(operacao: () => Promise<{ ok: boolean; mensagem?: string }>, sucesso: string) {
    const resultado = await operacao();
    toast(resultado.ok ? sucesso : resultado.mensagem || 'Não foi possível concluir a ação.', resultado.ok ? 'success' : 'danger');
    return resultado.ok;
  }

  async function publicarSelecionado() {
    if (!detalheAberto) return;
    const ok = await executarAcao(() => publicar(detalheAberto.id), detalheAberto.publicado ? 'Nova versão publicada.' : 'Padrão publicado.');
    if (ok) setDetalheAberto(await detalhe(detalheAberto.id));
  }

  async function duplicarSelecionado() {
    if (!detalheAberto) return;
    await executarAcao(() => duplicar(detalheAberto.id), 'Padrão duplicado como rascunho.');
  }

  async function alternarAtivo() {
    if (!detalheAberto) return;
    const ativo = !detalheAberto.ativo;
    const ok = await executarAcao(() => alterarAtivo(detalheAberto.id, ativo), ativo ? 'Padrão ativado.' : 'Padrão inativado.');
    if (ok) setDetalheAberto({ ...detalheAberto, ativo });
  }

  async function confirmarExclusao() {
    if (!aExcluir) return;
    const resultado = await excluir(aExcluir.id);
    toast(resultado.ok ? 'Padrão excluído.' : resultado.mensagem, resultado.ok ? 'info' : 'danger');
    if (resultado.ok) {
      if (selecionadoId === aExcluir.id) {
        setSelecionadoId(null);
        setDetalheAberto(null);
      }
      setAExcluir(null);
    }
  }

  async function abrirHistorico(padrao: PadraoOperacional) {
    setHistorico({ nome: padrao.nome, versoes: await versoes(padrao.id) });
  }

  const padraoAtual = detalheAberto && detalheAberto.id === selecionadoId ? detalheAberto : padroes.find((padrao) => padrao.id === selecionadoId) || null;

  return <div className="padroes-page">
    <div className="padroes-page-header"><div><div className="padroes-breadcrumb"><span>Cartão Ordinário</span><span>/</span><strong>Cartões Programa Padrão</strong></div><h2>Cartões Programa Padrão</h2><p>Organize padrões por bairro, viatura e roteiro para montar os serviços com segurança.</p></div><button type="button" className="btn btn-primary" onClick={() => setForm({ modo: 'novo' })}><Plus /> Novo cartão padrão</button></div>
    <div className="padroes-toolbar"><label className="padroes-search"><Search /><input aria-label="Buscar cartão padrão" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, bairro ou missão..." /></label><div className="padroes-filtros">{FILTROS.map((item) => <button key={item.id} type="button" className={filtro === item.id ? 'ativo' : ''} onClick={() => setFiltro(item.id)}>{item.label}</button>)}</div></div>
    {erro && <div className="padroes-erro" role="alert">{erro}<button type="button" onClick={() => window.location.reload()}>Tentar novamente</button></div>}
    {carregando ? <div className="padroes-loading"><LoaderCircle className="spin" /><span>Carregando cartões padrão...</span></div> : padroesFiltrados.length === 0 && !form ? <div className="padroes-vazio"><Archive /><h3>Nenhum cartão padrão encontrado</h3><p>Crie o primeiro padrão para montar o Cartão Ordinário.</p><button type="button" className="btn btn-secondary" onClick={() => setForm({ modo: 'novo' })}><Plus /> Criar cartão padrão</button></div> : <div className="padroes-workspace">
      <aside className="padroes-biblioteca" aria-label="Lista de cartões padrão"><div className="padroes-biblioteca-cabecalho"><div><strong>Padrões disponíveis</strong><span>Selecione para visualizar</span></div><b>{padroesFiltrados.length}</b></div><div className="padroes-lista">{padroesFiltrados.map((padrao) => <button type="button" className={`padrao-lista-item${padrao.id === selecionadoId ? ' selecionado' : ''}${!padrao.ativo ? ' inativo' : ''}`} key={padrao.id} aria-pressed={padrao.id === selecionadoId} onClick={() => void selecionar(padrao)}><span className="padrao-lista-item-top"><strong>{padrao.nome}</strong><span className={`padrao-status ${padrao.ativo ? 'ativo' : 'inativo'}`}>{padrao.ativo ? 'Ativo' : 'Inativo'}</span></span><span className="padrao-lista-item-meta"><span>{labelCategoria(padrao.categoria)}</span><span>{(padrao.componentes || []).length} VTR(s)</span></span><span className="padrao-lista-item-bairros">{padrao.bairros?.join(' + ') || 'Sem bairro relacionado'}</span></button>)}</div></aside>
    <main>{form ? <FormPadrao modo={form.modo} inicial={form.padrao ? payloadDoPadrao(form.padrao) : VAZIO} bairrosDisponiveis={bairros} salvando={salvando} onFechar={() => setForm(null)} onSalvar={salvar} /> : padraoAtual ? <DetalhePadrao padrao={padraoAtual} onEditar={() => void abrirEdicao(padraoAtual)} onDuplicar={() => void duplicarSelecionado()} onPublicar={() => void publicarSelecionado()} onAlternarAtivo={() => void alternarAtivo()} onHistorico={() => void abrirHistorico(padraoAtual)} onExcluir={() => setAExcluir(padraoAtual)} /> : <div className="padroes-detalhe-vazio"><Eye /><h3>Selecione um cartão padrão</h3><p>Os bairros, viaturas e roteiros aparecerão aqui.</p></div>}</main>
    </div>}
    {historico && <HistoricoPadrao nome={historico.nome} versoes={historico.versoes} onFechar={() => setHistorico(null)} />}
    {aExcluir && <ModalConfirmarExclusaoForte titulo="Excluir cartão padrão" aviso={`O padrão “${aExcluir.nome}” será removido apenas da biblioteca de padrões, junto com suas ${aExcluir.componentes?.length || 0} viatura(s). Cartões de serviço, históricos e snapshots já aplicados não serão alterados.`} label="Digite o nome do padrão para confirmar:" valorEsperado={aExcluir.nome} onFechar={() => setAExcluir(null)} onConfirmar={() => void confirmarExclusao()} />}
  </div>;
}
