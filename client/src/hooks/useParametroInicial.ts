import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Consome UMA vez um parâmetro de busca da URL e o remove.
 *
 * Serve aos destinos da paleta de comandos (Ctrl+K), que precisam abrir um
 * registro específico ao chegar na tela — `/eventos?evento=<id>` abre a gaveta
 * daquele evento.
 *
 * O parâmetro é removido logo depois (`replace: true`, sem entrada nova no
 * histórico) por dois motivos: fechar a gaveta e recarregar a página não deve
 * reabri-la, e o "voltar" do navegador não deve ressuscitar um estado que o
 * usuário já dispensou.
 */
export function useParametroInicial(nome: string, aoReceber: (valor: string) => void) {
  const [params, setParams] = useSearchParams();
  const valor = params.get(nome);
  // Guarda contra o efeito rodar duas vezes no StrictMode e contra o callback
  // mudar de identidade a cada render da página.
  const jaTratou = useRef(false);
  const callbackRef = useRef(aoReceber);
  // Atualizar a ref em efeito, não durante o render: escrever em ref no corpo do
  // componente é proibido (react-hooks/refs) porque o render pode ser descartado.
  useEffect(() => {
    callbackRef.current = aoReceber;
  });

  useEffect(() => {
    if (!valor || jaTratou.current) return;
    jaTratou.current = true;
    callbackRef.current(valor);
    // Forma funcional, não `new URLSearchParams(params)`: com dois parâmetros na
    // mesma tela (ex.: ?de=&ate=), os dois efeitos rodam no MESMO render e o
    // segundo escreveria por cima com uma cópia que ainda continha o primeiro —
    // devolvendo à URL o parâmetro que o outro acabara de remover.
    setParams((atuais) => {
      const restante = new URLSearchParams(atuais);
      restante.delete(nome);
      return restante;
    }, { replace: true });
  }, [valor, nome, setParams]);
}
