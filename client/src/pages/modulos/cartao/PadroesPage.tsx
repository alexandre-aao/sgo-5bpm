import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Archive, ArrowDown, ArrowLeft, ArrowUp, Check, ChevronDown, ChevronRight, Copy,
  History, Info, LoaderCircle, MapPin, MoreHorizontal, Pencil, Plus, RotateCcw, Route,
  Search, Trash2, Truck, X,
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
import { ATIVIDADES_CARTAO } from './constantes';
import { contarPbsComponentes } from '../../../lib/padroesOperacionais';

const FILTROS = [
  { id: 'todos', label: 'Todos' },
  { id: 'bairro', label: 'Bairro' },
  { id: 'especializado', label: 'Especializado' },
  { id: 'reforco', label: 'Reforço' },
  { id: 'missao', label: 'Missão' },
] as const;

const ATIVIDADES_PADRAO = ['CPB', 'QTL', ...ATIVIDADES_CARTAO];

const VAZIO: PadraoPayload = {
  nome: '', categoria: 'bairro', descricao: '', horario_inicio: '07:00', horario_fim: '19:00', bairros: [], componentes: [],
};

function labelCategoria(categoria: string | null | undefined) {
  return FILTROS.find((item) => item.id === categoria)?.label || categoria || 'Padrão';
}

function slugCategoria(categoria: string | null | undefined) {
  return String(categoria || 'bairro').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'bairro';
}

function hora(valor: string | null | undefined) {
  return valor ? valor.replace(':', 'h') : '—';
}

function formatarData(data: string | null | undefined, comHora = false) {
  if (!data) return 'Sem atualização';
  const valor = new Date(data);
  if (Number.isNaN(valor.getTime())) return 'Sem atualização';
  return valor.toLocaleDateString('pt-BR', comHora ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' } : undefined);
}

function idLocal(prefixo: string) {
  return `${prefixo}-${Date.now()}-${Math.round(Math.random() * 10000)}`;
}

function novoItem(): ItemRoteiroPadrao {
  return { id: idLocal('item'), inicio: '', fim: '', local: '', atividade: 'CPB', observacao: '' };
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
    bairros_ids: [...(componente.bairros_ids || [])],
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
  const bairrosAtivos = bairrosDisponiveis.filter((bairro) => bairro.ativo !== false);
  const bairrosNomes = bairrosAtivos.map((bairro) => bairro.nome_bairro);
  const [bairrosSelecionados, setBairrosSelecionados] = useState(() => inicial.bairros.filter((bairro) => bairrosNomes.includes(bairro)));
  const [bairrosLivres, setBairrosLivres] = useState(() => inicial.bairros.filter((bairro) => !bairrosNomes.includes(bairro)).join(', '));
  const [buscaBairro, setBuscaBairro] = useState('');
  const [erroForm, setErroForm] = useState<string | null>(null);
  const bairrosLivresNormalizados = bairrosLivres.split(',').map((item) => item.trim()).filter(Boolean);
  const bairrosTotais = [...new Set([...bairrosSelecionados, ...bairrosLivresNormalizados])];
  const quantidadePbs = contarPbsComponentes(form.componentes);
  const bairrosFiltrados = bairrosAtivos.filter((bairro) => bairro.nome_bairro.toLocaleLowerCase('pt-BR').includes(buscaBairro.trim().toLocaleLowerCase('pt-BR')));

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

  function removerBairro(bairro: string) {
    setBairrosSelecionados((atual) => atual.filter((item) => item !== bairro));
    setBairrosLivres((atual) => atual.split(',').map((item) => item.trim()).filter((item) => item && item !== bairro).join(', '));
  }

  function alternarBairroComponente(indice: number, bairroId: string) {
    const componente = form.componentes?.[indice];
    const atuais = componente?.bairros_ids || [];
    if (!atuais.includes(bairroId) && atuais.length >= 3) {
      setErroForm('Cada viatura pode possuir no máximo 3 bairros relacionados.');
      return;
    }
    setErroForm(null);
    atualizarComponente(indice, { bairros_ids: atuais.includes(bairroId) ? atuais.filter((id) => id !== bairroId) : [...atuais, bairroId] });
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
    void onSalvar({ ...form, bairros: bairrosTotais, componentes: form.componentes || [] });
  }

  return (
    <section className="padroes-detalhe padrao-edicao-inline" aria-label={modo === 'editar' ? `Editando o padrão ${inicial.nome}` : 'Novo cartão padrão'}>
      <div className="padroes-detalhe-cabecalho">
        <div><div className="padrao-detalhe-kicker"><span className="padrao-status ativo">Edição inline</span></div><h2 id="titulo-form-padrao">{modo === 'editar' ? 'Editar cartão padrão' : 'Novo cartão padrão'}</h2><p>Altere o modelo diretamente neste painel. Cancelar descarta todas as mudanças locais.</p></div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onFechar}><X /> Cancelar</button>
      </div>
      <form onSubmit={enviar}>
        <div className="padrao-form-secao">
          <div className="padrao-form-secao-titulo"><strong>Identificação do padrão</strong><span>Esta configuração serve como base independente para futuros cartões de serviço.</span></div>
          <div className="form-row">
            <div className="form-group col-md-8"><label htmlFor="padrao-nome">Nome *</label><input id="padrao-nome" required maxLength={120} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Lagoa Nova ou Força Tática" /></div>
            <div className="form-group col-md-4"><label htmlFor="padrao-categoria">Tipo / categoria</label><input id="padrao-categoria" list="categorias-padrao" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} /><datalist id="categorias-padrao">{FILTROS.filter((item) => item.id !== 'todos').map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</datalist></div>
          </div>
          <div className="form-row">
            <div className="form-group col-md-6"><label htmlFor="padrao-inicio">Horário de início</label><input id="padrao-inicio" type="time" value={form.horario_inicio} onChange={(e) => setForm({ ...form, horario_inicio: e.target.value })} /></div>
            <div className="form-group col-md-6"><label htmlFor="padrao-fim">Horário de fim</label><input id="padrao-fim" type="time" value={form.horario_fim} onChange={(e) => setForm({ ...form, horario_fim: e.target.value })} /></div>
          </div>
          <fieldset className="padrao-bairros-selector">
            <legend>Bairros relacionados</legend>
            <div className="padrao-bairros-selector-top"><span>Selecione até 3 bairros para este padrão.</span><strong>{bairrosTotais.length}/3</strong></div>
            <div className="padrao-bairros-chips">{bairrosTotais.length === 0 ? <span className="padrao-bairros-vazio">Nenhum bairro selecionado</span> : bairrosTotais.map((bairro) => <button type="button" className="padrao-bairro-chip" key={bairro} onClick={() => removerBairro(bairro)} title={`Remover ${bairro}`}>{bairro}<X /></button>)}</div>
            <label className="padroes-search padrao-bairro-busca"><Search /><input aria-label="Buscar bairro relacionado" value={buscaBairro} onChange={(e) => setBuscaBairro(e.target.value)} placeholder="Buscar bairro para adicionar..." /></label>
            <div className="padrao-bairros-opcoes" aria-label="Bairros disponíveis">{bairrosFiltrados.slice(0, 12).map((bairro) => { const selecionado = bairrosSelecionados.includes(bairro.nome_bairro); return <button type="button" className={`padrao-bairro-opcao${selecionado ? ' selecionado' : ''}`} key={bairro.id} disabled={!selecionado && bairrosTotais.length >= 3} onClick={() => alternarBairro(bairro.nome_bairro)}><span>{bairro.nome_bairro}</span>{selecionado && <Check />}</button>; })}</div>
            <span className="texto-auxiliar">Também é possível informar locais livres separados por vírgula abaixo.</span>
          </fieldset>
          <div className="form-row">
            <div className="form-group col-md-4"><label htmlFor="padrao-pbs">PBs calculados</label><output id="padrao-pbs" className="padrao-pbs-calculados"><strong>{quantidadePbs}</strong><span>dos itens do roteiro</span></output></div>
            <div className="form-group col-md-8"><label htmlFor="padrao-outros-bairros">Outros bairros / locais</label><input id="padrao-outros-bairros" value={bairrosLivres} onChange={(e) => setBairrosLivres(e.target.value)} placeholder="Separe por vírgula" /></div>
          </div>
          <div className="form-group"><label htmlFor="padrao-descricao">Observações / missão</label><textarea id="padrao-descricao" rows={3} maxLength={500} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
        </div>

        <div className="padrao-form-secao">
          <div className="padrao-form-secao-cabecalho"><div className="padrao-form-secao-titulo"><strong>Viaturas e roteiros</strong><span>Configure os componentes e todos os itens do roteiro neste mesmo contexto.</span></div><button type="button" className="btn btn-secondary btn-sm" onClick={adicionarComponente}><Plus /> Adicionar viatura</button></div>
          {(form.componentes || []).length === 0 ? <div className="padrao-editor-vazio"><Archive /><span>Nenhuma viatura configurada. Adicione a primeira acima.</span></div> : <div className="padrao-componentes-editor">{(form.componentes || []).map((componente, indice) => {
            const bairrosComponente = componente.bairros_ids || [];
            return <div className="padrao-componente-editor" key={componente.id}>
              <div className="padrao-componente-editor-cabecalho"><strong>Viatura {indice + 1}</strong><div className="acoes-linha"><button type="button" className="btn-icon btn-sm" title="Mover viatura para cima" aria-label="Mover viatura para cima" disabled={indice === 0} onClick={() => moverComponente(indice, -1)}><ArrowUp /></button><button type="button" className="btn-icon btn-sm" title="Mover viatura para baixo" aria-label="Mover viatura para baixo" disabled={indice === (form.componentes || []).length - 1} onClick={() => moverComponente(indice, 1)}><ArrowDown /></button><button type="button" className="btn-icon btn-sm btn-icon-danger" title="Remover viatura" aria-label="Remover viatura" onClick={() => removerComponente(indice)}><Trash2 /></button></div></div>
              <div className="form-row">
                <div className="form-group col-md-3"><label>Prefixo / identificação *</label><input required value={componente.prefixo} onChange={(e) => atualizarComponente(indice, { prefixo: e.target.value })} placeholder="VTR 01" /></div>
                <div className="form-group col-md-3"><label>Setor / bairro</label><input value={componente.setor} onChange={(e) => atualizarComponente(indice, { setor: e.target.value })} /></div>
                <div className="form-group col-md-3"><label>Companhia</label><input value={componente.companhia} onChange={(e) => atualizarComponente(indice, { companhia: e.target.value })} /></div>
                <div className="form-group col-md-3"><label>Categoria</label><input value={componente.categoria} onChange={(e) => atualizarComponente(indice, { categoria: e.target.value })} /></div>
              </div>
              <details className="padrao-componente-bairros"><summary>Bairros vinculados <strong>{bairrosComponente.length}/3</strong></summary><div className="padrao-componente-bairros-opcoes">{bairrosAtivos.map((bairro) => { const selecionado = bairrosComponente.includes(bairro.id); return <button type="button" className={`padrao-bairro-opcao${selecionado ? ' selecionado' : ''}`} key={bairro.id} disabled={!selecionado && bairrosComponente.length >= 3} onClick={() => alternarBairroComponente(indice, bairro.id)}><span>{bairro.nome_bairro}</span>{selecionado && <Check />}</button>; })}</div></details>
              <div className="form-group"><label>Observação da viatura</label><input value={componente.observacao} onChange={(e) => atualizarComponente(indice, { observacao: e.target.value })} /></div>
              <div className="padrao-roteiro-editor"><div className="padrao-roteiro-editor-cabecalho"><strong>Itens de roteiro ({componente.itens.length})</strong><button type="button" className="btn btn-secondary btn-sm" onClick={() => adicionarItem(indice)}><Plus /> Adicionar item</button></div>{componente.itens.length === 0 ? <p className="texto-auxiliar">Nenhum item. Adicione local, horário e tipo de patrulhamento.</p> : <div className="padrao-roteiro-linhas">{componente.itens.map((item, indiceItem) => { const atividadesItem = [...new Set([...ATIVIDADES_PADRAO, item.atividade].filter(Boolean))]; return <div className="padrao-roteiro-linha" key={item.id}><input aria-label={`Início do item ${indiceItem + 1}`} required type="time" value={item.inicio} onChange={(e) => atualizarItem(indice, indiceItem, { inicio: e.target.value })} /><input aria-label={`Fim do item ${indiceItem + 1}`} required type="time" value={item.fim} onChange={(e) => atualizarItem(indice, indiceItem, { fim: e.target.value })} /><input aria-label={`Local do item ${indiceItem + 1}`} required placeholder="Local / itinerário" value={item.local} onChange={(e) => atualizarItem(indice, indiceItem, { local: e.target.value })} /><select aria-label={`Atividade do item ${indiceItem + 1}`} value={item.atividade} onChange={(e) => atualizarItem(indice, indiceItem, { atividade: e.target.value })}>{atividadesItem.map((atividade) => <option key={atividade}>{atividade}</option>)}</select><input aria-label={`Observação do item ${indiceItem + 1}`} placeholder="Observação (opcional)" value={item.observacao || ''} onChange={(e) => atualizarItem(indice, indiceItem, { observacao: e.target.value })} /><button type="button" className="btn-icon btn-sm btn-icon-danger" title="Remover item" aria-label="Remover item" onClick={() => removerItem(indice, indiceItem)}><Trash2 /></button></div>; })}</div>}</div>
            </div>;
          })}</div>}
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
  return <div className="padrao-roteiro-visualizacao"><div className="padrao-roteiro-visualizacao-cabecalho"><span>Horário</span><span>Local</span><span>Atividade</span><span>Observações</span></div>{itens.map((item) => <div className="padrao-roteiro-visualizacao-linha" key={item.id}><span className="padrao-roteiro-celula"><small>Horário</small><strong>{hora(item.inicio)}{item.fim ? `–${hora(item.fim)}` : ''}</strong></span><span className="padrao-roteiro-celula"><small>Local</small><span>{item.local || 'Local não informado'}</span></span><span className="padrao-roteiro-celula"><small>Atividade</small><span className="padrao-atividade-badge">{item.atividade || 'CPB'}</span></span><span className="padrao-roteiro-celula"><small>Observações</small><span>{item.observacao || '—'}</span></span></div>)}</div>;
}

function HistoricoPadrao({ nome, versoes, onFechar }: { nome: string; versoes: VersaoPadrao[]; onFechar: () => void }) {
  return <div className="modal-overlay" role="presentation"><div className="modal-box padrao-historico-modal" role="dialog" aria-modal="true" aria-labelledby="titulo-historico-padrao"><div className="modal-header"><h3 id="titulo-historico-padrao"><History /> Histórico de versões</h3><button type="button" className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button></div><p className="padrao-historico-subtitulo">{nome}</p>{versoes.length === 0 ? <div className="padrao-historico-vazio"><Archive /><p>Nenhuma versão publicada ainda.</p></div> : <div className="padrao-versoes-lista">{versoes.map((versao, indice) => <div className={`padrao-versao-linha${indice === 0 ? ' atual' : ''}`} key={`${versao.id || nome}-${versao.versao}`}><span className="padrao-versao-numero">v{versao.versao}</span><span>{versao.criado_em ? new Date(versao.criado_em).toLocaleString('pt-BR') : 'Data não informada'}</span><span className="padrao-versao-autor">{indice === 0 ? 'Atual' : (versao.criado_por || 'P3')}</span></div>)}</div>}<div className="form-actions form-actions-modal"><button type="button" className="btn btn-secondary" onClick={onFechar}>Fechar</button></div></div></div>;
}

function PainelLateralPadrao({ padrao, versoes, onHistorico }: { padrao: PadraoOperacional; versoes: VersaoPadrao[]; onHistorico: () => void }) {
  const bairros = padrao.bairros || [];
  const setores = [...new Set((padrao.componentes || []).map((componente) => componente.setor).filter(Boolean))];
  const versaoAtual = padrao.versao_publicada || padrao.versao || 0;
  const versoesRecentes = versoes.filter((versao) => versao.versao !== versaoAtual).slice(0, 3);
  return <aside className="padroes-detalhe-lateral" aria-label="Informações secundárias do padrão">
    <section className="padrao-lateral-secao"><h3>Observações do padrão</h3><p>{padrao.descricao || 'Nenhuma observação cadastrada.'}</p></section>
    <section className="padrao-lateral-secao"><h3>Cobertura do padrão</h3><div className="padrao-lateral-chips">{bairros.length ? bairros.map((bairro) => <span key={bairro}><MapPin />{bairro}</span>) : <span className="padrao-lateral-vazio">Sem bairro relacionado</span>}</div>{setores.length > 0 && <><strong className="padrao-lateral-label">Setores/localidades</strong><div className="padrao-lateral-lista">{setores.map((setor) => <span key={setor}>{setor}</span>)}</div></>}</section>
    <section className="padrao-lateral-secao padrao-lateral-historico"><div className="padrao-lateral-secao-topo"><h3>Histórico recente</h3><History /></div><div className="padrao-lateral-versoes">{versaoAtual > 0 && <div className="padrao-lateral-versao atual"><strong>v{versaoAtual}</strong><span>{padrao.publicado ? 'Publicado · Atual' : 'Rascunho atual'}</span></div>}{versoesRecentes.map((versao) => <div className="padrao-lateral-versao" key={versao.id || versao.versao}><strong>v{versao.versao}</strong><span>{versao.criado_em ? formatarData(versao.criado_em) : 'Versão publicada'}</span></div>)}{versaoAtual === 0 && versoesRecentes.length === 0 && <span className="padrao-lateral-vazio">Nenhuma versão publicada.</span>}</div><button type="button" className="btn btn-link btn-sm" onClick={onHistorico}>Ver todas as versões <ChevronRight /></button></section>
  </aside>;
}

function DetalhePadrao({
  padrao, versoesRecentes, onVoltar, onEditar, onDuplicar, onPublicar, onAlternarAtivo, onHistorico, onExcluir,
}: {
  padrao: PadraoOperacional;
  versoesRecentes: VersaoPadrao[];
  onVoltar: () => void;
  onEditar: () => void;
  onDuplicar: () => void;
  onPublicar: () => void;
  onAlternarAtivo: () => void;
  onHistorico: () => void;
  onExcluir: () => void;
}) {
  const componentes = padrao.componentes || [];
  const quantidadePbs = contarPbsComponentes(componentes);
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set(componentes[0]?.id ? [componentes[0].id] : []));
  const [menuAberto, setMenuAberto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAbertas(new Set(componentes[0]?.id ? [componentes[0].id] : []));
  }, [padrao.id]);

  useEffect(() => {
    if (!menuAberto) return undefined;
    function fecharMenu(evento: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(evento.target as Node)) setMenuAberto(false);
    }
    document.addEventListener('mousedown', fecharMenu);
    return () => document.removeEventListener('mousedown', fecharMenu);
  }, [menuAberto]);

  function alternarAccordion(id: string) {
    setAbertas((atual) => { const proxima = new Set(atual); if (proxima.has(id)) proxima.delete(id); else proxima.add(id); return proxima; });
  }

  return <section className="padroes-detalhe-view" aria-label={`Detalhes do padrão ${padrao.nome}`}>
    <button type="button" className="padroes-voltar" onClick={onVoltar}><ArrowLeft /> Voltar para biblioteca</button>
    <div className="padroes-detalhe-cabecalho">
      <div><div className="padrao-detalhe-kicker"><span className={`padrao-categoria categoria-${slugCategoria(padrao.categoria)}`}>{labelCategoria(padrao.categoria)}</span><span className={`padrao-status ${padrao.ativo ? 'ativo' : 'inativo'}`}>{padrao.ativo ? 'Ativo' : 'Inativo'}</span><span className={`padrao-status ${padrao.publicado ? 'publicado' : 'rascunho'}`}>{padrao.publicado ? `Publicado · v${padrao.versao_publicada || padrao.versao || 1}` : 'Rascunho'}</span></div><h2>{padrao.nome}</h2><p>Modelo-base utilizado como biblioteca para montagem do Cartão Programa do dia.</p></div>
      <div className="padroes-detalhe-acoes"><button type="button" className="btn btn-primary btn-sm" onClick={onEditar}><Pencil /> Editar padrão</button><button type="button" className="btn btn-secondary btn-sm" onClick={onDuplicar}><Copy /> Duplicar</button><button type="button" className="btn btn-secondary btn-sm" onClick={onHistorico}><History /> Histórico</button><button type="button" className="btn btn-secondary btn-sm" onClick={onPublicar}>{padrao.publicado ? <RotateCcw /> : <Check />} {padrao.publicado ? 'Republicar' : 'Publicar'}</button><div className="padrao-acoes-menu" ref={menuRef}><button type="button" className="btn-icon btn-sm" title="Mais ações" aria-label="Mais ações" aria-haspopup="menu" aria-expanded={menuAberto} onClick={() => setMenuAberto((atual) => !atual)}><MoreHorizontal /></button>{menuAberto && <div className="padrao-acoes-menu-lista" role="menu"><button type="button" role="menuitem" onClick={() => { setMenuAberto(false); onAlternarAtivo(); }}>{padrao.ativo ? 'Inativar padrão' : 'Ativar padrão'}</button><button type="button" role="menuitem" className="perigoso" onClick={() => { setMenuAberto(false); onExcluir(); }}><Trash2 /> Excluir padrão</button></div>}</div></div>
    </div>
    <div className="padroes-independencia"><Info /><span>Este padrão é um modelo de biblioteca. Alterações realizadas aqui não modificam cartões de serviço já criados.</span></div>
    <div className="padroes-detalhe-grid">
      <div className="padroes-detalhe-conteudo">
        <div className="padroes-detalhe-metadados"><span><strong>Viaturas</strong><b>{componentes.length}</b></span><span><strong>PBs</strong><b>{quantidadePbs}</b></span><span><strong>Itens de roteiro</strong><b>{componentes.reduce((total, componente) => total + componente.itens.length, 0)}</b></span><span><strong>Período padrão</strong><b>{hora(padrao.horario_inicio)} às {hora(padrao.horario_fim)}</b></span><span><strong>Última atualização</strong><b>{formatarData(padrao.atualizado_em)}</b></span></div>
        <div className="padroes-detalhe-bairros"><div><strong>Bairros relacionados</strong><span className="padrao-contador-bairros">{(padrao.bairros || []).length}/3</span></div><div className="padrao-bairros-chips">{(padrao.bairros || []).length ? padrao.bairros?.map((bairro) => <span className="padrao-bairro-chip" key={bairro}>{bairro}</span>) : <span className="padrao-bairros-vazio">Nenhum bairro relacionado</span>}</div></div>
        <div className="padroes-detalhe-roteiros"><div className="padroes-detalhe-roteiros-cabecalho"><div><h3>Viaturas e roteiros</h3><p>Fotografia atual deste cartão padrão. Os cartões de serviço recebem uma cópia independente.</p></div><span className="padrao-roteiros-contador">{componentes.length} {componentes.length === 1 ? 'viatura' : 'viaturas'}</span></div>{componentes.length === 0 ? <div className="padrao-editor-vazio"><Archive /><span>Este padrão ainda não possui viaturas ou roteiro.</span></div> : <div className="padrao-viaturas-visualizacao">{componentes.map((componente, indice) => <article className={`padrao-viatura-visualizacao${abertas.has(componente.id) ? ' aberto' : ''}`} key={componente.id}><button type="button" className="padrao-viatura-visualizacao-trigger" aria-expanded={abertas.has(componente.id)} onClick={() => alternarAccordion(componente.id)}><span className="padrao-viatura-numero">{String(indice + 1).padStart(2, '0')}</span><span className="padrao-viatura-identidade"><strong>{componente.prefixo || `VTR ${indice + 1}`}</strong><span>{componente.setor || 'Setor não informado'}{componente.companhia ? ` · ${componente.companhia}` : ''}</span></span><span className="padrao-viatura-contador">{componente.itens.length} {componente.itens.length === 1 ? 'item' : 'itens'}</span><ChevronDown className="padrao-accordion-icone" /></button>{abertas.has(componente.id) && <div className="padrao-viatura-visualizacao-conteudo"><div className="padrao-viatura-ficha"><span><strong>Prefixo</strong>{componente.prefixo || 'Não informado'}</span><span><strong>Setor / bairro</strong>{componente.setor || 'Não informado'}</span><span><strong>Companhia</strong>{componente.companhia || 'Não informada'}</span><span><strong>Categoria</strong>{componente.categoria || 'Não informada'}</span></div>{componente.observacao && <p className="padrao-viatura-observacao"><strong>Observação:</strong> {componente.observacao}</p>}<RoteiroVisualizacao itens={componente.itens} /></div>}</article>)}</div>}</div>
      </div>
      <PainelLateralPadrao padrao={padrao} versoes={versoesRecentes} onHistorico={onHistorico} />
    </div>
  </section>;
}

function CartaoResumo({ icone, valor, rotulo, detalhe }: { icone: ReactNode; valor: string | number; rotulo: string; detalhe: string }) {
  return <div className="padroes-resumo-item"><span className="padroes-resumo-icone">{icone}</span><div><strong>{valor}</strong><span>{rotulo}</span><small>{detalhe}</small></div></div>;
}

export default function PadroesPage() {
  const { toast } = useToast();
  const { bairros } = useBairros();
  const { padroes, carregando, erro, criar, atualizar, publicar, duplicar, alterarAtivo, excluir, detalhe, versoes } = usePadroesOperacionais();
  const [parametros, setParametros] = useSearchParams();
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<string>('todos');
  const [filtroBairro, setFiltroBairro] = useState('');
  const [ordenacao, setOrdenacao] = useState<'nome' | 'atualizado'>('nome');
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [detalheAberto, setDetalheAberto] = useState<PadraoOperacional | null>(null);
  const [form, setForm] = useState<{ modo: 'novo' | 'editar'; padrao?: PadraoOperacional } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [historico, setHistorico] = useState<{ nome: string; versoes: VersaoPadrao[] } | null>(null);
  const [versoesRecentes, setVersoesRecentes] = useState<VersaoPadrao[]>([]);
  const [aExcluir, setAExcluir] = useState<PadraoOperacional | null>(null);
  const idSelecaoSolicitado = parametros.get('padraoId');
  const selecaoEmAndamento = useRef<string | null>(null);

  const bairrosCatalogo = useMemo(() => [...new Set(padroes.flatMap((padrao) => padrao.bairros || []))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [padroes]);
  const resumo = useMemo(() => {
    const componentes = padroes.flatMap((padrao) => padrao.componentes || []);
    const atualizacoes = padroes.map((padrao) => padrao.atualizado_em).filter(Boolean).map((data) => new Date(data as string)).filter((data) => !Number.isNaN(data.getTime()));
    return {
      bairros: new Set(padroes.flatMap((padrao) => padrao.bairros || [])).size,
      viaturas: componentes.length,
      roteiros: componentes.reduce((total, componente) => total + componente.itens.length, 0),
      ultimaAtualizacao: atualizacoes.sort((a, b) => b.getTime() - a.getTime())[0]?.toISOString(),
    };
  }, [padroes]);
  const padroesFiltrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    return [...padroes].filter((padrao) => {
      const texto = [padrao.nome, padrao.descricao, ...(padrao.bairros || [])].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
      const bairroOk = !filtroBairro || (padrao.bairros || []).includes(filtroBairro);
      return (!termo || texto.includes(termo)) && (filtro === 'todos' || padrao.categoria === filtro) && bairroOk;
    }).sort((a, b) => ordenacao === 'atualizado' ? String(b.atualizado_em || '').localeCompare(String(a.atualizado_em || '')) : a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [busca, filtro, filtroBairro, ordenacao, padroes]);

  const selecionar = useCallback(async (padrao: PadraoOperacional, editar = false) => {
    selecaoEmAndamento.current = padrao.id;
    setSelecionadoId(padrao.id);
    setForm(null);
    const completo = await detalhe(padrao.id);
    const atual = completo || padrao;
    if (selecaoEmAndamento.current !== padrao.id) return;
    setDetalheAberto(atual);
    setVersoesRecentes(await versoes(padrao.id));
    setParametros((atuais) => { const proximo = new URLSearchParams(atuais); proximo.set('padraoId', padrao.id); proximo.delete('editar'); return proximo; });
    if (editar) setForm({ modo: 'editar', padrao: atual });
  }, [detalhe, setParametros, versoes]);

  useEffect(() => {
    if (selecaoEmAndamento.current === 'biblioteca') {
      if (!idSelecaoSolicitado) selecaoEmAndamento.current = null;
      return;
    }
    const padraoSolicitado = idSelecaoSolicitado ? padroes.find((padrao) => padrao.id === idSelecaoSolicitado) : null;
    if (padraoSolicitado && selecionadoId !== padraoSolicitado.id) {
      // A navegação de Editar no Cartão Ordinário chega com o id do padrão.
      void selecionar(padraoSolicitado, parametros.get('editar') === '1');
    }
    if (selecionadoId && !padroes.some((padrao) => padrao.id === selecionadoId)) {
      setSelecionadoId(null);
      setDetalheAberto(null);
      setVersoesRecentes([]);
    }
  }, [idSelecaoSolicitado, padroes, parametros, selecionadoId, selecionar]);

  async function salvar(payload: PadraoPayload) {
    setSalvando(true);
    const resultado = form?.modo === 'editar' && form.padrao ? await atualizar(form.padrao.id, payload) : await criar(payload);
    setSalvando(false);
    if (!resultado.ok) { toast(resultado.mensagem, 'danger'); return; }
    setForm(null);
    toast('Cartão padrão salvo como rascunho.', 'success');
    if (resultado.padrao) {
      setSelecionadoId(resultado.padrao.id);
      setDetalheAberto(resultado.padrao);
      setVersoesRecentes([]);
      setParametros((atuais) => { const proximo = new URLSearchParams(atuais); proximo.set('padraoId', resultado.padrao?.id || ''); proximo.delete('editar'); return proximo; });
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
    if (ok) { setDetalheAberto(await detalhe(detalheAberto.id)); setVersoesRecentes(await versoes(detalheAberto.id)); }
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
      selecaoEmAndamento.current = 'biblioteca';
      setSelecionadoId(null); setDetalheAberto(null); setVersoesRecentes([]); setAExcluir(null);
      setParametros((atuais) => { const proximo = new URLSearchParams(atuais); proximo.delete('padraoId'); proximo.delete('editar'); return proximo; });
    }
  }

  async function abrirHistorico(padrao: PadraoOperacional) {
    setHistorico({ nome: padrao.nome, versoes: await versoes(padrao.id) });
  }

  function voltarBiblioteca() {
    selecaoEmAndamento.current = 'biblioteca';
    setForm(null); setSelecionadoId(null); setDetalheAberto(null); setVersoesRecentes([]);
    setParametros((atuais) => { const proximo = new URLSearchParams(atuais); proximo.delete('padraoId'); proximo.delete('editar'); return proximo; });
  }

  const padraoAtual = detalheAberto && detalheAberto.id === selecionadoId ? detalheAberto : padroes.find((padrao) => padrao.id === selecionadoId) || null;

  return <div className="padroes-page">
    {!padraoAtual && <div className="padroes-page-header"><div><div className="padroes-breadcrumb"><span>Cartão Programa</span><span>/</span><strong>Padrões operacionais</strong></div><h2>Cartão Programa Padrão</h2><p>Biblioteca de modelos operacionais para montar o Cartão Programa do dia.</p></div><button type="button" className="btn btn-primary" onClick={() => setForm({ modo: 'novo' })}><Plus /> Novo padrão</button></div>}
    {erro && <div className="padroes-erro" role="alert">{erro}<button type="button" onClick={() => window.location.reload()}>Tentar novamente</button></div>}
    {carregando ? <div className="padroes-loading"><LoaderCircle className="spin" /><span>Carregando padrões operacionais...</span></div> : form ? <FormPadrao modo={form.modo} inicial={form.padrao ? payloadDoPadrao(form.padrao) : VAZIO} bairrosDisponiveis={bairros} salvando={salvando} onFechar={() => setForm(null)} onSalvar={salvar} /> : padraoAtual ? <DetalhePadrao padrao={padraoAtual} versoesRecentes={versoesRecentes} onVoltar={voltarBiblioteca} onEditar={() => void abrirEdicao(padraoAtual)} onDuplicar={() => void duplicarSelecionado()} onPublicar={() => void publicarSelecionado()} onAlternarAtivo={() => void alternarAtivo()} onHistorico={() => void abrirHistorico(padraoAtual)} onExcluir={() => setAExcluir(padraoAtual)} /> : <section className="padroes-biblioteca-view" aria-label="Biblioteca de padrões operacionais">
      <div className="padroes-info"><Info /><span>Estes são os padrões disponíveis para serem utilizados na montagem do Cartão Programa do dia. Crie, edite ou gerencie os roteiros e viaturas-base.</span></div>
      <div className="padroes-resumo"><CartaoResumo icone={<Archive />} valor={padroes.length} rotulo="Padrões cadastrados" detalhe="Na biblioteca" /><CartaoResumo icone={<MapPin />} valor={resumo.bairros} rotulo="Bairros únicos" detalhe="Relacionados aos padrões" /><CartaoResumo icone={<Truck />} valor={resumo.viaturas} rotulo="Viaturas totais" detalhe="Em todos os padrões" /><CartaoResumo icone={<Route />} valor={resumo.roteiros} rotulo="Roteiros padrão" detalhe="Itens cadastrados" /><CartaoResumo icone={<History />} valor={formatarData(resumo.ultimaAtualizacao)} rotulo="Última atualização" detalhe="Fonte da biblioteca" /></div>
      <div className="padroes-biblioteca-toolbar"><label className="padroes-search"><Search /><input aria-label="Buscar padrão" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite o nome do padrão, bairro ou descrição..." /></label><label className="padroes-filtro-select"><span>Tipo de padrão</span><select value={filtro} onChange={(e) => setFiltro(e.target.value)}>{FILTROS.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label><label className="padroes-filtro-select"><span>Bairro</span><select value={filtroBairro} onChange={(e) => setFiltroBairro(e.target.value)}><option value="">Todos</option>{bairrosCatalogo.map((bairro) => <option value={bairro} key={bairro}>{bairro}</option>)}</select></label><label className="padroes-filtro-select"><span>Ordenar por</span><select value={ordenacao} onChange={(e) => setOrdenacao(e.target.value as 'nome' | 'atualizado')}><option value="nome">Nome (A–Z)</option><option value="atualizado">Última atualização</option></select></label></div>
      <div className="padroes-biblioteca-cabecalho"><div><strong>Biblioteca de padrões</strong><span>{padroesFiltrados.length} de {padroes.length} padrões disponíveis</span></div><span className="padroes-resultados">Mostrando {padroesFiltrados.length}</span></div>
      {padroesFiltrados.length === 0 ? <div className="padroes-vazio"><Archive /><h3>Nenhum padrão encontrado</h3><p>Ajuste a busca ou os filtros para consultar a biblioteca.</p>{padroes.length === 0 && <button type="button" className="btn btn-secondary" onClick={() => setForm({ modo: 'novo' })}><Plus /> Criar primeiro padrão</button>}</div> : <div className="padroes-grid">{padroesFiltrados.map((padrao) => { const componentes = padrao.componentes || []; const itens = componentes.reduce((total, componente) => total + componente.itens.length, 0); return <article className={`padrao-management-card${!padrao.ativo ? ' inativo' : ''}`} key={padrao.id}><div className="padrao-management-top"><span className={`padrao-categoria categoria-${slugCategoria(padrao.categoria)}`}>{labelCategoria(padrao.categoria)}</span><div className="padrao-management-status"><span className={`padrao-status ${padrao.ativo ? 'ativo' : 'inativo'}`}>{padrao.ativo ? 'Ativo' : 'Inativo'}</span>{padrao.publicado && <span className="padrao-status publicado">Publicado · v{padrao.versao_publicada || padrao.versao || 1}</span>}</div></div><h3>{padrao.nome}</h3><p className="padrao-management-descricao">{padrao.descricao || 'Sem descrição cadastrada.'}</p><div className="padrao-management-bairros">{padrao.bairros?.length ? padrao.bairros.map((bairro) => <span key={bairro}>{bairro}</span>) : <span>Sem bairro relacionado</span>}</div><dl><div><dt>Viaturas</dt><dd>{componentes.length}</dd></div><div><dt>PBs</dt><dd>{contarPbsComponentes(componentes)}</dd></div><div><dt>Roteiros</dt><dd>{itens}</dd></div></dl><div className="padrao-management-actions"><span className="padrao-management-atualizado">Atualizado {formatarData(padrao.atualizado_em)}</span><button type="button" className="btn btn-link btn-sm" onClick={() => void selecionar(padrao)}>Abrir padrão <ChevronRight /></button></div></article>; })}</div>}
    </section>}
    {historico && <HistoricoPadrao nome={historico.nome} versoes={historico.versoes} onFechar={() => setHistorico(null)} />}
    {aExcluir && <ModalConfirmarExclusaoForte titulo="Excluir cartão padrão" aviso={`O padrão “${aExcluir.nome}” será removido apenas da biblioteca de padrões, junto com suas ${aExcluir.componentes?.length || 0} viatura(s). Cartões de serviço, históricos e snapshots já aplicados não serão alterados.`} label="Digite o nome do padrão para confirmar:" valorEsperado={aExcluir.nome} onFechar={() => setAExcluir(null)} onConfirmar={() => void confirmarExclusao()} />}
  </div>;
}
