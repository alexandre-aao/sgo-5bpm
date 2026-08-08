const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');

function arquivosFonte(diretorio) {
  return fs.readdirSync(diretorio, { withFileTypes: true }).flatMap((entrada) => {
    const absoluto = path.join(diretorio, entrada.name);
    if (entrada.isDirectory()) return arquivosFonte(absoluto);
    return /\.(?:ts|tsx|html)$/.test(entrada.name) ? [absoluto] : [];
  });
}

test('frontend não cria atributos style próprios', () => {
  const ocorrencias = arquivosFonte(path.join(raiz, 'client', 'src')).flatMap((arquivo) => {
    const conteudo = fs.readFileSync(arquivo, 'utf8');
    return /\bstyle\s*=|\.style\s*\./.test(conteudo) ? [path.relative(raiz, arquivo)] : [];
  });
  assert.deepStrictEqual(ocorrencias, []);
});

test("style-src da produção não contém 'unsafe-inline'", () => {
  const config = JSON.parse(fs.readFileSync(path.join(raiz, 'vercel.json'), 'utf8'));
  const regra = config.routes.find((rota) => rota.headers?.['Content-Security-Policy']);
  assert.ok(regra?.continue, 'a regra CSP precisa continuar até a rota de destino');
  const csp = regra.headers['Content-Security-Policy'];
  const diretiva = csp.split(';').map((item) => item.trim()).find((item) => item.startsWith('style-src '));
  assert.ok(diretiva);
  assert.ok(!diretiva.includes("'unsafe-inline'"), `diretiva insegura: ${diretiva}`);
  assert.match(csp, /style-src-attr 'unsafe-inline'/, 'Leaflet ainda precisa da exceção restrita a atributos');
});
