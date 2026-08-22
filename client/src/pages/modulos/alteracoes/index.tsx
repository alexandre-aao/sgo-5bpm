import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, ClipboardList, FileText, Filter, Plus, Printer, RefreshCw, Search, ShieldCheck, Users, X } from 'lucide-react';
import { apiFetch } from '../../../lib/api';
import { useAuth } from '../../../context/useAuth';
import { useAppData } from '../../../context/useAppData';
import { PortalImpressao } from '../../../components/PortalImpressao';
import { Carregando } from '../../../components/estado/Carregando';
import { ErroAoCarregar } from '../../../components/estado/ErroAoCarregar';
import { SemDados } from '../../../components/estado/SemDados';
import { useModalA11y } from '../../../hooks/useModalA11y';
import { DetalheAlteracao } from './DetalheAlteracao';
import { ModalAlteracao } from './ModalAlteracao';
import { ModalComposicao } from './ModalComposicao';
import type { AlteracaoPayload, AlteracaoServico, ComposicaoPayload, ComposicaoServico, PessoaServico, ResumoResposta, ResumoUnidade } from './types';
import { TIPOS_ALTERACAO, TURNOS_SERVICO, UNIDADES_SERVICO } from './types';
import { adicionarDias, calcularResumoLocal, dataBr, dataHoraBr, dataLocalIso, normalizarAlteracao, normalizarComposicao, normalizarResumo, rotuloPeriodo, textoImpacto } from './utils';

interface Filtros {
  de: string;
  ate: string;
  unidade: string;
  turno: string;
  tipo: string;
  busca: string;
}

interface Impressao {
  alteracoes: AlteracaoServico[];
  resumo?: ResumoUnidade | null;
  resumos?: ResumoUnidade[];
  consolidado?: ResumoResposta['consolidado'];
  titulo: string;
  geradoEm: string;
  emissor: string;
  formato: 'aviso' | 'afastamentos' | 'individual';
}

const FILTRO_VAZIO = (): Filtros => { const hoje = dataLocalIso(); return { de: hoje, ate: adicionarDias(hoje, 6), unidade: '', turno: '', tipo: '', busca: '' }; };

function respostaErro(res: Response, fallback: string): Promise<{ mensagem?: string }> {
  return res.json().catch(() => ({})).then((body: unknown) => ({ mensagem: body && typeof body === 'object' && 'error' in body ? String((body as { error?: unknown }).error) : fallback }));
}

function pessoaDoCadastro(pessoa: { id?: string; nome: string; matricula?: string | null; posto_graduacao?: string | null; subunidade?: string | null }): PessoaServico {
  return { id: pessoa.id, nome: pessoa.nome, matricula: pessoa.matricula, posto_graduacao: pessoa.posto_graduacao, subunidade: pessoa.subunidade };
}

function resumoFallback(composicao: ComposicaoServico | null, alteracoes: AlteracaoServico[]): ResumoUnidade {
  return { unidade: composicao?.unidade || alteracoes[0]?.unidade || '', composicao, alteracoes, resumo: calcularResumoLocal(composicao, alteracoes) };
}

function PrintDocument({ documento, onFechar }: { documento: Impressao; onFechar: () => void }) {
  const { idTitulo, refCaixa, propsOverlay } = useModalA11y(onFechar);
  const resumo = documento.resumo?.resumo;
  const resumos = documento.resumos || (documento.resumo ? [documento.resumo] : []);
  return (
    <PortalImpressao>
      <div id="modal-relatorio-pdf" className="modal-overlay" {...propsOverlay}>
        <div className="modal-box modal-box-lg relatorio-pdf-area" ref={refCaixa}>
          <div className="modal-header"><h3 id={idTitulo}><FileText /> Alterações do Serviço</h3><button type="button" className="btn-close" onClick={onFechar} aria-label="Fechar"><X /></button></div>
          <div className="relatorio-cabecalho"><strong>5º BATALHÃO DE POLÍCIA MILITAR</strong><span>SEÇÃO DE PLANEJAMENTO OPERACIONAL</span><h1>ALTERAÇÕES DO SERVIÇO</h1><p>{documento.titulo}</p></div>
          {resumos.length > 0 && <section className="relatorio-secao"><h2>CAPACIDADE OPERACIONAL POR COMPANHIA</h2><div className="table-responsive"><table className="styled-table"><thead><tr><th>Companhia / turno</th><th>Alterações</th><th>Viaturas completas</th><th>Policiais disponíveis</th><th>Ciência do Adjunto</th></tr></thead><tbody>{resumos.map((item) => <tr key={`${item.unidade}-${item.turno || ''}`}><td><strong>{item.unidade}</strong><br />{item.turno || '24H'}</td><td>{item.resumo.alteracoes}</td><td>{item.resumo.viaturas_completas}</td><td>{item.resumo.policiais_remanescentes}</td><td>{item.alteracoes.filter((alteracao) => alteracao.ciencias?.length).length} registro(s)</td></tr>)}</tbody></table></div>{documento.consolidado && <p><strong>TOTAL 5º BPM:</strong> {documento.consolidado.viaturasCompletas} viaturas completas · {documento.consolidado.policiaisDisponiveis} policiais disponíveis · {documento.consolidado.totalAlteracoes} alterações · {documento.consolidado.companhiasImpactadas} Companhia(s) impactada(s).</p>}</section>}
          {resumo && <section className="relatorio-secao"><h2>RESUMO DO SERVIÇO</h2><div className="relatorio-resumo-grid"><span>Previsto<strong>{resumo.composicao ? `${resumo.composicao.viaturas_previstas} viatura(s) / ${resumo.policiais_previstos} policiais` : 'Não informado'}</strong></span><span>Alterações<strong>{resumo.alteracoes}</strong></span><span>Viaturas completas<strong>{resumo.viaturas_completas}</strong></span><span>Policiais disponíveis<strong>{resumo.policiais_remanescentes}</strong></span></div></section>}
          <section className="relatorio-secao"><h2>{documento.formato === 'afastamentos' ? 'AFASTAMENTOS ATIVOS' : 'REGISTROS QUE COMPÕEM O RELATÓRIO'}</h2><div className="table-responsive"><table className="styled-table"><thead><tr><th>Policial / período</th><th>Companhia / jornada</th><th>Tipo / substituto</th><th>Plantões afetados</th><th>Processo / justificativa</th><th>Ciência do Adjunto</th></tr></thead><tbody>{documento.alteracoes.map((item) => <tr key={item.id}><td><strong>{item.policial_nome}</strong><br />{item.policial_matricula || '—'}<br />{rotuloPeriodo(item)}</td><td>{item.unidade}<br />{item.turno} · {item.jornada || '24H'}{item.horario_inicio ? ` · ${item.horario_inicio}–${item.horario_fim}` : ''}</td><td>{item.tipo}<br />{item.substituto_nome ? `Substituto: ${item.substituto_nome}` : 'Sem substituição'}</td><td>{item.impacto?.datas_servicos?.map(dataBr).join(', ') || '—'}</td><td>{item.numero_sei || item.documento || '—'}<br />{item.motivo || item.observacao || '—'}</td><td>{item.ciencias?.length ? `Ciente em ${dataHoraBr(item.ciencias[0].criado_em)} por ${item.ciencias[0].usuario_nome || item.ciencias[0].usuario}` : 'Pendente'}</td></tr>)}</tbody></table></div></section>
          <p className="relatorio-rodape">Gerado pelo SGO em {documento.geradoEm}. Emissão por {documento.emissor}.</p>
          <div className="form-actions"><button type="button" className="btn btn-secondary" onClick={onFechar}>Fechar</button><button type="button" className="btn btn-primary" onClick={() => window.print()}><Printer /> Imprimir</button></div>
        </div>
      </div>
    </PortalImpressao>
  );
}

export default function AlteracoesServicoPage() {
  const { usuario } = useAuth();
  const { dados } = useAppData();
  const [filtros, setFiltros] = useState<Filtros>(() => ({
    ...FILTRO_VAZIO(),
    unidade: usuario?.role === 'Sargenteante' ? (usuario.unidade || '') : '',
  }));
  const [alteracoes, setAlteracoes] = useState<AlteracaoServico[]>([]);
  const [composicoes, setComposicoes] = useState<ComposicaoServico[]>([]);
  const [resumo, setResumo] = useState<ResumoResposta>({ data: dataLocalIso(), turno: '', unidades: [] });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [alteracaoAberta, setAlteracaoAberta] = useState<AlteracaoServico | null>(null);
  const [modalAlteracao, setModalAlteracao] = useState<{ aberto: boolean; item: AlteracaoServico | null }>({ aberto: false, item: null });
  const [modalComposicao, setModalComposicao] = useState<{ aberto: boolean; item: ComposicaoServico | null }>({ aberto: false, item: null });
  const [impressao, setImpressao] = useState<Impressao | null>(null);

  const role = String(usuario?.role || '');
  const usuarioComUnidade = usuario as (typeof usuario & { unidade?: string }) | null;
  const unidadeUsuario = usuarioComUnidade?.unidade || '';
  const ehSargenteante = role.toUpperCase() === 'SARGENTEANTE';
  const podeEditar = ehSargenteante || role === 'P3';
  const podeCiencia = role === 'Adjunto';
  const podeDivergencia = role === 'Adjunto';
  const unidadesPermitidas = ehSargenteante && unidadeUsuario ? [unidadeUsuario] : [...UNIDADES_SERVICO];
  const pessoas = useMemo(() => dados.pessoal.filter((item) => item.ativo !== false).map(pessoaDoCadastro), [dados.pessoal]);

  const recarregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true); else setAtualizando(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filtros).forEach(([chave, valor]) => { if (valor) params.set(chave, valor); });
      const paramsComposicao = new URLSearchParams({ data: filtros.de });
      if (filtros.unidade) paramsComposicao.set('unidade', filtros.unidade);
      if (filtros.turno) paramsComposicao.set('turno', filtros.turno);
      const paramsResumo = new URLSearchParams({ data: filtros.de, turno: filtros.turno || 'TODOS' });
      if (filtros.turno) paramsResumo.set('turno', filtros.turno);
      const [alteracoesRes, composicoesRes, resumoRes] = await Promise.all([
        apiFetch(`/api/alteracoes-servico?${params.toString()}`),
        apiFetch(`/api/composicoes-servico?${paramsComposicao.toString()}`),
        apiFetch(`/api/alteracoes-servico/resumo?${paramsResumo.toString()}`),
      ]);
      if (!alteracoesRes.ok) throw new Error((await respostaErro(alteracoesRes, 'Falha ao carregar alterações.')).mensagem);
      const listaAlteracoes = await alteracoesRes.json() as unknown;
      const listaComposicoes = composicoesRes.ok ? await composicoesRes.json() as unknown : [];
      const objetoResumo = resumoRes.ok ? await resumoRes.json() as unknown : {};
      setAlteracoes(Array.isArray(listaAlteracoes) ? listaAlteracoes.map(normalizarAlteracao) : []);
      setComposicoes(Array.isArray(listaComposicoes) ? listaComposicoes.map(normalizarComposicao) : []);
      setResumo(normalizarResumo(objetoResumo, filtros.de, filtros.turno));
      setErro(null);
    } catch (falha) {
      console.error('Erro ao carregar alterações do serviço:', falha);
      setErro(falha instanceof Error ? falha.message : 'Falha na comunicação com o servidor.');
    } finally {
      setCarregando(false); setAtualizando(false);
    }
  }, [filtros]);

  useEffect(() => {
    // A carga inicial é uma sincronização assíncrona intencional da tela com a API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recarregar();
  }, [recarregar]);

  const alteracoesVisiveis = useMemo(() => alteracoes.filter((item) => {
    if (filtros.unidade && item.unidade !== filtros.unidade) return false;
    if (filtros.turno && item.turno !== filtros.turno) return false;
    if (filtros.tipo && item.tipo !== filtros.tipo) return false;
    if (filtros.busca) {
      const termo = filtros.busca.toLocaleLowerCase();
      if (!`${item.policial_nome} ${item.policial_matricula || ''} ${item.substituto_nome || ''} ${item.motivo || ''}`.toLocaleLowerCase().includes(termo)) return false;
    }
    return true;
  }), [alteracoes, filtros]);

  const composicaoSelecionada = useMemo(() => composicoes.find((item) => item.unidade === (filtros.unidade || unidadeUsuario || UNIDADES_SERVICO[0]) && item.data === filtros.de && (!filtros.turno || item.turno === filtros.turno)) || null, [composicoes, filtros.de, filtros.turno, filtros.unidade, unidadeUsuario]);
  const resumoSelecionado = useMemo(() => resumo.unidades.find((item) => !filtros.unidade || item.unidade === filtros.unidade) || (composicaoSelecionada || alteracoesVisiveis.length ? resumoFallback(composicaoSelecionada, alteracoesVisiveis) : null), [alteracoesVisiveis, composicaoSelecionada, filtros.unidade, resumo.unidades]);
  const resumoAtual = resumoSelecionado?.resumo || calcularResumoLocal(composicaoSelecionada, alteracoesVisiveis);
  const consolidado = resumo.consolidado;
  const ausenciasHoje = alteracoesVisiveis.filter((item) => item.tipo !== 'PERMUTA' && !item.substituto_nome && item.situacao !== 'CANCELADA').length;
  const permutasHoje = alteracoesVisiveis.filter((item) => item.tipo === 'PERMUTA' && item.situacao !== 'CANCELADA').length;
  const cientes = alteracoesVisiveis.filter((item) => item.ciencia || item.ciente_por).length;
  const hojeIso = dataLocalIso();
  const alteracoesHoje = alteracoesVisiveis.filter((item) => item.data_inicio <= hojeIso && (item.data_fim || item.data_inicio) >= hojeIso && item.situacao !== 'CANCELADA');
  const alteracoesFuturas = alteracoesVisiveis.filter((item) => item.data_inicio > hojeIso && item.situacao !== 'CANCELADA');
  const afastamentosAtivos = alteracoesHoje.filter((item) => item.tipo !== 'PERMUTA');

  function aplicarPreset(preset: 'hoje' | 'amanha' | 'sete') {
    const hoje = dataLocalIso();
    const ate = preset === 'hoje' ? hoje : preset === 'amanha' ? adicionarDias(hoje, 1) : adicionarDias(hoje, 6);
    setFiltros((atual) => ({ ...atual, de: preset === 'amanha' ? ate : hoje, ate }));
  }

  function atualizarFiltro<K extends keyof Filtros>(campo: K, valor: Filtros[K]) { setFiltros((atual) => ({ ...atual, [campo]: valor })); }

  async function salvarComposicao(payload: ComposicaoPayload, id?: string) {
    try {
      const res = await apiFetch(id ? `/api/composicoes-servico/${id}` : '/api/composicoes-servico', { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) return { ok: false, mensagem: (await respostaErro(res, 'Falha ao salvar composição.')).mensagem };
      await recarregar(true); return { ok: true };
    } catch { return { ok: false, mensagem: 'Falha na comunicação com o servidor.' }; }
  }

  async function salvarAlteracao(payload: AlteracaoPayload, id?: string) {
    try {
      const res = await apiFetch(id ? `/api/alteracoes-servico/${id}` : '/api/alteracoes-servico', { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) return { ok: false, mensagem: (await respostaErro(res, 'Falha ao salvar alteração.')).mensagem };
      await recarregar(true); return { ok: true };
    } catch { return { ok: false, mensagem: 'Falha na comunicação com o servidor.' }; }
  }

  async function marcarCiencia(item: AlteracaoServico) {
    try {
      const res = await apiFetch(`/api/alteracoes-servico/${item.id}/ciencia`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      if (!res.ok) return { ok: false, mensagem: (await respostaErro(res, 'Falha ao registrar ciência.')).mensagem };
      await recarregar(true); setAlteracaoAberta(null); return { ok: true };
    } catch { return { ok: false, mensagem: 'Falha na comunicação com o servidor.' }; }
  }

  async function registrarDivergencia(item: AlteracaoServico, texto: string) {
    try {
      const res = await apiFetch(`/api/alteracoes-servico/${item.id}/divergencias`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ descricao: texto }) });
      if (!res.ok) return { ok: false, mensagem: (await respostaErro(res, 'Falha ao registrar divergência.')).mensagem };
      await recarregar(true); return { ok: true };
    } catch { return { ok: false, mensagem: 'Falha na comunicação com o servidor.' }; }
  }

  function abrirImpressao(item?: AlteracaoServico, afastamentos = false) {
    const hoje = dataLocalIso();
    const itens = item ? [item] : afastamentos
      ? alteracoesVisiveis.filter((registro) => registro.tipo !== 'PERMUTA' && registro.situacao !== 'CANCELADA' && registro.data_inicio <= hoje && (registro.data_fim || registro.data_inicio) >= hoje)
      : alteracoesVisiveis;
    setImpressao({
      alteracoes: itens, resumo: resumoSelecionado, resumos: resumo.unidades, consolidado,
      titulo: item ? `Registro individual · ${item.unidade} · ${rotuloPeriodo(item)}` : afastamentos ? `Afastamentos ativos em ${dataBr(hoje)}` : `${resumo.data ? dataBr(resumo.data) : dataBr(filtros.de)} · ${filtros.turno || 'Todos os turnos'}`,
      geradoEm: dataHoraBr(Date.now()), emissor: usuario?.nome || usuario?.usuario || 'Usuário',
      formato: item ? 'individual' : afastamentos ? 'afastamentos' : 'aviso',
    });
    window.setTimeout(() => window.print(), 150);
  }

  if (carregando) return <Carregando />;
  if (erro) return <ErroAoCarregar onTentarDeNovo={() => void recarregar()} />;

  return (
    <>
      <div className="panel alteracoes-page-header"><div className="panel-header flex-column-mobile"><div className="panel-title"><ClipboardList /><h2>Alterações do Serviço</h2></div><div className="alteracoes-toolbar-actions"><button type="button" className="btn btn-secondary btn-sm" onClick={() => void recarregar(true)} disabled={atualizando}><RefreshCw /> Atualizar</button><button type="button" className="btn btn-secondary btn-sm" onClick={() => abrirImpressao()} disabled={!alteracoesVisiveis.length}><Printer /> {role === 'P3' ? 'Relatório consolidado' : 'Relatório da Companhia'}</button><button type="button" className="btn btn-secondary btn-sm" onClick={() => abrirImpressao(undefined, true)}><Printer /> Afastamentos ativos</button>{podeEditar && <button type="button" className="btn btn-primary btn-sm" onClick={() => setModalAlteracao({ aberto: true, item: null })}><Plus /> Nova Alteração</button>}</div></div><p className="texto-auxiliar alteracoes-page-note">A tela mostra os plantões afetados, a capacidade final informada pela Companhia e a ciência do Adjunto. O registro permanece no histórico após a ciência.</p></div>

      <div className="kpi-row alteracoes-kpis"><div className="kpi-card kpi-card-horizontal"><span className="kpi-icone fundo-primary tom-primary"><CalendarDays /></span><div><div className="kpi-valor">{alteracoesVisiveis.length}</div><div className="kpi-label-sob">Alterações no período</div></div></div><div className="kpi-card kpi-card-horizontal"><span className="kpi-icone fundo-warning tom-warning"><AlertTriangle /></span><div><div className="kpi-valor">{ausenciasHoje}</div><div className="kpi-label-sob">Ausências sem reposição</div></div></div><div className="kpi-card kpi-card-horizontal"><span className="kpi-icone fundo-info tom-info"><Users /></span><div><div className="kpi-valor">{permutasHoje}</div><div className="kpi-label-sob">Permutas</div></div></div><div className="kpi-card kpi-card-horizontal"><span className="kpi-icone fundo-success tom-success"><ShieldCheck /></span><div><div className="kpi-valor">{cientes}/{alteracoesVisiveis.length || 0}</div><div className="kpi-label-sob">Ciência registrada</div></div></div></div>

      {ehSargenteante && <div className="alteracoes-dashboard-sarg"><section className="panel"><div className="panel-header"><div className="panel-title"><CalendarDays /><h2>Hoje</h2></div><span className="badge">{alteracoesHoje.length}</span></div><p className="texto-auxiliar">Composição, alterações e impacto projetado do serviço atual.</p><strong className="alteracoes-dashboard-impacto">{textoImpacto(resumoAtual)}</strong></section><section className="panel"><div className="panel-header"><div className="panel-title"><RefreshCw /><h2>Próximos dias</h2></div><span className="badge">{alteracoesFuturas.length}</span></div>{alteracoesFuturas.length ? alteracoesFuturas.slice(0, 4).map((item) => <p className="alteracoes-dashboard-item" key={item.id}><strong>{dataBr(item.data_inicio)}</strong> {item.policial_nome} · {item.tipo}</p>) : <p className="turno-vazio">Nenhuma alteração futura informada.</p>}</section><section className="panel"><div className="panel-header"><div className="panel-title"><AlertTriangle /><h2>Afastamentos ativos</h2></div><span className="badge">{afastamentosAtivos.length}</span></div>{afastamentosAtivos.length ? afastamentosAtivos.slice(0, 4).map((item) => <p className="alteracoes-dashboard-item" key={item.id}><strong>{item.policial_nome}</strong> {item.tipo} · {item.impacto?.servicos_atingidos ?? 0} serviço(s) afetado(s)</p>) : <p className="turno-vazio">Nenhum afastamento ativo.</p>}</section></div>}

      <div className="panel alteracoes-filtros-panel"><div className="panel-header"><div className="panel-title"><Filter /><h2>Filtros de consulta</h2></div><button type="button" className="btn btn-ghost btn-sm" onClick={() => setFiltros(FILTRO_VAZIO())}>Limpar</button></div><div className="alteracoes-presets"><button type="button" className="btn btn-secondary btn-sm" onClick={() => aplicarPreset('hoje')}>Hoje</button><button type="button" className="btn btn-secondary btn-sm" onClick={() => aplicarPreset('amanha')}>Amanhã</button><button type="button" className="btn btn-secondary btn-sm" onClick={() => aplicarPreset('sete')}>Próximos 7 dias</button></div><div className="report-filters alteracoes-filtros"><div className="form-group"><label htmlFor="alteracoes-de">De</label><input id="alteracoes-de" type="date" value={filtros.de} onChange={(e) => atualizarFiltro('de', e.target.value)} /></div><div className="form-group"><label htmlFor="alteracoes-ate">Até</label><input id="alteracoes-ate" type="date" value={filtros.ate} onChange={(e) => atualizarFiltro('ate', e.target.value)} /></div><div className="form-group"><label htmlFor="alteracoes-unidade">Unidade</label><select id="alteracoes-unidade" value={filtros.unidade} onChange={(e) => atualizarFiltro('unidade', e.target.value)} disabled={unidadesPermitidas.length === 1}><option value="">Todas as unidades</option>{unidadesPermitidas.map((unidade) => <option key={unidade} value={unidade}>{unidade}</option>)}</select></div><div className="form-group"><label htmlFor="alteracoes-turno">Turno</label><select id="alteracoes-turno" value={filtros.turno} onChange={(e) => atualizarFiltro('turno', e.target.value)}><option value="">Todos os turnos</option>{TURNOS_SERVICO.map((turno) => <option key={turno} value={turno}>{turno === '24H' ? '24h · 24x72' : `12h · ${turno.toLowerCase()}`}</option>)}</select></div><div className="form-group"><label htmlFor="alteracoes-tipo">Tipo</label><select id="alteracoes-tipo" value={filtros.tipo} onChange={(e) => atualizarFiltro('tipo', e.target.value)}><option value="">Todos os tipos</option>{TIPOS_ALTERACAO.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}</select></div><div className="form-group alteracoes-filtro-busca"><label htmlFor="alteracoes-busca">Policial / matrícula</label><div className="input-com-icone"><Search /><input id="alteracoes-busca" value={filtros.busca} onChange={(e) => atualizarFiltro('busca', e.target.value)} placeholder="Buscar policial ou matrícula" /></div></div></div></div>

      <div className="alteracoes-duas-colunas"><section className="panel alteracoes-composicao-panel"><div className="panel-header"><div className="panel-title"><Users /><h2>Capacidade da Companhia</h2></div>{podeEditar && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModalComposicao({ aberto: true, item: composicaoSelecionada })}><Plus /> {composicaoSelecionada ? 'Editar' : 'Registrar'}</button>}</div>{composicaoSelecionada ? <div className="alteracoes-composicao-detalhe"><div className="alteracoes-composicao-titulo"><strong>{composicaoSelecionada.unidade}</strong><span>{dataBr(composicaoSelecionada.data)} · {composicaoSelecionada.turno} · {composicaoSelecionada.jornada || '24H'}</span></div><div className="alteracoes-composicao-numeros"><span><strong>{composicaoSelecionada.viaturas_previstas}</strong> previstas</span><span><strong>{composicaoSelecionada.total_previsto}</strong> efetivo previsto</span><span><strong>{composicaoSelecionada.qtd_viaturas_completas ?? '—'}</strong> completas</span><span><strong>{composicaoSelecionada.qtd_policiais_disponiveis ?? '—'}</strong> disponíveis</span></div>{composicaoSelecionada.observacao && <p className="texto-auxiliar">{composicaoSelecionada.observacao}</p>}</div> : <SemDados icone={Users} titulo="Capacidade não informada" orientacao="Registre a fotografia final da Companhia para calcular o impacto operacional." />}</section><section className="panel alteracoes-resumo-panel"><div className="panel-header"><div className="panel-title"><ShieldCheck /><h2>Resumo operacional</h2></div><span className="badge badge-info">Após as alterações</span></div><div className="alteracoes-resumo-headline"><strong>{textoImpacto(resumoAtual)}</strong><span>Uma fotografia por Companhia, sem somar registros duplicados</span></div><div className="alteracoes-resumo-linhas"><span>Policiais previstos<strong>{resumoAtual.policiais_previstos}</strong></span><span>Alterações<strong>{resumoAtual.alteracoes}</strong></span><span>Viaturas completas<strong>{resumoAtual.viaturas_completas}</strong></span><span>Policiais disponíveis<strong>{resumoAtual.policiais_remanescentes}</strong></span></div></section></div>

      {(role === 'P3' || role === 'Adjunto') && <section className="panel alteracoes-consolidado-panel"><div className="panel-header"><div className="panel-title"><ShieldCheck /><h2>Consolidação do 5º BPM</h2></div><div className="acoes-linha"><span className="badge badge-info">{consolidado?.companhiasImpactadas || 0} Companhia(s) impactada(s)</span><button type="button" className="btn btn-secondary btn-sm" onClick={() => abrirImpressao()}><Printer /> Imprimir consolidado</button></div></div><div className="alteracoes-consolidado-grid">{resumo.unidades.map((grupo) => <article className="alteracoes-consolidado-card" key={`${grupo.unidade}-${grupo.turno || ''}`}><strong>{grupo.unidade}</strong><span>{grupo.turno || '24H'} · {grupo.resumo.alteracoes} alteração(ões)</span><b>{grupo.resumo.viaturas_completas} viaturas completas</b><b>{grupo.resumo.policiais_remanescentes} policiais disponíveis</b></article>)}</div><div className="alteracoes-consolidado-total"><span>Total 5º BPM</span><strong>{consolidado?.viaturasCompletas || 0} viaturas completas</strong><strong>{consolidado?.policiaisDisponiveis || 0} policiais disponíveis</strong><span>{consolidado?.totalAlteracoes || 0} alterações</span></div></section>}

      <section className="panel alteracoes-lista-panel"><div className="panel-header"><div className="panel-title"><ClipboardList /><h2>Registros do período</h2></div><span className="texto-auxiliar">{alteracoesVisiveis.length} registro(s)</span></div><div className="table-responsive"><table className="styled-table table-cards-mobile"><thead><tr><th>Período / plantões afetados</th><th>Companhia / turno</th><th>Policial afetado</th><th>Alteração</th><th>Substituto</th><th>Ciência do Adjunto</th><th className="text-right">Ações</th></tr></thead><tbody>{alteracoesVisiveis.length === 0 ? <tr><td colSpan={7}><SemDados icone={ClipboardList} titulo="Nenhuma alteração encontrada" orientacao="Ajuste o período ou registre uma nova alteração para a unidade." acao={podeEditar ? { rotulo: 'Nova alteração', onClick: () => setModalAlteracao({ aberto: true, item: null }) } : undefined} /></td></tr> : alteracoesVisiveis.map((item) => <tr key={item.id} className={item.situacao === 'CANCELADA' ? 'linha-inativa' : 'linha-clicavel'} onClick={() => setAlteracaoAberta(item)}><td className="card-title-cell" data-label="Período / plantões afetados">{rotuloPeriodo(item)}<small className="texto-auxiliar alteracoes-celula-subtexto">{item.impacto?.datas_servicos?.map(dataBr).join(', ') || 'Plantão a confirmar'}</small></td><td data-label="Companhia / turno"><strong>{item.unidade}</strong><br />{item.jornada || '24H'} · {item.turno || '—'}{item.horario_inicio ? ` · ${item.horario_inicio}–${item.horario_fim}` : ''}</td><td data-label="Policial afetado"><strong>{item.policial_nome || 'Não informado'}</strong><br /><span className="texto-auxiliar">{item.policial_matricula ? `Mat. ${item.policial_matricula}` : 'Matrícula não informada'}</span></td><td data-label="Alteração"><span className="badge badge-info">{item.tipo}</span>{item.motivo && <small className="texto-auxiliar alteracoes-celula-subtexto">{item.motivo}</small>}</td><td data-label="Substituto">{item.substituto_nome || <span className="celula-vazia">Não informado</span>}</td><td data-label="Ciência do Adjunto">{item.ciencias?.length ? <span className="badge badge-success">Ciente</span> : <span className="texto-auxiliar">Pendente</span>}</td><td data-label="Ações" className="text-right"><div className="acoes-linha"><button type="button" className="btn-icon btn-sm" title="Ver detalhes" aria-label="Ver detalhes" onClick={(e) => { e.stopPropagation(); setAlteracaoAberta(item); }}><FileText /></button>{podeEditar && <button type="button" className="btn-icon btn-sm" title="Editar alteração" aria-label="Editar alteração" onClick={(e) => { e.stopPropagation(); setModalAlteracao({ aberto: true, item }); }}><Plus /></button>}<button type="button" className="btn-icon btn-sm" title="Imprimir registro" aria-label="Imprimir registro" onClick={(e) => { e.stopPropagation(); abrirImpressao(item); }}><Printer /></button></div></td></tr>)}</tbody></table></div></section>

      {alteracaoAberta && <DetalheAlteracao alteracao={alteracaoAberta} podeCiencia={podeCiencia} podeDivergencia={podeDivergencia} onFechar={() => setAlteracaoAberta(null)} onCiencia={() => marcarCiencia(alteracaoAberta)} onDivergencia={(texto) => registrarDivergencia(alteracaoAberta, texto)} onImprimir={() => abrirImpressao(alteracaoAberta)} />}
      {modalAlteracao.aberto && <ModalAlteracao alteracao={modalAlteracao.item} unidades={unidadesPermitidas} pessoas={pessoas} unidadeInicial={filtros.unidade || unidadeUsuario || UNIDADES_SERVICO[0]} dataInicial={filtros.de} turnoInicial={filtros.turno || TURNOS_SERVICO[0]} onFechar={() => setModalAlteracao({ aberto: false, item: null })} onSalvar={salvarAlteracao} />}
      {modalComposicao.aberto && <ModalComposicao composicao={modalComposicao.item} unidades={unidadesPermitidas} unidadeInicial={filtros.unidade || unidadeUsuario || UNIDADES_SERVICO[0]} dataInicial={filtros.de} turnoInicial={filtros.turno || TURNOS_SERVICO[0]} onFechar={() => setModalComposicao({ aberto: false, item: null })} onSalvar={salvarComposicao} />}
      {impressao && <PrintDocument documento={impressao} onFechar={() => setImpressao(null)} />}
    </>
  );
}
