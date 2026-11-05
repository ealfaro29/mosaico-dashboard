import { icon } from './icons.js';
import { DEFAULT_LOCATION, fetchWeather, fetchExchange, fetchNews, searchCities, weatherDescription } from './data.js';
import { getWidget, listWidgets } from './extensions.js';
import { mountWeatherScene } from './weather-scene.js';

const STORAGE_KEY = 'mosaico:space:v1';
const TZ = 'America/Costa_Rica';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => crypto.randomUUID();
const clone = value => structuredClone(value);
const money = value => Number(value).toLocaleString('es-CR', {minimumFractionDigits:2, maximumFractionDigits:2});
const builtins = [
  {type:'weather', name:'Clima', description:'Un vistazo al cielo, estés donde estés.', icon:'sun', accent:'sage', category:'daily', defaults:{location:DEFAULT_LOCATION}},
  {type:'exchange', name:'Tipo de cambio', description:'Dólares y colones, con la referencia del día.', icon:'exchange', accent:'peach', category:'daily', defaults:{amount:1,rate:'sell'}},
  {type:'news', name:'Noticias', description:'Lo que se mueve en el mundo de la tecnología.', icon:'news', accent:'sage', category:'daily', defaults:{topic:'tech'}},
  {type:'clock', name:'Reloj', description:'Un pequeño recordatorio del aquí y ahora.', icon:'clock', accent:'sage', category:'daily', defaults:{}},
  {type:'note', name:'Notas rápidas', description:'Una idea, una frase o algo por recordar.', icon:'note', accent:'sand', category:'personal', defaults:{text:''}}
];
const definitions = () => [...builtins, ...listWidgets().map(x => ({category:'personal',...x}))];
const definition = type => definitions().find(x => x.type === type);
const defaultSpace = () => ({version:1,widgets:['weather','exchange','clock','news','note'].map(type=>({id:uid(),type,title:'',config:clone(definition(type).defaults)}))});
function validateSpace(raw) {
  if (!raw || raw.version !== 1 || !Array.isArray(raw.widgets) || raw.widgets.length > 40) throw new Error('Este archivo no es un espacio válido de Mosaico.');
  const seen = new Set();
  return {version:1,widgets:raw.widgets.map(w=>{
    if (!w || !definition(w.type) || !w.config || typeof w.config !== 'object' || Array.isArray(w.config)) throw new Error('El archivo contiene un widget que no está disponible.');
    const id = typeof w.id === 'string' && !seen.has(w.id) ? w.id : uid(); seen.add(id);
    const config={...clone(definition(w.type).defaults),...w.config};
    if(w.type==='focus'){
      const minutes=Number(config.minutes);config.minutes=Number.isFinite(minutes)?Math.max(1,Math.min(180,minutes)):25;
      const remaining=Number(config.remainingSeconds);config.remainingSeconds=Number.isFinite(remaining)?Math.max(0,Math.min(config.minutes*60,remaining)):config.minutes*60;
      const started=Number(config.startedAt);config.startedAt=Number.isFinite(started)&&started>0&&started<=Date.now()?started:null;
    }
    if(w.type==='exchange'){const amount=Number(config.amount);config.amount=Number.isFinite(amount)?Math.max(0,Math.min(1e9,amount)):1;config.rate=config.rate==='buy'?'buy':'sell';}
    return {id,type:w.type,title:String(w.title || '').slice(0,60),accent:['sage','peach','lavender','sand'].includes(w.accent)?w.accent:undefined,config};
  })};
}
let storageAvailable = true;
let state;
try { const raw = localStorage.getItem(STORAGE_KEY); state = raw ? validateSpace(JSON.parse(raw)) : defaultSpace(); } catch { state = defaultSpace(); }
let editing = false, cleanups = [], draggedId = null, toastTimer, catalogCategory = 'all', lastRefresh = Date.now();
const newsRequests = new WeakMap();
function toast(message) { const node=$('#toast');node.textContent=message;node.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('visible'),3200); }
function save() {
  try { localStorage.setItem(STORAGE_KEY,JSON.stringify(state));storageAvailable=true;$('#save-status').textContent='Guardado en este navegador'; }
  catch { storageAvailable=false;$('#save-status').textContent='Sin guardar · almacenamiento no disponible'; }
}
function updateConfig(widget, patch) { widget.config={...widget.config,...patch};save(); }
function showDialog(id) { const d=$(id); if(!d.open)d.showModal(); }
function sourceLine(result, name, url) {
  const stamp=new Intl.DateTimeFormat('es-CR',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:TZ}).format(new Date(result.fetchedAt));
  const day=new Intl.DateTimeFormat('es-CR',{day:'numeric',month:'short',timeZone:TZ}).format(new Date(result.fetchedAt));
  return `<p class="source-line"><a href="${url}" target="_blank" rel="noopener noreferrer">${name}</a><span class="tiny-dot"></span><span>${result.cached?'Caché · '+esc(day)+' · ':''}${stamp}</span></p>`;
}
function loading(container) { container.innerHTML='<div class="skeleton big"></div><div class="skeleton"></div><div class="skeleton short"></div>'; }
function errorState(container,error,retry) { container.replaceChildren();const wrapper=document.createElement('div');wrapper.className='error-state';const p=document.createElement('p');p.textContent=error.message || 'No se pudo actualizar este widget.';const b=document.createElement('button');b.textContent='Reintentar';b.onclick=retry;wrapper.append(p,b);container.append(wrapper); }
function cardTitle(w) {
  if (w.title) return w.title;
  if (w.type==='weather') return w.config.location?.name || 'San José';
  return ({news:'En el radar',clock:'Aquí y ahora',note:'Notas rápidas'})[w.type] || definition(w.type).name;
}
function render() {
  cleanups.forEach(fn=>fn());cleanups=[];
  const grid=$('#widget-grid');grid.replaceChildren();
  $('#app').classList.toggle('editing',editing);
  $('#edit-button').classList.toggle('selected',editing);
  $('#edit-button').innerHTML=icon(editing?'check':'sliders')+`<span>${editing?'Listo':'Personalizar'}</span>`;
  state.widgets.forEach((w,index)=>{
    const def=definition(w.type);if(!def)return;
    const card=document.createElement('article');card.className=`widget ${w.type}${getWidget(w.type)?' extension accent-'+(w.accent||def.accent):''}`;card.dataset.id=w.id;card.setAttribute('aria-label',cardTitle(w));card.draggable=editing;
    card.innerHTML=`<div class="widget-header"><div class="widget-label">${icon(w.type==='weather'?'pin':def.icon)}<span class="widget-title">${esc(cardTitle(w))}</span></div><div class="card-actions">${w.type==='note'?'<span class="personal-tag">PERSONAL</span>':''}<div class="edit-controls"><button class="icon-button move-left" aria-label="Mover ${esc(cardTitle(w))} antes" ${index===0?'disabled':''}>${icon('left')}</button><button class="icon-button move-right" aria-label="Mover ${esc(cardTitle(w))} después" ${index===state.widgets.length-1?'disabled':''}>${icon('right')}</button><button class="icon-button remove-widget" aria-label="Quitar ${esc(cardTitle(w))}">${icon('trash')}</button></div><button class="icon-button widget-config" aria-label="Configurar ${esc(cardTitle(w))}">${icon('sliders')}</button></div></div><div class="widget-body"></div>`;
    grid.append(card);
    card.querySelector('.widget-config').onclick=()=>openConfig(w);
    card.querySelector('.remove-widget').onclick=()=>{state.widgets=state.widgets.filter(x=>x.id!==w.id);save();render();toast('Widget eliminado');};
    card.querySelector('.move-left').onclick=()=>moveWidget(w.id,-1);
    card.querySelector('.move-right').onclick=()=>moveWidget(w.id,1);
    card.addEventListener('dragstart',event=>{if(!editing)return event.preventDefault();draggedId=w.id;card.classList.add('dragging');event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',w.id);});
    card.addEventListener('dragover',event=>{if(editing&&draggedId&&draggedId!==w.id){event.preventDefault();card.classList.add('drag-over');}});
    card.addEventListener('dragleave',()=>card.classList.remove('drag-over'));
    card.addEventListener('dragend',()=>{draggedId=null;document.querySelectorAll('.dragging,.drag-over').forEach(x=>x.classList.remove('dragging','drag-over'));});
    card.addEventListener('drop',event=>{event.preventDefault();if(!editing||!draggedId||draggedId===w.id)return;const from=state.widgets.findIndex(x=>x.id===draggedId);const to=state.widgets.findIndex(x=>x.id===w.id);if(from<0||to<0)return;state.widgets.splice(to,0,state.widgets.splice(from,1)[0]);draggedId=null;save();render();});
    const body=card.querySelector('.widget-body');
    if(w.type==='weather')renderWeather(w,body);
    else if(w.type==='exchange')renderExchange(w,body);
    else if(w.type==='news')renderNews(w,body,card);
    else if(w.type==='clock')renderClock(w,body);
    else if(w.type==='note')renderNote(w,body);
    else {try { const cleanup=def.render({widget:w,container:body,update:patch=>updateConfig(w,patch),icon});if(typeof cleanup==='function')cleanups.push(cleanup); } catch(error) {errorState(body,new Error('Este widget no pudo abrirse. Revisa su configuración.'),()=>openConfig(w));console.error(error);} }
  });
  const add=document.createElement('button');add.className='add-tile';add.setAttribute('aria-label','Agregar un widget a mi espacio');add.innerHTML=`<div class="tile-art" aria-hidden="true"><span></span><span></span><span></span><span>${icon('plus')}</span></div><strong>Un espacio para tus ideas</strong><p>Hazlo tuyo con los widgets<br>que van contigo.</p><span class="add-small">${icon('plus')} Agregar widget</span>`;add.onclick=openCatalog;grid.append(add);
}
function moveWidget(id,direction) { const from=state.widgets.findIndex(x=>x.id===id);const to=from+direction;if(to<0||to>=state.widgets.length)return;[state.widgets[from],state.widgets[to]]=[state.widgets[to],state.widgets[from]];save();render();document.querySelector(`[data-id="${CSS.escape(id)}"] .move-${direction<0?'left':'right'}`)?.focus(); }
async function renderWeather(w,container) {
  loading(container);
  try {
    const result=await fetchWeather(w.config.location || DEFAULT_LOCATION);if(!container.isConnected)return;
    const d=result.data;
    container.innerHTML=`<div class="temperature">${Math.round(d.temperature)}<sup>°C</sup></div><p class="weather-description">${esc(weatherDescription(d.code))}</p><div class="weather-range">Máx. ${Math.round(d.high)}° <span>·</span> Mín. ${Math.round(d.low)}°</div><div class="weather-stats"><span>${icon('drop')}${Math.round(d.humidity)}% humedad</span><span>${icon('wind')}${Math.round(d.wind)} km/h</span></div>${sourceLine(result,'Open-Meteo','https://open-meteo.com/')}`;
    const card=container.closest('.weather');card.classList.add('has-weather');cleanups.push(mountWeatherScene(card,d));
  } catch(error) {if(container.isConnected)errorState(container,error,()=>renderWeather(w,container));}
}
async function renderExchange(w,container) {
  loading(container);
  try {
    const result=await fetchExchange();if(!container.isConnected)return;
    const d=result.data;let mode=w.config.rate==='buy'?'buy':'sell';
    container.innerHTML=`<div class="currency-pair"><span class="flag" aria-hidden="true">🇺🇸</span><span>USD</span><span class="currency-arrow">/</span><span class="flag" aria-hidden="true">🇨🇷</span><span>CRC</span></div><div class="exchange-rate"><span class="symbol">₡</span><span class="rate-value"></span></div><div class="exchange-meta"><span class="reference-badge">${icon('check')} Referencia Hacienda</span><select class="rate-select" aria-label="Tipo de cambio para conversión"><option value="sell">Venta</option><option value="buy">Compra</option></select></div><div class="converter"><label class="converter-input"><span>$</span><input type="number" min="0" max="1000000000" step="any" aria-label="Cantidad en dólares USD" value="${Number.isFinite(Number(w.config.amount))?Math.max(0,Number(w.config.amount)):1}"></label><output class="converter-result" aria-label="Equivalente en colones"></output></div><div class="exchange-source"></div>`;
    const select=container.querySelector('select');select.value=mode;
    const input=container.querySelector('input');
    function convert(){const rate=d[mode];container.querySelector('.rate-value').textContent=money(rate);const amount=Number(input.value);container.querySelector('output').textContent=Number.isFinite(amount)&&amount>=0?'₡ '+money(amount*rate):'—';const date=mode==='buy'?d.buyDate:d.sellDate;container.querySelector('.exchange-source').innerHTML=`<p class="source-line"><a href="https://api.hacienda.go.cr/indicadores/tc/dolar" target="_blank" rel="noopener noreferrer">Hacienda · ${esc(date)}</a><span>${result.cached?'Caché · ':''}1 USD = CRC</span></p>`;}
    select.onchange=()=>{mode=select.value;updateConfig(w,{rate:mode});convert();};input.oninput=()=>{updateConfig(w,{amount:Math.max(0,Number(input.value)||0)});convert();};convert();
  } catch(error){if(container.isConnected)errorState(container,error,()=>renderExchange(w,container));}
}
function safeUrl(value) {try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:'#';}catch{return '#';}}
async function renderNews(w,container,card) {
  const header=card.querySelector('.widget-label');
  if(!header.querySelector('.news-tabs')) {
    const tabs=document.createElement('div');tabs.className='news-tabs';tabs.setAttribute('aria-label','Temas de noticias');tabs.innerHTML='<button data-topic="tech">Tech</button><button data-topic="ai">IA</button>';
    tabs.querySelectorAll('button').forEach(b=>{b.classList.toggle('selected',b.dataset.topic===(w.config.topic||'tech'));b.setAttribute('aria-pressed',String(b.dataset.topic===(w.config.topic||'tech')));b.onclick=()=>{updateConfig(w,{topic:b.dataset.topic});tabs.querySelectorAll('button').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});renderNews(w,container,card);};});
    header.append(tabs);
  }
  const topic=w.config.topic||'tech';const request={};newsRequests.set(container,request);loading(container);
  try {
    const result=await fetchNews(topic);if(!container.isConnected || newsRequests.get(container)!==request)return;
    container.innerHTML=`<ol class="news-headline-list">${result.data.slice(0,3).map((n,i)=>{
      let domain='Hacker News';try{domain=new URL(n.url).hostname.replace(/^www\./,'');}catch{}
      return `<li class="news-item"><span class="news-number">0${i+1}</span><a href="${esc(safeUrl(n.url))}" target="_blank" rel="noopener noreferrer"><span class="news-title">${esc(n.title)}</span><span class="news-detail">${esc(domain)}<span>·</span>${Number(n.points)||0} puntos</span></a>${icon('external')}</li>`;
    }).join('')}</ol>${sourceLine(result,'Hacker News · Titulares originales','https://news.ycombinator.com/')}`;
    if(!result.data.length)container.innerHTML='<p class="ext-empty">No hay noticias para este tema en este momento.</p>';
  } catch(error){if(container.isConnected&&newsRequests.get(container)===request)errorState(container,error,()=>renderNews(w,container,card));}
}
function renderClock(w,container) {
  container.classList.add('clock-body');container.innerHTML=`<div class="clock-time"><span class="clock-hm"></span><span class="clock-seconds"></span></div><p class="clock-period">El tiempo, a tu ritmo.</p><div class="clock-rule"></div><div class="clock-location">${icon('pin')} Costa Rica <span>· UTC −6</span></div><div class="clock-date"></div>`;
  const tick=()=>{const now=new Date();const parts=new Intl.DateTimeFormat('es-CR',{timeZone:TZ,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now);const val=t=>parts.find(p=>p.type===t)?.value || '00';container.querySelector('.clock-hm').textContent=`${val('hour')}:${val('minute')}`;container.querySelector('.clock-seconds').textContent=val('second');container.querySelector('.clock-date').textContent=new Intl.DateTimeFormat('es-CR',{timeZone:TZ,weekday:'long',day:'numeric',month:'long'}).format(now);};tick();const timer=setInterval(tick,1000);cleanups.push(()=>clearInterval(timer));
}
function renderNote(w,container) {
  container.innerHTML=`<textarea class="note-editor" aria-label="Contenido de ${esc(cardTitle(w))}" placeholder="Una idea suelta.\nAlgo por recordar.\nEste espacio es tuyo." maxlength="10000" spellcheck="true"></textarea><div class="note-bottom"><span>${icon('check')} <span class="note-save">Guardado para ti</span></span><span class="note-count"></span></div>`;
  const textarea=container.querySelector('textarea');textarea.value=typeof w.config.text==='string'?w.config.text:'';const count=container.querySelector('.note-count');const updateCount=()=>{count.textContent=textarea.value.length?`${textarea.value.length} caracteres`:'';};updateCount();textarea.oninput=()=>{updateConfig(w,{text:textarea.value});updateCount();container.querySelector('.note-save').textContent=storageAvailable?'Guardado para ti':'Sin guardar';};
}
function openCatalog(){catalogCategory='all';$('#catalog-search').value='';document.querySelectorAll('[data-category]').forEach(b=>b.classList.toggle('selected',b.dataset.category==='all'));renderCatalog();showDialog('#catalog-dialog');}
function renderCatalog(){
  const query=$('#catalog-search').value.trim().toLocaleLowerCase('es');const matches=definitions().filter(d=>(catalogCategory==='all'||d.category===catalogCategory)&&`${d.name} ${d.description}`.toLocaleLowerCase('es').includes(query));const grid=$('#catalog-grid');grid.replaceChildren();
  matches.forEach(d=>{const b=document.createElement('button');b.className='catalog-card';b.innerHTML=`<span class="catalog-icon accent-${d.accent}">${icon(d.icon)}</span><span class="catalog-add">${icon('plus')}</span><strong>${esc(d.name)}</strong><p>${esc(d.description)}</p>`;b.onclick=()=>{if(state.widgets.length>=40)return toast('Tu espacio admite hasta 40 widgets.');const w={id:uid(),type:d.type,title:'',config:clone(d.defaults)};state.widgets.push(w);save();render();$('#catalog-dialog').close();requestAnimationFrame(()=>document.querySelector(`[data-id="${CSS.escape(w.id)}"]`)?.scrollIntoView({behavior:'smooth',block:'nearest'}));toast(`${d.name} agregado`);if(d.type==='metric')openConfig(w);};grid.append(b);});
  if(!matches.length)grid.innerHTML='<p class="empty-search">No encontramos ese widget. Prueba con otro nombre.</p>';
}
function field(name,label,value='',type='text',extra=''){return `<label class="field-label">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;}
function openConfig(w){
  const d=definition(w.type);$('#config-heading').textContent=d.name;const form=$('#config-form');form.innerHTML=field('title','Nombre del widget',w.title || cardTitle(w),'text','maxlength="60" required');const originalAutoTitle=cardTitle({...w,title:''});let chosenLocation=w.config.location || DEFAULT_LOCATION;
  if(w.type==='weather')form.insertAdjacentHTML('beforeend',`<label class="field-label">Ubicación<div class="city-search"><input name="city" placeholder="Buscar una ciudad…" value="${esc(chosenLocation.name)}" autocomplete="off"><button class="button" type="button" id="city-search-button">Buscar</button></div></label><div class="city-results"></div><p class="field-hint">Ubicación actual: <span id="selected-city">${esc(chosenLocation.name)}, ${esc(chosenLocation.country)}</span></p>`);
  if(w.type==='note')form.insertAdjacentHTML('beforeend','<p class="field-hint">Puedes escribir directamente sobre tu tarjeta. Tus notas se guardan al instante.</p>');
  if(w.type==='news')form.insertAdjacentHTML('beforeend',`<label class="field-label">Tema<select name="topic"><option value="tech">Tecnología · Portada de Hacker News</option><option value="ai">Inteligencia artificial</option></select></label><p class="field-hint">Los titulares se muestran en su idioma original y abren la publicación de origen.</p>`);
  if(w.type==='exchange')form.insertAdjacentHTML('beforeend','<p class="field-hint">Compra y venta de referencia del Ministerio de Hacienda. La fecha del dato se muestra en la tarjeta. Puedes cambiar entre ambas tasas en el widget.</p>');
  if(w.type==='clock')form.insertAdjacentHTML('beforeend','<p class="field-hint">Hora de Costa Rica (UTC −6), actualizada cada segundo.</p>');
  if(w.type==='metric')form.insertAdjacentHTML('beforeend',field('value','Valor',w.config.value,'text','maxlength="30"')+field('unit','Unidad (opcional)',w.config.unit,'text','maxlength="16"')+field('label','Descripción',w.config.label,'text','maxlength="100"')+field('trend','Nota o contexto (opcional)',w.config.trend,'text','maxlength="100"'));
  if(w.type==='focus')form.insertAdjacentHTML('beforeend',field('minutes','Duración de la sesión (minutos)',w.config.minutes,'number','min="1" max="180" required')+'<p class="field-hint">Guardar una nueva duración reinicia la sesión.</p>');
  if(getWidget(w.type))form.insertAdjacentHTML('beforeend','<label class="field-label">Color<select name="accent"><option value="sage">Salvia</option><option value="peach">Durazno</option><option value="lavender">Lavanda</option><option value="sand">Arena</option></select></label>');
  form.insertAdjacentHTML('beforeend','<div class="form-actions"><button type="button" class="button cancel-config">Cancelar</button><button type="submit" class="button primary">Guardar cambios</button></div>');
  if(w.type==='news')form.elements.topic.value=w.config.topic||'tech';if(getWidget(w.type))form.elements.accent.value=w.accent||d.accent;
  form.querySelector('.cancel-config').onclick=()=>$('#config-dialog').close();
  if(w.type==='weather'){
    let searchSequence=0;
    const search=async()=>{const query=form.elements.city.value.trim();if(query.length<2)return toast('Escribe al menos dos letras de la ciudad.');const seq=++searchSequence;const results=form.querySelector('.city-results');results.textContent='Buscando…';try{const cities=await searchCities(query);if(seq!==searchSequence||!form.isConnected)return;results.replaceChildren();cities.forEach(city=>{const b=document.createElement('button');b.type='button';b.className='city-result';b.textContent=`${city.name}${city.admin1?', '+city.admin1:''} · ${city.country}`;b.onclick=()=>{chosenLocation=city;form.querySelector('#selected-city').textContent=`${city.name}, ${city.country}`;results.querySelectorAll('button').forEach(x=>x.classList.toggle('selected',x===b));};results.append(b);});if(!cities.length)results.textContent='No encontramos esa ciudad.';}catch(error){results.textContent=error.message;}};
    form.querySelector('#city-search-button').onclick=search;form.elements.city.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();search();}};
  }
  form.onsubmit=e=>{e.preventDefault();const data=new FormData(form);w.title=String(data.get('title')||'').trim();if(w.type==='weather'){w.config.location=chosenLocation;if(w.title===originalAutoTitle)w.title='';}if(w.type==='news')w.config.topic=data.get('topic');if(w.type==='metric')for(const key of ['value','unit','label','trend'])w.config[key]=String(data.get(key)||'');if(w.type==='focus'){w.config.minutes=Math.max(1,Math.min(180,Number(data.get('minutes'))||25));w.config.remainingSeconds=w.config.minutes*60;w.config.startedAt=null;}if(getWidget(w.type))w.accent=data.get('accent');save();render();$('#config-dialog').close();toast('Widget actualizado');};
  showDialog('#config-dialog');
}
async function toggleFullscreen(){
  try {if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else toast('Usa la opción de pantalla completa de tu navegador.');}
  catch {toast('Activa la pantalla completa desde el menú de tu navegador.');}
}
function updateFullscreenButton(){const active=!!document.fullscreenElement;$('#fullscreen-button').innerHTML=icon(active?'shrink':'expand')+`<span class="fullscreen-label">${active?'Salir de pantalla completa':'Pantalla completa'}</span>`;$('#fullscreen-button').setAttribute('aria-pressed',String(active));}
for(const node of document.querySelectorAll('[data-icon]'))node.innerHTML=icon(node.dataset.icon);
$('#fullscreen-button').onclick=toggleFullscreen;document.addEventListener('fullscreenchange',updateFullscreenButton);updateFullscreenButton();
$('#add-button').onclick=openCatalog;$('#library-button').onclick=openCatalog;$('#sidebar-add').onclick=openCatalog;
$('#edit-button').onclick=()=>{editing=!editing;render();if(editing)toast('Arrastra los widgets o usa las flechas para organizarlos.');};
$('#home-button').onclick=()=>{$('.dashboard-scroll').scrollTo({top:0,behavior:'smooth'});document.querySelectorAll('dialog[open]').forEach(d=>d.close());};
$('#settings-button').onclick=()=>showDialog('#settings-dialog');$('#about-button').onclick=()=>showDialog('#about-dialog');
$('#catalog-search').oninput=renderCatalog;document.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{catalogCategory=b.dataset.category;document.querySelectorAll('[data-category]').forEach(x=>x.classList.toggle('selected',x===b));renderCatalog();});
for(const button of document.querySelectorAll('.close-dialog'))button.onclick=()=>button.closest('dialog').close();
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
$('#export-button').onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='mosaico-mi-espacio.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Tu espacio fue exportado');};
$('#import-input').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>1024*1024)throw new Error('El archivo debe pesar menos de 1 MB.');const imported=validateSpace(JSON.parse(await file.text()));if(!confirm('¿Reemplazar este espacio con el archivo seleccionado? Tus widgets y notas actuales se reemplazarán.'))return;state=imported;save();editing=false;render();$('#settings-dialog').close();toast('Tu espacio está listo');}catch(error){toast(error instanceof SyntaxError?'El archivo no contiene JSON válido.':error.message);}finally{e.target.value='';}};
$('#reset-button').onclick=()=>{if(!confirm('¿Restablecer tu espacio? Se eliminarán tus widgets y notas actuales de este navegador.'))return;state=defaultSpace();editing=false;save();render();$('#settings-dialog').close();toast('Volviste al punto de partida');};
function footerDate(){ $('#footer-date').textContent=new Intl.DateTimeFormat('es-CR',{timeZone:TZ,weekday:'short',day:'numeric',month:'short',year:'numeric'}).format(new Date()); }footerDate();setInterval(footerDate,60000);
setInterval(()=>{if(!document.hidden&&!document.querySelector('dialog[open]')&&!editing&&document.activeElement?.tagName!=='TEXTAREA'&&document.activeElement?.tagName!=='INPUT'){lastRefresh=Date.now();render();}},15*60*1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastRefresh>15*60*1000&&!document.querySelector('dialog[open]')){lastRefresh=Date.now();render();}});
render();save();
