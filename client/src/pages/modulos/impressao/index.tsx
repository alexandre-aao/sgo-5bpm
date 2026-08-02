import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Archive, CheckCircle2, ChevronLeft, ChevronRight, Download, FileCheck2, FileSliders,
  FolderArchive, History, Info, Printer, Send, Share2, ShieldAlert, TriangleAlert, Users, XCircle,
} from 'lucide-react';
import { API_BASE_URL, apiFetch } from '../../../lib/api';
import { useAuth } from '../../../context/useAuth';
import type { CartaoDetalhado } from '../../../lib/cartaoConflitos';
import { Carregando } from '../../../components/estado/Carregando';
import { useAppData } from '../../../context/useAppData';
import { useToast } from '../../../context/useToast';
import { useBairros } from '../../../hooks/useBairros';
import { useAvisos } from '../../../hooks/useAvisos';
import {
  CONFIGURACOES_MODALIDADE, documentoCartaoEmTexto, filtrarViaturasPorConteudo, montarDocumentosCartao,
  type AgrupamentoDocumento, type ConfiguracaoEmissao, type ConteudoDocumento, type DocumentoCartao,
  type FormatoDocumento, type ModalidadeEmissao, type TipoDocumento,
} from './documentoCartao';
import { DocumentoCartaoView, LoteDocumentosCartao } from './RenderDocumentoCartao';
import { gerarDocumentosCartaoPdf } from './gerarPdfCartao';
import { validarCentralEmissao } from './validacaoEmissao';

interface RegistroEmissao {
  id: string;
  usuario: string;
  usuario_nome: string;
  emitido_em: string;
  modalidade: ModalidadeEmissao;
  formato: FormatoDocumento;
  tipo_documento: TipoDocumento;
  com_alertas: boolean;
  viaturas_ids: string[];
  versao: number;
  acao: 'gerado' | 'enviado';
  status: 'gerado' | 'enviado' | 'retificado' | 'substituido';
}

interface EmissaoConfirmada {
  instante: Date;
  documentos: DocumentoCartao[];
  chaveConfiguracao: string;
}

interface PdfPronto {
  base64: string;
  nomeArquivo: string;
  chaveConfiguracao: string;
}

function blobParaBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => {
      const resultado = String(leitor.result || '');
      const separador = resultado.indexOf(',');
      if (separador < 0) reject(new Error('Não foi possível preparar o arquivo PDF.'));
      else resolve(resultado.slice(separador + 1));
    };
    leitor.onerror = () => reject(new Error('Não foi possível preparar o arquivo PDF.'));
    leitor.readAsDataURL(blob);
  });
}

function enviarPdfAoNavegador(
  cartaoId: string,
  token: string,
  pdf: PdfPronto,
  disposicao: 'attachment' | 'inline',
): void {
  const formulario = document.createElement('form');
  formulario.method = 'POST';
  formulario.action = `${API_BASE_URL}/api/cartoes/${encodeURIComponent(cartaoId)}/arquivo-pdf`;
  formulario.target = '_blank';
  formulario.style.display = 'none';

  const campos = {
    token,
    pdf_base64: pdf.base64,
    nome_arquivo: pdf.nomeArquivo,
    disposicao,
  };
  Object.entries(campos).forEach(([nome, valor]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = nome;
    input.value = valor;
    formulario.appendChild(input);
  });

  document.body.appendChild(formulario);
  formulario.submit();
  formulario.remove();
}

const MODOS: Array<{
  id: ModalidadeEmissao;
  titulo: string;
  descricao: string;
  Icone: typeof Send;
}> = [
  { id: 'guarnicao', titulo: 'Enviar à guarnição', descricao: 'Uma viatura por documento, celular e alertas ativados.', Icone: Send },
  { id: 'arquivo_sei', titulo: 'Arquivo ou SEI', descricao: 'A4 institucional completo, sem alertas e sem assinatura.', Icone: FolderArchive },
  { id: 'consolidado', titulo: 'Consolidado operacional', descricao: 'Todas as viaturas, resumo quantitativo e agrupamento.', Icone: Users },
  { id: 'personalizado', titulo: 'Personalizada', descricao: 'Controle de layout, conteúdo, alertas e agrupamento.', Icone: FileSliders },
];

const ROTULO_MODALIDADE: Record<ModalidadeEmissao, string> = {
  guarnicao: 'Guarnição', arquivo_sei: 'Arquivo / SEI', consolidado: 'Consolidado', personalizado: 'Personalizada',
};

function chaveDaConfiguracao(configuracao: ConfiguracaoEmissao, ids: Set<string>): string {
  return JSON.stringify([configuracao, [...ids].sort()]);
}

function formatarHistorico(data: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(data));
}

function compartilharTextoNativo(titulo: string, texto: string): Promise<'compartilhado' | 'copiado' | 'cancelado' | 'falhou'> {
  return (async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: titulo, text: texto });
        return 'compartilhado';
      } catch (erro) {
        if (erro instanceof Error && erro.name === 'AbortError') return 'cancelado';
      }
    }
    try {
      await navigator.clipboard.writeText(texto);
      return 'copiado';
    } catch {
      return 'falhou';
    }
  })();
}

export default function CentralEmissaoPage() {
  const [searchParams] = useSearchParams();
  const cartaoIdInicial = searchParams.get('cartao');
  const viaturaInicial = searchParams.get('viatura');
  const { dados } = useAppData();
  const { bairros } = useBairros();
  const { avisos } = useAvisos();
  const { toast } = useToast();
  const { usuario } = useAuth();

  const [data, setData] = useState('');
  const [cartao, setCartao] = useState<CartaoDetalhado | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [naoEncontrado, setNaoEncontrado] = useState(false);
  const [configuracao, setConfiguracao] = useState<ConfiguracaoEmissao>({
    modalidade: 'guarnicao', ...CONFIGURACOES_MODALIDADE.guarnicao,
  });
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [confirmada, setConfirmada] = useState<EmissaoConfirmada | null>(null);
  const [indicePrevia, setIndicePrevia] = useState(0);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [pdfPronto, setPdfPronto] = useState<PdfPronto | null>(null);
  const [historico, setHistorico] = useState<RegistroEmissao[]>([]);
  const [historicoAberto, setHistoricoAberto] = useState(false);

  const carregarHistorico = useCallback(async (cartaoId: string) => {
    const res = await apiFetch(`/api/cartoes/${cartaoId}/emissoes`);
    if (!res.ok) {
      setHistorico([]);
      return;
    }
    setHistorico((await res.json()) as RegistroEmissao[]);
  }, []);

  const aplicarCartao = useCallback((novoCartao: CartaoDetalhado) => {
    setCartao(novoCartao);
    setData(novoCartao.data || '');
    const elegiveis = novoCartao.viaturas || [];
    const inicial = viaturaInicial && elegiveis.some((viatura) => viatura.id === viaturaInicial)
      ? [viaturaInicial]
      : elegiveis.map((viatura) => viatura.id);
    setSelecionadas(new Set(inicial));
    setConfirmada(null);
    setIndicePrevia(0);
    void carregarHistorico(novoCartao.id);
  }, [carregarHistorico, viaturaInicial]);

  const carregarPorId = useCallback(async (id: string) => {
    setCarregando(true);
    setNaoEncontrado(false);
    try {
      const res = await apiFetch(`/api/cartoes/${id}`);
      if (!res.ok) throw new Error();
      aplicarCartao((await res.json()) as CartaoDetalhado);
    } catch {
      setCartao(null);
      setNaoEncontrado(true);
    } finally {
      setCarregando(false);
    }
  }, [aplicarCartao]);

  const carregarPorData = useCallback(async (dataAlvo: string) => {
    if (!dataAlvo) { setCartao(null); return; }
    setCarregando(true);
    setNaoEncontrado(false);
    try {
      const res = await apiFetch(`/api/cartoes?data=${dataAlvo}`);
      const lista = (await res.json()) as { id: string }[];
      if (!res.ok || !lista.length) throw new Error();
      const detalhe = await apiFetch(`/api/cartoes/${lista[0].id}`);
      if (!detalhe.ok) throw new Error();
      aplicarCartao((await detalhe.json()) as CartaoDetalhado);
    } catch {
      setCartao(null);
      setNaoEncontrado(true);
    } finally {
      setCarregando(false);
    }
  }, [aplicarCartao]);

  useEffect(() => {
    // Carregamento inicial sincroniza a URL externa com o estado da tela.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cartaoIdInicial) void carregarPorId(cartaoIdInicial);
    // O id da URL é estável durante a vida desta tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // A data é um filtro controlado; a resposta assíncrona atualiza a tela.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!cartaoIdInicial) void carregarPorData(data);
  }, [cartaoIdInicial, carregarPorData, data]);

  const viaturasElegiveis = useMemo(
    () => cartao ? filtrarViaturasPorConteudo(cartao.viaturas || [], configuracao.conteudo) : [],
    [cartao, configuracao.conteudo],
  );
  const viaturasSelecionadas = useMemo(
    () => viaturasElegiveis.filter((viatura) => selecionadas.has(viatura.id)),
    [selecionadas, viaturasElegiveis],
  );
  const chaveAtual = chaveDaConfiguracao(configuracao, selecionadas);
  const documentosPrevia = useMemo(() => cartao ? montarDocumentosCartao(
    cartao, viaturasSelecionadas, dados.pessoal, bairros, dados.eventos, avisos, configuracao, null,
  ) : [], [avisos, bairros, cartao, configuracao, dados.eventos, dados.pessoal, viaturasSelecionadas]);
  const documentosExibidos = confirmada?.chaveConfiguracao === chaveAtual ? confirmada.documentos : documentosPrevia;
  const validacao = useMemo(() => cartao ? validarCentralEmissao(
    cartao, viaturasSelecionadas, configuracao, documentosPrevia, dados.pessoal,
  ) : { erros: ['Selecione um Cartão Programa.'], avisos: [], paginasEstimadas: 0 },
  [cartao, configuracao, dados.pessoal, documentosPrevia, viaturasSelecionadas]);
  const estaConfirmada = !!confirmada && confirmada.chaveConfiguracao === chaveAtual;

  function invalidarConferencia() {
    setConfirmada(null);
    setPdfPronto(null);
    setIndicePrevia(0);
  }

  function selecionarModalidade(modalidade: ModalidadeEmissao) {
    const nova = { modalidade, ...CONFIGURACOES_MODALIDADE[modalidade] };
    setConfiguracao(nova);
    if (cartao) {
      const elegiveis = filtrarViaturasPorConteudo(cartao.viaturas || [], nova.conteudo);
      setSelecionadas(new Set(elegiveis.map((viatura) => viatura.id)));
    }
    invalidarConferencia();
  }

  function atualizarConfiguracao(patch: Partial<ConfiguracaoEmissao>) {
    setConfiguracao((atual) => ({ ...atual, ...patch }));
    invalidarConferencia();
  }

  function alternarViatura(id: string) {
    setSelecionadas((atual) => {
      const nova = new Set(atual);
      if (nova.has(id)) nova.delete(id); else nova.add(id);
      return nova;
    });
    invalidarConferencia();
  }

  function selecionarTodas(marcar: boolean) {
    setSelecionadas(new Set(marcar ? viaturasElegiveis.map((viatura) => viatura.id) : []));
    invalidarConferencia();
  }

  function confirmarEmissao() {
    if (!cartao || validacao.erros.length) {
      toast('Corrija os erros impeditivos antes de confirmar a emissão.', 'warning');
      return;
    }
    const instante = new Date();
    const documentos = montarDocumentosCartao(
      cartao, viaturasSelecionadas, dados.pessoal, bairros, dados.eventos, avisos, configuracao, instante,
    );
    setPdfPronto(null);
    setConfirmada({ instante, documentos, chaveConfiguracao: chaveAtual });
    setIndicePrevia(0);
    toast('Emissão conferida. O horário foi registrado; escolha a forma de saída.', 'success');
  }

  async function registrarEmissao(acao: 'gerado' | 'enviado'): Promise<boolean> {
    if (!cartao) return false;
    const res = await apiFetch(`/api/cartoes/${cartao.id}/emissoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        acao,
        modalidade: configuracao.modalidade,
        formato: configuracao.formato,
        tipo_documento: configuracao.tipoDocumento,
        agrupamento: configuracao.agrupamento,
        com_alertas: configuracao.comAlertas,
        viaturas_ids: viaturasSelecionadas.map((viatura) => viatura.id),
      }),
    });
    if (!res.ok) {
      const corpo = (await res.json().catch(() => ({}))) as { error?: string };
      toast(corpo.error || 'O documento saiu, mas não foi possível registrar a emissão.', 'danger');
      return false;
    }
    await carregarHistorico(cartao.id);
    return true;
  }

  function nomeDoArquivoConfirmado(): string {
    if (!confirmada) return `cartao-programa-${cartao?.data || 'sem-data'}`;
    return confirmada.documentos.length === 1
      ? confirmada.documentos[0].controle.nomeArquivo
      : `cartao-programa-${cartao?.data || 'sem-data'}-lote-${confirmada.documentos.length}-v${Math.max(...confirmada.documentos.map((d) => d.controle.versao))}`;
  }

  async function gerarPdf() {
    if (!estaConfirmada || !confirmada) {
      toast('Confirme a emissão antes de imprimir ou salvar.', 'warning');
      return;
    }
    if (gerandoPdf) return;
    setGerandoPdf(true);
    try {
      const blob = await gerarDocumentosCartaoPdf(confirmada.documentos);
      const base64 = await blobParaBase64(blob);
      const nomeArquivo = `${nomeDoArquivoConfirmado()}.pdf`;
      setPdfPronto({
        base64,
        nomeArquivo,
        chaveConfiguracao: chaveAtual,
      });
      const ok = await registrarEmissao('gerado');
      if (ok) toast('PDF pronto. Clique em “Guardar PDF” para baixar ou abrir o arquivo.', 'success');
    } catch (erro) {
      console.error('Falha ao gerar PDF do Cartão Programa:', erro);
      toast(erro instanceof Error ? erro.message : 'Não foi possível gerar o PDF.', 'danger');
    } finally {
      setGerandoPdf(false);
    }
  }

  function entregarPdf(disposicao: 'attachment' | 'inline') {
    if (!cartao || !pdfDisponivel || !usuario?.token) {
      toast('Gere o PDF antes de guardar ou imprimir.', 'warning');
      return;
    }
    enviarPdfAoNavegador(cartao.id, usuario.token, pdfDisponivel, disposicao);
    toast(
      disposicao === 'attachment'
        ? 'Download solicitado ao navegador.'
        : 'PDF aberto para visualização e impressão.',
      'success',
    );
  }

  async function compartilharTexto() {
    if (!estaConfirmada || !confirmada) {
      toast('Confirme a emissão antes de compartilhar.', 'warning');
      return;
    }
    const texto = confirmada.documentos.map(documentoCartaoEmTexto).join('\n\n────────────────\n\n');
    const resultado = await compartilharTextoNativo('Cartão Programa — 5º BPM', texto);
    if (resultado === 'cancelado') return;
    if (resultado === 'falhou') {
      toast('Não foi possível compartilhar nem copiar o texto.', 'danger');
      return;
    }
    const ok = await registrarEmissao('enviado');
    if (ok) toast(resultado === 'compartilhado' ? 'Texto compartilhado e envio registrado.' : 'Texto copiado e envio registrado.', 'success');
  }

  const previa = documentosExibidos[Math.min(indicePrevia, Math.max(0, documentosExibidos.length - 1))];
  const pdfDisponivel = pdfPronto?.chaveConfiguracao === chaveAtual ? pdfPronto : null;

  return (
    <div className="central-emissao">
      <header className="central-emissao-topo panel">
        <div>
          <div className="panel-title"><FileCheck2 /><h2>Central de Emissão</h2></div>
          <p>Uma única fonte para conferir, imprimir, salvar e compartilhar o Cartão Programa.</p>
        </div>
        <div className="central-emissao-data form-group">
          <label htmlFor="central-emissao-data">Data do Cartão</label>
          <input id="central-emissao-data" type="date" value={data} onChange={(e) => { setData(e.target.value); invalidarConferencia(); }} />
        </div>
      </header>

      {carregando ? <Carregando mensagem="Carregando Cartão Programa..." /> : naoEncontrado || !cartao ? (
        <div className="panel central-emissao-vazio"><Archive /><p>Nenhum Cartão Programa encontrado para esta data.</p></div>
      ) : (
        <>
          <div className="central-emissao-grid">
            <section className="panel central-emissao-config">
              <h3>1. Modo de emissão</h3>
              <div className="central-modos" role="radiogroup" aria-label="Modo de emissão">
                {MODOS.map(({ id, titulo, descricao, Icone }) => (
                  <button
                    type="button" key={id} role="radio" aria-checked={configuracao.modalidade === id}
                    className={`central-modo${configuracao.modalidade === id ? ' ativo' : ''}`}
                    onClick={() => selecionarModalidade(id)}
                  >
                    <Icone /><span><strong>{titulo}</strong><small>{descricao}</small></span>
                    <span className="central-radio" />
                  </button>
                ))}
              </div>

              <h3>2. Configuração do documento</h3>
              <div className="central-config-campos">
                <div className="form-group central-viaturas-selecao">
                  <div className="central-label-acoes">
                    <span className="form-label-estatico">Viaturas</span>
                    <button type="button" onClick={() => selecionarTodas(selecionadas.size !== viaturasElegiveis.length)}>
                      {selecionadas.size === viaturasElegiveis.length ? 'Desmarcar todas' : 'Selecionar todas'}
                    </button>
                  </div>
                  <div className="central-check-lista">
                    {viaturasElegiveis.map((viatura) => (
                      <label key={viatura.id} className="checkbox-inline">
                        <input type="checkbox" checked={selecionadas.has(viatura.id)} onChange={() => alternarViatura(viatura.id)} />
                        <span><strong>{viatura.prefixo}</strong> · {viatura.companhia || 'Sem Companhia'} · {viatura.categoria || 'Ordinária'}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="central-config-grid">
                  <label>Layout<select value={configuracao.formato} onChange={(e) => atualizarConfiguracao({ formato: e.target.value as FormatoDocumento })}><option value="celular">Celular</option><option value="a4">A4</option></select></label>
                  <label>Tipo<select value={configuracao.tipoDocumento} onChange={(e) => atualizarConfiguracao({ tipoDocumento: e.target.value as TipoDocumento })}><option value="individual">Individual</option><option value="consolidado">Consolidado</option></select></label>
                  <label>Alertas<select value={configuracao.comAlertas ? 'com' : 'sem'} onChange={(e) => atualizarConfiguracao({ comAlertas: e.target.value === 'com' })}><option value="com">Com alertas</option><option value="sem">Sem alertas</option></select></label>
                  <label>Conteúdo<select value={configuracao.conteudo} onChange={(e) => {
                    const conteudo = e.target.value as ConteudoDocumento;
                    atualizarConfiguracao({ conteudo });
                    const elegiveis = filtrarViaturasPorConteudo(cartao.viaturas, conteudo);
                    setSelecionadas(new Set(elegiveis.map((viatura) => viatura.id)));
                  }}><option value="ordinario">Ordinário</option><option value="reforco">Reforço</option><option value="completo">Completo</option></select></label>
                  <label>Agrupamento<select value={configuracao.agrupamento} disabled={configuracao.tipoDocumento === 'individual'} onChange={(e) => atualizarConfiguracao({ agrupamento: e.target.value as AgrupamentoDocumento })}><option value="nenhum">Sem agrupamento</option><option value="companhia">Por Companhia</option><option value="categoria">Por categoria</option></select></label>
                  <label>Eventos<select value={configuracao.incluirEventos ? 'incluir' : 'omitir'} onChange={(e) => atualizarConfiguracao({ incluirEventos: e.target.value === 'incluir' })}><option value="incluir">Incluir eventos</option><option value="omitir">Omitir eventos</option></select></label>
                  <label>Observações<select value={configuracao.incluirObservacoes ? 'incluir' : 'omitir'} onChange={(e) => atualizarConfiguracao({ incluirObservacoes: e.target.value === 'incluir' })}><option value="incluir">Incluir observações</option><option value="omitir">Omitir observações</option></select></label>
                </div>
              </div>
            </section>

            <section className="central-emissao-conferencia">
              <div className="panel central-conferencia">
                <h3>3. Conferência</h3>
                <div className="central-indicadores">
                  <div><Users /><strong>{viaturasSelecionadas.length}</strong><span>viatura(s)<br />selecionada(s)</span></div>
                  <div><FileCheck2 /><strong>{validacao.paginasEstimadas}</strong><span>página(s)<br />estimada(s)</span></div>
                  <div><Info /><strong>{estaConfirmada ? 'Pronta' : 'Prévia'}</strong><span>{ROTULO_MODALIDADE[configuracao.modalidade]}</span></div>
                </div>
                {validacao.erros.length > 0 && <div className="central-validacao erro"><XCircle /><div><strong>{validacao.erros.length} erro(s) impeditivo(s)</strong><ul>{validacao.erros.map((erro) => <li key={erro}>{erro}</li>)}</ul></div></div>}
                {validacao.avisos.length > 0 && <div className="central-validacao aviso"><TriangleAlert /><div><strong>{validacao.avisos.length} alerta(s) não impeditivo(s)</strong><ul>{validacao.avisos.map((aviso) => <li key={aviso}>{aviso}</li>)}</ul></div></div>}
                <div className={`central-alertas-escolha${configuracao.comAlertas ? ' com' : ' sem'}`}>
                  <ShieldAlert /> Documento <strong>{configuracao.comAlertas ? 'com alertas' : 'sem alertas'}</strong>
                </div>
              </div>

              <div className="panel central-previa-panel">
                <div className="central-previa-topo">
                  <h3>4. Prévia do documento</h3>
                  {documentosExibidos.length > 1 && <div className="central-previa-nav"><button type="button" disabled={indicePrevia === 0} onClick={() => setIndicePrevia((i) => i - 1)}><ChevronLeft /></button><span>{indicePrevia + 1} / {documentosExibidos.length}</span><button type="button" disabled={indicePrevia >= documentosExibidos.length - 1} onClick={() => setIndicePrevia((i) => i + 1)}><ChevronRight /></button></div>}
                </div>
                <div className="central-previa-documento">
                  {previa ? <DocumentoCartaoView documento={previa} /> : <p>Selecione viaturas para visualizar o documento.</p>}
                </div>
              </div>
            </section>
          </div>

          <div className="panel central-emissao-acoes">
            <div className="central-saidas">
              <button type="button" className="btn btn-secondary" disabled={!estaConfirmada} onClick={() => void compartilharTexto()}><Share2 /> Compartilhar texto</button>
              {pdfDisponivel ? (
                <button type="button" className="btn btn-primary" onClick={() => entregarPdf('attachment')}>
                  <Download /> Guardar PDF
                </button>
              ) : (
                <button type="button" className="btn btn-secondary" disabled={!estaConfirmada || gerandoPdf} onClick={() => void gerarPdf()}><Download /> {gerandoPdf ? 'Gerando PDF...' : 'Gerar PDF'}</button>
              )}
              <button type="button" className="btn btn-secondary" disabled={!pdfDisponivel || gerandoPdf} onClick={() => entregarPdf('inline')}><Printer /> Abrir / imprimir PDF</button>
            </div>
            <button type="button" className="btn btn-primary" disabled={validacao.erros.length > 0} onClick={confirmarEmissao}><CheckCircle2 /> {estaConfirmada ? 'Emissão confirmada' : 'Confirmar emissão'}</button>
          </div>

          <section className="panel central-historico">
            <button type="button" className="central-historico-toggle" onClick={() => setHistoricoAberto((aberto) => !aberto)}><History /><span>Histórico de emissões</span><small>{historico.length} registro(s)</small></button>
            {historicoAberto && <div className="central-historico-lista">
              {historico.length === 0 ? <p>Nenhuma emissão registrada para este Cartão.</p> : historico.map((registro) => (
                <div key={registro.id} className="central-historico-item">
                  <div><strong>{ROTULO_MODALIDADE[registro.modalidade]} · v{registro.versao}</strong><span>{formatarHistorico(registro.emitido_em)} · {registro.usuario_nome || registro.usuario}</span></div>
                  <div><span className={`badge emissao-${registro.status}`}>{registro.status}</span><small>{registro.viaturas_ids.length} VTR · {registro.com_alertas ? 'com alertas' : 'sem alertas'}</small></div>
                </div>
              ))}
            </div>}
          </section>

          <div id="central-emissao-impressao" aria-hidden="true">
            {estaConfirmada && confirmada && <LoteDocumentosCartao documentos={confirmada.documentos} />}
          </div>
        </>
      )}
    </div>
  );
}
