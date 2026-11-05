/** Small fallbacks for JSON state; these helpers are not security identifiers. */
let sequence = 0;
export function uid() {
  try { if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID(); } catch {}
  return `m-${Date.now().toString(36)}-${(++sequence).toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function clone(value) {
  // Widget defaults are JSON data, just like the persisted/exported space.
  return JSON.parse(JSON.stringify(value));
}

const options = {
  time: {hour:'2-digit',minute:'2-digit',hour12:false},
  day: {day:'numeric',month:'short'},
  date: {weekday:'long',day:'numeric',month:'long'},
  footer: {weekday:'short',day:'numeric',month:'short',year:'numeric'},
};
const formatters = {};
for (const [key, value] of Object.entries(options)) {
  try { formatters[key] = new Intl.DateTimeFormat('es-CR', {timeZone:'America/Costa_Rica', ...value}); } catch {}
}
const days = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
export const costaRicaDate = date => new Date(date.getTime() - 6 * 60 * 60 * 1000);
export const pad = value => String(value).padStart(2, '0');
export function formatDate(date, mode) {
  try { if (formatters[mode]) return formatters[mode].format(date); } catch {}
  const local = costaRicaDate(date);
  const day = local.getUTCDate(), month = months[local.getUTCMonth()], weekday = days[local.getUTCDay()];
  if (mode === 'time') return `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
  if (mode === 'day') return `${day} ${month.slice(0,3)}`;
  if (mode === 'footer') return `${weekday.slice(0,3)}, ${day} ${month.slice(0,3)} ${local.getUTCFullYear()}`;
  return `${weekday}, ${day} de ${month}`;
}
