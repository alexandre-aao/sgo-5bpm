import type { DadosCartaoPdf } from './cartaoPdfDados';
import { siglaAtividade, horaCurta } from './cartaoPdfDados';
import type { AvisoDoCartao } from './CartaoPdf';

const ROTULO_PRIORIDADE: Record<AvisoDoCartao['prioridade'], string> = {
  informativa: 'INFORMATIVA',
  atencao: 'ATENÇÃO',
  alta: 'ALTA',
  critica: 'CRÍTICA',
};

/**
 * O mesmo cartão em texto, para ir direto no WhatsApp.
 *
 * Por que existe: `window.print()` não devolve um arquivo ao JavaScript — o PDF
 * nasce dentro do diálogo do navegador —, então não há `File` para passar em
 * `navigator.share({files})`. O texto resolve o caso de uso real (o comandante
 * lê a escala no celular) sem trazer uma biblioteca de geração de PDF. Quem
 * precisa do PDF usa "Gerar", salva e anexa.
 *
 * Formatação pensada para o WhatsApp: *negrito* nos rótulos de bloco, linhas
 * curtas, sem tabela (que quebra em tela estreita).
 */
export function cartaoEmTexto(dados: DadosCartaoPdf, avisos: AvisoDoCartao[]): string {
  const linhas: string[] = [];

  linhas.push('*POLÍCIA MILITAR DO RN — 5º BPM*');
  if (dados.numero) linhas.push(`*CARTÃO PROGRAMA Nº ${dados.numero}*`);
  linhas.push('');

  // Campo vazio não vira linha órfã, mesma regra do documento impresso.
  const par = (rotulo: string, valor: string) => {
    if (valor) linhas.push(`${rotulo}: ${valor}`);
  };

  par('DATA', dados.data);
  par('DELTA 07', dados.delta07);
  par('ADJUNTO', dados.adjunto);
  par('GUARNIÇÃO', dados.delta07Viatura);
  linhas.push('');

  par('VIATURA', dados.prefixo);
  par('GUARNIÇÃO', dados.companhia);
  par('COMANDANTE', dados.comandante);
  par('BAIRRO', dados.bairro);

  if (dados.itens.length > 0) {
    linhas.push('');
    linhas.push('*ROTEIRO*');
    dados.itens.forEach((item) => {
      const hora = `${horaCurta(item.inicio)}${item.fim ? `-${horaCurta(item.fim)}` : ''}`;
      linhas.push(`${hora}  ${siglaAtividade(item.atividade)}  ${item.local}`);
    });
  }

  if (avisos.length > 0) {
    linhas.push('');
    // Agrupado por bairro, sem repetir o cabeçalho.
    const porBairro = new Map<string, AvisoDoCartao[]>();
    avisos.forEach((a) => {
      const chave = a.bairro || dados.bairro;
      if (!porBairro.has(chave)) porBairro.set(chave, []);
      porBairro.get(chave)!.push(a);
    });
    porBairro.forEach((lista, bairro) => {
      linhas.push(`*ALERTAS${bairro ? ` — ${bairro}` : ''}*`);
      lista.forEach((aviso) => {
        const cabecalho = [ROTULO_PRIORIDADE[aviso.prioridade], aviso.categoria].filter(Boolean).join(' · ');
        linhas.push(`- ${cabecalho}`);
        linhas.push(`  ${aviso.texto}`);
      });
    });
  }

  if (dados.legenda) {
    linhas.push('');
    linhas.push(dados.legenda);
  }
  linhas.push(`v${dados.versao} · gerado ${dados.geradoEm}`);

  return linhas.join('\n');
}

export type ResultadoCompartilhar = 'compartilhado' | 'copiado' | 'cancelado' | 'falhou';

/**
 * Manda o cartão pelo seletor nativo (Web Share API) — no celular é o caminho
 * direto para o contato ou grupo do WhatsApp. Sem suporte, cai para a área de
 * transferência, que é o fallback útil no desktop.
 */
export async function compartilharTexto(titulo: string, texto: string): Promise<ResultadoCompartilhar> {
  if (navigator.share) {
    try {
      await navigator.share({ title: titulo, text: texto });
      return 'compartilhado';
    } catch (erro) {
      // AbortError = o operador fechou a folha de compartilhamento; não é falha.
      if (erro instanceof Error && erro.name === 'AbortError') return 'cancelado';
      // Qualquer outro erro cai no fallback abaixo em vez de deixar o operador sem saída.
    }
  }

  try {
    await navigator.clipboard.writeText(texto);
    return 'copiado';
  } catch (erro) {
    console.error('Falha ao copiar o cartão:', erro);
    return 'falhou';
  }
}
