# Yoga Pace

Yoga Pace es una web app estática pensada para usarse en móvil o tablet mientras haces yoga: la pantalla completa va cambiando de color por intervalos, actuando como luz ambiente y temporizador visual.

## Qué hace

- Canvas fullscreen con transición de color por intervalos
- Panel de sesión minimalista y desplegable
- Botón de ajustes con modal para configurar:
  - duración total de sesión
  - intervalo de ejercicio
  - paleta base de colores
  - vibración en cambio de intervalo
  - intensidad del flash de pantalla
- Botón `Play` para iniciar la sesión
- Controles `Pause / Resume` y `Stop`
- Tiempo transcurrido y tiempo restante visibles
- Presets de paleta
- Guarda la configuración en `localStorage`
- Intento de `Wake Lock` para mantener la pantalla despierta durante la sesión
- Intento de pantalla completa al iniciar
- Zoom bloqueado en mobile para que no se rompa la experiencia táctil
- PWA instalable con soporte offline básico
- Compatible con GitHub Pages

## Estructura

- `index.html` — interfaz principal
- `styles.css` — layout y estilo visual
- `script.js` — lógica de temporizador, canvas, PWA y ajustes
- `manifest.webmanifest` — manifiesto de instalación
- `sw.js` — service worker para cache básico
- `icon.svg` — icono de la app
- `PLAN.md` — plan y registro de progreso

## Uso local

Abre `index.html` directamente en el navegador o sirve la carpeta con cualquier servidor estático.

Ejemplo con Ruby:

```bash
ruby -run -e httpd . -p 8080
```

Luego abre `http://localhost:8080`.

## Publicación en GitHub Pages

La app está pensada para servirse desde `main` en GitHub Pages.

URL actual:

```text
https://prcalopa.github.io/yoga-pace/
```

## Idea de producto

Una herramienta ultra simple para acompañar sesiones de yoga, estiramientos, respiración o movilidad usando el dispositivo como luz ambiental suave y referencia temporal sin necesidad de mirar números todo el rato.
