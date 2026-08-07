#!/usr/bin/env node
// Inventário das rotas registradas no Express, em ordem.
//
// Existe para tornar a divisão do server.js em routers VERIFICÁVEL: capture
// antes, capture depois e compare. Se método, caminho, ORDEM e middlewares
// baterem, a refatoração não mudou o roteamento — que é exatamente o risco de
// mover 80 rotas de arquivo. A ordem importa de verdade: `/api/escalas/lote`
// registrada depois de `/api/escalas/:id` deixa de ser alcançável.
//
//   node scripts/listar-rotas.js > /tmp/rotas-antes.txt
//
// VERCEL=1 evita o app.listen(), então o processo não fica preso.
process.env.VERCEL = '1';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://exemplo.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'chave-fake-para-inventario';

const app = require('../server');

/** Middlewares nomeados da camada: é o que revela se uma rota perdeu o
 *  `exigirP3` no caminho — o tipo de regressão silenciosa que o split pode
 *  causar sem quebrar nada visível. */
function nomesDosHandlers(camada) {
  return camada.route.stack
    .map((s) => s.name || 'anonimo')
    .filter((n) => n !== 'anonimo' && n !== '<anonymous>')
    .join(',');
}

const linhas = [];
function percorrer(stack, prefixo = '') {
  for (const camada of stack) {
    if (camada.route) {
      const metodos = Object.keys(camada.route.methods).filter((m) => camada.route.methods[m]);
      for (const metodo of metodos) {
        linhas.push(`${metodo.toUpperCase().padEnd(6)} ${prefixo}${camada.route.path}  [${nomesDosHandlers(camada)}]`);
      }
    } else if (camada.name === 'router' && camada.handle?.stack) {
      // Router montado com app.use('/prefixo', router): reconstrói o caminho
      // completo a partir do regexp do mount, senão o inventário do "depois"
      // não seria comparável com o do "antes".
      const fonte = camada.regexp?.source || '';
      const mount = fonte
        .replace('^\\/', '/')
        .replace('\\/?(?=\\/|$)', '')
        .replace(/\\\//g, '/')
        .replace(/\$$/, '')
        .replace(/\(\?:\(\[\^\\\/]\+\?\)\)/g, ':param');
      percorrer(camada.handle.stack, prefixo + (mount === '/' ? '' : mount));
    }
  }
}

percorrer(app._router?.stack || app.router?.stack || []);

console.log(linhas.join('\n'));
console.error(`total: ${linhas.length} rotas`);
