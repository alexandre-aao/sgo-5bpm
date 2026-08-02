import type { DocumentoCartao, FormatoDocumento } from './documentoCartao';

const TAMANHO_PAGINA: Record<FormatoDocumento, [number, number]> = {
  a4: [210, 297],
  celular: [100, 180],
};

async function aguardarImagens(elemento: HTMLElement): Promise<void> {
  const imagens = [...elemento.querySelectorAll('img')];
  await Promise.all(imagens.map((imagem) => {
    if (imagem.complete) return Promise.resolve();
    return new Promise<void>((resolve) => {
      imagem.addEventListener('load', () => resolve(), { once: true });
      imagem.addEventListener('error', () => resolve(), { once: true });
    });
  }));
}

function recortarCanvas(canvas: HTMLCanvasElement, inicioY: number, altura: number): HTMLCanvasElement {
  const recorte = document.createElement('canvas');
  recorte.width = canvas.width;
  recorte.height = altura;
  const contexto = recorte.getContext('2d');
  if (!contexto) throw new Error('Não foi possível preparar a página do PDF.');
  contexto.fillStyle = '#fff';
  contexto.fillRect(0, 0, recorte.width, recorte.height);
  contexto.drawImage(canvas, 0, inicioY, canvas.width, altura, 0, 0, canvas.width, altura);
  return recorte;
}

/** Gera um arquivo PDF real no navegador. Não depende do diálogo nativo de
 * impressão, que pode ser bloqueado em webviews ou não disparar `afterprint`. */
export async function baixarDocumentosCartaoPdf(
  documentos: DocumentoCartao[],
  nomeArquivo: string,
): Promise<void> {
  const lote = document.getElementById('central-emissao-impressao');
  if (!lote || documentos.length === 0) throw new Error('Nenhum documento disponível para baixar.');

  lote.classList.add('central-emissao-exportando');
  try {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);
    await document.fonts?.ready;
    await aguardarImagens(lote);
    const elementos = [...lote.querySelectorAll<HTMLElement>('.documento-cartao')];
    if (elementos.length !== documentos.length) {
      throw new Error('A prévia do documento ainda não terminou de carregar.');
    }

    const formato = documentos[0].controle.formato;
    const [larguraPagina, alturaPagina] = TAMANHO_PAGINA[formato];
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [larguraPagina, alturaPagina] });
    let primeiraPagina = true;

    for (const elemento of elementos) {
      const canvas = await html2canvas(elemento, {
        backgroundColor: '#ffffff',
        logging: false,
        scale: 2,
        useCORS: true,
      });
      const alturaPaginaIdealPx = Math.max(1, Math.floor(canvas.width * alturaPagina / larguraPagina));
      // Conversões CSS mm -> px podem deixar o canvas 1 ou 2 pixels maior que a
      // página física e produzir uma folha final vazia. Absorve apenas essa sobra.
      const alturaPaginaPx = canvas.height <= alturaPaginaIdealPx * 1.01
        ? canvas.height
        : alturaPaginaIdealPx;

      for (let inicioY = 0; inicioY < canvas.height; inicioY += alturaPaginaPx) {
        const alturaRecorte = Math.min(alturaPaginaPx, canvas.height - inicioY);
        const pagina = recortarCanvas(canvas, inicioY, alturaRecorte);
        if (primeiraPagina) primeiraPagina = false;
        else pdf.addPage([larguraPagina, alturaPagina], 'portrait');
        const alturaNoPdf = Math.min(alturaPagina, alturaRecorte * larguraPagina / canvas.width);
        pdf.addImage(pagina.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, larguraPagina, alturaNoPdf);
        pagina.width = 1;
        pagina.height = 1;
      }

      canvas.width = 1;
      canvas.height = 1;
    }

    await pdf.save(`${nomeArquivo}.pdf`, { returnPromise: true });
  } finally {
    lote.classList.remove('central-emissao-exportando');
  }
}
