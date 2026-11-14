# Multijugador de Bubble Trouble

## Publicar en Netlify

Netlify aloja la página y los SWF de `GAMES/` como archivos estáticos. El servidor de salas usa WebSockets, por lo que se publica aparte como servicio Node.js en Render; Netlify Functions no sustituyen esa conexión persistente.

1. Sube esta carpeta a un repositorio GitHub. Netlify y Render necesitan acceder al repositorio para ejecutar sus configuraciones de despliegue.
2. En Netlify, importa el repositorio. Netlify detecta `netlify.toml`, ejecuta `npm run build` y publica `dist`. Espera al primer despliegue y anota el origen exacto del sitio, por ejemplo `https://mi-arcade.netlify.app` (sin `/` final).
3. En Render, crea un **Blueprint** desde el mismo repositorio y acepta la configuración de `render.yaml`. Cuando solicite `ALLOWED_ORIGINS`, introduce el origen exacto de Netlify. No incluyas rutas ni comodines.
4. Espera a que el servicio de Render esté activo. En este proyecto, el nombre del servicio define como URL predeterminada `https://arcade-swf-multiplayer.onrender.com`.
5. Si Render asignó una URL diferente, configura en Netlify **Site configuration → Environment variables** con `ARCADE_MULTIPLAYER_SERVER` y esa URL HTTPS. Vuelve a desplegar Netlify.
6. Despliega Netlify después de desplegar Render y abre la URL de Netlify en ambos iPhone. Un jugador crea la sala, comparte el código o la invitación y el otro se une.

La URL predeterminada de Render se inserta en `config.js` durante la compilación de Netlify. Si cambias de URL de Netlify, actualiza `ALLOWED_ORIGINS` en Render; si cambia la URL de Render, configura `ARCADE_MULTIPLAYER_SERVER` en Netlify y vuelve a desplegar.

Para desarrollo local, ejecuta `npm install` y `npm start`; abre `http://localhost:3000`. Las salas locales no necesitan una URL de backend configurada.

### Si aparece HTTP 404 al crear una sala

- Abre `https://arcade-swf-multiplayer.onrender.com/health`. Debe responder `{"ok":true}`. Si devuelve 404, el servicio de Render todavía no existe con ese nombre, está suspendido/no desplegado o no ejecuta `server.js`; crea o actualiza el Blueprint de Render con `render.yaml`.
- Si Render muestra otra URL pública, configura `ARCADE_MULTIPLAYER_SERVER` en Netlify con esa URL base, sin `/health` ni barra final, y vuelve a desplegar.
- Confirma que `ALLOWED_ORIGINS` en Render coincida exactamente con el origen del sitio Netlify.

## Crear una partida

En un teléfono toca **Multijugador → Crear sala** y comparte el código o la invitación. En el otro, abre la invitación o escribe el código y toca **Unirse a una sala**. Cuando los dos aparezcan conectados, el jugador 1 inicia la partida.

Bubble Trouble muestra los botones táctiles también en partidas individuales desde iPhone: izquierda/derecha/disparo para el jugador 1. En multijugador, el segundo teléfono usa esos mismos botones para enviar los controles X/W/C del jugador 2.

El servidor retransmite las pulsaciones; cada teléfono ejecuta su propia copia del SWF. No modifica el motor Flash ni impone un estado de juego autoritativo, así que la sincronización depende del juego y de la conexión. El plan gratuito de Render puede suspender el servicio cuando no se usa; la primera conexión posterior puede tardar en despertar el servidor.

Zombie Trailer Park conserva los 24 FPS definidos en su archivo SWF. El reproductor usa calidad media para reducir la carga gráfica, pero no se pueden añadir cuadros de animación que no existan en el archivo original.
