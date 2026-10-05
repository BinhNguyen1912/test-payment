// Global enhancer: every <th> in the whole app whose text is a plain field name (snake_case / camelCase / known word)
// gets "(meaning)" appended on a new line. Works for ALL pages/tables, including ones rendered by other components.
import { fieldDoc, hasDoc } from './fieldDocs.js';

const IDENT = /^[A-Za-z][A-Za-z0-9_.]*$/;
const looksLikeField = (t) => IDENT.test(t) && (hasDoc(t) || /[_]|[a-z][A-Z]/.test(t));

function annotate(th) {
  if (th.dataset.fd === '1' || th.querySelector('.fd-d, .dv-d, *')) return; // only pure-text headers
  const name = (th.textContent || '').trim();
  if (!name || name.length > 60 || !looksLikeField(name)) return;
  th.dataset.fd = '1';
  th.textContent = '';
  const b = document.createElement('b');
  b.textContent = name;
  b.style.cssText = 'display:block';
  const d = document.createElement('span');
  d.className = 'fd-d';
  d.textContent = `(${fieldDoc(name)})`;
  th.append(b, d);
  th.classList.add('fd-h');
}

function scan(root) {
  if (!(root instanceof Element)) return;
  if (root.tagName === 'TH') annotate(root);
  root.querySelectorAll?.('th').forEach(annotate);
}

export function startFieldAnnotations() {
  const css = document.createElement('style');
  css.textContent = `th.fd-h { white-space: normal !important; min-width: 150px; max-width: 260px; vertical-align: top; text-transform: none !important; letter-spacing: 0 !important; }
th.fd-h > b { display: block; }
.fd-d { display: block; font-weight: 400 !important; color: #4b6b57 !important; font-size: 11px !important; line-height: 1.35; margin-top: 2px; text-transform: none !important; letter-spacing: 0 !important; }`;
  document.head.appendChild(css);
  let queued = false;
  const run = () => { queued = false; scan(document.body); };
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(run); } })
    .observe(document.body, { childList: true, subtree: true, characterData: true });
  run();
}
