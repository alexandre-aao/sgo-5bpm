import type { Tables } from '../../../../types/supabase';
import type { CartaoDetalhado, CartaoViatura, CartaoItem } from '../../../../lib/cartaoConflitos';
import { abreviarPosto } from '../../../../lib/abrevPosto';

/** Nome como sai no documento: graduação + nome de guerra, em caixa alta.
 *  Ex.: "3º SGT PM SILVA". O nome de guerra é o que o comandante reconhece no
 *  rádio; o nome completo do cadastro só entra se não houver nome de guerra. */
export function nomeExibicaoMilitar(pessoa: Tables<'pessoal'> | undefined): string {
  if (!pessoa) return '';
  const posto = abreviarPosto(pessoa.posto_graduacao);
  const nome = pessoa.nome_guerra || pessoa.nome;
  return `${posto} PM ${nome}`.toUpperCase().replace(/\s+/g, ' ').trim();
}

/** Resolve o nome pelo id do cadastro; sem id (cartão antigo, texto livre),
 *  cai no texto já gravado — em caixa alta, para o documento ficar uniforme. */
export function resolverNome(
  pessoalId: string | null | undefined,
  textoGravado: string | null | undefined,
  pessoal: Tables<'pessoal'>[],
): string {
  if (pessoalId) {
    const pessoa = pessoal.find((p) => p.id === pessoalId);
    if (pessoa) return nomeExibicaoMilitar(pessoa);
  }
  if (textoGravado) {
    // Texto livre pode já ser o nome completo do cadastro — tenta casar para
    // sair no mesmo formato dos demais.
    const porNome = pessoal.find((p) => p.nome === textoGravado);
    if (porNome) return nomeExibicaoMilitar(porNome);
    return textoGravado.toUpperCase();
  }
  return '';
}

// As 7 atividades do sistema abreviadas para o documento. O cartão é lido no
// celular, em serviço: sigla curta na coluna e legenda no rodapé, só das siglas
// que aparecem naquele roteiro. O domínio completo continua intacto no app
// (QTL Almoço/Jantar alimentam o Quadro Resumo e os alertas de cobertura).
const SIGLA_ATIVIDADE: Record<string, { sigla: string; legenda: string }> = {
  'PB': { sigla: 'PB', legenda: 'ponto base' },
  'Patrulhamento': { sigla: 'PAT', legenda: 'patrulhamento' },
  'Barreira Itinerante': { sigla: 'BAR', legenda: 'barreira itinerante' },
  'QTL Almoço': { sigla: 'QTL', legenda: 'refeição' },
  'QTL Jantar': { sigla: 'QTL', legenda: 'refeição' },
  'Corredor Seguro': { sigla: 'CS', legenda: 'corredor seguro' },
  'Outros': { sigla: 'OUT', legenda: 'outras atividades' },
};

export function siglaAtividade(atividade: string): string {
  return SIGLA_ATIVIDADE[atividade]?.sigla || 'OUT';
}

/** Legenda do rodapé: só as siglas usadas neste roteiro, sem repetir
 *  (QTL Almoço e QTL Jantar viram uma entrada só). */
export function legendaDoRoteiro(itens: CartaoItem[]): string {
  const vistas = new Map<string, string>();
  itens.forEach((item) => {
    const entrada = SIGLA_ATIVIDADE[item.atividade] || SIGLA_ATIVIDADE['Outros'];
    if (!vistas.has(entrada.sigla)) vistas.set(entrada.sigla, entrada.legenda);
  });
  return [...vistas.entries()].map(([sigla, legenda]) => `${sigla} ${legenda}`).join(' · ');
}

export function horaCurta(hora: string | null | undefined): string {
  return hora ? hora.replace(':', 'h') : '';
}

export interface DadosCartaoPdf {
  numero: string;
  data: string;
  delta07: string;
  delta07Viatura: string;
  adjunto: string;
  prefixo: string;
  companhia: string;
  comandante: string;
  bairro: string;
  itens: CartaoItem[];
  legenda: string;
  versao: number;
  geradoEm: string;
}

/** Monta o que sai no documento de UMA viatura. Campo vazio fica vazio — quem
 *  renderiza omite a linha inteira (rótulo incluído), nunca imprime rótulo órfão. */
export function montarDadosCartaoPdf(
  cartao: CartaoDetalhado,
  viatura: CartaoViatura,
  pessoal: Tables<'pessoal'>[],
  bairros: Tables<'bairros_coordenadas'>[],
  agora = new Date(),
): DadosCartaoPdf {
  const p2 = (n: number) => String(n).padStart(2, '0');
  const bairro = viatura.bairro_id ? bairros.find((b) => b.id === viatura.bairro_id) : undefined;

  return {
    numero: cartao.numero ? `${String(cartao.numero).padStart(6, '0')}/${cartao.ano}` : '',
    data: cartao.data ? cartao.data.split('-').reverse().join('/') : '',
    delta07: resolverNome(cartao.fiscal_pessoal_id, cartao.fiscal, pessoal),
    delta07Viatura: (cartao.delta07_viatura || '').toUpperCase(),
    adjunto: resolverNome(cartao.adjunto_pessoal_id, cartao.adjunto, pessoal),
    prefixo: (viatura.prefixo || '').toUpperCase(),
    // "2ª Companhia" -> "2ª CIA": abreviação que o comandante usa e que economiza
    // linha na página estreita.
    companhia: (viatura.companhia || '').replace(/Companhia/i, 'CIA').toUpperCase(),
    // O comandante é o ÚNICO militar da guarnição que sai no documento.
    comandante: resolverNome(viatura.comandante_pessoal_id, viatura.comandante, pessoal),
    // Bairro do cadastro; sem vínculo, cai no setor (texto livre) para não
    // deixar a viatura sem referência de área no cartão do comandante.
    bairro: (bairro?.nome_bairro || viatura.setor || '').toUpperCase(),
    itens: viatura.itens || [],
    legenda: legendaDoRoteiro(viatura.itens || []),
    versao: viatura.versao || 1,
    geradoEm: `${p2(agora.getDate())}/${p2(agora.getMonth() + 1)} ${p2(agora.getHours())}h${p2(agora.getMinutes())}`,
  };
}

/** Nome do arquivo que o comandante vê no WhatsApp antes de abrir:
 *  CP_2026-07-30_VTR-1234_3SGT-SILVA_ORD_v1 */
export function nomeArquivoCartao(dados: DadosCartaoPdf, conteudo: string): string {
  const limpar = (texto: string) =>
    texto
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      // "3º SGT" -> "3SGT": o indicador ordinal não é diacrítico e sozinho
      // viraria um hífen solto ("3-SGT-SILVA" em vez de "3SGT-SILVA").
      .replace(/(\d)[ºª]?\s+/g, '$1')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

  const dataIso = dados.data.split('/').reverse().join('-');
  // O prefixo às vezes já vem como "VTR 1234" — não repetir o rótulo.
  const prefixo = limpar(dados.prefixo).replace(/^VTR-?/i, '');
  // "3º SGT PM SILVA" -> "3SGT-SILVA": a partícula PM é a mesma em todos os
  // nomes e só ocupa espaço no que o comandante lê no WhatsApp.
  const comandante = limpar(dados.comandante.replace(/\bPM\b/g, ''));

  const partes = [
    'CP',
    dataIso,
    `VTR-${prefixo}`,
    comandante || 'SEM-CMT',
    conteudo,
    `v${dados.versao}`,
  ];
  return partes.filter(Boolean).join('_');
}
