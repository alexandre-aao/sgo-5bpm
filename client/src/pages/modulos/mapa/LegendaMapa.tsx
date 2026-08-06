import type { MapaPrefs } from './useMapaPrefs';

/**
 * Legenda das cores do mapa. As cores de categoria de viatura e de prioridade de
 * alerta já existiam no mapa sem nenhuma explicação na tela — quem não conhecia
 * a convenção via pontos coloridos sem significado.
 *
 * Os literais repetem os de `viaturasNoMapa.ts` e `avisosNoMapa.ts` de propósito:
 * o Leaflet pinta fora da cascata do componente e não resolve `var(--…)`, então
 * a fonte da verdade é o valor literal, e a legenda precisa bater com ele.
 */
const CATEGORIAS = [
  { rotulo: 'Força Tática', cor: '#ef4444' },
  { rotulo: 'Suplementar', cor: '#f59e0b' },
  { rotulo: 'Ordinária', cor: '#2563eb' },
];

const PRIORIDADES = [
  { rotulo: 'Crítica', cor: '#b91c1c' },
  { rotulo: 'Alta', cor: '#ea580c' },
  { rotulo: 'Atenção', cor: '#ca8a04' },
  { rotulo: 'Informativa', cor: '#0369a1' },
];

export function LegendaMapa({ prefs }: { prefs: MapaPrefs }) {
  // Só entra na legenda o que está de fato desenhado: legenda de camada
  // desligada explica algo que o usuário não está vendo.
  if (!prefs.mostrarViaturas && !prefs.mostrarAvisos) return null;

  return (
    <div className="mapa-legenda">
      {prefs.mostrarViaturas && (
        <div className="mapa-legenda-grupo">
          <span className="mapa-legenda-titulo">Viaturas</span>
          {CATEGORIAS.map((c) => (
            <span className="mapa-legenda-item" key={c.rotulo}>
              <span className="mapa-legenda-quadrado" style={{ background: c.cor }} aria-hidden="true" />
              {c.rotulo}
            </span>
          ))}
        </div>
      )}

      {prefs.mostrarAvisos && (
        <div className="mapa-legenda-grupo">
          <span className="mapa-legenda-titulo">Alertas</span>
          {PRIORIDADES.map((p) => (
            <span className="mapa-legenda-item" key={p.rotulo}>
              <span className="mapa-legenda-circulo" style={{ borderColor: p.cor, background: `${p.cor}26` }} aria-hidden="true" />
              {p.rotulo}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
