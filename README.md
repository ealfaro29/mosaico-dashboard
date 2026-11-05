# Mosaico

Dashboard bento modular en español, hecho con HTML, CSS y módulos JavaScript nativos. Es una web estática compatible con GitHub Pages: no requiere compilación, servidor propio, claves API ni dependencias de ejecución.

## Abrir localmente

Desde esta carpeta:

```sh
python3 -m http.server 4173
```

Abre <http://localhost:4173>. Los módulos JavaScript necesitan HTTP; no abras `index.html` directamente con `file://`.

El contenedor mide como máximo **1024 × 640 píxeles** y se adapta a ventanas menores. El botón de pantalla completa utiliza la API del navegador y conserva el dashboard centrado dentro de ese tamaño máximo. La disponibilidad de pantalla completa depende del navegador y del contexto de apertura.

## Datos y estado

- **Clima:** [Open-Meteo](https://open-meteo.com/en/docs); ubicación inicial San José, Costa Rica.
- **USD/CRC:** [Ministerio de Hacienda de Costa Rica](https://api.hacienda.go.cr/docs/). Los valores de compra y venta conservan su fecha de referencia.
- **Noticias:** [Hacker News mediante Algolia](https://hn.algolia.com/api). Los titulares mantienen el idioma original de la fuente.

Las consultas se hacen desde el navegador. Si una fuente falla, el servicio puede mostrar la última respuesta guardada, identificada como caché; no genera valores ficticios. Las fuentes externas requieren conexión y pueden tener interrupciones.

La distribución, configuración, notas y contenido de los widgets se guardan en `localStorage` del navegador. No hay cuenta ni sincronización entre dispositivos. El panel de ajustes permite **exportar** una copia JSON e **importarla** para recuperar o trasladar el espacio. Borrar los datos del sitio también elimina este estado local.

## Crear un widget propio

`js/extensions.js` exporta `registerWidget`, `getWidget` y `listWidgets`. Una definición incluye un `type` único, nombre, valores iniciales y una función de renderizado. Por ejemplo, crea `js/mi-widget.js`:

```js
import { registerWidget } from './extensions.js';

registerWidget({
  type: 'mi-widget',
  name: 'Mi widget',
  description: 'Un módulo creado por nosotros.',
  icon: 'chart',
  accent: 'sage',
  defaults: { texto: 'Hola, Mosaico' },
  render({ container, widget, update }) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.textContent = widget.config.texto;
    boton.addEventListener('click', () => {
      boton.textContent = 'Listo';
      update({ texto: 'Listo' });
    });
    container.append(boton);
  }
});
```

Después importa el módulo en `js/app.js`:

```js
import './mi-widget.js';
```

El catálogo obtiene las definiciones del registro. `update(patch)` mezcla y guarda los datos en `widget.config`; el widget actualiza su propio DOM. `render` también recibe el helper `icon`. Puede devolver una función de limpieza para cancelar temporizadores o retirar listeners externos cuando se desmonta. Acentos disponibles: `sage`, `peach`, `lavender` y `sand`.

Los widgets incluidos son pendientes, temporizador de foco, enlaces e indicador personalizado. Usa `textContent` para contenido editable y valida enlaces externos; no hace falta ejecutar HTML o JavaScript introducido por usuarios.

## Publicación

GitHub Pages puede servir esta carpeta directamente desde la raíz de una rama. Los archivos usan rutas relativas para funcionar también bajo la ruta de un repositorio. No incluyas credenciales ni datos privados en los archivos publicados.

El clima tiene un cielo según el código WMO y el indicador real de día/noche. En equipos normales se anima; en modo ligero y con movimiento reducido utiliza un fondo estático sin Canvas. El reloj reutiliza formateadores, los temporizadores no pintan en segundo plano y las consultas simultáneas a una misma fuente se comparten.

## Marcos Android y modo ligero

Android 9 o anterior y dispositivos que reportan 2 GB de memoria o menos activan el modo ligero **antes de cargar el CSS**: fuentes del sistema, cielo estático, sin texturas Canvas, animaciones, filtros de hover ni desenfoque de diálogos. La distribución, colores y funciones se conservan. Puedes forzarlo en cualquier equipo con [Mosaico ligero](https://ealfaro29.github.io/mosaico-dashboard/?lite=1).

Las fuentes externas son opcionales y se solicitan después de iniciar el documento en el modo normal; no bloquean el arranque. Los identificadores y las copias de datos JSON tienen alternativas sin `crypto.randomUUID` ni `structuredClone`. Esto endurece el arranque; no implica que Firefox 159 carezca de esas funciones.

Un error al abrir un widget no impide abrir los siguientes. Si no puede leerse o validarse el espacio guardado, Mosaico mantiene el original sin sobrescribirlo: muestra un aviso y permite exportarlo desde Ajustes. Importar o restablecer conserva la confirmación de reemplazo. Si el módulo inicial no llega a arrancar, aparece un enlace de reintento ligero a los ocho segundos.

## Verificación de regresiones

### Vista independiente para el marco

[Abrir `frame.html`](https://ealfaro29.github.io/mosaico-dashboard/frame.html?v=20261105-frame2). Es un documento autónomo de unos 15 KB: no carga los módulos, estilos, fuentes ni motor del dashboard. Los cinco widgets y enlaces de fuentes existen en el HTML incluso sin JavaScript. Usa script clásico, tipografía del sistema y CSS simple, sin Canvas, SVG, Intl, animaciones, transformaciones, filtros o sombras.

El reloj se actualiza por minuto. Después de cuatro segundos consulta clima de San José, tipo de cambio y tres titulares, una fuente a la vez, con límites de 32 KB y siete segundos. No hace consultas periódicas. [Iniciar sin consultas automáticas](https://ealfaro29.github.io/mosaico-dashboard/frame.html?offline=1&v=20261105-frame2) conserva el botón para consultar manualmente.

Las notas de esta vista se guardan explícitamente con **Guardar nota**, hasta 4000 caracteres, en `mosaico:frame:note:v1`. No lee, migra, enumera ni modifica las notas, configuración o caché del dashboard anterior. No redirige a otros usuarios ni reemplaza el dashboard. Una URL nueva y una prueba de navegador no demuestran que el cierre físico haya desaparecido.

Prueba específica: `NODE_PATH=/tmp/mosaico-qa/node_modules node tests/frame-independent.cjs`. Cubre arranque sin JavaScript, independencia de recursos/API del dashboard, almacenamiento previo grande e intacto, recarga de notas propias, red secuencial y respuestas fallidas, bloqueadas o excesivas.

El sitio no tiene dependencias de ejecución. La prueba opcional de navegador usa Playwright instalado fuera del proyecto:

```sh
npm install --prefix /tmp/mosaico-qa --no-audit --no-fund playwright
NODE_PATH=/tmp/mosaico-qa/node_modules node tests/frame-smoke.cjs
```

En macOS usa el Chrome instalado. En otros equipos instala Chromium con Playwright. Para Firefox, instala su binario y usa `MOSAICO_BROWSER=firefox`. La prueba crea un servidor local y guarda resultados/capturas en `.qa/`, que no se publica en git. Incluye perfil Android 8.1 a 1024 × 640, arranque sin APIs opcionales, cero Canvas/fuentes externas en modo ligero, datos sin conexión y peticiones bloqueadas, fallos aislados, preservación exacta de notas/IDs/orden, configuración, exportación e importación y recuperación del arranque.

El perfil Android simulado no sustituye una prueba en el marco físico ni demuestra la causa de un cierre nativo del navegador.

## Publicación

- Web: https://ealfaro29.github.io/mosaico-dashboard/
- Código: https://github.com/ealfaro29/mosaico-dashboard
- GitHub Pages publica la raíz de la rama `main`. No hay compilación ni dependencias que instalar.
