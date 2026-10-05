import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, fuzzyMatch, search } from '../src/fuzzy.js';

test('normalize remove acentos e mantém o tamanho', () => {
  assert.equal(normalize('Emitir Cobrança'), 'emitir cobranca');
  assert.equal(normalize('Relatórios').length, 'Relatórios'.length);
});

test('fuzzyMatch encontra subsequências e devolve índices', () => {
  assert.deepEqual(fuzzyMatch('pip', 'Pipeline').indices, [0, 1, 2]);
  assert.equal(fuzzyMatch('xyz', 'Pipeline'), null);
  assert.deepEqual(fuzzyMatch('', 'qualquer'), { score: 0, indices: [] });
});

test('fuzzyMatch ignora acentos na busca e no texto', () => {
  assert.ok(fuzzyMatch('cobranca', 'Emitir cobrança'));
  assert.ok(fuzzyMatch('relatórios', 'Relatorios'));
});

test('prefere início de palavra sem perder correspondências', () => {
  // "nl" deve casar com N(ovo) L(ead), não com o "n" e o "l" do meio
  assert.deepEqual(fuzzyMatch('nl', 'Novo lead').indices, [0, 5]);
  // pular para o início de palavra não pode impedir o resto da busca
  assert.deepEqual(fuzzyMatch('ab', 'xab-a').indices, [1, 2]);
});

test('search ordena por relevância', () => {
  const items = [
    { id: 1, title: 'Configurações de notificação' },
    { id: 2, title: 'Novo lead' },
    { id: 3, title: 'Nota fiscal' },
  ];
  const ids = search('nl', items).map((r) => r.item.id);
  assert.equal(ids[0], 2);
});

test('search consulta keywords, mas destaca só o título', () => {
  const items = [{ id: 'billing', title: 'Financeiro', keywords: ['boleto', 'pix'] }];
  const [hit] = search('pix', items);
  assert.equal(hit.item.id, 'billing');
  assert.deepEqual(hit.indices, []);
  assert.deepEqual(search('zzz', items), []);
});

test('search com query vazia devolve tudo respeitando o limite', () => {
  const items = Array.from({ length: 80 }, (_, i) => ({ title: `Item ${i}` }));
  assert.equal(search('', items).length, 50);
  assert.equal(search('  ', items, { limit: 10 }).length, 10);
});
