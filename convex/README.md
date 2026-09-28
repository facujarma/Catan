# Convex

`rooms.ts` implementa el ciclo de vida del lobby (`createRoom`, `joinRoom`, `setReady`, `startGame`, `leaveRoom`), los heartbeats de presencia, el chat, el registro de partida y `applyGameAction`.

La mutation de jugada identifica al jugador por un token anónimo de capacidad guardado en su navegador y reemplaza cualquier identidad del payload con el id validado de la sala. Después ejecuta `@catan/engine` en la mutation y persiste el estado completo dentro de la transacción.

`getRoom` verifica el token y devuelve solo `getPlayerView` para esa persona, además de las ubicaciones públicas y movimientos legales. Los tokens, el mazo y las manos rivales nunca salen en la query. `presence`, `messages` y `gameEvents` son tablas reactivas independientes.

Configurá `VITE_CONVEX_URL` en `apps/web/.env.local`, luego corré `bun run convex:dev` para vincular el deployment y regenerar el esquema local. Para producción, `bun run convex:deploy` despliega las funciones.
