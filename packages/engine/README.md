# `@catan/engine`

Motor puro de reglas: no conoce React, Convex ni el transporte. Cada acción valida al jugador y la fase, devuelve un estado nuevo y deja intacta la entrada. Las acciones inválidas lanzan `EngineError` con un `code` estable.

```ts
import { applyAction, createGame, getPlayerView } from "@catan/engine";

let game = createGame({
  players: [
    { id: "a", name: "Ana" },
    { id: "b", name: "Bruno" },
    { id: "c", name: "Cami" },
  ],
  seed: "sala-ABCD",
});

// Las acciones incluyen playerId y se vuelven a validar en el motor.
game = applyAction(game, {
  type: "place-setup-settlement",
  playerId: "a",
  vertexId: "v0",
});

const viewForAna = getPlayerView(game, "a");
```

`createGame` genera el tablero, los puertos y el mazo desde una semilla. `getLegalSettlementPlacements`, `getLegalRoadPlacements` y `getLegalCityUpgrades` entregan opciones para la UI; `getPlayerView` omite los recursos y las cartas de desarrollo de los rivales.

Las pruebas de reglas corren con `bun --filter @catan/engine test`.
