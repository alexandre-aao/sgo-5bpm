import type { DocumentoCartao, DocumentoViatura } from './documentoCartao';

const ROTULO_MODALIDADE = {
  guarnicao: 'Enviar à guarnição',
  arquivo_sei: 'Documento para arquivo ou SEI',
  consolidado: 'Consolidado operacional',
  personalizado: 'Configuração personalizada',
};

function Linha({ rotulo, valor }: { rotulo: string; valor?: string }) {
  if (!valor) return null;
  return <div className="doc-cartao-linha"><span>{rotulo}</span><strong>{valor}</strong></div>;
}

function Cabecalho({ documento }: { documento: DocumentoCartao }) {
  return (
    <header className="doc-cartao-cabecalho">
      <img src="/img/brasao-5bpm.png" alt="Brasão do 5º BPM" />
      <div className="doc-cartao-identidade">
        <span>POLÍCIA MILITAR DO ESTADO DO RIO GRANDE DO NORTE</span>
        <strong>5º BATALHÃO DE POLÍCIA MILITAR</strong>
        <h1>{documento.cabecalho.titulo}</h1>
      </div>
      {documento.cabecalho.numero && <div className="doc-cartao-numero">Nº {documento.cabecalho.numero}</div>}
      <div className="doc-cartao-meta">
        <span>{documento.cabecalho.dataExtensa}</span>
        <span>{documento.cabecalho.diaSemana}</span>
        {documento.cabecalho.tipoPeriodo && <span>{documento.cabecalho.tipoPeriodo}</span>}
      </div>
    </header>
  );
}

function Viatura({ viatura, mostrarAlertas }: { viatura: DocumentoViatura; mostrarAlertas: boolean }) {
  return (
    <section className="doc-cartao-viatura">
      <div className="doc-cartao-vtr-titulo">
        <h2>VTR {viatura.prefixo}</h2>
        <span>versão {viatura.versao}</span>
      </div>
      <div className="doc-cartao-dados-grid">
        <Linha rotulo="Categoria da viatura" valor={viatura.categoria} />
        <Linha rotulo="Companhia" valor={viatura.companhia} />
        <Linha rotulo="Comandante" valor={viatura.comandante} />
        <Linha rotulo="Composição da guarnição" valor={viatura.composicao} />
        <Linha rotulo="Setor operacional" valor={viatura.setor} />
        <Linha rotulo="Bairros atendidos" valor={viatura.bairros.join(', ')} />
        <Linha rotulo="Observações da VTR" valor={viatura.observacao} />
        {viatura.madrugadaSegura && <Linha rotulo="Emprego" valor="Madrugada Segura" />}
      </div>

      {viatura.eventos.length > 0 && (
        <div className="doc-cartao-bloco">
          <h3>EVENTOS NA ÁREA</h3>
          {viatura.eventos.map((evento) => (
            <div className="doc-cartao-evento" key={evento.id}>
              <strong>{evento.nome}</strong>
              <span>{[evento.tipo, evento.horario, evento.bairro, evento.local, evento.numeroOs].filter(Boolean).join(' · ')}</span>
            </div>
          ))}
        </div>
      )}

      <div className="doc-cartao-bloco">
        <h3>ROTEIRO OPERACIONAL</h3>
        <table className="doc-cartao-roteiro">
          <thead><tr><th>Horário</th><th>Local / Itinerário</th><th>Atividade</th></tr></thead>
          <tbody>
            {viatura.roteiro.map((item) => (
              <tr key={item.id}>
                <td>{item.inicio}{item.fim ? ` às ${item.fim}` : ''}</td>
                <td>{item.local}</td>
                <td>{item.atividade}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mostrarAlertas && viatura.alertas.length > 0 && (
        <div className="doc-cartao-bloco doc-cartao-alertas">
          <h3>ALERTAS OPERACIONAIS</h3>
          {viatura.alertas.map((alerta) => (
            <div className="doc-cartao-alerta" key={alerta.id}>
              <strong>{alerta.prioridade.toUpperCase()}{alerta.categoria ? ` · ${alerta.categoria}` : ''}</strong>
              <span>{alerta.texto}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function grupos(documento: DocumentoCartao): Array<{ titulo: string; viaturas: DocumentoViatura[] }> {
  if (documento.controle.agrupamento === 'nenhum') return [{ titulo: '', viaturas: documento.viaturas }];
  const mapa = new Map<string, DocumentoViatura[]>();
  documento.viaturas.forEach((viatura) => {
    const chave = documento.controle.agrupamento === 'companhia' ? viatura.companhia || 'Sem Companhia' : viatura.categoria || 'Sem categoria';
    mapa.set(chave, [...(mapa.get(chave) || []), viatura]);
  });
  return [...mapa.entries()].map(([titulo, viaturas]) => ({ titulo, viaturas }));
}

export function DocumentoCartaoView({ documento }: { documento: DocumentoCartao }) {
  return (
    <article className={`documento-cartao documento-cartao--${documento.controle.formato} documento-cartao--${documento.controle.tipoDocumento}`}>
      <Cabecalho documento={documento} />
      <div className="doc-cartao-servico">
        <Linha rotulo="Período do serviço" valor={documento.servico.janela} />
        <Linha rotulo="Fiscal de Operações" valor={documento.servico.fiscal} />
        <Linha rotulo="Adjunto" valor={documento.servico.adjunto} />
        <Linha rotulo="VTR do Delta 07" valor={documento.servico.delta07Viatura} />
      </div>

      {documento.controle.tipoDocumento === 'consolidado' && (
        <div className="doc-cartao-resumo">
          <strong>{documento.viaturas.length} viatura(s)</strong>
          <span>{documento.viaturas.reduce((total, viatura) => total + viatura.roteiro.length, 0)} item(ns) de roteiro</span>
          <span>{documento.eventos.length} evento(s) relacionado(s)</span>
          <span>{ROTULO_MODALIDADE[documento.controle.modalidade]}</span>
        </div>
      )}

      {grupos(documento).map((grupo) => (
        <div className="doc-cartao-grupo" key={grupo.titulo || 'geral'}>
          {grupo.titulo && <h2 className="doc-cartao-grupo-titulo">{grupo.titulo}</h2>}
          {grupo.viaturas.map((viatura) => <Viatura key={viatura.id} viatura={viatura} mostrarAlertas={documento.controle.comAlertas} />)}
        </div>
      ))}

      <footer className="doc-cartao-rodape">{documento.controle.rodape}</footer>
    </article>
  );
}

export function LoteDocumentosCartao({ documentos }: { documentos: DocumentoCartao[] }) {
  return <>{documentos.map((documento, indice) => <div className="doc-cartao-pagina" key={`${documento.controle.nomeArquivo}-${indice}`}><DocumentoCartaoView documento={documento} /></div>)}</>;
}
