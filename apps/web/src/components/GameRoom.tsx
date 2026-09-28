import { useState } from "react";
import { RESOURCES } from "@catan/engine";
import type { HeldDevelopmentCard, PlayerPublicView, Resource } from "@catan/engine";
import BoardSvg, { type BoardMode } from "./BoardSvg";
import FeedPanel from "./FeedPanel";
import GameActions from "./GameActions";
import { TradeComposer, TradeOfferPanel, RESOURCE_NAMES, RESOURCE_SYMBOLS } from "./TradePanels";
import type { ChatMessage, GameActionPayload, GameEvent, RoomSnapshot } from "../model";

interface GameRoomProps {
  room: RoomSnapshot;
  messages: ChatMessage[];
  events: GameEvent[];
  busy: boolean;
  demo?: boolean;
  onAction: (action: GameActionPayload) => Promise<void>;
  onSendMessage: (body: string) => Promise<void>;
  onLeave: () => void;
  onCopyInvite: () => void;
}

export default function GameRoom({
  room,
  messages,
  events,
  busy,
  demo = false,
  onAction,
  onSendMessage,
  onLeave,
  onCopyInvite,
}: GameRoomProps) {
  const game = room.game!;
  const [mode, setMode] = useState<BoardMode>(null);
  const [selectedCard, setSelectedCard] = useState<HeldDevelopmentCard | null>(null);
  const [selectedRoadIds, setSelectedRoadIds] = useState<string[]>([]);
  const [plentyResources, setPlentyResources] = useState<Resource[]>([]);
  const [pendingRobberHexId, setPendingRobberHexId] = useState<string | null>(null);
  const [tradeComposer, setTradeComposer] = useState<null | "new" | "counter">(null);

  const isMyTurn = game.currentPlayerId === room.selfPlayerId;
  const currentPlayer = game.players.find((player) => player.id === game.currentPlayerId);
  const offer = game.activeTrade;
  const eligibleVictims = pendingRobberHexId
    ? playersAdjacentToHex(pendingRobberHexId).filter((player) => player.resourceCardCount > 0)
    : [];

  function playersAdjacentToHex(hexId: string) {
    const adjacentVertexIds = new Set(
      game.board.vertices.filter((vertex) => vertex.hexIds.includes(hexId)).map((vertex) => vertex.id),
    );
    return game.players.filter(
      (player) =>
        player.id !== room.selfPlayerId &&
        [...player.settlementVertexIds, ...player.cityVertexIds].some((vertexId) =>
          adjacentVertexIds.has(vertexId),
        ),
    );
  }

  const resetSelection = () => {
    setMode(null);
    setSelectedCard(null);
    setSelectedRoadIds([]);
    setPlentyResources([]);
    setPendingRobberHexId(null);
  };

  const submitRobberMove = async (hexId: string, victimId: string | null) => {
    if (selectedCard?.type === "knight") {
      await onAction({ type: "play-knight", cardId: selectedCard.id, hexId, victimId });
    } else {
      await onAction({ type: "move-robber", hexId, victimId });
    }
    resetSelection();
  };

  const handleHexClick = (hexId: string) => {
    const victims = playersAdjacentToHex(hexId).filter((player) => player.resourceCardCount > 0);
    if (victims.length > 1) {
      setPendingRobberHexId(hexId);
      return;
    }
    void submitRobberMove(hexId, victims[0]?.id ?? null);
  };

  const handleVertexClick = (vertexId: string) => {
    if (!isMyTurn) return;
    if (game.phase === "setup-settlement") {
      void onAction({ type: "place-setup-settlement", vertexId }).then(resetSelection);
    } else if (mode === "settlement") {
      void onAction({ type: "build-settlement", vertexId }).then(resetSelection);
    } else if (mode === "city") {
      void onAction({ type: "build-city", vertexId }).then(resetSelection);
    }
  };

  const handleEdgeClick = (edgeId: string) => {
    if (!isMyTurn) return;
    if (game.phase === "setup-road") {
      void onAction({ type: "place-setup-road", edgeId }).then(resetSelection);
    } else if (mode === "road") {
      void onAction({ type: "build-road", edgeId }).then(resetSelection);
    } else if (mode === "free-road") {
      setSelectedRoadIds((current) => {
        if (current.includes(edgeId)) return current.filter((candidate) => candidate !== edgeId);
        if (current.length >= 2) return current;
        return [...current, edgeId];
      });
    }
  };

  const selectDevelopmentCard = (card: HeldDevelopmentCard | null) => {
    setSelectedCard(card);
    if (!card) return;
    setSelectedRoadIds([]);
    setPlentyResources([]);
    setMode(
      card.type === "knight" ? "robber" : card.type === "road-building" ? "free-road" : null,
    );
  };

  const playMonopoly = (resource: Resource) => {
    if (!selectedCard || selectedCard.type !== "monopoly") return;
    void onAction({ type: "play-monopoly", cardId: selectedCard.id, resource }).then(resetSelection);
  };

  const togglePlentyResource = (resource: Resource) => {
    const amountToTake = Math.min(2, RESOURCES.reduce((sum, key) => sum + game.bank[key], 0));
    setPlentyResources((current) => {
      if (
        current.length >= amountToTake ||
        current.filter((candidate) => candidate === resource).length >= game.bank[resource]
      ) {
        return current;
      }
      return [...current, resource];
    });
  };

  const playYearOfPlenty = () => {
    if (!selectedCard || selectedCard.type !== "year-of-plenty") return;
    void onAction({
      type: "play-year-of-plenty",
      cardId: selectedCard.id,
      resources: plentyResources,
    }).then(resetSelection);
  };

  const playRoadBuilding = () => {
    if (!selectedCard || selectedCard.type !== "road-building" || selectedRoadIds.length === 0) return;
    void onAction({
      type: "play-road-building",
      cardId: selectedCard.id,
      edgeIds: selectedRoadIds,
    }).then(resetSelection);
  };

  const robberTargetName = game.board.hexes.find((hex) => hex.id === pendingRobberHexId)?.id;
  const requiredPlentyCards = Math.min(2, RESOURCES.reduce((sum, resource) => sum + game.bank[resource], 0));
  const otherPlayers = game.players.filter((player) => player.id !== room.selfPlayerId);
  const selfPlayer = game.players.find((player) => player.id === room.selfPlayerId);

  const hint = (() => {
    if (game.phase === "finished") return null;
    if (selectedCard?.type === "knight") return "Caballero: elegí en el tablero el nuevo territorio del ladrón.";
    if (selectedCard?.type === "road-building") {
      return `Caminos gratis: elegí hasta dos aristas conectadas (${selectedRoadIds.length}/2).`;
    }
    if (game.phase === "setup-settlement") {
      return isMyTurn ? "Elegí un vértice vacío para tu poblado inicial." : `Colocando: ${currentPlayer?.name}`;
    }
    if (game.phase === "setup-road") {
      return isMyTurn ? "Elegí un camino que salga de ese poblado." : `Colocando: ${currentPlayer?.name}`;
    }
    if (game.phase === "robber") {
      return isMyTurn ? "Elegí un hexágono para mover al ladrón." : "El jugador activo está moviendo al ladrón.";
    }
    if (game.phase === "main" && isMyTurn && mode) {
      const action = mode === "road" ? "construir el camino" : mode === "settlement" ? "construir el poblado" : "mejorar el poblado";
      return `Elegí en el tablero dónde ${action}. Volvé a tocar el botón para cancelar.`;
    }
    if (game.phase === "trade" && offer && offer.fromPlayerId === room.selfPlayerId) {
      return "Tu oferta está abierta para toda la mesa.";
    }
    return null;
  })();

  return (
    <div className="cg-shell">
      <header className="cg-topbar">
        <div className="cg-topbar-left">
          <span className="cg-logo">CATAN</span>
          <span className="cg-room-chip">{room.code}</span>
          <span className={`cg-phase-pill ${isMyTurn ? "is-mine" : "is-other"}`}>
            {isMyTurn ? "Tu turno" : `Turno de ${currentPlayer?.name ?? "…"}`}
          </span>
        </div>
        <div className="cg-topbar-right">
          {!demo && (
            <button className="cg-ghost-button" type="button" onClick={onCopyInvite}>
              ↗ Invitar
            </button>
          )}
          <button className="cg-ghost-button" type="button" onClick={onLeave}>
            {demo ? "← Volver" : "× Salir"}
          </button>
        </div>
      </header>

      <main className="cg-layout">
        <aside className="cg-players" aria-label="Jugadores">
          <h2 className="cg-players-title">Jugadores</h2>
          {otherPlayers.map((player) => (
            <PlayerPanel
              key={player.id}
              player={player}
              room={room}
              longestRoad={game.longestRoadHolderId === player.id}
              largestArmy={game.largestArmyHolderId === player.id}
            />
          ))}
          {selfPlayer && (
            <PlayerPanel
              player={selfPlayer}
              room={room}
              self
              totalPoints={game.self.totalVictoryPoints}
              longestRoad={game.longestRoadHolderId === selfPlayer.id}
              largestArmy={game.largestArmyHolderId === selfPlayer.id}
            />
          )}
        </aside>

        <section className="cg-board-area">
          <BoardSvg
            game={game}
            legal={demo ? emptyLegalPlacements : room.legal}
            selfPlayerId={room.selfPlayerId}
            mode={demo ? null : mode}
            selectedRoadIds={selectedRoadIds}
            onVertexClick={handleVertexClick}
            onEdgeClick={handleEdgeClick}
            onHexClick={handleHexClick}
          />

          {!demo && game.phase === "trade" && offer && (
            <TradeOfferPanel
              game={game}
              selfPlayerId={room.selfPlayerId}
              busy={busy}
              onAction={onAction}
              onCounter={() => setTradeComposer("counter")}
            />
          )}

          {!demo && hint && (
            <div className="cg-board-hint">
              {hint}
              {selectedCard?.type === "road-building" && (
                <>
                  <button
                    type="button"
                    disabled={busy || selectedRoadIds.length === 0}
                    onClick={playRoadBuilding}
                  >
                    Colocar
                  </button>
                  <button type="button" onClick={resetSelection}>
                    Cancelar
                  </button>
                </>
              )}
              {selectedCard?.type === "knight" && (
                <button type="button" onClick={resetSelection}>
                  Cancelar
                </button>
              )}
            </div>
          )}

          {game.phase === "finished" && (
            <div className="cg-winner-banner">
              <div className="cg-winner-card">
                <h2>
                  {game.winnerId === room.selfPlayerId
                    ? "¡Ganaste la partida!"
                    : `Ganó ${game.players.find((player) => player.id === game.winnerId)?.name ?? "un jugador"}`}
                </h2>
                <p>10 puntos de victoria</p>
              </div>
            </div>
          )}
        </section>

        <aside className="cg-right">
          <FeedPanel
            messages={messages}
            events={events}
            disabled={busy || demo}
            onSend={onSendMessage}
          />
          <section className="cg-bank" aria-label="Banco">
            <div className="cg-bank-title">
              <span>Banco</span>
              <span>Cartas restantes</span>
            </div>
            <div className="cg-bank-row">
              {RESOURCES.map((resource) => (
                <div className="cg-bank-item" key={resource} title={RESOURCE_NAMES[resource]}>
                  <span>{RESOURCE_SYMBOLS[resource]}</span>
                  <b>{game.bank[resource]}</b>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </main>

      <footer className="cg-dock">
        {demo ? (
          <div className="cg-dock-inner cg-dock-demo">
            <p className="cg-status-note">
              Vista de muestra: así se ve una partida con el comercio global y el tablero al estilo Colonist.
            </p>
          </div>
        ) : (
          <GameActions
            room={room}
            mode={mode}
            selectedCard={selectedCard}
            busy={busy}
            onModeChange={setMode}
            onSelectedCard={selectDevelopmentCard}
            onAction={onAction}
            onOpenTrade={() => setTradeComposer("new")}
          />
        )}
      </footer>

      {!demo && tradeComposer && (
        <TradeComposer
          game={game}
          busy={busy}
          counter={tradeComposer === "counter"}
          onClose={() => setTradeComposer(null)}
          onAction={onAction}
        />
      )}

      {!demo && selectedCard?.type === "monopoly" && (
        <div className="cg-modal-backdrop" role="presentation">
          <section className="cg-modal" role="dialog" aria-modal="true" aria-labelledby="monopoly-title">
            <div className="cg-modal-head">
              <div>
                <p className="cg-modal-eyebrow">Carta de desarrollo</p>
                <h2 id="monopoly-title">Monopolio</h2>
              </div>
              <button className="cg-modal-close" type="button" aria-label="Cerrar" onClick={resetSelection}>
                ×
              </button>
            </div>
            <p className="cg-modal-note">
              Elegí un recurso. Todos los demás jugadores te entregarán las cartas de ese tipo que tengan.
            </p>
            <div className="cg-trade-cards" style={{ marginTop: 16 }}>
              {RESOURCES.map((resource) => (
                <button
                  key={resource}
                  type="button"
                  className={`cg-res-card is-${resource} is-picked`}
                  title={RESOURCE_NAMES[resource]}
                  disabled={busy}
                  onClick={() => playMonopoly(resource)}
                >
                  {RESOURCE_SYMBOLS[resource]}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {!demo && selectedCard?.type === "year-of-plenty" && (
        <div className="cg-modal-backdrop" role="presentation">
          <section className="cg-modal" role="dialog" aria-modal="true" aria-labelledby="plenty-title">
            <div className="cg-modal-head">
              <div>
                <p className="cg-modal-eyebrow">Carta de desarrollo</p>
                <h2 id="plenty-title">Año de la abundancia</h2>
              </div>
              <button className="cg-modal-close" type="button" aria-label="Cerrar" onClick={resetSelection}>
                ×
              </button>
            </div>
            <p className="cg-modal-note">
              Elegí {requiredPlentyCards} recurso{requiredPlentyCards === 1 ? "" : "s"} del banco.
              Seleccionados: {plentyResources.length}/{requiredPlentyCards}.
            </p>
            <div className="cg-trade-cards" style={{ marginTop: 16 }}>
              {RESOURCES.map((resource) => {
                const selectedCount = plentyResources.filter((candidate) => candidate === resource).length;
                return (
                  <button
                    key={resource}
                    type="button"
                    className={`cg-res-card is-${resource} ${selectedCount > 0 ? "is-picked" : ""}`}
                    title={`Banco: ${game.bank[resource]}`}
                    disabled={busy || game.bank[resource] === 0}
                    onClick={() => togglePlentyResource(resource)}
                  >
                    {RESOURCE_SYMBOLS[resource]}
                    {selectedCount > 0 && <span className="cg-res-count">{selectedCount}</span>}
                  </button>
                );
              })}
            </div>
            <div className="cg-modal-actions">
              <button
                className="cg-button is-neutral"
                type="button"
                disabled={plentyResources.length === 0}
                onClick={() => setPlentyResources((current) => current.slice(0, -1))}
              >
                Deshacer
              </button>
              <button className="cg-button is-neutral" type="button" onClick={resetSelection}>
                Cancelar
              </button>
              <button
                className="cg-button is-accept"
                type="button"
                disabled={busy || plentyResources.length !== requiredPlentyCards || requiredPlentyCards === 0}
                onClick={playYearOfPlenty}
              >
                Tomar recursos
              </button>
            </div>
          </section>
        </div>
      )}

      {!demo && pendingRobberHexId && (
        <div className="cg-modal-backdrop" role="presentation">
          <section className="cg-modal" role="dialog" aria-modal="true" aria-labelledby="victim-title">
            <div className="cg-modal-head">
              <div>
                <p className="cg-modal-eyebrow">Ladrón en {robberTargetName}</p>
                <h2 id="victim-title">Elegí a quién robar</h2>
              </div>
              <button className="cg-modal-close" type="button" aria-label="Cerrar" onClick={() => setPendingRobberHexId(null)}>
                ×
              </button>
            </div>
            <p className="cg-modal-note">Hay varios rivales con construcciones junto a este territorio.</p>
            <div className="cg-offer-actions" style={{ paddingLeft: 0, paddingRight: 0 }}>
              {eligibleVictims.map((player) => (
                <button
                  key={player.id}
                  className="cg-button is-neutral"
                  type="button"
                  disabled={busy}
                  onClick={() => void submitRobberMove(pendingRobberHexId, player.id)}
                >
                  {player.name} · {player.resourceCardCount} recursos
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      <span className="sr-only" aria-live="polite">
        {robberTargetName ? `Territorio seleccionado ${robberTargetName}` : ""}
      </span>
    </div>
  );
}

function PlayerPanel({
  player,
  room,
  self = false,
  totalPoints,
  longestRoad,
  largestArmy,
}: {
  player: PlayerPublicView;
  room: RoomSnapshot;
  self?: boolean;
  totalPoints?: number;
  longestRoad: boolean;
  largestArmy: boolean;
}) {
  const lobbyPlayer = room.players.find((candidate) => candidate.id === player.id);
  const points = self ? totalPoints ?? player.publicVictoryPoints : player.publicVictoryPoints;
  return (
    <article
      className={`cg-player ${player.isCurrentPlayer ? "is-current" : ""} ${self ? "is-self" : ""} ${
        lobbyPlayer && !lobbyPlayer.online ? "is-offline" : ""
      }`}
    >
      <span className="cg-player-avatar" style={{ backgroundColor: player.color }}>
        {player.name.slice(0, 2).toUpperCase()}
      </span>
      <div className="cg-player-body">
        <div className="cg-player-top">
          <strong className="cg-player-name">
            {player.name}
            {self ? " (vos)" : ""}
          </strong>
          <span className="cg-vp">🏅 {points}</span>
        </div>
        <div className="cg-player-meta">
          <span>
            🎴 <b>{player.resourceCardCount}</b>
          </span>
          <span>
            🃏 <b>{player.developmentCardCount}</b>
          </span>
          <span>
            ⚔ <b>{player.playedKnights}</b>
          </span>
          <span>
            🛤 <b>{player.roadsBuilt}</b>
          </span>
          {lobbyPlayer && !lobbyPlayer.online && <span className="cg-player-offline-dot">Desconectado</span>}
        </div>
      </div>
      {(longestRoad || largestArmy) && (
        <div className="cg-badges">
          {longestRoad && <span className="cg-badge cg-badge-road">Camino</span>}
          {largestArmy && <span className="cg-badge cg-badge-army">Ejército</span>}
        </div>
      )}
    </article>
  );
}

const emptyLegalPlacements = {
  settlementVertexIds: [] as string[],
  roadIds: [] as string[],
  freeRoadIds: [] as string[],
  cityVertexIds: [] as string[],
  tradeRatios: { wood: 4, brick: 4, sheep: 4, wheat: 4, ore: 4 },
  robberHexIds: [] as string[],
};
