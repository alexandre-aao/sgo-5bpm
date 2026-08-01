import { useEffect, useMemo, useRef, useState } from 'react';
import { FileDown, X, Printer, Share2, Send } from 'lucide-react';
import type { Tables } from '../../../../types/supabase';
import type { CartaoDetalhado } from '../../../../lib/cartaoConflitos';
import { useToast } from '../../../../context/useToast';
import { DocumentoCartoes } from './DocumentoCartoes';
import { montarDadosCartaoPdf, nomeArquivoCartao } from './cartaoPdfDados';
import { avisosSelecionadosParaPdf } from './avisosDoCartao';
import { cartaoEmTexto, compartilharTexto } from './cartaoTexto';
import {
  agruparPorRecorte,
  carregarPreset,
  filtrarPorConteudo,
  salvarPreset,
  CODIGO_CONTEUDO,
  ROTULO_CONTEUDO,
  ROTULO_RECORTE,
  type ConteudoCartao,
  type GrupoGeracao,
  type PresetGeracao,
  type RecorteCartao,
} from './geracaoCartao';
import type { LayoutCartaoPdf } from './CartaoPdf';

interface ModalGerarCartoesProps {
  cartao: CartaoDetalhado;
  pessoal: Tables<'pessoal'>[];
  bairros: Tables<'bairros_coordenadas'>[];
  avisos: Tables<'avisos'>[];
  onFechar: () => void;
  onGerado?: (viaturaIds: string[]) => void;
  onEnviado?: (viaturaIds: string[]) => void;
}

/** Grupo de botões de um eixo do preset. */
function Eixo<T extends string>({
  rotulo, valor, opcoes, onChange,
}: {
  rotulo: string;
  valor: T;
  opcoes: { valor: T; texto: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="form-group">
      <span className="form-label-estatico">{rotulo}</span>
      <div className="companhia-switch" role="group" aria-label={rotulo}>
        {opcoes.map((opcao) => (
          <button
            key={opcao.valor}
            type="button"
            className={`companhia-opcao${valor === opcao.valor ? ' ativo' : ''}`}
            aria-pressed={valor === opcao.valor}
            onClick={() => onChange(opcao.valor)}
          >
            {opcao.texto}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ModalGerarCartoes({
  cartao, pessoal, bairros, avisos, onFechar, onGerado, onEnviado,
}: ModalGerarCartoesProps) {
  const { toast } = useToast();
  const [preset, setPreset] = useState<PresetGeracao>(carregarPreset);
  const [grupoAtivo, setGrupoAtivo] = useState<GrupoGeracao | null>(null);

  // O preset é lembrado entre sessões — o Adjunto quase sempre repete a mesma
  // combinação todo dia.
  useEffect(() => { salvarPreset(preset); }, [preset]);

  const grupos = useMemo(() => {
    const filtradas = filtrarPorConteudo(cartao.viaturas || [], preset.conteudo);
    return agruparPorRecorte(filtradas, preset.recorte);
  }, [cartao.viaturas, preset.conteudo, preset.recorte]);

  // Os callbacks do pai são arrow functions novas a cada render. Guardados num
  // ref, não entram nas dependências do efeito abaixo — senão qualquer re-render
  // reexecutaria a impressão.
  const onGeradoRef = useRef(onGerado);
  onGeradoRef.current = onGerado;

  // Dispara a impressão depois que o documento do grupo está no DOM. O efeito
  // roda após o commit, então `.cp-pdf-palco-impressao` já existe — e
  // window.print() força o layout por conta própria.
  // Sem requestAnimationFrame de propósito: rAF não dispara em aba sem pintura,
  // e o cleanup o cancelaria a cada re-render, deixando a geração travada.
  useEffect(() => {
    if (!grupoAtivo) return;
    const dadosPrimeira = montarDadosCartaoPdf(cartao, grupoAtivo.viaturas[0], pessoal, bairros);
    const sufixo = grupoAtivo.viaturas.length > 1 ? `_${grupoAtivo.viaturas.length}VTR` : '';
    const tituloOriginal = document.title;
    document.title = nomeArquivoCartao(dadosPrimeira, CODIGO_CONTEUDO[preset.conteudo]) + sufixo;

    window.print();

    document.title = tituloOriginal;
    onGeradoRef.current?.(grupoAtivo.viaturas.map((v) => v.id));
    setGrupoAtivo(null);
  }, [grupoAtivo, cartao, pessoal, bairros, preset.conteudo]);

  async function handleCompartilhar(grupo: GrupoGeracao) {
    const partes = grupo.viaturas.map((viatura) => {
      const dados = montarDadosCartaoPdf(cartao, viatura, pessoal, bairros);
      const avisosDaVtr = preset.comAvisos ? avisosSelecionadosParaPdf(viatura, avisos, bairros) : [];
      return cartaoEmTexto(dados, avisosDaVtr);
    });

    const resultado = await compartilharTexto(`Cartão Programa — ${grupo.titulo}`, partes.join('\n\n———\n\n'));

    if (resultado === 'compartilhado') {
      toast(`Cartão de ${grupo.titulo} compartilhado.`, 'success');
      onEnviado?.(grupo.viaturas.map((v) => v.id));
    } else if (resultado === 'copiado') {
      toast('Cartão copiado — cole no WhatsApp do comandante.', 'info');
      onEnviado?.(grupo.viaturas.map((v) => v.id));
    } else if (resultado === 'falhou') {
      toast('Não foi possível compartilhar nem copiar o cartão.', 'danger');
    }
    // 'cancelado': o operador fechou a folha de compartilhamento, sem aviso.
  }

  return (
    <div id="modal-cartao-pdf" className="modal-overlay">
      <div className="modal-box modal-box-lg">
        <div className="modal-header">
          <h3><FileDown /> Gerar Cartões</h3>
          <button className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button>
        </div>

        <div className="cp-geracao-eixos">
          <Eixo<ConteudoCartao>
            rotulo="Conteúdo"
            valor={preset.conteudo}
            opcoes={(['ordinario', 'reforco', 'completo'] as ConteudoCartao[]).map((v) => ({ valor: v, texto: ROTULO_CONTEUDO[v] }))}
            onChange={(conteudo) => setPreset((atual) => ({ ...atual, conteudo }))}
          />
          <Eixo<RecorteCartao>
            rotulo="Recorte"
            valor={preset.recorte}
            opcoes={(['viatura', 'companhia', 'geral'] as RecorteCartao[]).map((v) => ({ valor: v, texto: ROTULO_RECORTE[v] }))}
            onChange={(recorte) => setPreset((atual) => ({ ...atual, recorte }))}
          />
          <Eixo<'com' | 'sem'>
            rotulo="Alertas"
            valor={preset.comAvisos ? 'com' : 'sem'}
            opcoes={[{ valor: 'com', texto: 'Com' }, { valor: 'sem', texto: 'Sem' }]}
            onChange={(v) => setPreset((atual) => ({ ...atual, comAvisos: v === 'com' }))}
          />
          <Eixo<LayoutCartaoPdf>
            rotulo="Layout"
            valor={preset.layout}
            opcoes={[{ valor: 'celular', texto: 'Celular' }, { valor: 'a4', texto: 'A4' }]}
            onChange={(layout) => setPreset((atual) => ({ ...atual, layout }))}
          />
        </div>

        {!preset.comAvisos && (
          <p className="cp-pdf-dica">
            Versão sem alertas — é a que serve para arquivo e processo, já que a orientação da P3
            costuma ser informação sensível.
          </p>
        )}

        <div className="cp-geracao-lista">
          {grupos.length === 0 ? (
            <p className="cp-pdf-dica">
              Nenhuma viatura no conteúdo &quot;{ROTULO_CONTEUDO[preset.conteudo]}&quot;.
              Troque para &quot;Completo&quot; para ver todas as viaturas do dia.
            </p>
          ) : (
            grupos.map((grupo) => (
              <div key={grupo.id} className="cp-geracao-item">
                <div className="cp-geracao-identificacao">
                  <strong>{grupo.titulo}</strong>
                  <span>{grupo.subtitulo}</span>
                </div>
                <div className="acoes-linha">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setGrupoAtivo(grupo)}>
                    <Printer /> Gerar
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => void handleCompartilhar(grupo)}>
                    <Share2 /> Compartilhar
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <p className="cp-pdf-dica">
          <Send style={{ width: 12, height: 12, verticalAlign: '-1px' }} /> &quot;Gerar&quot; abre
          o diálogo de impressão (escolha &quot;Salvar como PDF&quot;). &quot;Compartilhar&quot; manda
          o cartão em texto direto pelo celular, ou copia para a área de transferência no computador.
        </p>

        <div className="form-actions" style={{ border: 'none', paddingTop: 8, marginTop: 0 }}>
          <button type="button" className="btn btn-secondary" onClick={onFechar}>Fechar</button>
        </div>

        {/* Área que vai para a impressora: só existe enquanto um grupo está sendo gerado. */}
        {grupoAtivo && (
          <div className="cp-pdf-palco cp-pdf-palco-impressao">
            <DocumentoCartoes
              cartao={cartao}
              viaturas={grupoAtivo.viaturas}
              pessoal={pessoal}
              bairros={bairros}
              avisos={avisos}
              layout={preset.layout}
              comAvisos={preset.comAvisos}
            />
          </div>
        )}
      </div>
    </div>
  );
}
