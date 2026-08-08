import type { CartaoDetalhado } from './cartaoConflitos';

export const CABECALHO_VERSAO_CARTAO = 'X-Cartao-Atualizado-Em';
export const CODIGO_CARTAO_DESATUALIZADO = 'CARTAO_DESATUALIZADO';
export const CODIGO_VERSAO_CARTAO_OBRIGATORIA = 'VERSAO_CARTAO_OBRIGATORIA';

type VersaoCartao = Pick<CartaoDetalhado, 'atualizado_em'>;

export function cabecalhosVersaoCartao(cartao: VersaoCartao | null | undefined): Record<string, string> {
  return cartao?.atualizado_em ? { [CABECALHO_VERSAO_CARTAO]: cartao.atualizado_em } : {};
}

export interface ErroApiCartao {
  code?: string;
  error?: string;
}

export function ehConflitoDeCartao(resposta: Response, corpo: ErroApiCartao): boolean {
  return (
    (resposta.status === 409 && corpo.code === CODIGO_CARTAO_DESATUALIZADO)
    || (resposta.status === 428 && corpo.code === CODIGO_VERSAO_CARTAO_OBRIGATORIA)
  );
}

export async function extrairErroCartao(
  resposta: Response,
  mensagemPadrao: string,
  aoConflito: (mensagem?: string) => void,
): Promise<string> {
  const corpo = (await resposta.json().catch(() => ({}))) as ErroApiCartao;
  if (ehConflitoDeCartao(resposta, corpo)) aoConflito(corpo.error);
  return corpo.error || mensagemPadrao;
}
