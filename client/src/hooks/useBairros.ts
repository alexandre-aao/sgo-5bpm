import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import type { Tables } from '../types/supabase';

/** Cadastro de bairros (coordenadas) — alimenta o select de Bairro em Novo/Editar
 * Evento e os marcadores do Mapa. Espelha popularSelectBairros() em public/app.js. */
export function useBairros() {
  const [bairros, setBairros] = useState<Tables<'bairros_coordenadas'>[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    async function buscar() {
      try {
        const res = await apiFetch('/api/bairros-coordenadas');
        const lista = (await res.json()) as Tables<'bairros_coordenadas'>[];
        if (!cancelado && Array.isArray(lista)) {
          setBairros([...lista].sort((a, b) => a.nome_bairro.localeCompare(b.nome_bairro)));
        }
      } catch (erro) {
        console.error('Erro ao carregar cadastro de bairros:', erro);
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }
    void buscar();
    return () => {
      cancelado = true;
    };
  }, []);

  return { bairros, carregando };
}
