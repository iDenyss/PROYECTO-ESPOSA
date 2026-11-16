# Multijugador

## Publicar en Netlify

Netlify aloja la aplicación React compilada y los SWF de `GAMES/` como archivos estáticos. El servidor de salas y la señalización WebRTC usan WebSockets, por lo que se publican aparte como servicio Node.js en Render; Netlify Functions no sustituyen esa conexión persistente.

1. Sube esta carpeta a un repositorio GitHub. Netlify y Render necesitan acceder al repositorio para ejecutar sus configuraciones de despliegue.
2. En Netlify, importa el repositorio. Netlify detecta `netlify.toml`, ejecuta `npm run build` y publica `dist`. Espera al primer despliegue y anota el origen exacto del sitio, por ejemplo `https://mi-arcade.netlify.app` (sin `/` final).
3. En Render, crea un **Blueprint** desde el mismo repositorio y acepta la configuración de `render.yaml`. Cuando solicite `ALLOWED_ORIGINS`, introduce el origen exacto de Netlify. No incluyas rutas ni comodines.
4. Espera a que el servicio de Render esté activo. En este proyecto, el nombre del servicio define como URL predeterminada `https://arcade-swf-multiplayer.onrender.com`.
5. Si Render asignó una URL diferente, configura en Netlify **Site configuration → Environment variables** con `ARCADE_MULTIPLAYER_SERVER` y esa URL HTTPS. Vuelve a desplegar Netlify.
6. Despliega Netlify después de desplegar Render y abre la URL de Netlify en ambos iPhone. Un jugador crea la sala, comparte el código o la invitación y el otro se une.

El catálogo incluye Bubble Trouble, Zombie Trailer Park, Bad Ice Cream, Age of War, Bloons Tower Defense 4, The World's Hardest Game y Pac-Man. Pac-Man se puede jugar individualmente desde su ficha o en multijugador desde **Jugar online**; ambos jugadores comparten el laberinto, compiten por los puntos y evitan a los fantasmas. Bad Ice Cream tiene el botón **Jugar online** en su ficha y usa controles táctiles en horizontal: cruceta (flechas para el anfitrión, WASD para el segundo jugador) y botón de acción (espacio para el anfitrión, F para el segundo jugador). The World's Hardest Game se juega en vertical, con la pantalla arriba y la cruceta centrada debajo; Age of War y Bloons Tower Defense 4 se adaptan al modo horizontal y aceptan toques sobre el juego. Los controles de Bubble Trouble se colocan por encima de la insignia flotante de Netlify en móviles.

La URL predeterminada de Render se inserta en `config.js` durante la compilación de Netlify. Si cambias de URL de Netlify, actualiza `ALLOWED_ORIGINS` en Render; si cambia la URL de Render, configura `ARCADE_MULTIPLAYER_SERVER` en Netlify y vuelve a desplegar.

Para desarrollo local, ejecuta `npm install`, inicia `npm start` en una terminal para levantar el backend y `npm run dev` en otra para Vite. En PowerShell configura el origen de desarrollo antes de iniciar el backend: `$env:ALLOWED_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"`. Abre la URL que muestra Vite. Con el backend local, las salas usan el proxy de desarrollo y no necesitan una URL pública configurada.

### Si aparece HTTP 404 al crear una sala

- Abre `https://arcade-swf-multiplayer.onrender.com/health`. Debe responder `{"ok":true}`. Si devuelve 404, Render todavía no está ejecutando `server.js` en esa URL. En el Dashboard de Render crea el Blueprint del repositorio con `render.yaml`, espera a que el despliegue termine y vuelve a comprobar `/health`.
- Si Render muestra otra URL pública, configura `ARCADE_MULTIPLAYER_SERVER` en Netlify con esa URL base, sin `/health` ni barra final, y vuelve a desplegar.
- Cuando `/health` funcione, confirma que `ALLOWED_ORIGINS` en Render coincida exactamente con el origen del sitio Netlify. Después vuelve a desplegar el servicio de Render.
- Publica de nuevo Netlify después de desplegar Render para que los dos sitios queden usando la configuración actual.

## Crear una partida

Para Pac-Man o Bad Ice Cream, toca **Jugar online** en la ficha y luego **Crear sala**. Comparte el código con el segundo jugador, que puede unirse escribiéndolo. Cuando los dos aparezcan conectados, el jugador 1 inicia la partida. En Pac-Man ambos juegan en el mismo laberinto; usa las flechas o WASD en computadora, o los controles táctiles en móvil. Para Bad Ice Cream, el anfitrión ejecuta el SWF y transmite el video del juego; el segundo teléfono ve esa misma partida y sus botones envían los controles del jugador 2 al anfitrión.

Bubble Trouble también se puede iniciar desde **Multijugador**. Su mapeo existente se conserva: el anfitrión usa flechas izquierda/derecha y espacio; el segundo jugador usa X/W/C.

Bubble Trouble muestra los botones táctiles también en partidas individuales desde iPhone: izquierda/derecha/disparo para el jugador 1. En multijugador, el segundo teléfono usa esos mismos botones para enviar los controles X/W/C del jugador 2. La transmisión entre los teléfonos usa WebRTC y un servidor STUN público; la conexión directa puede fallar en algunas redes móviles o Wi-Fi restrictivas.

El segundo teléfono recibe video en tiempo real de la pantalla del anfitrión; no ejecuta una segunda copia del SWF. La calidad y latencia dependen de la conexión y del dispositivo anfitrión. El plan gratuito de Render puede suspender el servicio cuando no se usa; la primera conexión posterior puede tardar en despertar el servidor.

Después de actualizar el código, despliega tanto el servicio de Render como el sitio de Netlify desde la rama `main`. Render debe ejecutar la versión del servidor que retransmite los mensajes de señalización WebRTC; Netlify debe publicar el cliente actualizado.

Zombie Trailer Park conserva los 24 FPS definidos en su archivo SWF. El reproductor usa calidad media para reducir la carga gráfica, pero no se pueden añadir cuadros de animación que no existan en el archivo original.
