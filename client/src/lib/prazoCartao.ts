// Prazo de edição/exclusão do Cartão Programa pelo Adjunto/Oficial: até 08h00 do dia
// SEGUINTE à data do serviço, no fuso America/Fortaleza.
//
// Espelho exato de prazoEdicaoCartao()/bloqueioEdicaoCartao() em server.js — o servidor
// é quem decide de fato (403); isto existe pra travar a UI antes do request e explicar o
// motivo ao operador. Se a regra mudar, mudar nos dois lugares.
//
// Fortaleza é UTC-3 o ano inteiro (o Ceará nunca adotou horário de verão e o Brasil o
// extinguiu em 2019), então o offset fixo basta e evita puxar uma lib de fuso.
const OFFSET_FORTALEZA = '-03:00';

export type RoleUsuario = 'P3' | 'Adjunto' | 'Oficial';

/** Instante limite de edição de um cartão daquela data. null para modelo (sem data). */
export function prazoEdicaoCartao(dataCartao: string | null | undefined): Date | null {
  if (!dataCartao) return null;
  const diaSeguinte = new Date(`${dataCartao}T00:00:00${OFFSET_FORTALEZA}`);
  diaSeguinte.setUTCDate(diaSeguinte.getUTCDate() + 1);
  const ano = diaSeguinte.getUTCFullYear();
  const mes = String(diaSeguinte.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(diaSeguinte.getUTCDate()).padStart(2, '0');
  return new Date(`${ano}-${mes}-${dia}T08:00:00${OFFSET_FORTALEZA}`);
}

export function dentroDoPrazoCartao(dataCartao: string | null | undefined, agora = new Date()): boolean {
  const limite = prazoEdicaoCartao(dataCartao);
  if (!limite) return true;
  return agora.getTime() <= limite.getTime();
}

export function formatarPrazoCartao(dataCartao: string | null | undefined): string {
  const limite = prazoEdicaoCartao(dataCartao);
  if (!limite) return '';
  return limite.toLocaleString('pt-BR', {
    timeZone: 'America/Fortaleza',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface AlvoPrazo {
  data: string | null;
  is_template: boolean;
}

/** Quem pode editar este cartão agora. Adjunto e Oficial têm exatamente os mesmos
 * poderes; a P3 não tem prazo. Modelos são P3-only. */
export function podeEditarCartao(cartao: AlvoPrazo, role: string | undefined, agora = new Date()): boolean {
  if (!role) return false;
  if (role === 'P3') return true;
  if (role !== 'Adjunto' && role !== 'Oficial') return false;
  if (cartao.is_template) return false;
  return dentroDoPrazoCartao(cartao.data, agora);
}

/** Mensagem explicando por que a edição está travada — null quando pode editar. */
export function motivoBloqueioCartao(cartao: AlvoPrazo, role: string | undefined, agora = new Date()): string | null {
  if (podeEditarCartao(cartao, role, agora)) return null;
  if (cartao.is_template) return 'Apenas a P3 edita modelos de cartão.';
  if (role !== 'Adjunto' && role !== 'Oficial') return 'Seu perfil não tem permissão para editar o Cartão Programa.';
  return `Prazo encerrado em ${formatarPrazoCartao(cartao.data)}. Alterações agora só pela P3.`;
}
