import type { Tables } from '../../../types/supabase';
import { calcularAlertasCartao, type CartaoDetalhado } from '../../../lib/cartaoConflitos';

export interface AvisoExibicao {
  mensagem: string;
  deCartao: boolean;
}

export interface AtividadeParaAviso {
  nome: string;
  num_os_manual: string | null;
  num_sei: string | null;
}

/** Conflitos do cartão do dia + atividades do dia sem Nº OS/Nº SEI — espelha o
 * cálculo de `avisos` em renderTurnoTab() (public/app.js). Ao contrário de
 * calcularAlertasEventosUrgentes() (Dashboard, janela de 3 dias), aqui é só o
 * dia selecionado. */
export function calcularAvisosDoTurno(cartao: CartaoDetalhado | null, atividades: AtividadeParaAviso[], pessoal: Tables<'pessoal'>[]): AvisoExibicao[] {
  const avisosCartao: AvisoExibicao[] = cartao
    ? calcularAlertasCartao(cartao, pessoal).map((a) => ({ mensagem: a.mensagem, deCartao: true }))
    : [];

  const avisosAtividades: AvisoExibicao[] = [];
  atividades.forEach((atividade) => {
    const faltando: string[] = [];
    if (!atividade.num_os_manual) faltando.push('Número da OS');
    if (!atividade.num_sei) faltando.push('Número SEI');
    if (faltando.length > 0) {
      avisosAtividades.push({ mensagem: `"${atividade.nome}" sem ${faltando.join(' e sem ')}.`, deCartao: false });
    }
  });

  return [...avisosCartao, ...avisosAtividades];
}
