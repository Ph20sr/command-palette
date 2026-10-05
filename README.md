# command-palette

[![CI](https://github.com/Ph20sr/command-palette/actions/workflows/ci.yml/badge.svg)](https://github.com/Ph20sr/command-palette/actions/workflows/ci.yml)
![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![license](https://img.shields.io/badge/license-MIT-blue)

Paleta de comandos **Ctrl/⌘ + K** como Web Component. Funciona em qualquer stack (React, Vue, Next.js, PHP, HTML puro), sem dependências e em ~8 KB.

- **Busca fuzzy em português**: `cobranca` encontra "Emitir cobrança", `nl` encontra "**N**ovo **l**ead"
- **Acessível**: `role="dialog"`, combobox e listbox com `aria-activedescendant`; o foco fica preso no diálogo e volta para onde estava ao fechar
- **Teclado completo**: ↑ ↓ Home End Enter Esc
- **Recentes**: os últimos comandos usados aparecem primeiro, salvos no `localStorage` com fallback silencioso
- **Tema** claro e escuro automático, customizável por CSS custom properties e `::part()`

## Uso

```html
<command-palette></command-palette>

<script type="module">
  import 'https://cdn.jsdelivr.net/gh/Ph20sr/command-palette/src/command-palette.js';

  document.querySelector('command-palette').commands = [
    { id: 'lead:new', section: 'Ações', title: 'Novo lead', icon: '＋', shortcut: 'N',
      keywords: ['criar', 'contato'], run: () => openLeadForm() },
    { id: 'nav:billing', section: 'Navegação', title: 'Financeiro',
      subtitle: 'cobranças e assinaturas', href: '/financeiro' },
  ];
</script>
```

### Comandos

| campo | descrição |
| --- | --- |
| `id` | obrigatório e único (usado no histórico de recentes) |
| `title` | texto principal (é onde a busca destaca as letras) |
| `subtitle`, `icon`, `shortcut` | opcionais, só para exibição |
| `section` | agrupa os resultados |
| `keywords` | termos extras pesquisáveis (sinônimos) |
| `run(cmd)` ou `href` | o que fazer ao executar |

### API

```js
const palette = document.querySelector('command-palette');
palette.open('texto inicial');
palette.close();
palette.toggle();

palette.addEventListener('command', (e) => {
  analytics.track('command', e.detail.id);
  // e.preventDefault() cancela o run/href padrão
});
```

Atributos: `placeholder` e `hotkey` (padrão `k`).

### Tema

```css
command-palette {
  --cp-accent: #16a34a;
  --cp-radius: 8px;
  --cp-font: 'Inter', sans-serif;
}
command-palette::part(panel) { border-width: 2px; }
```

## Só a busca

O algoritmo de busca é exportado separadamente e roda no Node e no navegador:

```js
import { search } from '@ph20sr/command-palette/fuzzy';

search('nl', [{ title: 'Novo lead' }, { title: 'Nota fiscal' }]);
// [{ item: { title: 'Novo lead' }, score: 20.45, indices: [0, 5] }, ...]
```

## Desenvolvimento

```bash
npm test       # testes da busca (node:test)
npm run demo   # demo em http://localhost:5173
```

## Licença

MIT
