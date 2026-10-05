/** Minúsculas e sem acentos: "Ação" -> "acao". Preserva o tamanho da string. */
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

const isBoundary = (text, i) => i === 0 || /[\s\-_/.:]/.test(text[i - 1]);

function isSubsequence(needle, haystack, start) {
  let pos = start;
  for (const ch of needle) {
    pos = haystack.indexOf(ch, pos);
    if (pos === -1) return false;
    pos++;
  }
  return true;
}

/**
 * Pontua `text` contra `query` como subsequência (as letras precisam aparecer
 * em ordem, não necessariamente juntas). Premia início de palavra, letras
 * consecutivas e prefixo. Retorna null quando não há correspondência.
 *
 * @returns {{ score: number, indices: number[] } | null}
 */
export function fuzzyMatch(query, text) {
  const q = normalize(query).replace(/\s+/g, '');
  const raw = String(text ?? '');
  // NFD pode mudar o tamanho; normalizamos caractere a caractere para manter índices
  const t = Array.from(raw, (ch) => normalize(ch)[0] ?? ch).join('');
  if (!q) return { score: 0, indices: [] };

  const indices = [];
  let score = 0;
  let from = 0;
  let prev = -2;

  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    let idx = t.indexOf(ch, from);
    if (idx === -1) return null;
    // Prefere uma ocorrência posterior em início de palavra, desde que o
    // restante da busca ainda caiba depois dela.
    if (!isBoundary(t, idx) && idx !== prev + 1) {
      for (let j = idx + 1; j < t.length; j++) {
        if (t[j] === ch && isBoundary(t, j) && isSubsequence(q.slice(qi + 1), t, j + 1)) { idx = j; break; }
      }
    }

    score += 1;
    if (idx === prev + 1) score += 5;
    if (isBoundary(t, idx)) score += 8;
    if (idx === 0) score += 4;
    score -= Math.min(idx - from, 10) * 0.3;

    indices.push(idx);
    prev = idx;
    from = idx + 1;
  }

  // Textos menores com o mesmo match são mais relevantes
  score -= (t.length - q.length) * 0.05;
  return { score, indices };
}

/**
 * Filtra e ordena itens. `keys` são os campos pesquisados; o primeiro é o
 * principal (os índices de destaque se referem a ele).
 */
export function search(query, items, { keys = ['title', 'keywords'], limit = 50 } = {}) {
  if (!normalize(query).trim()) return items.slice(0, limit).map((item) => ({ item, score: 0, indices: [] }));

  const results = [];
  for (const item of items) {
    let best = null;
    keys.forEach((key, k) => {
      const value = Array.isArray(item[key]) ? item[key].join(' ') : item[key];
      const match = fuzzyMatch(query, value);
      if (!match) return;
      const weighted = { score: match.score - k * 2, indices: k === 0 ? match.indices : [] };
      if (!best || weighted.score > best.score) best = weighted;
    });
    if (best) results.push({ item, ...best });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
