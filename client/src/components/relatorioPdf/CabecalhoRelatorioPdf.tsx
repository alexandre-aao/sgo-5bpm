import { useState } from 'react';

interface CabecalhoRelatorioPdfProps {
  titulo: string;
  subtitulo?: string;
}

// Cabeçalho oficial padrão dos relatórios PDF (estilo SGEPM) — espelha
// cabecalhoRelatorioPdf() em public/app.js. O horário "Gerado em" é fixado no
// primeiro render (useState lazy) pra não mudar se o pai re-renderizar
// enquanto o relatório está aberto.
export function CabecalhoRelatorioPdf({ titulo, subtitulo }: CabecalhoRelatorioPdfProps) {
  const [gerado] = useState(() => {
    const agora = new Date();
    const p2 = (n: number) => String(n).padStart(2, '0');
    return `${p2(agora.getDate())}/${p2(agora.getMonth() + 1)}/${agora.getFullYear()}, ${p2(agora.getHours())}:${p2(agora.getMinutes())}`;
  });

  return (
    <>
      <div className="rel-pdf-cabecalho">
        <div className="rpc-brasao">POLÍCIA MILITAR DO RIO GRANDE DO NORTE</div>
        <div className="rpc-sub">5º BATALHÃO DE POLÍCIA MILITAR — SEÇÃO DE PLANEJAMENTO E OPERAÇÕES (P3)</div>
      </div>
      <div className="rel-pdf-titulobar">
        <div>
          <div className="rel-pdf-titulo">{titulo}</div>
          <div className="rel-pdf-gerado">{subtitulo || ''}</div>
        </div>
        <div className="rel-pdf-gerado">Gerado em: {gerado}</div>
      </div>
    </>
  );
}
