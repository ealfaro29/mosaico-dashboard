/** Public, keyless data sources. Cached values retain their original fetch time. */
export const DEFAULT_LOCATION = Object.freeze({
  name: 'San José',
  country: 'Costa Rica',
  latitude: 9.93,
  longitude: -84.08,
});

const CACHE_PREFIX = 'mosaico:data:v1:';
const TIMEOUT_MS = 12_000;

function readCache(key) {
  try {
    const result = JSON.parse(localStorage.getItem(CACHE_PREFIX + key));
    return result && result.data != null && Number.isFinite(Date.parse(result.fetchedAt))
      ? result
      : null;
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
  } catch {
    // A blocked or full storage area must not prevent live data from loading.
  }
}

async function requestJSON(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    if (body.error) throw new Error('Respuesta no válida');
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function networkOrCache(key, loader, message) {
  try {
    const data = await loader();
    const result = { data, fetchedAt: new Date().toISOString() };
    writeCache(key, result);
    return { ...result, cached: false };
  } catch {
    const previous = readCache(key);
    if (previous) return { ...previous, cached: true };
    throw new Error(message);
  }
}

const finite = value => typeof value === 'number' && Number.isFinite(value);

export async function fetchWeather(location = DEFAULT_LOCATION) {
  const { latitude, longitude } = location;
  if (!finite(latitude) || !finite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new Error('Seleccioná una ubicación válida para consultar el clima.');
  }
  const key = `weather:${latitude.toFixed(4)}:${longitude.toFixed(4)}`;
  return networkOrCache(key, async () => {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day',
      daily: 'temperature_2m_max,temperature_2m_min,weather_code',
      timezone: 'auto',
      forecast_days: '5',
    });
    const response = await requestJSON(`https://api.open-meteo.com/v1/forecast?${params}`);
    const current = response.current;
    const daily = response.daily;
    if (!current || !daily || !Array.isArray(daily.time)
      || ![current.temperature_2m, current.apparent_temperature, current.relative_humidity_2m,
        current.wind_speed_10m, current.weather_code, daily.temperature_2m_max?.[0],
        daily.temperature_2m_min?.[0]].every(finite)) {
      throw new Error('Datos de clima incompletos');
    }
    const forecast = daily.time.map((date, index) => ({
      date,
      high: daily.temperature_2m_max[index],
      low: daily.temperature_2m_min[index],
      code: daily.weather_code?.[index],
    })).filter(day => [day.high, day.low, day.code].every(finite));
    return {
      temperature: current.temperature_2m,
      feelsLike: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      wind: current.wind_speed_10m,
      code: current.weather_code,
      isDay: current.is_day === 1,
      high: daily.temperature_2m_max[0],
      low: daily.temperature_2m_min[0],
      location: { ...location },
      forecast,
    };
  }, 'No pudimos consultar el clima. Revisá tu conexión e intentá de nuevo.');
}

export async function fetchExchange() {
  return networkOrCache('exchange:usd-crc', async () => {
    const result = await requestJSON('https://api.hacienda.go.cr/indicadores/tc/dolar');
    if (!finite(result.compra?.valor) || !finite(result.venta?.valor)
      || result.compra.valor <= 0 || result.venta.valor <= 0
      || !/^\d{4}-\d{2}-\d{2}$/.test(result.compra.fecha)
      || !/^\d{4}-\d{2}-\d{2}$/.test(result.venta.fecha)) {
      throw new Error('Tipo de cambio no válido');
    }
    return {
      buy: result.compra.valor,
      sell: result.venta.valor,
      buyDate: result.compra.fecha,
      sellDate: result.venta.fecha,
      source: 'Ministerio de Hacienda',
    };
  }, 'El tipo de cambio no está disponible. Intentá de nuevo en unos minutos.');
}

function safeArticleURL(value, id) {
  try {
    const url = new URL(value || `https://news.ycombinator.com/item?id=${encodeURIComponent(id)}`);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export async function fetchNews(topic = 'tech') {
  const selected = topic === 'ai' ? 'ai' : 'tech';
  return networkOrCache(`news:${selected}`, async () => {
    const url = selected === 'ai'
      ? 'https://hn.algolia.com/api/v1/search_by_date?query=AI&tags=story&numericFilters=points%3E10&hitsPerPage=12'
      : 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=12';
    const result = await requestJSON(url);
    if (!Array.isArray(result.hits)) throw new Error('Noticias no válidas');
    const articles = result.hits.map(hit => ({
      id: String(hit.objectID || ''),
      title: typeof hit.title === 'string' ? hit.title.trim() : '',
      url: safeArticleURL(hit.url, hit.objectID),
      points: finite(hit.points) ? hit.points : 0,
      date: hit.created_at,
      source: 'Hacker News',
    })).filter(article => article.id && article.title && article.url && Number.isFinite(Date.parse(article.date)));
    if (!articles.length) throw new Error('No hay noticias disponibles');
    return articles;
  }, 'No pudimos cargar las noticias. Revisá tu conexión o intentá más tarde.');
}

export async function searchCities(query) {
  const term = String(query || '').trim().slice(0, 100);
  if (term.length < 2) return [];
  try {
    const params = new URLSearchParams({ name: term, count: '6', language: 'es', format: 'json' });
    const result = await requestJSON(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
    return (result.results || []).filter(city => finite(city.latitude) && finite(city.longitude))
      .map(city => ({
        name: city.name,
        country: city.country || city.country_code || '',
        latitude: city.latitude,
        longitude: city.longitude,
        admin1: city.admin1 || '',
      }));
  } catch {
    throw new Error('No pudimos buscar esa ciudad. Intentá de nuevo.');
  }
}

export function weatherDescription(wmo) {
  const code = Number(wmo);
  if (code === 0) return 'Despejado';
  if (code === 1) return 'Mayormente despejado';
  if (code === 2) return 'Parcialmente nublado';
  if (code === 3) return 'Nublado';
  if ([45, 48].includes(code)) return 'Neblina';
  if ([51, 53, 55].includes(code)) return 'Llovizna';
  if ([56, 57].includes(code)) return 'Llovizna helada';
  if ([61, 63, 65].includes(code)) return 'Lluvia';
  if ([66, 67].includes(code)) return 'Lluvia helada';
  if ([71, 73, 75, 77].includes(code)) return 'Nieve';
  if ([80, 81, 82].includes(code)) return 'Aguaceros';
  if ([85, 86].includes(code)) return 'Chubascos de nieve';
  if (code === 95) return 'Tormenta eléctrica';
  if ([96, 99].includes(code)) return 'Tormenta con granizo';
  return 'Condiciones variables';
}
