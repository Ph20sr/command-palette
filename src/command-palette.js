import { search } from './fuzzy.js';

const RECENT_KEY = 'command-palette:recent';
const MAX_RECENT = 5;

const STYLE = `
  :host {
    --cp-bg: #ffffff;
    --cp-fg: #18181b;
    --cp-muted: #71717a;
    --cp-border: #e4e4e7;
    --cp-active: #f4f4f5;
    --cp-accent: #4f46e5;
    --cp-overlay: rgb(9 9 11 / 0.45);
    --cp-radius: 14px;
    --cp-font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    position: fixed; inset: 0; z-index: 2147483000;
    display: none; font-family: var(--cp-font);
  }
  @media (prefers-color-scheme: dark) {
    :host {
      --cp-bg: #18181b; --cp-fg: #fafafa; --cp-muted: #a1a1aa;
      --cp-border: #27272a; --cp-active: #27272a; --cp-accent: #818cf8;
    }
  }
  :host([open]) { display: block; }
  .overlay { position: absolute; inset: 0; background: var(--cp-overlay); animation: fade .12s ease-out; }
  .panel {
    position: relative; margin: min(12vh, 120px) auto 0; width: min(640px, calc(100vw - 32px));
    background: var(--cp-bg); color: var(--cp-fg); border: 1px solid var(--cp-border);
    border-radius: var(--cp-radius); box-shadow: 0 24px 64px rgb(0 0 0 / .25);
    overflow: hidden; animation: pop .14s ease-out;
  }
  input {
    width: 100%; box-sizing: border-box; border: 0; outline: 0; background: transparent;
    color: inherit; font: inherit; font-size: 16px; padding: 18px 20px;
    border-bottom: 1px solid var(--cp-border);
  }
  input::placeholder { color: var(--cp-muted); }
  ul { list-style: none; margin: 0; padding: 6px; max-height: min(420px, 60vh); overflow-y: auto; }
  .section { padding: 10px 12px 4px; font-size: 12px; color: var(--cp-muted); font-weight: 600; }
  .item {
    display: flex; align-items: center; gap: 12px; padding: 10px 12px;
    border-radius: 8px; cursor: pointer; font-size: 14px;
  }
  .item[aria-selected="true"] { background: var(--cp-active); }
  .item .icon { width: 18px; text-align: center; flex: none; }
  .item .title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .item .subtitle { color: var(--cp-muted); font-size: 12px; margin-left: 6px; }
  mark { background: none; color: var(--cp-accent); font-weight: 650; }
  kbd {
    font: 11px/1 ui-monospace, monospace; color: var(--cp-muted); padding: 4px 6px;
    border: 1px solid var(--cp-border); border-radius: 5px;
  }
  .empty { padding: 28px; text-align: center; color: var(--cp-muted); font-size: 14px; }
  footer {
    display: flex; gap: 14px; padding: 10px 14px; border-top: 1px solid var(--cp-border);
    font-size: 12px; color: var(--cp-muted);
  }
  @keyframes fade { from { opacity: 0 } }
  @keyframes pop { from { opacity: 0; transform: scale(.98) translateY(-4px) } }
  @media (prefers-reduced-motion: reduce) { .overlay, .panel { animation: none } }
`;

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function highlight(text, indices) {
  if (!indices.length) return escapeHtml(text);
  const set = new Set(indices);
  return Array.from(text, (ch, i) => (set.has(i) ? `<mark>${escapeHtml(ch)}</mark>` : escapeHtml(ch))).join('');
}

function readRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) ?? []; } catch { return []; }
}

function writeRecent(ids) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(ids)); } catch { /* storage indisponível */ }
}

/**
 * <command-palette> — paleta de comandos acessível, aberta com Ctrl/⌘+K.
 *
 * Atributos: `placeholder`, `hotkey` (padrão "k"), `open`.
 * Propriedade: `commands = [{ id, title, subtitle?, section?, keywords?, icon?, shortcut?, href?, run? }]`.
 * Eventos: `command` (detail = comando), `open`, `close`.
 */
export class CommandPalette extends HTMLElement {
  #commands = [];
  #results = [];
  #active = 0;
  #returnFocus = null;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>${STYLE}</style>
      <div class="overlay" part="overlay"></div>
      <div class="panel" part="panel" role="dialog" aria-modal="true" aria-label="Paleta de comandos">
        <input part="input" type="text" role="combobox" aria-expanded="true" aria-controls="list"
               aria-autocomplete="list" autocomplete="off" spellcheck="false" />
        <ul id="list" role="listbox" part="list"></ul>
        <footer part="footer"><span><kbd>↑</kbd> <kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> executar</span><span><kbd>Esc</kbd> fechar</span></footer>
      </div>`;
    this.input = root.querySelector('input');
    this.list = root.querySelector('ul');

    root.querySelector('.overlay').addEventListener('click', () => this.close());
    this.input.addEventListener('input', () => this.#render());
    this.input.addEventListener('keydown', (e) => this.#onKeydown(e));
    this.list.addEventListener('mousemove', (e) => {
      const li = e.target.closest('.item');
      if (li && Number(li.dataset.index) !== this.#active) this.#setActive(Number(li.dataset.index));
    });
    this.list.addEventListener('click', (e) => {
      const li = e.target.closest('.item');
      if (li) this.#execute(Number(li.dataset.index));
    });
    this.onGlobalKeydown = this.onGlobalKeydown.bind(this);
  }

  connectedCallback() {
    this.input.placeholder = this.getAttribute('placeholder') ?? 'Buscar comandos, páginas e ações…';
    document.addEventListener('keydown', this.onGlobalKeydown);
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this.onGlobalKeydown);
  }

  get commands() { return this.#commands; }
  set commands(value) {
    this.#commands = Array.isArray(value) ? value : [];
    if (this.isOpen) this.#render();
  }

  get isOpen() { return this.hasAttribute('open'); }

  open(query = '') {
    if (this.isOpen) return;
    this.#returnFocus = document.activeElement;
    this.setAttribute('open', '');
    this.input.value = query;
    this.#render();
    requestAnimationFrame(() => this.input.focus());
    this.dispatchEvent(new CustomEvent('open'));
  }

  close() {
    if (!this.isOpen) return;
    this.removeAttribute('open');
    this.#returnFocus?.focus?.();
    this.dispatchEvent(new CustomEvent('close'));
  }

  toggle() { this.isOpen ? this.close() : this.open(); }

  onGlobalKeydown(e) {
    const hotkey = (this.getAttribute('hotkey') ?? 'k').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === hotkey) {
      e.preventDefault();
      this.toggle();
    }
  }

  #onKeydown(e) {
    const count = this.#results.length;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); if (count) this.#setActive((this.#active + 1) % count); break;
      case 'ArrowUp': e.preventDefault(); if (count) this.#setActive((this.#active - 1 + count) % count); break;
      case 'Home': e.preventDefault(); if (count) this.#setActive(0); break;
      case 'End': e.preventDefault(); if (count) this.#setActive(count - 1); break;
      case 'Enter': e.preventDefault(); this.#execute(this.#active); break;
      case 'Escape': e.preventDefault(); this.close(); break;
      case 'Tab': e.preventDefault(); break; // mantém o foco dentro do diálogo
      default:
    }
  }

  #orderedForEmptyQuery() {
    const recent = readRecent();
    const byId = new Map(this.#commands.map((c) => [c.id, c]));
    const recentCmds = recent.map((id) => byId.get(id)).filter(Boolean)
      .map((c) => ({ ...c, section: 'Recentes' }));
    const rest = this.#commands.filter((c) => !recent.includes(c.id));
    return [...recentCmds, ...rest].map((item) => ({ item, indices: [] }));
  }

  #render() {
    const query = this.input.value;
    this.#results = query.trim()
      ? search(query, this.#commands, { keys: ['title', 'keywords', 'section'] })
      : this.#orderedForEmptyQuery();
    this.#active = 0;

    if (!this.#results.length) {
      this.list.innerHTML = `<li class="empty" role="presentation">Nada encontrado para “${escapeHtml(query)}”</li>`;
      this.input.removeAttribute('aria-activedescendant');
      return;
    }

    // Agrupa por seção sem desfazer a ordem de relevância dentro de cada uma
    const groups = new Map();
    this.#results.forEach((r, index) => {
      const section = r.item.section ?? '';
      if (!groups.has(section)) groups.set(section, []);
      groups.get(section).push({ ...r, index });
    });
    this.#results = [...groups.values()].flat();

    let html = '';
    let i = 0;
    for (const [section, rows] of groups) {
      if (section) html += `<li class="section" role="presentation">${escapeHtml(section)}</li>`;
      for (const { item, indices } of rows) {
        html += `<li class="item" id="opt-${i}" role="option" data-index="${i}" aria-selected="false">
          ${item.icon ? `<span class="icon" aria-hidden="true">${escapeHtml(item.icon)}</span>` : ''}
          <span class="title">${highlight(item.title, indices)}${item.subtitle ? `<span class="subtitle">${escapeHtml(item.subtitle)}</span>` : ''}</span>
          ${item.shortcut ? `<kbd>${escapeHtml(item.shortcut)}</kbd>` : ''}
        </li>`;
        i++;
      }
    }
    this.list.innerHTML = html;
    this.#setActive(0);
  }

  #setActive(index) {
    this.list.querySelector(`#opt-${this.#active}`)?.setAttribute('aria-selected', 'false');
    this.#active = index;
    const el = this.list.querySelector(`#opt-${index}`);
    if (!el) return;
    el.setAttribute('aria-selected', 'true');
    el.scrollIntoView({ block: 'nearest' });
    this.input.setAttribute('aria-activedescendant', el.id);
  }

  #execute(index) {
    const result = this.#results[index];
    if (!result) return;
    const command = this.#commands.find((c) => c.id === result.item.id) ?? result.item;

    writeRecent([command.id, ...readRecent().filter((id) => id !== command.id)].slice(0, MAX_RECENT));

    const event = new CustomEvent('command', { detail: command, cancelable: true });
    this.dispatchEvent(event);
    this.close();
    if (event.defaultPrevented) return;
    if (typeof command.run === 'function') command.run(command);
    else if (command.href) window.location.assign(command.href);
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('command-palette')) {
  customElements.define('command-palette', CommandPalette);
}
