import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/api';
import type { CartaoDetalhado } from '../../../lib/cartaoConflitos';

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
}

interface UseCartaoPrograma {
  dataSelecionada: string;
  setDataSelecionada: (data: string) => void;
  deslocarDia: (dias: number) => void;
  cartao: CartaoDetalhado | null;
  /** null = sem data selecionada; false = data sem cartão; true = cartão carregado */
  temCartao: boolean | null;
  carregando: boolean;
  recarregar: () => Promise<void>;
  criarCartao: (tipoPeriodo?: string) => Promise<ResultadoAcao>;
  atualizarCabecalho: (patch: CabecalhoPatch) => Promise<ResultadoAcao>;
}

/** Busca o Cartão Programa da data selecionada — espelha renderCartaoTab() em
 * public/app.js (lista por data + detalhe). */
export function useCartaoPrograma(): UseCartaoPrograma {
  const [dataSelecionada, setDataSelecionada] = useState(dataInicialCartao);
  const [cartao, setCartao] = useState<CartaoDetalhado | null>(null);
  const [temCartao, setTemCartao] = useState<boolean | null>(null);
  const [carregando, setCarregando] = useState(true);

  const buscar = useCallback(async (data: string, cancelRef: { cancelado: boolean }) => {
    if (!data) {
      setCartao(null);
      setTemCartao(null);
      setCarregando(false);
      return;
    }

    setCarregando(true);
    try {
      const res = await apiFetch(`/api/cartoes?data=${data}`);
      const lista = (await res.json()) as { id: string }[];

      if (!Array.isArray(lista) || lista.length === 0) {
        if (!cancelRef.cancelado) {
          setCartao(null);
          setTemCartao(false);
        }
        return;
      }

      const resDetalhe = await apiFetch(`/api/cartoes/${lista[0].id}`);
      const detalhe = (await resDetalhe.json()) as CartaoDetalhado;
      if (!cancelRef.cancelado) {
        setCartao(detalhe);
        setTemCartao(true);
      }
    } catch (erro) {
      console.error('Erro ao carregar Cartão Programa:', erro);
      if (!cancelRef.cancelado) {
        setCartao(null);
        setTemCartao(false);
      }
    } finally {
      if (!cancelRef.cancelado) setCarregando(false);
    }
  }, []);

  useEffect(() => {
    const cancelRef = { cancelado: false };
    // fetch on mount/dep change: o setState real só roda depois dos awaits dentro de
    // buscar(), não sincronamente no corpo do efeito (mesmo caso de AppDataContext.tsx).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void buscar(dataSelecionada, cancelRef);
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
    await buscar(dataSelecionada, cancelRef);
  }, [dataSelecionada, buscar]);

  // Cria um cartão em branco na data selecionada — espelha handleCriarCartao(false)
  // em public/app.js (o "copiar do dia anterior" fica pro lote de templates/cópia).
  const criarCartao = useCallback(
    async (tipoPeriodo = ''): Promise<ResultadoAcao> => {
      if (!dataSelecionada) return { ok: false, mensagem: 'Selecione a data do Cartão Programa.' };
      try {
        const res = await apiFetch('/api/cartoes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: dataSelecionada, tipo_periodo: tipoPeriodo }),
        });
        if (res.status === 409) {
          await recarregar();
          return { ok: false, mensagem: 'Já existe um Cartão Programa para esta data.' };
        }
        if (!res.ok) {
          const corpo = (await res.json().catch(() => ({}))) as { error?: string };
          return { ok: false, mensagem: corpo.error || 'Falha ao criar o Cartão Programa.' };
        }
        await recarregar();
        return { ok: true };
      } catch (erro) {
        console.error('Erro ao criar Cartão Programa:', erro);
        return { ok: false, mensagem: 'Falha ao criar o Cartão Programa.' };
      }
    },
    [dataSelecionada, recarregar],
  );

  // Atualiza fiscal/adjunto/sobreaviso/tipo_periodo — espelha handleSalvarCabecalhoCartao().
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
        setCartao((atual) => (atual ? { ...atual, ...atualizado } : atual));
        return { ok: true };
      } catch (erro) {
        console.error('Erro ao atualizar cabeçalho do Cartão Programa:', erro);
        return { ok: false, mensagem: 'Falha ao atualizar o cabeçalho do cartão.' };
      }
    },
    [cartao],
  );

  return {
    dataSelecionada,
    setDataSelecionada,
    deslocarDia,
    cartao,
    temCartao,
    carregando,
    recarregar,
    criarCartao,
    atualizarCabecalho,
  };
}
