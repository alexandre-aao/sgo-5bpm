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
  const cabecalho = config.headers
    .flatMap((regra) => regra.headers)
    .find((header) => header.key.toLowerCase() === 'content-security-policy');
  assert.ok(cabecalho, 'vercel.json precisa aplicar CSP ao frontend estático');
  const diretiva = cabecalho.value.split(';').map((item) => item.trim()).find((item) => item.startsWith('style-src '));
  assert.ok(diretiva);
  assert.ok(!diretiva.includes("'unsafe-inline'"), `diretiva insegura: ${diretiva}`);
  assert.match(cabecalho.value, /style-src-attr 'unsafe-inline'/, 'Leaflet ainda precisa da exceção restrita a atributos');
});
