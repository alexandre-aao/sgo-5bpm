import { useMemo } from 'react';
import { CalendarRange, ShieldAlert, Contact, MapPin, ArrowRight, Plus, Route } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { normalizarTexto } from '../../lib/cartaoConflitos';
import { ALL_NAV_ITEMS, type SectionId } from '../../layout/navConfig';
import type { Role } from '../../types/auth';
import type { AppData } from '../../context/app-data-context';
import type { Tables } from '../../types/supabase';

export type GrupoResultado = 'Ir para' | 'Ações' | 'Eventos' | 'Operações' | 'Pessoal' | 'Bairros';

export interface ResultadoPaleta {
  id: string;
  grupo: GrupoResultado;
  rotulo: string;
  detalhe?: string;
  icone: LucideIcon;
  /** Para onde navegar ao escolher. */
  destino: string;
}

/** Máximo por grupo: a paleta é para escolher rápido, não para paginar. Sem o
 *  corte, digitar "a" traria 463 eventos e 244 militares numa lista só. */
const LIMITE_POR_GRUPO = 5;

function dataBrCurta(iso: string | null): string {
  return iso ? iso.split('-').reverse().join('/') : '';
}

/**
 * Resultados da paleta de comandos, já filtrados pelo PERFIL: cada item só
 * aparece se o destino for permitido ao usuário. Isso não é segurança — as rotas
 * do servidor continuam sendo a autoridade —, é para não oferecer ao Adjunto um
 * atalho que vai bater em 403.
 */
export function useResultadosPaleta(
  termo: string,
  dados: AppData,
  bairros: Tables<'bairros_coordenadas'>[],
  role: Role | undefined,
): ResultadoPaleta[] {
  return useMemo(() => {
    if (!role) return [];

    const busca = normalizarTexto(termo).trim();
    const permitido = (id: SectionId) =>
      ALL_NAV_ITEMS.some((item) => item.id === id && item.roles.includes(role));

    const casa = (...campos: (string | null | undefined)[]) =>
      !busca || campos.some((c) => normalizarTexto(c || '').includes(busca));

    const resultados: ResultadoPaleta[] = [];

    // --- Navegação --------------------------------------------------------
    for (const item of ALL_NAV_ITEMS) {
      if (!item.roles.includes(role)) continue;
      if (!casa(item.label)) continue;
      resultados.push({
        id: `nav-${item.id}`,
        grupo: 'Ir para',
        rotulo: item.label,
        icone: ArrowRight,
        destino: `/${item.id}`,
      });
    }

    // --- Ações rápidas ----------------------------------------------------
    const acoes: { id: string; rotulo: string; secao: SectionId; destino: string; icone: LucideIcon }[] = [
      { id: 'novo-evento', rotulo: 'Novo evento', secao: 'cadastro', destino: '/cadastro', icone: Plus },
      { id: 'cartao-hoje', rotulo: 'Cartão Programa de hoje', secao: 'cartao', destino: '/cartao', icone: Route },
      { id: 'nova-operacao', rotulo: 'Nova operação', secao: 'operacoes', destino: '/operacoes', icone: Plus },
    ];
    for (const acao of acoes) {
      if (!permitido(acao.secao) || !casa(acao.rotulo)) continue;
      resultados.push({
        id: `acao-${acao.id}`,
        grupo: 'Ações',
        rotulo: acao.rotulo,
        icone: acao.icone,
        destino: acao.destino,
      });
    }

    // Sem termo, mostra só navegação e ações: listar registro sem busca não
    // ajuda a escolher e enche a paleta.
    if (!busca) return resultados;

    // --- Registros --------------------------------------------------------
    if (permitido('eventos')) {
      for (const evt of dados.eventos) {
        if (resultados.filter((r) => r.grupo === 'Eventos').length >= LIMITE_POR_GRUPO) break;
        if (!casa(evt.nome_evento, evt.bairro, evt.local_itinerario, evt.num_os_manual, evt.num_sei)) continue;
        resultados.push({
          id: `evt-${evt.id}`,
          grupo: 'Eventos',
          rotulo: evt.nome_evento,
          detalhe: [dataBrCurta(evt.data_inicio), evt.bairro].filter(Boolean).join(' · '),
          icone: CalendarRange,
          destino: `/eventos?evento=${encodeURIComponent(evt.id)}`,
        });
      }
    }

    if (permitido('operacoes')) {
      for (const op of dados.operacoes) {
        if (resultados.filter((r) => r.grupo === 'Operações').length >= LIMITE_POR_GRUPO) break;
        if (!casa(op.nome_operacao, op.bairro, op.tipo_operacao, op.demandante)) continue;
        resultados.push({
          id: `op-${op.id}`,
          grupo: 'Operações',
          rotulo: op.nome_operacao,
          detalhe: [dataBrCurta(op.data_inicio), op.tipo_operacao, op.situacao].filter(Boolean).join(' · '),
          icone: ShieldAlert,
          destino: `/operacoes?operacao=${encodeURIComponent(op.id)}`,
        });
      }
    }

    if (permitido('pessoal')) {
      for (const p of dados.pessoal) {
        if (resultados.filter((r) => r.grupo === 'Pessoal').length >= LIMITE_POR_GRUPO) break;
        // Mesmos campos do autocomplete de escala: nome, nome de guerra e matrícula.
        if (!casa(p.nome, p.nome_guerra, p.matricula)) continue;
        resultados.push({
          id: `pes-${p.id}`,
          grupo: 'Pessoal',
          rotulo: p.nome_guerra || p.nome,
          detalhe: [p.posto_graduacao, p.matricula].filter(Boolean).join(' · '),
          icone: Contact,
          destino: `/pessoal?busca=${encodeURIComponent(p.nome_guerra || p.nome)}`,
        });
      }
    }

    if (permitido('mapa')) {
      for (const b of bairros) {
        if (resultados.filter((r) => r.grupo === 'Bairros').length >= LIMITE_POR_GRUPO) break;
        if (!casa(b.nome_bairro)) continue;
        resultados.push({
          id: `bairro-${b.id}`,
          grupo: 'Bairros',
          rotulo: b.nome_bairro,
          // Leva ao Mapa, sem centralizar no bairro: focar exigiria esperar o
          // Leaflet montar, e um foco que falha às vezes é pior que não prometer.
          detalhe: b.ativo === false ? 'inativo · abre o Mapa' : 'abre o Mapa',
          icone: MapPin,
          destino: '/mapa',
        });
      }
    }

    return resultados;
  }, [termo, dados, bairros, role]);
}
