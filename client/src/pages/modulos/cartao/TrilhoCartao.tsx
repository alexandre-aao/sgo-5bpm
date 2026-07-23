import { LayoutGrid, BarChart3, AlertTriangle, CheckCircle, Car, Map as MapIcon, Activity } from 'lucide-react';
import type { CartaoViatura, AlertaConflito } from '../../../lib/cartaoConflitos';

const ROTULO_CONFLITO: Record<AlertaConflito['tipo'], string> = {
  sobreposicao: 'Sobreposição de horário',
  cobertura: 'Setor sem cobertura',
  'sobreaviso-pendente': 'Fiscal Praça sem Oficial de Sobreaviso',
};

const CORES_CATEGORIA: Record<string, string> = {
  'Ordinária': 'var(--primary)',
  'Força Tática': 'var(--danger-fg)',
  'Suplementar': 'var(--warning-fg)',
};

interface TrilhoCartaoProps {
  viaturas: CartaoViatura[];
  alertas: AlertaConflito[];
}

// Trilho lateral do Cartão Programa: Resumo do Turno (4 mini-cards), Distribuição
// por Categoria e Alertas de Conflito detalhados — espelha renderResumoLateralCartao()
// e a parte de lista de renderAlertasCartao() em public/app.js.
export function TrilhoCartao({ viaturas, alertas }: TrilhoCartaoProps) {
  const setores = new Set(viaturas.map((v) => v.setor).filter(Boolean));
  const atividades = new Set<string>();
  viaturas.forEach((v) => v.itens.forEach((i) => { if (i.atividade) atividades.add(i.atividade); }));
  const conflitos = alertas.length;

  const cards = [
    { valor: viaturas.length, rotulo: 'Viaturas', Icone: Car, cor: 'var(--primary)', bg: 'var(--primary-soft)' },
    { valor: setores.size, rotulo: 'Setores', Icone: MapIcon, cor: 'var(--info-fg)', bg: 'var(--info-bg)' },
    { valor: atividades.size, rotulo: 'Atividades', Icone: Activity, cor: 'var(--success-fg)', bg: 'var(--success-bg)' },
    {
      valor: conflitos, rotulo: 'Conflitos', Icone: AlertTriangle,
      cor: conflitos ? 'var(--danger-fg)' : 'var(--success-fg)',
      bg: conflitos ? 'var(--danger-bg)' : 'var(--success-bg)',
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
              <span className="resumo-mini-icone" style={{ background: c.bg, color: c.cor }}><c.Icone /></span>
              <div>
                <div className="resumo-mini-valor" style={{ color: c.cor }}>{c.valor}</div>
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
              const cor = CORES_CATEGORIA[cat] || 'var(--badge-neutro)';
              return (
                <div className="categoria-linha" key={cat}>
                  <div className="categoria-topo">
                    <span style={{ fontWeight: 600, color: cor }}>{cat}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{qtd} ({pct}%)</span>
                  </div>
                  <div className="mini-bar-track"><div className="mini-bar-fill" style={{ width: `${pct}%`, background: cor }} /></div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="panel" id="cartao-alertas-panel">
        <div className="panel-header">
          <div className="panel-title"><AlertTriangle /><h2>Alertas de Conflito</h2></div>
          <span className={`contador-pill${alertas.length === 0 ? ' contador-pill-zero' : ''}`}>{alertas.length}</span>
        </div>
        <div className="dash-alertas-lista">
          {alertas.length === 0 ? (
            <div className="dash-alertas-vazio"><CheckCircle /><span>Nenhum conflito neste cartão.</span></div>
          ) : (
            alertas.map((a, i) => (
              <div className="dash-alerta-item" key={i}>
                <span className="dash-alerta-icone" style={{ background: 'var(--warning-bg)', color: 'var(--warning-fg)' }}>
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
