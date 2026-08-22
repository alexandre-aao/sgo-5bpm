import { useState, type FormEvent } from 'react';
import { Check, LayoutTemplate, X } from 'lucide-react';
import type { Tables } from '../../../types/supabase';
import type { CartaoDetalhado } from '../../../lib/cartaoConflitos';
import { apiFetch } from '../../../lib/api';
import { useToast } from '../../../context/useToast';
import { useModalA11y } from '../../../hooks/useModalA11y';

interface ModalSalvarComoPadraoOperacionalProps {
  cartao: CartaoDetalhado;
  bairros: Tables<'bairros_coordenadas'>[];
  onFechar: () => void;
  onCriado: (id: string) => void;
}

export function ModalSalvarComoPadraoOperacional({ cartao, bairros, onFechar, onCriado }: ModalSalvarComoPadraoOperacionalProps) {
  const MAX_BAIRROS_RELACIONADOS = 3;
  const { idTitulo, refCaixa, propsOverlay } = useModalA11y(onFechar);
  const { toast } = useToast();
  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState('bairro');
  const [descricao, setDescricao] = useState('');
  const [separarPorBairro, setSepararPorBairro] = useState(false);
  const [bairrosSelecionados, setBairrosSelecionados] = useState<string[]>(() => {
    const ids = new Set((cartao.viaturas || []).flatMap((viatura) => viatura.bairros_ids || (viatura.bairro_id ? [viatura.bairro_id] : [])));
    return bairros.filter((bairro) => ids.has(bairro.id)).map((bairro) => bairro.nome_bairro);
  });
  const [enviando, setEnviando] = useState(false);

  function alternarBairro(nomeBairro: string) {
    setBairrosSelecionados((atuais) => {
      if (atuais.includes(nomeBairro)) return atuais.filter((bairro) => bairro !== nomeBairro);
      if (atuais.length >= MAX_BAIRROS_RELACIONADOS) return atuais;
      return [...atuais, nomeBairro];
    });
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!separarPorBairro && !nome.trim()) return;
    if (bairrosSelecionados.length > MAX_BAIRROS_RELACIONADOS) {
      toast(`Selecione no máximo ${MAX_BAIRROS_RELACIONADOS} bairros relacionados.`, 'warning');
      return;
    }
    setEnviando(true);
    try {
      const res = await apiFetch(`/api/cartoes/${cartao.id}/salvar-como-padrao-operacional`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nome.trim(), categoria, bairros: bairrosSelecionados, descricao: descricao.trim(), separar_por_bairro: separarPorBairro }),
      });
      const corpo = await res.json().catch(() => ({})) as { id?: string; ids?: string[]; error?: string };
      const idsCriados = Array.isArray(corpo.ids) ? corpo.ids : (corpo.id ? [corpo.id] : []);
      if (!res.ok || !idsCriados.length) {
        toast(corpo.error || `Não foi possível salvar o cartão como padrão (HTTP ${res.status}).`, 'danger');
        return;
      }
      toast(idsCriados.length > 1
        ? `${idsCriados.length} cartões padrão criados como rascunho. Publique-os na biblioteca antes de usar.`
        : 'Novo cartão padrão criado como rascunho. Publique-o na biblioteca antes de usar.', 'success');
      onCriado(idsCriados[0]);
    } catch {
      toast('Falha na comunicação com o servidor.', 'danger');
    } finally {
      setEnviando(false);
    }
  }

  const qtdViaturas = (cartao.viaturas || []).length;
  const qtdItens = (cartao.viaturas || []).reduce((total, viatura) => total + (viatura.itens || []).length, 0);

  const bairrosAtivos = bairros.filter((bairro) => bairro.ativo !== false);
  return <div className="modal-overlay" {...propsOverlay}><div className="modal-box cartao-salvar-padrao-modal" ref={refCaixa}><div className="modal-header"><h3 id={idTitulo}><LayoutTemplate /> Salvar como cartão padrão</h3><button type="button" className="btn-close" aria-label="Fechar" onClick={onFechar}><X /></button></div><form onSubmit={enviar}><p className="texto-auxiliar">{separarPorBairro ? `Serão criados padrões independentes por bairro, aproveitando as viaturas e os ${qtdItens} itens de roteiro do cartão. O cartão de serviço e seu histórico permanecem intactos.` : `Será criada uma cópia independente com ${qtdViaturas} viatura(s) e ${qtdItens} item(ns) de roteiro. O cartão de serviço e seu histórico permanecem intactos.`}</p><label className="checkbox-inline"><input type="checkbox" checked={separarPorBairro} onChange={(e) => setSepararPorBairro(e.target.checked)} /> Criar um padrão separado para cada bairro identificado nas viaturas</label>{!separarPorBairro && <div className="form-group"><label htmlFor="salvar-padrao-nome">Nome do padrão *</label><input id="salvar-padrao-nome" required maxLength={120} autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Lagoa Nova" /></div>}{separarPorBairro && <p className="texto-auxiliar">Os nomes serão extraídos do setor de cada viatura. Se uma viatura cobrir mais de um bairro, ela será disponibilizada em cada biblioteca correspondente.</p>}<div className="form-row"><div className="form-group col-md-6"><label htmlFor="salvar-padrao-categoria">Tipo / categoria</label><select id="salvar-padrao-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}><option value="bairro">Bairro</option><option value="especializado">Especializado</option><option value="reforco">Reforço</option><option value="missao">Missão</option></select></div><div className="form-group col-md-6"><label htmlFor="salvar-padrao-descricao">Observações</label><input id="salvar-padrao-descricao" maxLength={500} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Opcional" /></div></div><fieldset className="padrao-bairros-checkboxes"><legend>Bairros relacionados ({bairrosSelecionados.length}/{MAX_BAIRROS_RELACIONADOS})</legend><div>{bairrosAtivos.map((bairro) => <label className="checkbox-inline" key={bairro.id}><input type="checkbox" checked={bairrosSelecionados.includes(bairro.nome_bairro)} disabled={!bairrosSelecionados.includes(bairro.nome_bairro) && bairrosSelecionados.length >= MAX_BAIRROS_RELACIONADOS} onChange={() => alternarBairro(bairro.nome_bairro)} /><span>{bairro.nome_bairro}</span></label>)}</div><span className="texto-auxiliar">Marque até {MAX_BAIRROS_RELACIONADOS} bairros. Não é necessário usar Ctrl/Cmd.</span></fieldset><div className="form-actions form-actions-modal"><button type="button" className="btn btn-secondary" onClick={onFechar}>Cancelar</button><button type="submit" className={`btn btn-primary${enviando ? ' btn-carregando' : ''}`} disabled={enviando || (!separarPorBairro && !nome.trim())}><Check /> Criar padrão</button></div></form></div></div>;
}
