import type { Tables } from '../../../types/supabase';
import { calcularAlertasCartao, type CartaoDetalhado } from '../../../lib/cartaoConflitos';

export interface AvisoExibicao {
  mensagem: string;
  deCartao: boolean;
}

/** Conflitos do cartão do dia + eventos do dia sem Nº OS/Nº SEI — espelha o
 * cálculo de `avisos` em renderTurnoTab() (public/app.js). Ao contrário de
 * calcularAlertasEventosUrgentes() (Dashboard, janela de 3 dias), aqui é só o
 * dia selecionado. */
export function calcularAvisosDoTurno(cartao: CartaoDetalhado | null, eventos: Tables<'eventos'>[], pessoal: Tables<'pessoal'>[]): AvisoExibicao[] {
  const avisosCartao: AvisoExibicao[] = cartao
    ? calcularAlertasCartao(cartao, pessoal).map((a) => ({ mensagem: a.mensagem, deCartao: true }))
    : [];

  const avisosEventos: AvisoExibicao[] = [];
  eventos.forEach((evt) => {
    const faltando: string[] = [];
    if (!evt.num_os_manual) faltando.push('Número da OS');
    if (!evt.num_sei) faltando.push('Número SEI');
    if (faltando.length > 0) {
      avisosEventos.push({ mensagem: `"${evt.nome_evento}" sem ${faltando.join(' e sem ')}.`, deCartao: false });
    }
  });

  return [...avisosCartao, ...avisosEventos];
}
