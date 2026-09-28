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

## Deploy

- Frontend: importar el repositorio en Vercel. `vercel.json` usa los workspaces de Bun y publica `apps/web/dist`.
- Backend: ejecutar `bun run convex:deploy` y configurar `VITE_CONVEX_URL` en Vercel con la URL del deployment de producción.

## Paquetes

- `packages/engine`: generación determinista del tablero, estado, reglas y tests.
- `apps/web`: React, Vite, TypeScript y Tailwind CSS.
- `convex`: salas, presencia, chat y mutaciones autoritativas contra el motor.
