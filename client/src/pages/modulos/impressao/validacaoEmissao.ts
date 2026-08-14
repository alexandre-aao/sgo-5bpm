import type { Tables } from '../../../types/supabase';
import type { CartaoDetalhado, CartaoViatura } from '../../../lib/cartaoConflitos';
import { calcularAlertasCartao } from '../../../lib/cartaoConflitos';
import type { ConfiguracaoEmissao, DocumentoCartao } from './documentoCartao';
import { estimarPaginas } from './documentoCartao';

export interface ResultadoValidacaoEmissao {
  erros: string[];
  avisos: string[];
  paginasEstimadas: number;
}

const vazio = (valor: string | null | undefined) => !valor || !valor.trim();

export function validarCentralEmissao(
  cartao: CartaoDetalhado,
  viaturas: CartaoViatura[],
  configuracao: ConfiguracaoEmissao,
  documentos: DocumentoCartao[],
  pessoal: Tables<'pessoal'>[],
): ResultadoValidacaoEmissao {
  const erros: string[] = [];
  const avisos: string[] = [];

  if (!cartao.data) erros.push('O Cartão Programa está sem data.');
  if (viaturas.length === 0) erros.push('Selecione ao menos uma viatura para emitir.');
  if (!cartao.fiscal_pessoal_id && vazio(cartao.fiscal)) erros.push('Fiscal de Operações não informado.');
  if (!cartao.adjunto_pessoal_id && vazio(cartao.adjunto)) erros.push('Adjunto não informado.');

  viaturas.forEach((viatura) => {
    const prefixo = viatura.prefixo || 'sem prefixo';
    if (vazio(viatura.prefixo)) erros.push('Existe uma viatura sem prefixo.');
    if (!viatura.comandante_pessoal_id && vazio(viatura.comandante)) erros.push(`VTR ${prefixo}: comandante não informado.`);
    if ((viatura.itens || []).length === 0) erros.push(`VTR ${prefixo}: roteiro vazio.`);
    if (vazio(viatura.companhia)) avisos.push(`VTR ${prefixo}: Companhia não informada.`);
    if (vazio(viatura.setor)) avisos.push(`VTR ${prefixo}: setor operacional não informado.`);
    if ((viatura.observacao || '').length > 280) avisos.push(`VTR ${prefixo}: observação extensa; confira a quebra de página.`);
  });

  // A conferência pertence ao recorte efetivamente emitido. Sem essa redução,
  // selecionar uma única viatura ainda mostraria conflitos das desmarcadas.
  const cartaoDoRecorte: CartaoDetalhado = {
    ...cartao,
    // CartaoDetalhado combina o JSONB gerado pelo Supabase com o tipo rico do
    // frontend; o recorte preserva exatamente a mesma estrutura em runtime.
    viaturas: viaturas as unknown as CartaoDetalhado['viaturas'],
  };
  calcularAlertasCartao(cartaoDoRecorte, pessoal).forEach((alerta) => avisos.push(alerta.mensagem));
  const paginasEstimadas = estimarPaginas(documentos);
  if (paginasEstimadas >= 8) avisos.push(`Documento extenso: estimativa de ${paginasEstimadas} páginas.`);
  if (documentos.some((documento) => documento.alertas.some((alerta) => alerta.texto.length > 200))) {
    avisos.push('Há alerta operacional extenso; confira a prévia antes de emitir.');
  }
  if (configuracao.incluirEventos && viaturas.some((viatura) => !viatura.setor && !(viatura.bairros_ids?.length || viatura.bairro_id))) {
    avisos.push('Há viatura sem setor ou bairro associado; eventos da área podem não ser identificados.');
  }

  return { erros: [...new Set(erros)], avisos: [...new Set(avisos)], paginasEstimadas };
}
