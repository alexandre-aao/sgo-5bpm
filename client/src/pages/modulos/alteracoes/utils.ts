import type {
  AlteracaoServico,
  ComposicaoServico,
  ImpactoAlteracao,
  ResumoOperacional,
  ResumoResposta,
  ResumoUnidade,
} from './types';

export function dataLocalIso(data = new Date()): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export function adicionarDias(iso: string, dias: number): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const data = new Date(ano, (mes || 1) - 1, dia || 1);
  data.setDate(data.getDate() + dias);
  return dataLocalIso(data);
}

export function dataBr(iso?: string | null): string {
  if (!iso) return '—';
  const parte = iso.slice(0, 10);
  const [ano, mes, dia] = parte.split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso;
}

export function dataHoraBr(value?: string | number | null): string {
  if (!value) return '—';
  const data = new Date(typeof value === 'number' ? value : value);
  if (Number.isNaN(data.getTime())) return String(value);
  return data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function texto(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function numero(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pessoaNome(value: unknown): string {
  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>;
    return texto(item.nome ?? item.nome_guerra ?? item.policial_nome);
  }
  return texto(value);
}

export function normalizarImpacto(value: unknown): ImpactoAlteracao | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const datas = Array.isArray(item.servicosAfetados)
    ? item.servicosAfetados.map(texto).filter(Boolean)
    : Array.isArray(item.datas_servicos)
    ? item.datas_servicos.map(texto).filter(Boolean)
    : Array.isArray(item.servicos_afetados)
      ? item.servicos_afetados.map((itemServico) => texto(itemServico)).filter(Boolean)
      : [];
  return {
    dias_corridos: item.quantidadeDiasCorridos == null ? (item.dias_corridos == null ? null : numero(item.dias_corridos)) : numero(item.quantidadeDiasCorridos),
    servicos_atingidos: item.servicos_atingidos == null
      ? (item.quantidadeServicosAfetados == null ? (item.quantidade_servicos == null ? null : numero(item.quantidade_servicos)) : numero(item.quantidadeServicosAfetados))
      : numero(item.servicos_atingidos),
    datas_servicos: datas,
    proximo_servico: texto(item.proximoServicoProjetado || item.proximo_servico || item.proximo_servico_projetado) || null,
    impacto_liquido: item.impacto_liquido == null ? null : numero(item.impacto_liquido),
  };
}

export function normalizarAlteracao(value: unknown): AlteracaoServico {
  const item = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const policial = item.policial && typeof item.policial === 'object' ? item.policial as Record<string, unknown> : null;
  const substituto = item.substituto && typeof item.substituto === 'object' ? item.substituto as Record<string, unknown> : null;
  const inicio = texto(item.data_inicio ?? item.data ?? item.data_servico).slice(0, 10);
  const fim = texto(item.data_fim ?? item.data_termino).slice(0, 10);
  return {
    ...item,
    id: texto(item.id) || crypto.randomUUID(),
    unidade: texto(item.unidade),
    data: inicio || null,
    data_inicio: inicio,
    data_fim: fim || null,
    turno: texto(item.turno),
    policial_id: texto(item.policial_pessoal_id ?? item.policial_id ?? policial?.id) || null,
    policial_nome: texto(item.policial_nome ?? item.nome_policial ?? policial?.nome ?? policial?.nome_guerra),
    policial_matricula: texto(item.policial_matricula ?? item.matricula ?? policial?.matricula) || null,
    policial: policial ? {
      id: texto(policial.id) || undefined,
      nome: pessoaNome(policial),
      matricula: texto(policial.matricula) || null,
      posto_graduacao: texto(policial.posto_graduacao) || null,
      subunidade: texto(policial.subunidade) || null,
    } : null,
    tipo: texto(item.tipo || item.tipo_alteracao) || 'OUTRO',
    substituto_id: texto(item.substituto_pessoal_id ?? item.substituto_id ?? substituto?.id) || null,
    substituto_nome: texto(item.substituto_nome ?? item.nome_substituto ?? substituto?.nome ?? substituto?.nome_guerra) || null,
    substituto_matricula: texto(item.substituto_matricula ?? substituto?.matricula) || null,
    substituto: substituto ? {
      id: texto(substituto.id) || undefined,
      nome: pessoaNome(substituto),
      matricula: texto(substituto.matricula) || null,
      posto_graduacao: texto(substituto.posto_graduacao) || null,
      subunidade: texto(substituto.subunidade) || null,
    } : null,
    motivo: texto(item.motivo) || null,
    observacao: texto(item.observacoes ?? item.observacao ?? item.obs) || null,
    documento: texto(item.documento ?? item.numero_documento) || null,
    numero_sei: texto(item.numero_documento ?? item.numero_sei ?? item.sei) || null,
    situacao: texto(item.situacao) || 'INFORMADA',
    criado_por: texto(item.criado_por) || null,
    criado_em: item.criado_em as string | number | null | undefined,
    atualizado_por: texto(item.atualizado_por) || null,
    atualizado_em: item.atualizado_em as string | number | null | undefined,
    impacto: normalizarImpacto(item.impacto ?? item.projecao),
    ciencia: (item.ciencia && typeof item.ciencia === 'object' ? item.ciencia : Array.isArray(item.ciencias) ? item.ciencias[0] : null) as AlteracaoServico['ciencia'],
    ciente_por: texto(item.ciente_por) || null,
    ciente_em: item.ciente_em as string | number | null | undefined,
    divergencias: Array.isArray(item.divergencias) ? item.divergencias as AlteracaoServico['divergencias'] : [],
  };
}

export function normalizarComposicao(value: unknown): ComposicaoServico {
  const item = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const viaturas = numero(item.qtd_viaturas_previstas ?? item.viaturas_previstas ?? item.viaturas ?? item.qtd_viaturas);
  const porViatura = numero(item.policiais_por_viatura ?? item.policiais_por_vtr ?? item.qtd_policiais_por_viatura);
  const extras = numero(item.extras ?? item.policiais_extras ?? item.qtd_extras);
  return {
    ...item,
    id: texto(item.id) || undefined,
    unidade: texto(item.unidade),
    data: texto(item.data).slice(0, 10),
    turno: texto(item.turno),
    viaturas_previstas: viaturas,
    policiais_por_viatura: porViatura,
    extras,
    total_previsto: numero(item.total_previsto, viaturas * porViatura + extras),
    observacao: texto(item.observacao) || null,
    criado_por: texto(item.criado_por) || null,
    atualizado_em: item.atualizado_em as string | number | null | undefined,
  };
}

export function normalizarResumo(value: unknown, data: string, turno: string): ResumoResposta {
  const root = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const unidades = Array.isArray(root.unidades) ? root.unidades : [];
  return {
    data: texto(root.data) || data,
    turno: texto(root.turno) || turno,
    unidades: unidades.map((raw) => {
      const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      const resumoRaw = (item.resumo && typeof item.resumo === 'object' ? item.resumo : {}) as Record<string, unknown>;
      const composicao = item.composicao ? normalizarComposicao(item.composicao) : null;
      const alteracoes = Array.isArray(item.alteracoes) ? item.alteracoes.map(normalizarAlteracao) : [];
      const previstos = numero(resumoRaw.totalPrevisto ?? resumoRaw.policiais_previstos ?? composicao?.total_previsto);
      const permutas = numero(resumoRaw.permutas ?? alteracoes.filter((a) => a.tipo === 'PERMUTA' && a.situacao !== 'CANCELADA').length);
      const ausencias = numero(resumoRaw.ausenciasSemSubstituicao ?? resumoRaw.ausencias_sem_reposicao ?? alteracoes.filter((a) => a.tipo !== 'PERMUTA' && !a.substituto_nome && a.situacao !== 'CANCELADA').length);
      const disponiveis = numero(resumoRaw.policiaisDisponiveisProjetados ?? resumoRaw.policiais_disponiveis, previstos - ausencias);
      const porVtr = composicao?.policiais_por_viatura || 0;
      return {
        unidade: texto(item.unidade),
        composicao,
        alteracoes,
        resumo: {
          ...resumoRaw,
          policiais_previstos: previstos,
          alteracoes: numero(resumoRaw.totalAlteracoes ?? resumoRaw.alteracoes, alteracoes.filter((a) => a.situacao !== 'CANCELADA').length),
          permutas,
          ausencias_sem_reposicao: ausencias,
          policiais_disponiveis: disponiveis,
          viaturas_completas: numero(resumoRaw.viaturasCompletasPossiveis ?? resumoRaw.viaturas_completas, porVtr ? Math.floor(disponiveis / porVtr) : 0),
          policiais_remanescentes: numero(resumoRaw.policiaisRemanescentes ?? resumoRaw.policiais_remanescentes, porVtr ? disponiveis % porVtr : disponiveis),
          composicao,
        },
      } satisfies ResumoUnidade;
    }),
  };
}

export function calcularResumoLocal(composicao: ComposicaoServico | null, alteracoes: AlteracaoServico[]): ResumoOperacional {
  const previstos = composicao?.total_previsto || 0;
  const ativas = alteracoes.filter((alteracao) => alteracao.situacao !== 'CANCELADA');
  const permutas = ativas.filter((alteracao) => alteracao.tipo === 'PERMUTA').length;
  const ausencias = ativas.filter((alteracao) => alteracao.tipo !== 'PERMUTA' && !alteracao.substituto_nome).length;
  const disponiveis = Math.max(0, previstos - ausencias);
  const porVtr = composicao?.policiais_por_viatura || 0;
  return {
    policiais_previstos: previstos,
    alteracoes: ativas.length,
    permutas,
    ausencias_sem_reposicao: ausencias,
    policiais_disponiveis: disponiveis,
    viaturas_completas: porVtr ? Math.floor(disponiveis / porVtr) : 0,
    policiais_remanescentes: porVtr ? disponiveis % porVtr : disponiveis,
    composicao,
  };
}

export function textoImpacto(resumo: ResumoOperacional): string {
  if (!resumo.policiais_previstos) return 'Sem composição informada';
  const policiais = resumo.policiais_remanescentes === 1 ? 'policial disponível' : 'policiais disponíveis';
  return `${resumo.viaturas_completas} viatura${resumo.viaturas_completas === 1 ? '' : 's'} completa${resumo.viaturas_completas === 1 ? '' : 's'} + ${resumo.policiais_remanescentes} ${policiais}`;
}

export function classeSituacao(situacao: string): string {
  const normalizada = situacao.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
  return `status-pill status-pill-${normalizada}`;
}

export function rotuloPeriodo(alteracao: AlteracaoServico): string {
  if (alteracao.data_fim && alteracao.data_fim !== alteracao.data_inicio) {
    return `${dataBr(alteracao.data_inicio)} a ${dataBr(alteracao.data_fim)}`;
  }
  return dataBr(alteracao.data_inicio);
}
