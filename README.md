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

El clima tiene un cielo animado según el código WMO y el indicador real de día/noche: sol, luna, estrellas, nubosidad, lluvia, llovizna, neblina, nieve y tormenta. Las animaciones respetan la preferencia de movimiento reducido y se pausan con la pestaña en segundo plano.

## Publicación

- Web: https://ealfaro29.github.io/mosaico-dashboard/
- Código: https://github.com/ealfaro29/mosaico-dashboard
- GitHub Pages publica la raíz de la rama `main`. No hay compilación ni dependencias que instalar.
