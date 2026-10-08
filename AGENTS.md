<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Reglas de Database I/O (leer ANTES de tocar `convex/`)

Contexto: el plan gratuito tiene 1 GB de Database I/O y se agotó en ~10 partidas.
La métrica cuenta **bytes leídos + bytes escritos**. En Convex:

- `ctx.db.get`/`query` leen el **documento completo**.
- `ctx.db.patch` reescribe el **documento completo**, aunque cambie un solo campo.
- Cada escritura invalida y **re-ejecuta todas las queries reactivas** que leyeron ese
  documento; cada re-ejecución vuelve a leer los documentos que toca. El costo real es
  `tamaño del doc × lectores suscritos × frecuencia del write`.

Tamaños medidos en este repo (medidos con `convex-test`, partida de Navegantes):

- Antes: `gameState` dentro de `rooms` 48.4 KiB inicial → 64.7 KiB; tablero 45.8 KiB;
  vista ~48 KiB. Cada heartbeat/acción reescribía y releía ese doc completo.
- Ahora: `rooms` ~0.9 KB; `gameBoards` ~40 KB (inmutable, query cacheada);
  `gameStates` ~2.6 KB al inicio; `playerStates` ~1.2 KB c/u; eventos ~255 B.

### Arquitectura de datos vigente (no romper)

| Tabla | Contenido | Mutabilidad |
| --- | --- | --- |
| `rooms` | lobby, identidad, settings, `boardId`/`gameId` | chica, se patchea en lobby/estado |
| `gameBoards` | `board` completo | inmutable, se inserta 1 vez |
| `gameStates` | estado dinámico público (`public`) + timers + `turnStats` + `botTurnKey` + pausa | se patchea por acción |
| `playerStates` | mano privada, `legal`, PV y pendientes por jugador | se patchea solo si cambia |

Queries y su costo:

- `getRoom(code, token)`: solo `rooms`. Nunca lee estado de partida ni `presence`.
- `getBoard(boardId)`: lee un doc inmutable; Convex la cachea y no la re-ejecuta.
- `getGame(gameId)`: lee solo `gameStates` y devuelve la vista pública (sin tablero).
  Args idénticos para todos los jugadores → una sola ejecución compartida por partida.
- `getSelf(roomId, token)`: lee `rooms` + el `playerStates` propio. Sin tablero ni estado global.
- `getPresence(roomId)`: solo la tabla `presence`. El heartbeat no invalida nada más.
- `listMessages`/`listEvents(roomId)`: solo su tabla, `.take(30)`.

El cliente (`apps/web/src/App.tsx`) combina `getBoard` + `getGame` + `getSelf` +
`getPresence` en el `RoomSnapshot`. Cualquier campo nuevo debe exponerse por la query
que corresponda; no volver a una query única que lea todo.

### Reglas obligatorias

1. **`rooms` debe pesar < ~2 KB.** Solo lobby, identidad, settings, timers y
   referencias (`boardId`/`gameId`). PROHIBIDO `gameState`, tableros, mazos o
   cualquier blob grande dentro de `rooms`.
2. **Estado de partida en tablas propias, separando estático de dinámico:**
   - `gameBoards` (inmutable): se inserta una vez en `startGame`, nunca se patchea.
   - `gameStates` (mutable): se patchea por acción y NO incluye el tablero.
   Así un patch de acción escribe ~2-10 KB y no ~60 KB en Navegantes. El tablero se
   expone con `getBoard` (query cacheada, una vez por cliente).
3. **Presencia/heartbeat jamás en docs que leen queries pesadas.**
   `getRoom`/`getGame`/`getSelf` NO deben leer `presence`; usar `getPresence`.
   Un heartbeat solo escribe su doc de presencia. `cleanupPresence` materializa
   "offline" cada 60 s (no calcular online con `Date.now()` en queries).
4. **Autenticación barata:** `heartbeat`, `sendMessage`, `getSelf` y los jobs
   programados validan identidad contra el `rooms` chico, nunca contra un doc
   con estado de partida.
5. **Antes de escribir, contar lectores reactivos.** Un patch invalida todas las queries
   suscritas que leyeron el doc. No parchear docs grandes por campos chicos
   (`updatedAt`, `turnStats` sin cambios, timers que no cambiaron). `ensurePlayerStates`
   compara antes de patchear: mantener ese patrón.
6. **Timers: agendar solo si el deadline cambió** respecto del valor previo. Los jobs
   (`enforceTurnTimeout`, `expireTradeResponses`) reciben `gameId` y chequean el deadline
   en `gameStates` antes de leer tablero/jugadores. Los jobs que disparan antes de tiempo
   se reagendan; no dejar jobs zombie.
7. **Queries acotadas:** `.take(n)`/`.paginate()` siempre; feeds máximo 30 ítems
   (`FEED_LIMIT`); nunca `.collect()` en tablas que crecen. No devolver el estado
   completo si la UI no lo necesita.
8. **No usar `Date.now()` en queries** (rompe el cache y fuerza re-ejecuciones). Pasar
   el tiempo como argumento o materializar el estado con mutations programadas
   (ver `cleanupPresence`).
9. **Commits únicos por run de bot:** `playBotTurn` ya agrupa hasta 8 acciones; no
   commitear estado intermedio. Un commit = una invalidación de todos los clientes.
10. **Verificar antes de mergear:** estimar bytes (tamaño doc × lectores × frecuencia),
    medir con `ctx.meta.getTransactionMetrics()` en tests y revisar el panel
    Database I/O / `npx convex insights` en producción. Un cambio que sube el I/O
    no se mergea.

### Anti-patrones ya detectados (no repetir)

- `gameState: v.any()` dentro de `rooms`: cada heartbeat/mensaje/patch leía y
  reescribía 50-65 KB.
- `getRoom` leyendo `presence` con `.collect()`: el heartbeat de cada jugador
  re-ejecutaba la query pesada de todos los clientes.
- `commitGameFlow` agendando `enforceTurnTimeout`/`expireTradeResponses` en cada
  commit aunque el deadline no cambiara: N lecturas completas basura por turno.
- `requireRoom` (doc grande) en `heartbeat`, `listMessages`, `listEvents`,
  `sendMessage` solo para autenticar. Ahora los feeds van por `roomId` sin auth
  y el resto lee el `rooms` chico.
- Devolver el tablero completo (~40 KB en Navegantes) en cada re-ejecución de la
  vista: ahora se sirve una vez con `getBoard` (query inmutable cacheada) y el
  cliente lo combina.
- Volver a meter manos privadas o el mazo en la query pública: las manos viven en
  `playerStates` y solo se leen en `getSelf`.
