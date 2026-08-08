import type { Tables } from '../../../types/supabase';
import type { CartaoDetalhado, CartaoItem, CartaoViatura } from '../../../lib/cartaoConflitos';
import { normalizarTexto } from '../../../lib/cartaoConflitos';
import { abreviarPosto } from '../../../lib/abrevPosto';
import { dataBr, janela24h } from '../../../lib/janelaCartao';
import { horarioDaAtividade, madrugadaSeguraTexto, ordenarViaturasQuadroResumo } from '../../../lib/quadroResumo';
import { enderecoEvento } from '../../../lib/enderecoEvento';

export type ModalidadeEmissao = 'guarnicao' | 'arquivo_sei' | 'consolidado' | 'quadro_resumo' | 'personalizado';
export type FormatoDocumento = 'celular' | 'a4';
/** 'quadro_resumo' é a folha única de conferência: cabeçalho + a tabela
 *  Companhia/VTR/Setor/QTLs/Madrugada Segura, sem roteiro por viatura. */
export type TipoDocumento = 'individual' | 'consolidado' | 'quadro_resumo';
export type AgrupamentoDocumento = 'nenhum' | 'companhia' | 'categoria';
export type ConteudoDocumento = 'ordinario' | 'reforco' | 'completo';

export interface ConfiguracaoEmissao {
  modalidade: ModalidadeEmissao;
  formato: FormatoDocumento;
  tipoDocumento: TipoDocumento;
  agrupamento: AgrupamentoDocumento;
  conteudo: ConteudoDocumento;
  comAlertas: boolean;
  incluirEventos: boolean;
  incluirObservacoes: boolean;
}

export const CONFIGURACOES_MODALIDADE: Record<ModalidadeEmissao, Omit<ConfiguracaoEmissao, 'modalidade'>> = {
  guarnicao: {
    formato: 'celular', tipoDocumento: 'individual', agrupamento: 'nenhum', conteudo: 'completo',
    comAlertas: true, incluirEventos: true, incluirObservacoes: true,
  },
  arquivo_sei: {
    formato: 'a4', tipoDocumento: 'consolidado', agrupamento: 'companhia', conteudo: 'completo',
    comAlertas: false, incluirEventos: true, incluirObservacoes: true,
  },
  consolidado: {
    formato: 'a4', tipoDocumento: 'consolidado', agrupamento: 'companhia', conteudo: 'completo',
    comAlertas: false, incluirEventos: true, incluirObservacoes: true,
  },
  // A folha de conferência não carrega evento, alerta nem agrupamento: a tabela já
  // traz a Companhia como coluna, e um título de grupo a quebraria em várias.
  quadro_resumo: {
    formato: 'a4', tipoDocumento: 'quadro_resumo', agrupamento: 'nenhum', conteudo: 'completo',
    comAlertas: false, incluirEventos: false, incluirObservacoes: true,
  },
  personalizado: {
    formato: 'a4', tipoDocumento: 'consolidado', agrupamento: 'nenhum', conteudo: 'completo',
    comAlertas: false, incluirEventos: true, incluirObservacoes: true,
  },
};

export interface DocumentoAlerta {
  id: string;
  prioridade: string;
  categoria: string;
  texto: string;
  bairro: string;
}

export interface DocumentoEvento {
  id: string;
  nome: string;
  tipo: string;
  horario: string;
  local: string;
  bairro: string;
  numeroOs: string;
}

export interface DocumentoViatura {
  id: string;
  prefixo: string;
  categoria: string;
  companhia: string;
  comandante: string;
  composicao: string;
  setor: string;
  bairros: string[];
  observacao: string;
  madrugadaSegura: boolean;
  roteiro: CartaoItem[];
  eventos: DocumentoEvento[];
  alertas: DocumentoAlerta[];
  versao: number;
}

export interface DocumentoCartao {
  cabecalho: {
    numero: string;
    data: string;
    dataExtensa: string;
    diaSemana: string;
    tipoPeriodo: string;
    titulo: string;
  };
  servico: {
    janela: string;
    fiscal: string;
    adjunto: string;
    delta07Viatura: string;
  };
  viaturas: DocumentoViatura[];
  eventos: DocumentoEvento[];
  alertas: DocumentoAlerta[];
  controle: {
    modalidade: ModalidadeEmissao;
    formato: FormatoDocumento;
    tipoDocumento: TipoDocumento;
    agrupamento: AgrupamentoDocumento;
    comAlertas: boolean;
    versao: number;
    emitidoEm: Date | null;
    rodape: string;
    nomeArquivo: string;
  };
}

function nomeExibicaoPessoa(pessoa: Tables<'pessoal'> | undefined): string {
  if (!pessoa) return '';
  return `${abreviarPosto(pessoa.posto_graduacao)} PM ${pessoa.nome_guerra || pessoa.nome}`
    .toUpperCase().replace(/\s+/g, ' ').trim();
}

function resolverPessoa(id: string | null | undefined, texto: string | null | undefined, pessoal: Tables<'pessoal'>[]): string {
  const porId = id ? pessoal.find((p) => p.id === id) : undefined;
  if (porId) return nomeExibicaoPessoa(porId);
  if (!texto) return '';
  const porNome = pessoal.find((p) => normalizarTexto(p.nome) === normalizarTexto(texto));
  return porNome ? nomeExibicaoPessoa(porNome) : texto.toUpperCase().trim();
}

function bairrosDaViatura(viatura: CartaoViatura, bairros: Tables<'bairros_coordenadas'>[]): string[] {
  const ids = viatura.bairros_ids?.length ? viatura.bairros_ids : (viatura.bairro_id ? [viatura.bairro_id] : []);
  const nomes = ids
    .map((id) => bairros.find((bairro) => bairro.id === id)?.nome_bairro)
    .filter((nome): nome is string => !!nome);
  return nomes.length ? nomes : [];
}

function eventoNaArea(evento: Tables<'eventos'>, viatura: CartaoViatura, nomesBairros: string[], dataCartao: string): boolean {
  const fim = evento.data_termino || evento.data_inicio;
  if (!(evento.data_inicio <= dataCartao && dataCartao <= fim)) return false;
  const area = [viatura.setor, ...nomesBairros].map(normalizarTexto).filter(Boolean);
  const bairro = normalizarTexto(evento.bairro);
  return !!bairro && area.some((nome) => nome.includes(bairro) || bairro.includes(nome));
}

function eventosDaViatura(
  viatura: CartaoViatura,
  nomesBairros: string[],
  dataCartao: string,
  eventos: Tables<'eventos'>[],
): DocumentoEvento[] {
  return eventos.filter((evento) => eventoNaArea(evento, viatura, nomesBairros, dataCartao)).map((evento) => ({
    id: evento.id,
    nome: evento.nome_evento,
    tipo: evento.tipo_evento,
    horario: evento.horario_inicio || '',
    local: enderecoEvento(evento),
    bairro: evento.bairro || '',
    numeroOs: evento.num_os_manual || '',
  }));
}

function alertasDaViatura(
  viatura: CartaoViatura,
  avisos: Tables<'avisos'>[],
  bairros: Tables<'bairros_coordenadas'>[],
): DocumentoAlerta[] {
  const ids = new Set(viatura.avisos_ids || []);
  return avisos.filter((aviso) => ids.has(aviso.id)).map((aviso) => ({
    id: aviso.id,
    prioridade: aviso.prioridade,
    categoria: aviso.categoria || '',
    texto: aviso.texto,
    bairro: aviso.bairro_id ? bairros.find((bairro) => bairro.id === aviso.bairro_id)?.nome_bairro || '' : '',
  }));
}

function formatarInstante(data: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(data).replace(',', ' às');
}

function slugArquivo(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function nomeArquivo(data: string, viaturas: DocumentoViatura[], tipo: TipoDocumento, versao: number): string {
  const alvo = tipo === 'quadro_resumo'
    ? 'quadro-resumo'
    : tipo === 'consolidado'
      ? 'consolidado'
      : viaturas.length === 1
        ? `vtr-${slugArquivo(viaturas[0].prefixo)}`
        : `lote-${viaturas.length}-vtr`;
  return `cartao-programa-${data}-${alvo}-v${versao}`;
}

function diaDaSemana(dataIso: string): string {
  if (!dataIso) return '';
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long' })
    .format(new Date(ano, mes - 1, dia)).replace(/^./, (letra) => letra.toUpperCase());
}

function viaturaParaDocumento(
  viatura: CartaoViatura,
  cartao: CartaoDetalhado,
  pessoal: Tables<'pessoal'>[],
  bairros: Tables<'bairros_coordenadas'>[],
  eventos: Tables<'eventos'>[],
  avisos: Tables<'avisos'>[],
  configuracao: ConfiguracaoEmissao,
): DocumentoViatura {
  const nomesBairros = bairrosDaViatura(viatura, bairros);
  return {
    id: viatura.id,
    prefixo: (viatura.prefixo || '').toUpperCase(),
    categoria: viatura.categoria || '',
    companhia: viatura.companhia || '',
    comandante: resolverPessoa(viatura.comandante_pessoal_id, viatura.comandante, pessoal),
    composicao: viatura.composicao || '',
    setor: viatura.setor || '',
    bairros: nomesBairros,
    observacao: configuracao.incluirObservacoes ? viatura.observacao || '' : '',
    madrugadaSegura: /madrugada\s+segura/i.test(viatura.observacao || ''),
    roteiro: viatura.itens || [],
    eventos: configuracao.incluirEventos ? eventosDaViatura(viatura, nomesBairros, cartao.data || '', eventos) : [],
    alertas: configuracao.comAlertas ? alertasDaViatura(viatura, avisos, bairros) : [],
    versao: viatura.versao || 1,
  };
}

function baseDocumento(
  cartao: CartaoDetalhado,
  viaturas: DocumentoViatura[],
  pessoal: Tables<'pessoal'>[],
  configuracao: ConfiguracaoEmissao,
  emitidoEm: Date | null,
): DocumentoCartao {
  const versao = Math.max(1, ...viaturas.map((viatura) => viatura.versao));
  const numero = cartao.numero ? `${String(cartao.numero).padStart(6, '0')}/${cartao.ano}` : '';
  const rodape = emitidoEm
    ? `Cartão Programa nº ${numero || 'não informado'} · versão ${versao} · gerado em ${formatarInstante(emitidoEm)}`
    : `Cartão Programa nº ${numero || 'não informado'} · versão ${versao} · horário definido ao confirmar`;

  return {
    cabecalho: {
      numero,
      data: cartao.data || '',
      dataExtensa: dataBr(cartao.data),
      diaSemana: diaDaSemana(cartao.data || ''),
      tipoPeriodo: cartao.tipo_periodo === 'fim_de_semana' ? 'Fim de semana' : cartao.tipo_periodo === 'semana' ? 'Entre semana' : '',
      titulo: 'CARTÃO PROGRAMA DE PATRULHAMENTO',
    },
    servico: {
      janela: janela24h(cartao.data),
      fiscal: resolverPessoa(cartao.fiscal_pessoal_id, cartao.fiscal, pessoal),
      adjunto: resolverPessoa(cartao.adjunto_pessoal_id, cartao.adjunto, pessoal),
      delta07Viatura: (cartao.delta07_viatura || '').toUpperCase(),
    },
    viaturas,
    eventos: viaturas.flatMap((viatura) => viatura.eventos),
    alertas: viaturas.flatMap((viatura) => viatura.alertas),
    controle: {
      modalidade: configuracao.modalidade,
      formato: configuracao.formato,
      tipoDocumento: configuracao.tipoDocumento,
      agrupamento: configuracao.agrupamento,
      comAlertas: configuracao.comAlertas,
      versao,
      emitidoEm,
      rodape,
      nomeArquivo: nomeArquivo(cartao.data || 'sem-data', viaturas, configuracao.tipoDocumento, versao),
    },
  };
}

export function filtrarViaturasPorConteudo(viaturas: CartaoViatura[], conteudo: ConteudoDocumento): CartaoViatura[] {
  if (conteudo === 'completo') return viaturas;
  if (conteudo === 'ordinario') return viaturas.filter((viatura) => (viatura.categoria || 'Ordinária') === 'Ordinária');
  return viaturas.filter((viatura) => ['Força Tática', 'Suplementar'].includes(viatura.categoria || ''));
}

export function montarDocumentosCartao(
  cartao: CartaoDetalhado,
  viaturasSelecionadas: CartaoViatura[],
  pessoal: Tables<'pessoal'>[],
  bairros: Tables<'bairros_coordenadas'>[],
  eventos: Tables<'eventos'>[],
  avisos: Tables<'avisos'>[],
  configuracao: ConfiguracaoEmissao,
  emitidoEm: Date | null,
): DocumentoCartao[] {
  const viaturas = viaturasSelecionadas.map((viatura) =>
    viaturaParaDocumento(viatura, cartao, pessoal, bairros, eventos, avisos, configuracao));

  if (configuracao.tipoDocumento === 'individual') {
    return viaturas.map((viatura) => baseDocumento(cartao, [viatura], pessoal, configuracao, emitidoEm));
  }
  return [baseDocumento(cartao, viaturas, pessoal, configuracao, emitidoEm)];
}

export function estimarPaginas(documentos: DocumentoCartao[]): number {
  return documentos.reduce((total, documento) => {
    // Folha única por definição: é uma linha de tabela por viatura, e o cartão do
    // dia tem 5 a 7 viaturas. Não estimar por peso evita prometer 2 páginas.
    if (documento.controle.tipoDocumento === 'quadro_resumo') return total + 1;
    if (documento.controle.tipoDocumento === 'individual') {
      const viatura = documento.viaturas[0];
      const peso = viatura.roteiro.length + viatura.eventos.length * 2 + viatura.alertas.length * 2
        + Math.ceil((viatura.observacao.length + viatura.composicao.length) / 180);
      return total + Math.max(1, Math.ceil(peso / (documento.controle.formato === 'celular' ? 12 : 22)));
    }
    const peso = documento.viaturas.reduce((soma, viatura) => soma + 5 + viatura.roteiro.length
      + viatura.eventos.length * 2 + viatura.alertas.length * 2 + Math.ceil(viatura.observacao.length / 180), 0);
    return total + Math.max(1, Math.ceil(peso / 24));
  }, 0);
}

export function documentoCartaoEmTexto(documento: DocumentoCartao): string {
  const linhas: string[] = ['*POLÍCIA MILITAR DO ESTADO DO RIO GRANDE DO NORTE — 5º BPM*', `*${documento.cabecalho.titulo}*`];
  if (documento.cabecalho.numero) linhas.push(`Nº ${documento.cabecalho.numero}`);
  linhas.push(`${documento.cabecalho.dataExtensa} · ${documento.cabecalho.diaSemana} · ${documento.cabecalho.tipoPeriodo}`, '');
  const par = (rotulo: string, valor: string) => { if (valor) linhas.push(`*${rotulo}:* ${valor}`); };
  par('Período', documento.servico.janela);
  par('Fiscal de Operações', documento.servico.fiscal);
  par('Adjunto', documento.servico.adjunto);
  par('VTR do Delta 07', documento.servico.delta07Viatura);

  // O Quadro Resumo é uma tabela: repetir o bloco por viatura viraria um texto
  // longo justamente onde se quer a visão de uma folha só.
  if (documento.controle.tipoDocumento === 'quadro_resumo') {
    linhas.push('', '*QUADRO RESUMO*');
    ordenarViaturasQuadroResumo(documento.viaturas).forEach((viatura) => {
      const campos = [
        viatura.companhia || 'Sem Companhia',
        `VTR ${viatura.prefixo}`,
        viatura.setor,
        `Almoço: ${horarioDaAtividade(viatura.roteiro, 'QTL Almoço') || '-'}`,
        `Jantar: ${horarioDaAtividade(viatura.roteiro, 'QTL Jantar') || '-'}`,
        `Madrugada Segura: ${madrugadaSeguraTexto(viatura.roteiro, viatura.observacao) || '-'}`,
      ];
      linhas.push(`- ${campos.filter(Boolean).join(' · ')}`);
    });
    linhas.push('', documento.controle.rodape);
    return linhas.join('\n');
  }

  documento.viaturas.forEach((viatura) => {
    linhas.push('', `*VTR ${viatura.prefixo}*`);
    par('Categoria', viatura.categoria);
    par('Companhia', viatura.companhia);
    par('Comandante', viatura.comandante);
    par('Composição da guarnição', viatura.composicao);
    par('Setor', viatura.setor);
    par('Bairros atendidos', viatura.bairros.join(', '));
    par('Observações', viatura.observacao);
    if (viatura.madrugadaSegura) linhas.push('*Emprego:* Madrugada Segura');
    if (viatura.eventos.length) {
      linhas.push('*Eventos na área:*');
      viatura.eventos.forEach((evento) => linhas.push(`- ${evento.horario ? evento.horario + ' · ' : ''}${evento.nome} — ${evento.local}`));
    }
    if (viatura.roteiro.length) {
      linhas.push('*Roteiro:*');
      viatura.roteiro.forEach((item) => linhas.push(`- ${item.inicio}${item.fim ? `–${item.fim}` : ''} · ${item.atividade} · ${item.local}`));
    }
    if (documento.controle.comAlertas && viatura.alertas.length) {
      linhas.push('*Alertas:*');
      viatura.alertas.forEach((alerta) => linhas.push(`- ${alerta.prioridade.toUpperCase()}${alerta.categoria ? ` · ${alerta.categoria}` : ''}: ${alerta.texto}`));
    }
  });
  linhas.push('', documento.controle.rodape);
  return linhas.join('\n');
}
