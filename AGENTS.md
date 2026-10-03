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

Tamaños medidos en este repo (`JSON.stringify` de `createGame`):

- Base: `gameState` 17.5 KiB inicial → 35.6 KiB con partida avanzada; tablero 15 KiB.
- Navegantes: `gameState` 48.4 KiB inicial → 64.7 KiB; tablero 45.8 KiB; vista ~48 KiB.
- Los feeds (`messages`/`gameEvents`) son docs chicos, pero sus queries leían `rooms`
  entero (con `gameState`) solo para autenticar.

### Reglas obligatorias

1. **`rooms` debe pesar < ~2 KB.** Solo lobby, identidad, settings, timers y
   referencias (`boardId`/`stateId`). PROHIBIDO `gameState`, tableros, mazos o
   cualquier blob grande dentro de `rooms`.
2. **Estado de partida en tablas propias, separando estático de dinámico:**
   - `gameBoards` (inmutable): se inserta una vez en `startGame`, nunca se patchea.
   - `gameStates` (mutable): se patchea por acción y NO incluye el tablero.
   Así un patch de acción escribe ~15 KB y no ~60 KB en Navegantes. Como el tablero es
   inmutable, se puede exponer con una query propia que Convex cachea y no re-ejecuta.
3. **Presencia/heartbeat/timers jamás en docs que leen queries pesadas.**
   `getRoom`/`getGame` NO deben leer `presence`; usar una query `getPresence` separada.
   Un heartbeat solo escribe su doc de presencia.
4. **Autenticación barata:** `heartbeat`, `sendMessage`, `listMessages`, `listEvents` y
   los jobs programados validan identidad contra el `rooms` chico, nunca contra un doc
   con estado de partida.
5. **Antes de escribir, contar lectores reactivos.** Un patch invalida todas las queries
   suscritas que leyeron el doc. No parchear docs grandes por campos chicos
   (`updatedAt`, `turnStats` sin cambios, timers que no cambiaron).
6. **Timers: agendar solo si el deadline cambió** respecto del valor previo. Los jobs
   (`enforceTurnTimeout`, `expireTradeResponses`) chequean primero `rooms` (chico) y
   recién leen `gameStates` si el deadline coincide. Evitar jobs zombie que leen el doc
   completo para no hacer nada.
7. **Queries acotadas:** `.take(n)`/`.paginate()` siempre; feeds máximo 30 ítems;
   nunca `.collect()` en tablas que crecen. Mantener la misma forma de documento para
   listas calientes (docs chicos), no devolver el estado completo.
8. **No usar `Date.now()` en queries** (rompe el cache y fuerza re-ejecuciones). Pasar
   el tiempo como argumento o materializar estado (`isOnline`) con mutations programadas.
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
  `sendMessage` solo para autenticar.
- Devolver el tablero completo (~46 KB en Navegantes) en cada re-ejecución de
  `getRoom`, cuando es inmutable y puede servirse desde una query cacheada.
