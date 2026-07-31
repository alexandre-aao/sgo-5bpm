import type { Tables } from '../types/supabase';

export type PrioridadeAviso = 'informativa' | 'atencao' | 'alta' | 'critica';

export const PRIORIDADES_AVISO: PrioridadeAviso[] = ['critica', 'alta', 'atencao', 'informativa'];

export const ROTULO_PRIORIDADE: Record<PrioridadeAviso, string> = {
  critica: 'Crítica',
  alta: 'Alta',
  atencao: 'Atenção',
  informativa: 'Informativa',
};

/** Teto por cartão — protege o formato de uma página por viatura. O servidor
 *  aplica o mesmo limite (MAX_AVISOS_POR_CARTAO em server.js). */
export const MAX_AVISOS_POR_CARTAO = 4;

/** Prioridades que já vêm marcadas quando o Adjunto escolhe o bairro: o que é
 *  alta ou crítica entra por padrão; o resto fica visível, mas desmarcado. */
export const PRIORIDADES_PRE_MARCADAS: PrioridadeAviso[] = ['alta', 'critica'];

export const LIMITE_TEXTO_AVISO = 240;

/** Data de hoje no fuso do batalhão (UTC-3), não no do navegador — mesma regra
 *  do hojeISO() em server.js, para a vigência não divergir por fuso. */
export function hojeISO(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function avisoVigente(aviso: Tables<'avisos'>, hoje = hojeISO()): boolean {
  if (!aviso.ativo) return false;
  if (aviso.data_inicio && aviso.data_inicio > hoje) return false;
  if (aviso.permanente) return true;
  if (aviso.data_fim && aviso.data_fim < hoje) return false;
  return true;
}

/** Dias que faltam para vencer. null = permanente ou sem prazo definido. */
export function diasParaVencer(aviso: Tables<'avisos'>, hoje = hojeISO()): number | null {
  if (aviso.permanente || !aviso.data_fim) return null;
  const [ay, am, ad] = hoje.split('-').map(Number);
  const [by, bm, bd] = aviso.data_fim.split('-').map(Number);
  const msPorDia = 24 * 60 * 60 * 1000;
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / msPorDia);
}

/** "Vencendo": ainda vigente, mas com prazo dentro da janela — é a fila de
 *  trabalho da P3 para renovar ou encerrar antes que o aviso saia do ar. */
export function vencendoEm(aviso: Tables<'avisos'>, dias = 7, hoje = hojeISO()): boolean {
  if (!avisoVigente(aviso, hoje)) return false;
  const restantes = diasParaVencer(aviso, hoje);
  return restantes !== null && restantes <= dias;
}

/** Ordena por prioridade (mais grave primeiro) e, entre iguais, pelo mais recente. */
export function ordenarPorPrioridade(avisos: Tables<'avisos'>[]): Tables<'avisos'>[] {
  return [...avisos].sort((a, b) => {
    const peso =
      PRIORIDADES_AVISO.indexOf(a.prioridade as PrioridadeAviso) -
      PRIORIDADES_AVISO.indexOf(b.prioridade as PrioridadeAviso);
    if (peso !== 0) return peso;
    return String(b.criado_em || '').localeCompare(String(a.criado_em || ''));
  });
}

export function prioridadeBadgeClass(prioridade: string): string {
  return `prio-${prioridade}`;
}

/**
 * Bairros que uma viatura cobre, em ordem de confiança:
 *  1. o `bairro_id` escolhido pelo Adjunto (vínculo explícito);
 *  2. o `setor` casado por nome — rede de segurança, porque as viaturas
 *     lançadas antes deste módulo não têm `bairro_id` e ficariam sem aviso nenhum;
 *  3. os bairros citados nos locais do roteiro — é o caso "a viatura atua em
 *     mais de um bairro".
 * Sem repetir. O casamento por nome é normalizado (sem acento, minúsculas).
 */
export function bairrosDaViatura(
  viatura: { bairro_id?: string; setor?: string; itens?: { local: string }[] },
  bairros: Tables<'bairros_coordenadas'>[],
): { bairro: Tables<'bairros_coordenadas'>; explicito: boolean }[] {
  const norm = (t: string | undefined | null) =>
    (t || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();

  const encontrados = new Map<string, { bairro: Tables<'bairros_coordenadas'>; explicito: boolean }>();

  if (viatura.bairro_id) {
    const b = bairros.find((x) => x.id === viatura.bairro_id);
    if (b) encontrados.set(b.id, { bairro: b, explicito: true });
  }

  const textos = [viatura.setor || '', ...(viatura.itens || []).map((i) => i.local || '')];
  textos.forEach((texto) => {
    const t = norm(texto);
    if (!t) return;
    bairros.forEach((b) => {
      const nb = norm(b.nome_bairro);
      if (!nb || encontrados.has(b.id)) return;
      if (t === nb || t.includes(nb)) encontrados.set(b.id, { bairro: b, explicito: false });
    });
  });

  return [...encontrados.values()];
}

/** Avisos que se aplicam a uma viatura: os dos bairros que ela cobre, mais os
 *  da Companhia dela. Só vigentes, ordenados por prioridade, sem repetir. */
export function avisosDaViatura(
  avisos: Tables<'avisos'>[],
  bairrosIds: string[],
  companhia: string | undefined,
  hoje = hojeISO(),
): Tables<'avisos'>[] {
  const vigentes = avisos.filter((a) => avisoVigente(a, hoje));
  const aplicaveis = vigentes.filter((a) => {
    const porBairro = a.bairro_id && bairrosIds.includes(a.bairro_id);
    // Aviso só de Companhia (sem bairro) vale para toda viatura daquela Companhia.
    const porCompanhia = !a.bairro_id && a.companhia && companhia && a.companhia === companhia;
    return porBairro || porCompanhia;
  });
  return ordenarPorPrioridade(aplicaveis);
}
