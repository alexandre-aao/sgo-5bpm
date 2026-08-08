const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const urlHelper = pathToFileURL(path.join(
  __dirname, '..', 'client', 'src', 'lib', 'enderecoEvento.ts',
)).href;

test('enderecoEvento prioriza o endereço cadastrado', async () => {
  const { enderecoEvento } = await import(urlHelper);
  assert.strictEqual(enderecoEvento({
    endereco: '  Av. Roberto Freire, 123  ',
    local_itinerario: 'Praça do evento',
    bairro: 'Ponta Negra',
  }), 'Av. Roberto Freire, 123');
});

test('enderecoEvento preserva o fallback para eventos antigos', async () => {
  const { enderecoEvento } = await import(urlHelper);
  assert.strictEqual(enderecoEvento({ endereco: '', local_itinerario: 'Via Costeira', bairro: 'Mãe Luíza' }), 'Via Costeira');
  assert.strictEqual(enderecoEvento({ endereco: null, local_itinerario: '   ', bairro: 'Ponta Negra' }), 'Ponta Negra');
});

test('enderecoEvento devolve vazio quando nenhuma localização existe', async () => {
  const { enderecoEvento } = await import(urlHelper);
  assert.strictEqual(enderecoEvento({ endereco: null, local_itinerario: null, bairro: null }), '');
});
