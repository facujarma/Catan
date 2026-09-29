# Catan Online

Monorepo para un Catan multijugador. El motor de reglas es TypeScript puro y no depende de React ni de Convex.

## Requisitos

- Node.js 26+
- Bun

## Desarrollo

```sh
bun install
bun run convex:dev
bun run dev
bun run test
bun run typecheck
bun run build
```

La primera vez, `bun run convex:dev` crea o vincula el deployment de Convex. Copiá `apps/web/.env.example` a `apps/web/.env.local` y configurá `VITE_CONVEX_URL` con la URL que informa Convex. Vite levanta en `http://localhost:5173`.

Para ver la interfaz sin configurar Convex ni reunir jugadores, abrí la app y elegí **Ver una partida de muestra**. Es una vista local de solo lectura con cuatro participantes ficticios.

Las salas son privadas con código de cuatro caracteres. La identidad invitada y su token de acceso se guardan en `localStorage`; las consultas de Convex devuelven la vista pública y filtran la mano para cada jugador.

El anfitrión puede completar la sala con bots de prueba: esperan unos segundos, tiran si les toca, descartan al azar y pasan el turno. También puede configurar un límite de tiempo por turno (o desactivarlo).

El botón de comercio abre un único panel: muestra solo las cartas que tenés para entregar, calcula la tasa del banco (4:1 o la del puerto) y también permite proponer el intercambio a la mesa.

El tiempo se maneja por pasos: hay 5 segundos para tirar (después se tira solo), 20 segundos para mover al ladrón o elegir a quién robar, y para comerciar 15 segundos para elegir socio y 5 segundos para que el resto responda (si no responden, se auto-rechaza; pueden cambiar su respuesta mientras la oferta siga abierta). El tiempo restante del turno se pausa mientras resolvés un ladrón o un comercio y se reanuda después. Todo lo que no se elija a tiempo se resuelve al azar. El orden de turnos se sortea al azar al empezar cada partida. En partida, el temporizador aparece junto al turno activo y, al pasar el cursor sobre un jugador, se ve su tiempo promedio por turno.

## Deploy

- Frontend: importar el repositorio en Vercel. `vercel.json` usa los workspaces de Bun y publica `apps/web/dist`.
- Backend: ejecutar `bun run convex:deploy` y configurar `VITE_CONVEX_URL` en Vercel con la URL del deployment de producción.

## Paquetes

- `packages/engine`: generación determinista del tablero, estado, reglas y tests.
- `apps/web`: React, Vite, TypeScript y Tailwind CSS.
- `convex`: salas, presencia, chat y mutaciones autoritativas contra el motor.
