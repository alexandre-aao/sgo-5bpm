import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../../lib/api';
import { montarRegra, regraPronta, type FormRecorrencia } from '../../../lib/recorrencia';

interface EstadoPreview {
  datas: string[];
  carregando: boolean;
  erro: string;
}

const VAZIO: EstadoPreview = { datas: [], carregando: false, erro: '' };

/**
 * Prévia das datas do lote, calculada pelo SERVIDOR (POST /api/operacoes/preview-recorrencia).
 * Debounce de 350ms porque o usuário digita a data e o N de "a cada N dias" tecla a
 * tecla — sem isso seria uma requisição por caractere.
 *
 * A resposta carrega um token de execução: uma resposta atrasada de uma regra já
 * abandonada é descartada em vez de sobrescrever a atual (mesmo cuidado que o
 * calendário do Planejador precisou ter). AbortController não bastaria: o efeito
 * também é recriado por mudança de estado que não cancela o fetch anterior.
 */
export function useRecorrenciaPreview(
  form: FormRecorrencia,
  dataInicio: string,
  dataTermino: string,
): EstadoPreview {
  const [estado, setEstado] = useState<EstadoPreview>(VAZIO);
  const tokenRef = useRef(0);

  // Só o CONTEÚDO da regra importa. Serializar e usar a string como dependência
  // evita refazer o preview a cada render só porque montarRegra devolve um objeto
  // (e arrays) com identidade nova.
  const chave = JSON.stringify(montarRegra(form, { dataInicio, dataTermino }, false));
  const pronta = regraPronta(form, dataInicio, dataTermino);

  useEffect(() => {
    // Regra ainda incompleta: nada a buscar. O `return` lá embaixo já entrega
    // VAZIO — zerar o estado aqui seria setState síncrono dentro do efeito.
    if (!pronta) return;
    const token = ++tokenRef.current;

    const timer = setTimeout(async () => {
      // Mantém as datas anteriores na tela enquanto recalcula, só marcando
      // "carregando" — trocar por lista vazia faria a grade piscar a cada tecla.
      setEstado((atual) => ({ ...atual, carregando: true, erro: '' }));
      try {
        const res = await apiFetch('/api/operacoes/preview-recorrencia', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recorrencia_regra: JSON.parse(chave) }),
        });
        const corpo = (await res.json().catch(() => ({}))) as { datas?: string[]; error?: string };
        if (token !== tokenRef.current) return; // resposta atrasada de uma regra já trocada
        if (!res.ok) {
          setEstado({ datas: [], carregando: false, erro: corpo.error || 'Não foi possível calcular as datas.' });
          return;
        }
        setEstado({ datas: corpo.datas || [], carregando: false, erro: '' });
      } catch (erro) {
        console.error('Erro ao calcular a prévia da recorrência:', erro);
        if (token !== tokenRef.current) return;
        setEstado({ datas: [], carregando: false, erro: 'Falha na comunicação com o servidor.' });
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [chave, pronta]);

  // Estado derivado: com a regra incompleta nunca sobra resíduo da regra anterior.
  return pronta ? estado : VAZIO;
}
