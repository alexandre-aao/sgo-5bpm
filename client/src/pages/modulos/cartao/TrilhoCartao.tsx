import { LayoutGrid, BarChart3, AlertTriangle, CheckCircle, Car, Map as MapIcon, Activity } from 'lucide-react';
import type { CartaoViatura, AlertaConflito } from '../../../lib/cartaoConflitos';
import { BarraPercentual } from '../../../components/BarraPercentual';

const ROTULO_CONFLITO: Record<AlertaConflito['tipo'], string> = {
  sobreposicao: 'Sobreposição de horário',
  cobertura: 'Setor sem cobertura',
  'sobreaviso-pendente': 'Fiscal Praça sem Oficial de Sobreaviso',
};

// Categoria de viatura é classificação, não situação — por isso saiu do
// vermelho/amarelo (Etapa 1, item 3) e ficou na família azul/roxo.
const TONS_CATEGORIA: Record<string, { texto: string; barra: 'primary' | 'roxo' | 'info' }> = {
  'Ordinária': { texto: 'tom-primary', barra: 'primary' },
  'Força Tática': { texto: 'tom-roxo', barra: 'roxo' },
  'Suplementar': { texto: 'tom-info', barra: 'info' },
};

interface TrilhoCartaoProps {
  viaturas: CartaoViatura[];
  alertas: AlertaConflito[];
}

// Trilho lateral do Cartão Programa: Resumo do Turno (4 mini-cards), Distribuição
// por Categoria e Conflitos detalhados — espelha renderResumoLateralCartao()
// e a parte de lista de renderAlertasCartao() em public/app.js.
export function TrilhoCartao({ viaturas, alertas }: TrilhoCartaoProps) {
  const setores = new Set(viaturas.map((v) => v.setor).filter(Boolean));
  const atividades = new Set<string>();
  viaturas.forEach((v) => v.itens.forEach((i) => { if (i.atividade) atividades.add(i.atividade); }));
  const conflitos = alertas.length;

  const cards = [
    { valor: viaturas.length, rotulo: 'Viaturas', Icone: Car, tom: 'tom-primary', fundo: 'fundo-primary' },
    { valor: setores.size, rotulo: 'Setores', Icone: MapIcon, tom: 'tom-info', fundo: 'fundo-info' },
    { valor: atividades.size, rotulo: 'Atividades', Icone: Activity, tom: 'tom-roxo', fundo: 'fundo-roxo' },
    {
      valor: conflitos, rotulo: 'Conflitos', Icone: AlertTriangle,
      tom: conflitos ? 'tom-danger' : 'tom-success',
      fundo: conflitos ? 'fundo-danger' : 'fundo-success',
    },
  ];

  const contagemCategoria = new Map<string, number>();
  viaturas.forEach((v) => {
    const cat = v.categoria || 'Ordinária';
    contagemCategoria.set(cat, (contagemCategoria.get(cat) || 0) + 1);
  });
  const totalViaturas = viaturas.length;
  const linhasCategoria = [...contagemCategoria.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <aside className="dash-rail">
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title"><LayoutGrid /><h2>Resumo do Turno</h2></div>
        </div>
        <div className="cartao-resumo-mini">
          {cards.map((c) => (
            <div className="resumo-mini-card" key={c.rotulo}>
              <span className={`resumo-mini-icone ${c.fundo} ${c.tom}`}><c.Icone /></span>
              <div>
                <div className={`resumo-mini-valor ${c.tom}`}>{c.valor}</div>
                <div className="resumo-mini-rotulo">{c.rotulo}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div className="panel-title"><BarChart3 /><h2>Distribuição por Categoria</h2></div>
        </div>
        <div className="cartao-categorias">
          {totalViaturas === 0 ? (
            <p className="turno-vazio">Nenhuma viatura no cartão.</p>
          ) : (
            linhasCategoria.map(([cat, qtd]) => {
              const pct = Math.round((qtd / totalViaturas) * 100);
              const tom = TONS_CATEGORIA[cat] || { texto: 'tom-neutro', barra: 'neutro' as const };
              return (
                <div className="categoria-linha" key={cat}>
                  <div className="categoria-topo">
                    <span className={`peso-600 ${tom.texto}`}>{cat}</span>
                    <span className="texto-muted">{qtd} ({pct}%)</span>
                  </div>
                  <BarraPercentual valor={pct} tom={tom.barra} />
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="panel" id="cartao-alertas-panel">
        <div className="panel-header">
          <div className="panel-title"><AlertTriangle /><h2>Conflitos</h2></div>
          <span className={`contador-pill${alertas.length === 0 ? ' contador-pill-zero' : ''}`}>{alertas.length}</span>
        </div>
        <div className="dash-alertas-lista">
          {alertas.length === 0 ? (
            <div className="dash-alertas-vazio"><CheckCircle /><span>Nenhum conflito neste cartão.</span></div>
          ) : (
            alertas.map((a, i) => (
              <div className="dash-alerta-item" key={i}>
                <span className="dash-alerta-icone fundo-warning tom-warning">
                  <AlertTriangle />
                </span>
                <div className="dash-alerta-texto">
                  <div className="dash-alerta-titulo">{ROTULO_CONFLITO[a.tipo] || 'Conflito'}</div>
                  <div className="dash-alerta-sub">{a.mensagem}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
