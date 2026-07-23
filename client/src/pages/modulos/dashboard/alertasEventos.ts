import type { Tables } from '../../../types/supabase';

function getLocalDateStr(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Eventos em andamento ou que começam nos próximos 3 dias e ainda não têm Número
 * da OS e/ou Número SEI — espelha calcularAlertasEventosUrgentes() em public/app.js. */
export function calcularAlertasEventosUrgentes(eventos: Tables<'eventos'>[]): string[] {
  const hojeStr = getLocalDateStr();
  const hoje = new Date(hojeStr + 'T00:00:00');
  const alertas: string[] = [];

  eventos.forEach((evt) => {
    const faltando: string[] = [];
    if (!evt.num_os_manual) faltando.push('Número da OS');
    if (!evt.num_sei) faltando.push('Número SEI');
    if (faltando.length === 0) return;

    const dataInicio = new Date(evt.data_inicio + 'T00:00:00');
    const dataFim = new Date((evt.data_termino || evt.data_inicio) + 'T00:00:00');
    const diffDias = Math.round((dataInicio.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    const emAndamento = dataInicio <= hoje && hoje <= dataFim;

    if (!emAndamento && !(diffDias >= 0 && diffDias <= 3)) return;

    const dataBr = evt.data_inicio.split('-').reverse().join('/');
    let quando: string;
    if (emAndamento) quando = 'está em andamento';
    else if (diffDias === 0) quando = 'ocorre hoje';
    else if (diffDias === 1) quando = 'ocorre amanhã';
    else quando = `ocorre em ${diffDias} dias`;

    alertas.push(
      `Evento "${evt.nome_evento}" ${quando} (${dataBr}) e ainda está sem ${faltando.join(' e sem ')} informado.`,
    );
  });

  return alertas;
}
