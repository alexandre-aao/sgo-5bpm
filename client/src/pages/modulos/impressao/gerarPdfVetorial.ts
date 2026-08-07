import type { jsPDF } from 'jspdf';
import type { DocumentoCartao, DocumentoViatura, FormatoDocumento } from './documentoCartao';
import { horarioDaAtividade, madrugadaSeguraTexto, ordenarViaturasQuadroResumo } from '../../../lib/quadroResumo';

/**
 * PDF do Cartão Programa em TEXTO VETORIAL (jsPDF puro), substituindo a captura
 * de imagem do html2canvas.
 *
 * Por que trocar: o documento vai por WhatsApp para o celular do comandante de
 * viatura. Em imagem ele fica pesado (megabytes) e embaçado no zoom; em vetor
 * fica em dezenas de KB e o texto é selecionável e pesquisável. O tamanho também
 * é o que resolve o teto de ~4,5 MB de request body da Vercel, que a entrega do
 * arquivo atravessa.
 *
 * Sem lib de tabela (jspdf-autotable): as tabelas aqui são simples e o projeto
 * evita dependência nova sem pedido.
 */

const TAMANHO_PAGINA: Record<FormatoDocumento, [number, number]> = {
  a4: [210, 297],
  celular: [100, 180],
};

/** Uma cor institucional só, como no design .cp-* já existente. */
const MARINHO = '#002145';
const CINZA = '#666666';
const CINZA_LINHA = '#c8ced6';
const ZEBRA = '#f5f7fa';

interface Layout {
  largura: number;
  altura: number;
  margem: number;
  /** Onde o conteúdo pode terminar antes de virar a página. */
  limiteY: number;
  base: number;
  titulo: number;
  pequeno: number;
}

function layoutDo(formato: FormatoDocumento): Layout {
  const [largura, altura] = TAMANHO_PAGINA[formato];
  const margem = formato === 'celular' ? 7 : 15;
  return {
    largura,
    altura,
    margem,
    limiteY: altura - margem - 8, // reserva a faixa do rodapé
    base: formato === 'celular' ? 7.5 : 8.5,
    titulo: formato === 'celular' ? 10 : 12,
    pequeno: formato === 'celular' ? 6.2 : 7,
  };
}

/** Estado de escrita: o cursor Y e a página corrente. */
class Folha {
  y: number;
  // Campos declarados e atribuídos no corpo: `erasableSyntaxOnly` (tsconfig do
  // cliente) proíbe parameter properties, que não são apagáveis por type stripping.
  readonly doc: jsPDF;
  readonly l: Layout;
  readonly rodape: string;

  constructor(doc: jsPDF, l: Layout, rodape: string) {
    this.doc = doc;
    this.l = l;
    this.rodape = rodape;
    this.y = l.margem;
  }

  get larguraUtil() {
    return this.l.largura - this.l.margem * 2;
  }

  /** Abre página nova se não couberem `altura` mm. Devolve true se virou. */
  garantirEspaco(altura: number): boolean {
    if (this.y + altura <= this.l.limiteY) return false;
    this.novaPagina();
    return true;
  }

  novaPagina() {
    this.escreverRodape();
    this.doc.addPage([this.l.largura, this.l.altura], 'portrait');
    this.y = this.l.margem;
  }

  escreverRodape() {
    const { doc, l } = this;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(l.pequeno);
    doc.setTextColor(CINZA);
    doc.text(this.rodape, l.largura / 2, l.altura - l.margem / 2 - 1, {
      align: 'center',
      maxWidth: this.larguraUtil,
    });
  }

  texto(valor: string, opcoes: { tamanho?: number; negrito?: boolean; cor?: string; recuo?: number } = {}) {
    const { doc, l } = this;
    const tamanho = opcoes.tamanho ?? l.base;
    doc.setFont('helvetica', opcoes.negrito ? 'bold' : 'normal');
    doc.setFontSize(tamanho);
    doc.setTextColor(opcoes.cor ?? '#111111');
    const recuo = opcoes.recuo ?? 0;
    const linhas = doc.splitTextToSize(valor, this.larguraUtil - recuo) as string[];
    const alturaLinha = tamanho * 0.42;
    for (const linha of linhas) {
      this.garantirEspaco(alturaLinha);
      doc.text(linha, l.margem + recuo, this.y + alturaLinha * 0.8);
      this.y += alturaLinha;
    }
  }

  /** "Rótulo: valor" numa linha só; nada é impresso quando o valor é vazio —
   *  rótulo órfão em documento operacional confunde mais do que informa. */
  par(rotulo: string, valor: string) {
    if (!valor) return;
    const { doc, l } = this;
    doc.setFontSize(l.base);
    doc.setFont('helvetica', 'bold');
    const larguraRotulo = doc.getTextWidth(`${rotulo}: `);
    doc.setFont('helvetica', 'normal');
    const linhas = doc.splitTextToSize(valor, this.larguraUtil - larguraRotulo) as string[];
    const alturaLinha = l.base * 0.42;

    this.garantirEspaco(alturaLinha);
    doc.setTextColor('#111111');
    doc.setFont('helvetica', 'bold');
    doc.text(`${rotulo}: `, l.margem, this.y + alturaLinha * 0.8);
    doc.setFont('helvetica', 'normal');
    doc.text(linhas[0] ?? '', l.margem + larguraRotulo, this.y + alturaLinha * 0.8);
    this.y += alturaLinha;

    for (const extra of linhas.slice(1)) {
      this.garantirEspaco(alturaLinha);
      doc.text(extra, l.margem + larguraRotulo, this.y + alturaLinha * 0.8);
      this.y += alturaLinha;
    }
  }

  faixa(titulo: string) {
    const { doc, l } = this;
    const altura = l.base * 0.72;
    this.garantirEspaco(altura + 2);
    doc.setFillColor(MARINHO);
    doc.rect(l.margem, this.y, this.larguraUtil, altura, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(l.pequeno);
    doc.setTextColor('#ffffff');
    doc.text(titulo, l.margem + 1.5, this.y + altura * 0.72);
    this.y += altura + 1.5;
  }

  espaco(mm = 2) {
    this.y += mm;
  }

  linha() {
    const { doc, l } = this;
    this.garantirEspaco(1.5);
    doc.setDrawColor(CINZA_LINHA);
    doc.setLineWidth(0.2);
    doc.line(l.margem, this.y, l.largura - l.margem, this.y);
    this.y += 1.5;
  }

  /** Tabela simples com cabeçalho marinho e zebra. `pesos` soma 1. */
  tabela(cabecalhos: string[], linhas: string[][], pesos: number[]) {
    const { doc, l } = this;
    const larguras = pesos.map((p) => this.larguraUtil * p);
    const alturaLinha = l.base * 0.52;

    const desenharCabecalho = () => {
      doc.setFillColor(MARINHO);
      doc.rect(l.margem, this.y, this.larguraUtil, alturaLinha, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(l.pequeno);
      doc.setTextColor('#ffffff');
      let x = l.margem;
      cabecalhos.forEach((c, i) => {
        doc.text(c, x + 1, this.y + alturaLinha * 0.7, { maxWidth: larguras[i] - 2 });
        x += larguras[i];
      });
      this.y += alturaLinha;
    };

    this.garantirEspaco(alturaLinha * 2);
    desenharCabecalho();

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(l.pequeno);
    linhas.forEach((linha, indice) => {
      // Cada célula pode quebrar em várias linhas; a altura da faixa é a da
      // célula mais alta, senão o texto vaza sobre a linha seguinte.
      const celulas = linha.map((c, i) => doc.splitTextToSize(c || '-', larguras[i] - 2) as string[]);
      const maxLinhas = Math.max(1, ...celulas.map((c) => c.length));
      const altura = alturaLinha * maxLinhas;

      if (this.garantirEspaco(altura)) desenharCabecalho();

      if (indice % 2 === 1) {
        doc.setFillColor(ZEBRA);
        doc.rect(l.margem, this.y, this.larguraUtil, altura, 'F');
      }
      doc.setTextColor('#111111');
      let x = l.margem;
      celulas.forEach((c, i) => {
        c.forEach((texto, j) => {
          doc.text(texto, x + 1, this.y + alturaLinha * (j + 0.7));
        });
        x += larguras[i];
      });
      this.y += altura;
    });

    doc.setDrawColor(CINZA_LINHA);
    doc.setLineWidth(0.2);
    doc.line(l.margem, this.y, l.largura - l.margem, this.y);
    this.y += 1;
  }
}

function cabecalho(folha: Folha, documento: DocumentoCartao) {
  const { doc, l } = folha;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(l.pequeno);
  doc.setTextColor(CINZA);
  doc.text('POLÍCIA MILITAR DO ESTADO DO RIO GRANDE DO NORTE', l.margem, folha.y + 3);
  folha.y += 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(l.base);
  doc.setTextColor(MARINHO);
  doc.text('5º BATALHÃO DE POLÍCIA MILITAR', l.margem, folha.y + 3);
  folha.y += 5;

  doc.setFontSize(l.titulo);
  doc.text(documento.cabecalho.titulo, l.margem, folha.y + 3, { maxWidth: folha.larguraUtil });
  folha.y += 6;

  if (documento.cabecalho.numero) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(l.base);
    doc.setTextColor('#111111');
    doc.text(`Nº ${documento.cabecalho.numero}`, l.margem, folha.y + 2);
    folha.y += 4;
  }

  const meta = [documento.cabecalho.dataExtensa, documento.cabecalho.diaSemana, documento.cabecalho.tipoPeriodo]
    .filter(Boolean)
    .join(' · ');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(l.pequeno);
  doc.setTextColor(CINZA);
  doc.text(meta, l.margem, folha.y + 2, { maxWidth: folha.larguraUtil });
  folha.y += 4;

  folha.linha();
  folha.espaco(1);
}

function blocoServico(folha: Folha, documento: DocumentoCartao) {
  folha.par('Período', documento.servico.janela);
  folha.par('Fiscal de Operações', documento.servico.fiscal);
  folha.par('Adjunto', documento.servico.adjunto);
  folha.par('VTR do Delta 07', documento.servico.delta07Viatura);
  folha.espaco(2);
}

function blocoViatura(folha: Folha, viatura: DocumentoViatura, comAlertas: boolean) {
  folha.espaco(1);
  folha.faixa(`VTR ${viatura.prefixo}    (versão ${viatura.versao})`);

  folha.par('Categoria', viatura.categoria);
  folha.par('Companhia', viatura.companhia);
  folha.par('Comandante', viatura.comandante);
  folha.par('Composição da guarnição', viatura.composicao);
  folha.par('Setor operacional', viatura.setor);
  folha.par('Bairros atendidos', viatura.bairros.join(', '));
  folha.par('Observações', viatura.observacao);
  if (viatura.madrugadaSegura) folha.par('Emprego', 'Madrugada Segura');

  if (viatura.eventos.length) {
    folha.espaco(1.5);
    folha.texto('EVENTOS NA ÁREA', { negrito: true, tamanho: folha.l.pequeno, cor: MARINHO });
    viatura.eventos.forEach((evento) => {
      const detalhe = [evento.tipo, evento.horario, evento.bairro, evento.local, evento.numeroOs]
        .filter(Boolean)
        .join(' · ');
      folha.texto(`• ${evento.nome}`, { negrito: true, tamanho: folha.l.pequeno });
      if (detalhe) folha.texto(detalhe, { tamanho: folha.l.pequeno, cor: CINZA, recuo: 3 });
    });
  }

  if (viatura.roteiro.length) {
    folha.espaco(1.5);
    folha.texto('ROTEIRO OPERACIONAL', { negrito: true, tamanho: folha.l.pequeno, cor: MARINHO });
    folha.tabela(
      ['Horário', 'Local / Itinerário', 'Atividade'],
      viatura.roteiro.map((item) => [
        `${item.inicio}${item.fim ? ` às ${item.fim}` : ''}`,
        item.local,
        item.atividade,
      ]),
      [0.24, 0.46, 0.3],
    );
  }

  if (comAlertas && viatura.alertas.length) {
    folha.espaco(1.5);
    folha.texto('ALERTAS OPERACIONAIS', { negrito: true, tamanho: folha.l.pequeno, cor: MARINHO });
    viatura.alertas.forEach((alerta) => {
      const titulo = `${alerta.prioridade.toUpperCase()}${alerta.categoria ? ` · ${alerta.categoria}` : ''}`;
      folha.texto(titulo, { negrito: true, tamanho: folha.l.pequeno });
      folha.texto(alerta.texto, { tamanho: folha.l.pequeno, recuo: 3 });
    });
  }

  folha.espaco(2);
}

function blocoQuadroResumo(folha: Folha, documento: DocumentoCartao) {
  folha.espaco(1);
  folha.faixa('QUADRO RESUMO');
  folha.tabela(
    ['Companhia', 'VTR', 'Setor', 'QTL Almoço', 'QTL Jantar', 'Madrugada Segura'],
    ordenarViaturasQuadroResumo(documento.viaturas).map((v) => [
      v.companhia || '-',
      v.prefixo,
      v.setor || '-',
      horarioDaAtividade(v.roteiro, 'QTL Almoço') || '-',
      horarioDaAtividade(v.roteiro, 'QTL Jantar') || '-',
      madrugadaSeguraTexto(v.roteiro, v.observacao) || '-',
    ]),
    [0.17, 0.13, 0.24, 0.15, 0.15, 0.16],
  );
}

/**
 * Gera o PDF de um ou mais documentos. Cada documento começa em página nova —
 * mesma regra do caminho por imagem, onde Companhia/Geral saem num arquivo
 * contínuo com uma viatura por página.
 */
export async function gerarDocumentosCartaoPdfVetorial(documentos: DocumentoCartao[]): Promise<Blob> {
  if (documentos.length === 0) throw new Error('Nenhum documento disponível para baixar.');

  const { jsPDF: JsPDF } = await import('jspdf');
  const formato = documentos[0].controle.formato;
  const l = layoutDo(formato);
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: [l.largura, l.altura] });

  documentos.forEach((documento, indice) => {
    if (indice > 0) doc.addPage([l.largura, l.altura], 'portrait');
    const folha = new Folha(doc, l, documento.controle.rodape);

    cabecalho(folha, documento);
    blocoServico(folha, documento);

    if (documento.controle.tipoDocumento === 'quadro_resumo') {
      blocoQuadroResumo(folha, documento);
    } else {
      documento.viaturas.forEach((viatura, i) => {
        // Uma viatura por página no consolidado: é assim que o documento é
        // destacado e entregue a cada comandante.
        if (i > 0 && documento.controle.tipoDocumento === 'consolidado') folha.novaPagina();
        blocoViatura(folha, viatura, documento.controle.comAlertas);
      });
    }

    folha.escreverRodape();
  });

  return doc.output('blob');
}
