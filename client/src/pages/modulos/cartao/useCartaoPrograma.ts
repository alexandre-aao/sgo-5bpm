import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/api';
import type { CartaoDetalhado, TipoCartao } from '../../../lib/cartaoConflitos';

function getLocalDateStr(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Cartão Programa trabalha por padrão com o dia seguinte (montado na véspera) —
 * mesmo padrão de public/app.js (DOMContentLoaded seta #cartao-data pra amanhã). */
export function dataInicialCartao(): string {
  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);
  return getLocalDateStr(amanha);
}

export type ResultadoAcao = { ok: true } | { ok: false; mensagem: string };

interface CabecalhoPatch {
  fiscal?: string;
  adjunto?: string;
  oficial_sobreaviso?: string;
  tipo_periodo?: string;
  titulo?: string;
  observacoes?: string;
  operacao_id?: string;
}

export interface NovoCartaoPayload {
  tipo_periodo?: string;
  titulo?: string;
  operacao_id?: string;
  observacoes?: string;
}

/** Resumo devolvido por GET /api/cartoes (lista por data). */
export interface CartaoResumo {
  id: string;
  data: string;
  tipo: TipoCartao;
  titulo: string;
  operacao_id: string | null;
  fiscal: string | null;
  adjunto: string | null;
  qtd_viaturas: number;
}

interface UseCartaoPrograma {
  dataSelecionada: string;
  setDataSelecionada: (data: string) => void;
  deslocarDia: (dias: number) => void;
  /** Tipo em edição na tela (segmentado Ordinário | Reforço). */
  tipoAtivo: TipoCartao;
  setTipoAtivo: (tipo: TipoCartao) => void;
  /** Cartão ordinário da data (um só, por definição). */
  cartaoOrdinario: CartaoDetalhado | null;
  /** Reforços da data — vários podem coexistir. */
  reforcos: CartaoResumo[];
  reforcoSelecionadoId: string | null;
  selecionarReforco: (id: string | null) => void;
  /** Cartão do tipo ativo, já com detalhe carregado. */
  cartao: CartaoDetalhado | null;
  /** null = sem data; false = data sem cartão do tipo ativo; true = carregado */
  temCartao: boolean | null;
  carregando: boolean;
  recarregar: () => Promise<void>;
  criarCartao: (payload?: NovoCartaoPayload) => Promise<ResultadoAcao>;
  atualizarCabecalho: (patch: CabecalhoPatch) => Promise<ResultadoAcao>;
}

async function buscarDetalhe(id: string): Promise<CartaoDetalhado | null> {
  try {
    const res = await apiFetch(`/api/cartoes/${id}`);
    if (!res.ok) return null;
    return (await res.json()) as CartaoDetalhado;
  } catch (erro) {
    console.error('Erro ao carregar detalhe do cartão:', erro);
    return null;
  }
}

/** Carrega os cartões da data selecionada, dos DOIS tipos. O ordinário é único; os
 * reforços vêm como lista e um fica aberto por vez no editor. O editor em si é o mesmo
 * para os dois — o que muda é só qual objeto de cartão entra nele. */
export function useCartaoPrograma(): UseCartaoPrograma {
  const [dataSelecionada, setDataSelecionada] = useState(dataInicialCartao);
  const [tipoAtivo, setTipoAtivo] = useState<TipoCartao>('padrao');
  const [cartaoOrdinario, setCartaoOrdinario] = useState<CartaoDetalhado | null>(null);
  const [reforcos, setReforcos] = useState<CartaoResumo[]>([]);
  const [reforcoSelecionadoId, setReforcoSelecionadoId] = useState<string | null>(null);
  const [cartaoReforco, setCartaoReforco] = useState<CartaoDetalhado | null>(null);
  const [carregando, setCarregando] = useState(true);

  // Uma chamada só devolve os dois tipos da data (sem ?tipo=), evitando dois requests
  // por troca de dia. O detalhe é buscado só dos cartões que entram no editor.
  const buscar = useCallback(
    async (data: string, idReforcoDesejado: string | null, cancelRef: { cancelado: boolean }) => {
      if (!data) {
        setCartaoOrdinario(null);
        setReforcos([]);
        setReforcoSelecionadoId(null);
        setCartaoReforco(null);
        setCarregando(false);
        return;
      }

      setCarregando(true);
      try {
        const res = await apiFetch(`/api/cartoes?data=${data}`);
        const lista = (await res.json()) as CartaoResumo[];
        const todos = Array.isArray(lista) ? lista : [];

        const resumoOrdinario = todos.find((c) => c.tipo !== 'reforco') || null;
        const listaReforcos = todos.filter((c) => c.tipo === 'reforco');

        // Mantém aberto o reforço que já estava, se ele existe nesta data; senão abre o primeiro.
        const idReforco = listaReforcos.some((r) => r.id === idReforcoDesejado)
          ? idReforcoDesejado
          : listaReforcos[0]?.id ?? null;

        const [detalheOrdinario, detalheReforco] = await Promise.all([
          resumoOrdinario ? buscarDetalhe(resumoOrdinario.id) : Promise.resolve(null),
          idReforco ? buscarDetalhe(idReforco) : Promise.resolve(null),
        ]);

        if (cancelRef.cancelado) return;
        setCartaoOrdinario(detalheOrdinario);
        setReforcos(listaReforcos);
        setReforcoSelecionadoId(idReforco);
        setCartaoReforco(detalheReforco);
      } catch (erro) {
        console.error('Erro ao carregar Cartão Programa:', erro);
        if (!cancelRef.cancelado) {
          setCartaoOrdinario(null);
          setReforcos([]);
          setCartaoReforco(null);
        }
      } finally {
        if (!cancelRef.cancelado) setCarregando(false);
      }
    },
    [],
  );

  useEffect(() => {
    const cancelRef = { cancelado: false };
    // fetch on mount/dep change: o setState real só roda depois dos awaits dentro de
    // buscar(), não sincronamente no corpo do efeito (mesmo caso de AppDataContext.tsx).
    // O id do reforço aberto é lido via setState funcional dentro de buscar(), não entra
    // nas deps — trocar de chip não pode relistar a data inteira.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void buscar(dataSelecionada, null, cancelRef);
    return () => {
      cancelRef.cancelado = true;
    };
  }, [dataSelecionada, buscar]);

  const deslocarDia = useCallback((dias: number) => {
    setDataSelecionada((atual) => {
      if (!atual) return atual;
      const d = new Date(atual + 'T00:00:00');
      d.setDate(d.getDate() + dias);
      return getLocalDateStr(d);
    });
  }, []);

  const recarregar = useCallback(async () => {
    const cancelRef = { cancelado: false };
    await buscar(dataSelecionada, reforcoSelecionadoId, cancelRef);
  }, [dataSelecionada, reforcoSelecionadoId, buscar]);

  // Troca o reforço aberto no editor sem relistar a data inteira.
  const selecionarReforco = useCallback((id: string | null) => {
    setReforcoSelecionadoId(id);
    if (!id) {
      setCartaoReforco(null);
      return;
    }
    void buscarDetalhe(id).then(setCartaoReforco);
  }, []);

  // Cria um cartão em branco do TIPO ATIVO na data selecionada. Para o ordinário o
  // servidor recusa duplicata (409); no reforço, vários por data são esperados.
  const criarCartao = useCallback(
    async (payload: NovoCartaoPayload = {}): Promise<ResultadoAcao> => {
      if (!dataSelecionada) return { ok: false, mensagem: 'Selecione a data do Cartão Programa.' };
      try {
        const res = await apiFetch('/api/cartoes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: dataSelecionada, tipo: tipoAtivo, ...payload }),
        });
        if (res.status === 409) {
          await recarregar();
          return { ok: false, mensagem: 'Já existe um Cartão Programa para esta data.' };
        }
        if (!res.ok) {
          const corpo = (await res.json().catch(() => ({}))) as { error?: string };
          return { ok: false, mensagem: corpo.error || 'Falha ao criar o Cartão Programa.' };
        }
        const criado = (await res.json()) as CartaoDetalhado;
        // Reforço recém-criado já entra aberto no editor.
        const idAbrir = tipoAtivo === 'reforco' ? criado.id : reforcoSelecionadoId;
        await buscar(dataSelecionada, idAbrir, { cancelado: false });
        return { ok: true };
      } catch (erro) {
        console.error('Erro ao criar Cartão Programa:', erro);
        return { ok: false, mensagem: 'Falha ao criar o Cartão Programa.' };
      }
    },
    [dataSelecionada, tipoAtivo, reforcoSelecionadoId, buscar, recarregar],
  );

  const cartao = tipoAtivo === 'reforco' ? cartaoReforco : cartaoOrdinario;

  // Atualiza o cabeçalho do cartão aberto (fiscal/adjunto/sobreaviso/tipo_periodo e,
  // no reforço, título/operação/observações).
  const atualizarCabecalho = useCallback(
    async (patch: CabecalhoPatch): Promise<ResultadoAcao> => {
      if (!cartao) return { ok: false, mensagem: 'Nenhum cartão carregado.' };
      try {
        const res = await apiFetch(`/api/cartoes/${cartao.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          const corpo = (await res.json().catch(() => ({}))) as { error?: string };
          return { ok: false, mensagem: corpo.error || 'Falha ao atualizar o cabeçalho do cartão.' };
        }
        const atualizado = (await res.json()) as CartaoDetalhado;
        const aplicar = (atual: CartaoDetalhado | null) => (atual ? { ...atual, ...atualizado } : atual);
        if (tipoAtivo === 'reforco') {
          setCartaoReforco(aplicar);
          // O título aparece no chip da faixa de reforços — mantém a lista em dia.
          setReforcos((lista) =>
            lista.map((r) => (r.id === atualizado.id ? { ...r, titulo: atualizado.titulo || '' } : r)),
          );
        } else {
          setCartaoOrdinario(aplicar);
        }
        return { ok: true };
      } catch (erro) {
        console.error('Erro ao atualizar cabeçalho do Cartão Programa:', erro);
        return { ok: false, mensagem: 'Falha ao atualizar o cabeçalho do cartão.' };
      }
    },
    [cartao, tipoAtivo],
  );

  return {
    dataSelecionada,
    setDataSelecionada,
    deslocarDia,
    tipoAtivo,
    setTipoAtivo,
    cartaoOrdinario,
    reforcos,
    reforcoSelecionadoId,
    selecionarReforco,
    cartao,
    temCartao: !dataSelecionada ? null : !!cartao,
    carregando,
    recarregar,
    criarCartao,
    atualizarCabecalho,
  };
}
