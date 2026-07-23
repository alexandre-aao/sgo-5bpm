import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { apiFetch } from '../lib/api';
import { useAuth } from './useAuth';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { AppDataContext, type AppData } from './app-data-context';

const DADOS_VAZIOS: AppData = {
  eventos: [],
  operacoes: [],
  alocacoes: [],
  escalas: [],
  config: { id: 1, cota_mensal_diarias: 0 },
  pessoal: [],
  viaturas: [],
};

async function buscarJson<T>(caminho: string): Promise<T> {
  const res = await apiFetch(caminho);
  return res.json() as Promise<T>;
}

// Fallback pro estado anterior quando a resposta não é um array — mesmo papel de
// usarLista() em fetchData() do app antigo: uma rota que devolve {error:...} (500)
// ou HTML (522) não deve sobrescrever o estado bom com lixo.
function usarLista<T>(novo: unknown, atual: T[]): T[] {
  return Array.isArray(novo) ? (novo as T[]) : atual;
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { usuario } = useAuth();
  const [dados, setDados] = useState<AppData>(DADOS_VAZIOS);
  const [carregandoNucleo, setCarregandoNucleo] = useState(true);

  const recarregar = useCallback(async () => {
    // operacoes/escalas exigem P3 no server (ver server.js) — nenhuma tela de
    // Adjunto/Oficial usa esses dados, então nem pede (evita 403 a cada refresh).
    const ehP3 = usuario?.role === 'P3';

    try {
      // 1ª onda (núcleo): mesmo recorte de fetchData() no app antigo — eventos,
      // operações, alocações, escalas, config. pessoal/viaturas ficam pra 2ª onda,
      // sem travar a primeira pintura.
      const [eventosResp, operacoesResp, alocacoesResp, escalasResp, configResp] = await Promise.all([
        buscarJson<unknown>('/api/eventos'),
        ehP3 ? buscarJson<unknown>('/api/operacoes') : Promise.resolve([]),
        buscarJson<unknown>('/api/alocacoes'),
        ehP3 ? buscarJson<unknown>('/api/escalas') : Promise.resolve([]),
        buscarJson<unknown>('/api/config'),
      ]);

      setDados((atual) => ({
        ...atual,
        eventos: usarLista(eventosResp, atual.eventos),
        operacoes: usarLista(operacoesResp, atual.operacoes),
        alocacoes: usarLista(alocacoesResp, atual.alocacoes),
        escalas: usarLista(escalasResp, atual.escalas),
        config:
          configResp && typeof configResp === 'object' && 'cota_mensal_diarias' in configResp
            ? (configResp as AppData['config'])
            : atual.config,
      }));
      setCarregandoNucleo(false);

      // 2ª onda: pessoal (244 linhas, o payload mais pesado) + viaturas.
      const [pessoalResp, viaturasResp] = await Promise.all([
        buscarJson<unknown>('/api/pessoal'),
        buscarJson<unknown>('/api/viaturas'),
      ]);
      setDados((atual) => ({
        ...atual,
        pessoal: usarLista(pessoalResp, atual.pessoal),
        viaturas: usarLista(viaturasResp, atual.viaturas),
      }));
    } catch (erro) {
      // Falha total (ex.: Promise.all rejeitado por erro de rede/parse) — mantém o
      // estado anterior, só loga. Sem toast ainda (sistema de toast entra num lote
      // futuro, quando alguma tela realmente precisar dele).
      console.error('Erro ao buscar dados do servidor:', erro);
      setCarregandoNucleo(false);
    }
  }, [usuario]);

  // Carga inicial ao logar — o timer do useAutoRefresh só cobre os refreshs
  // periódicos (60s/foco), não a primeira busca (mesmo papel do fetchData()
  // chamado direto em checkAuth() no app antigo). O setState real só acontece
  // depois de awaits dentro de recarregar() (busca de rede), não sincronamente
  // no corpo do efeito — é o padrão "fetch on mount" que a regra não distingue
  // do caso problemático (setState direto e síncrono no efeito).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (usuario) void recarregar();
  }, [usuario, recarregar]);

  useAutoRefresh(recarregar, !!usuario);

  return (
    <AppDataContext.Provider value={{ dados, carregandoNucleo, recarregar }}>
      {children}
    </AppDataContext.Provider>
  );
}
