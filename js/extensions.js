/**
 * Widgets propios de Mosaico. Para añadir uno, registra una definición con
 * render({ widget, container, update, icon }). update mezcla datos en config;
 * devuelve una función de limpieza si usas timers o listeners externos.
 */
const registry = new Map();

export function registerWidget(definition) {
  if (!definition || !/^[a-z][a-z0-9-]*$/.test(definition.type || '') ||
      typeof definition.name !== 'string' || typeof definition.render !== 'function') {
    throw new TypeError('El widget necesita type, name y una función render.');
  }
  if (registry.has(definition.type)) throw new Error(`El widget ${definition.type} ya está registrado.`);
  registry.set(definition.type, Object.freeze({ accent: 'sage', defaults: {}, ...definition }));
  return definition.type;
}

export const getWidget = type => registry.get(type);
export const listWidgets = () => Array.from(registry.values());

const el = (tag, className, content) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
};
const button = (label, className = 'ext-button') => {
  const node = el('button', className, label);
  node.type = 'button';
  return node;
};
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const safeUrl = value => {
  try {
    const parsed = new URL(value.trim());
    return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : null;
  } catch { return null; }
};

registerWidget({
  type: 'tasks', name: 'Pendientes', description: 'Una lista breve para lo que sigue.',
  icon: 'check', accent: 'sage', defaults: { items: [] },
  render({ widget, container, update }) {
    container.classList.add('ext-tasks');
    let items = (Array.isArray(widget.config.items) ? widget.config.items : []).filter(x => x && typeof x.text === 'string');
    const list = el('ul', 'task-list');
    const summary = el('p', 'ext-caption');
    const paint = () => {
      list.replaceChildren();
      if (!items.length) list.append(el('li', 'ext-empty', 'Una cosa a la vez. ¿Qué quieres hacer hoy?'));
      items.forEach(item => {
        const row = el('li', `task-item${item.done ? ' is-done' : ''}`);
        const label = el('label', 'task-label');
        const check = el('input');
        check.type = 'checkbox';
        check.checked = Boolean(item.done);
        check.addEventListener('change', () => {
          items = items.map(x => x.id === item.id ? { ...x, done: check.checked } : x);
          update({ items });
          paint();
        });
        label.append(check, el('span', '', item.text));
        const remove = button('×', 'task-remove');
        remove.setAttribute('aria-label', `Eliminar ${item.text}`);
        remove.addEventListener('click', () => {
          items = items.filter(x => x.id !== item.id);
          update({ items });
          paint();
        });
        row.append(label, remove);
        list.append(row);
      });
      summary.textContent = items.length ? `${items.filter(x => x.done).length} de ${items.length} completados` : 'Tu lista se guarda en este navegador';
    };
    const form = el('form', 'ext-inline-form');
    const input = el('input', 'ext-input');
    input.placeholder = 'Agregar un pendiente…';
    input.setAttribute('aria-label', 'Nuevo pendiente');
    input.maxLength = 160;
    input.required = true;
    const add = button('+', 'ext-add');
    add.type = 'submit';
    add.setAttribute('aria-label', 'Agregar pendiente');
    form.append(input, add);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      items = [...items, { id: uid(), text, done: false }];
      input.value = '';
      update({ items });
      paint();
    });
    container.append(list, form, summary);
    paint();
  }
});

registerWidget({
  type: 'focus', name: 'Momento de foco', description: 'Dale a una sola cosa toda tu atención.',
  icon: 'focus', accent: 'lavender', defaults: { minutes: 25 },
  render({ widget, container, update }) {
    container.classList.add('ext-focus');
    const minutes = Math.max(1, Math.min(180, Number(widget.config.minutes) || 25));
    let remaining = Number.isFinite(widget.config.remainingSeconds) ? Math.max(0, widget.config.remainingSeconds) : minutes * 60;
    let startedAt = Number(widget.config.startedAt) || null;
    let disposed = false;
    const dial = el('div', 'focus-time');
    dial.setAttribute('role', 'timer');
    dial.setAttribute('aria-label', 'Tiempo restante');
    const caption = el('p', 'ext-caption');
    const actions = el('div', 'focus-actions');
    const toggle = button('Iniciar', 'ext-button focus-toggle');
    const reset = button('Reiniciar', 'ext-button is-subtle');
    const secondsLeft = () => Math.max(0, remaining - (startedAt ? (Date.now() - startedAt) / 1000 : 0));
    const persist = () => update({ minutes, remainingSeconds: remaining, startedAt });
    const paint = () => {
      if (disposed) return;
      const value = Math.ceil(secondsLeft());
      dial.textContent = `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
      toggle.textContent = startedAt ? 'Pausar' : value === 0 ? 'Otra sesión' : value === minutes * 60 ? 'Iniciar' : 'Continuar';
      caption.textContent = value === 0 ? 'Sesión completa. Tómate un respiro.' : startedAt ? 'Este momento es para concentrarte.' : `${minutes} minutos, una sola cosa.`;
      if (value === 0 && startedAt) {
        remaining = 0;
        startedAt = null;
        persist();
      }
    };
    toggle.addEventListener('click', () => {
      if (startedAt) { remaining = secondsLeft(); startedAt = null; }
      else { if (!remaining) remaining = minutes * 60; startedAt = Date.now(); }
      persist();
      paint();
    });
    reset.addEventListener('click', () => {
      remaining = minutes * 60;
      startedAt = null;
      persist();
      paint();
    });
    actions.append(toggle, reset);
    container.append(dial, caption, actions);
    const timer = setInterval(paint, 250);
    paint();
    return () => { disposed = true; clearInterval(timer); };
  }
});

registerWidget({
  type: 'links', name: 'Tus enlaces', description: 'Accesos directos a tus lugares favoritos.',
  icon: 'link', accent: 'sand', defaults: { items: [] },
  render({ widget, container, update }) {
    container.classList.add('ext-links');
    let items = (Array.isArray(widget.config.items) ? widget.config.items : []).filter(x => x && typeof x.label === 'string' && typeof x.url === 'string' && safeUrl(x.url));
    const list = el('div', 'link-list');
    const paint = () => {
      list.replaceChildren();
      if (!items.length) list.append(el('p', 'ext-empty', 'Ten a mano los sitios que más usas.'));
      items.forEach(item => {
        const row = el('div', 'link-item');
        const link = el('a', 'quick-link', item.label);
        link.href = safeUrl(item.url);
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.title = item.url;
        const remove = button('×', 'task-remove');
        remove.setAttribute('aria-label', `Eliminar enlace ${item.label}`);
        remove.addEventListener('click', () => {
          items = items.filter(x => x !== item);
          update({ items });
          paint();
        });
        row.append(link, remove);
        list.append(row);
      });
    };
    const form = el('form', 'link-form');
    const label = el('input', 'ext-input');
    label.placeholder = 'Nombre del enlace';
    label.setAttribute('aria-label', 'Nombre del enlace');
    label.required = true;
    label.maxLength = 60;
    const url = el('input', 'ext-input');
    url.type = 'url';
    url.placeholder = 'https://';
    url.setAttribute('aria-label', 'Dirección del enlace');
    url.required = true;
    const add = button('Agregar enlace', 'ext-button');
    add.type = 'submit';
    form.append(label, url, add);
    url.addEventListener('input', () => url.setCustomValidity(''));
    form.addEventListener('submit', event => {
      event.preventDefault();
      const href = safeUrl(url.value);
      if (!href) { url.setCustomValidity('Usa una dirección http:// o https:// válida.'); url.reportValidity(); return; }
      if (!label.value.trim()) return;
      items = [...items, { label: label.value.trim(), url: href }];
      form.reset();
      update({ items });
      paint();
    });
    container.append(list, form);
    paint();
  }
});

registerWidget({
  type: 'metric', name: 'Indicador personalizado', description: 'Un número, una meta o algo que quieras seguir.',
  icon: 'chart', accent: 'peach', defaults: { value: '—', label: 'Tu indicador', unit: '', trend: '' },
  render({ widget, container }) {
    container.classList.add('ext-metric');
    const value = el('div', 'metric-value', String(widget.config.value ?? '—'));
    const unit = el('span', 'metric-unit', String(widget.config.unit || ''));
    value.append(unit);
    const label = el('p', 'metric-label', String(widget.config.label || 'Tu indicador'));
    container.append(value, label);
    if (widget.config.trend) container.append(el('span', 'metric-trend', String(widget.config.trend)));
  }
});
