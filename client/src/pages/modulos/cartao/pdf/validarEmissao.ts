import type { CartaoDetalhado, CartaoViatura } from '../../../../lib/cartaoConflitos';

/**
 * Pendências que impedem emitir o documento.
 *
 * Diferente dos alertas de conflito do trilho (sobreposição de horário, Praça
 * sem Oficial de Sobreaviso), que são deliberadamente NÃO-bloqueantes: aqueles
 * apontam risco operacional num cartão completo; estes apontam campo em branco,
 * que produziria um documento com rótulo órfão e ainda assim marcaria a viatura
 * como "gerado".
 */
export interface PendenciaEmissao {
  /** Onde o operador corrige — a lista na tela agrupa por isto. */
  origem: 'cabecalho' | 'viatura';
  mensagem: string;
}

const vazio = (valor: string | null | undefined) => !valor || !valor.trim();

/** Campos de nível DIA: valem para todas as viaturas do cartão. */
export function validarCabecalhoParaEmissao(cartao: CartaoDetalhado): PendenciaEmissao[] {
  const pendencias: PendenciaEmissao[] = [];
  const faltou = (mensagem: string) => pendencias.push({ origem: 'cabecalho', mensagem });

  if (vazio(cartao.tipo_periodo)) faltou('Tipo de cartão (Semana ou Fim de Semana) não selecionado.');
  // Texto livre conta: cartão antigo guarda só o nome, sem id do cadastro.
  if (!cartao.fiscal_pessoal_id && vazio(cartao.fiscal)) faltou('Delta 07 (Fiscal de Operações) não informado.');
  if (vazio(cartao.delta07_viatura)) faltou('Guarnição do Delta 07 não informada.');
  if (!cartao.adjunto_pessoal_id && vazio(cartao.adjunto)) faltou('Adjunto não informado.');

  return pendencias;
}

/** Campos de nível VIATURA: cada página do documento precisa dos três. */
export function validarViaturaParaEmissao(viatura: CartaoViatura): PendenciaEmissao[] {
  const pendencias: PendenciaEmissao[] = [];
  const prefixo = viatura.prefixo || 'sem prefixo';
  const faltou = (mensagem: string) => pendencias.push({ origem: 'viatura', mensagem: `VTR ${prefixo}: ${mensagem}` });

  if (!viatura.comandante_pessoal_id && vazio(viatura.comandante)) faltou('sem comandante.');
  if (vazio(viatura.companhia)) faltou('sem Companhia.');
  if ((viatura.itens || []).length === 0) faltou('roteiro vazio, nenhum item lançado.');

  return pendencias;
}

/**
 * Tudo que impede emitir este recorte. Lista vazia = pode gerar.
 * O recorte sem nenhuma viatura é erro próprio: o documento sairia sem página
 * nenhuma, que é justamente a folha em branco que não pode acontecer.
 */
export function validarEmissao(cartao: CartaoDetalhado, viaturas: CartaoViatura[]): PendenciaEmissao[] {
  if (viaturas.length === 0) {
    return [{ origem: 'viatura', mensagem: 'Nenhuma viatura neste recorte — não há o que gerar.' }];
  }
  return [
    ...validarCabecalhoParaEmissao(cartao),
    ...viaturas.flatMap(validarViaturaParaEmissao),
  ];
}
