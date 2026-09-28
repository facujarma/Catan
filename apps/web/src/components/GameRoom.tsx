import { useEffect, useState } from "react";
import { RESOURCES } from "@catan/engine";
import type { HeldDevelopmentCard, PlayerPublicView, Resource } from "@catan/engine";
import BoardSvg, { type BoardMode } from "./BoardSvg";
import FeedPanel from "./FeedPanel";
import GameActions from "./GameActions";
import {
  Castle,
  Crown,
  Home,
  Landmark,
  Layers,
  LogOut,
  Route,
  ScrollText,
  Swords,
  UserPlus,
} from "lucide-react";
import { RESOURCE_NAMES, TradeComposer, TradeOfferPanel } from "./TradePanels";
import { RESOURCE_CARD_FILES } from "../assets";
import { CG_BUTTON_ACCEPT, CG_BUTTON_NEUTRAL, MODAL, MODAL_ACTIONS, MODAL_BACKDROP } from "../ui";
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

const MODAL_EYEBROW = "text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#a4844f]";
const MODAL_TITLE = "mt-1 text-[22px] font-black text-[#2c3c30]";
const MODAL_CLOSE = "border-0 bg-transparent text-[22px] leading-none text-[#8b8271]";
const MODAL_NOTE = "mt-2 text-xs leading-[1.5] text-ink-soft";

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
  const currentIsBot = room.players.some(
    (player) => player.id === game.currentPlayerId && player.isBot,
  );
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
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-gradient-to-b from-ocean-light via-ocean to-ocean-deep text-ink">
      <header className="z-20 flex shrink-0 items-center justify-between gap-2.5 border-b-2 border-[#8a5a1e] bg-[#4a2e1c]/95 px-3 py-1.5 shadow-[0_3px_0_rgba(30,16,6,0.35)]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg border-2 border-[#8a5a1e] bg-gradient-to-b from-[#e8b25a] to-[#c98a34] text-sm shadow-[0_2px_0_#8a5a1e]">
            🎲
          </span>
          <span className="font-display text-lg font-extrabold tracking-[0.12em] text-[#ffe9b8]">
            CATAN
          </span>
          <span className="rounded-full border-2 border-[#8a5a1e] bg-[#fdf6e3] px-2.5 py-px font-mono text-[11px] font-bold tracking-[0.18em] text-[#7a5320]">
            {room.code}
          </span>
          <span
            className={`rounded-full border-2 px-2.5 py-px text-[10px] font-extrabold uppercase tracking-[0.08em] ${
              isMyTurn
                ? "border-[#8a5a1e] bg-[#ffe9b8] text-[#7a5320]"
                : "border-[#7a5a3a] bg-[#3c2415] text-[#e8d3a8]"
            }`}
          >
            {isMyTurn
              ? "Tu turno"
              : `Turno de ${currentIsBot ? "🤖 " : ""}${currentPlayer?.name ?? "…"}`}
          </span>
          {!demo && game.phase !== "finished" && room.turnDeadlineAt !== null && (
            <TurnTimer deadlineAt={room.turnDeadlineAt} />
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {!demo && (
            <button
              className="inline-flex min-h-[30px] items-center gap-1.5 rounded-xl border-2 border-[#8a5a1e] bg-[#fdf6e3] px-2.5 font-display text-[11px] font-extrabold text-[#7a5320] shadow-[0_2px_0_#8a5a1e] transition enabled:hover:brightness-105 enabled:active:translate-y-0.5"
              type="button"
              onClick={onCopyInvite}
            >
              <UserPlus size={13} /> Invitar
            </button>
          )}
          <button
            className="inline-flex min-h-[30px] items-center gap-1.5 rounded-xl border-2 border-[#8a5a1e] bg-[#fdf6e3] px-2.5 font-display text-[11px] font-extrabold text-[#7a5320] shadow-[0_2px_0_#8a5a1e] transition enabled:hover:brightness-105 enabled:active:translate-y-0.5"
            type="button"
            onClick={onLeave}
          >
            <LogOut size={13} /> {demo ? "Volver" : "Salir"}
          </button>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[232px_minmax(0,1fr)_288px] gap-2 overflow-hidden p-2 max-[1180px]:grid-cols-[204px_minmax(0,1fr)_244px] max-[940px]:grid-cols-1 max-[940px]:grid-rows-[auto_minmax(280px,1fr)_minmax(150px,240px)]">
        <aside
          className="flex min-h-0 flex-col gap-1.5 overflow-x-hidden overflow-y-auto max-[940px]:flex-row max-[940px]:overflow-x-auto max-[940px]:overflow-y-hidden"
          aria-label="Jugadores"
        >
          <h2 className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-white/80 max-[940px]:hidden">
            Jugadores
          </h2>
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

        <section className="relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-[14px] bg-gradient-to-b from-ocean-light to-ocean-deep shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12),0_6px_20px_rgba(7,30,48,0.25)]">
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
            <div className="absolute bottom-3 left-1/2 z-30 max-w-[min(560px,calc(100%-24px))] -translate-x-1/2 rounded-2xl border-2 border-[#8a5a1e] bg-[#4a2e1c]/95 px-3.5 py-1.5 text-center text-xs font-semibold text-[#ffe9b8] shadow-[0_4px_0_rgba(30,16,6,0.4)]">
              {hint}
              {selectedCard?.type === "road-building" && (
                <>
                  <button
                    className="ml-2.5 border-0 bg-transparent font-display font-extrabold text-[#ffd76a] underline disabled:opacity-50"
                    type="button"
                    disabled={busy || selectedRoadIds.length === 0}
                    onClick={playRoadBuilding}
                  >
                    Colocar
                  </button>
                  <button
                    className="ml-2.5 border-0 bg-transparent font-display font-extrabold text-[#ffd76a] underline disabled:opacity-50"
                    type="button"
                    onClick={resetSelection}
                  >
                    Cancelar
                  </button>
                </>
              )}
              {selectedCard?.type === "knight" && (
                <button
                  className="ml-2.5 border-0 bg-transparent font-display font-extrabold text-[#ffd76a] underline disabled:opacity-50"
                  type="button"
                  onClick={resetSelection}
                >
                  Cancelar
                </button>
              )}
            </div>
          )}

          {game.phase === "finished" && (
            <div className="absolute inset-0 z-40 grid place-items-center bg-[#082234]/[0.55]">
              <div className="rounded-2xl bg-paper-soft px-8 py-5 text-center shadow-[0_18px_50px_rgba(5,22,36,0.45)]">
                <h2 className="text-[26px] font-black text-[#2d5c33]">
                  {game.winnerId === room.selfPlayerId
                    ? "¡Ganaste la partida!"
                    : `Ganó ${game.players.find((player) => player.id === game.winnerId)?.name ?? "un jugador"}`}
                </h2>
                <p className="mt-1.5 text-[13px] text-ink-soft">10 puntos de victoria</p>
              </div>
            </div>
          )}
        </section>

        <aside className="flex min-h-0 flex-col gap-2 overflow-hidden">
          <FeedPanel
            messages={messages}
            events={events}
            disabled={busy || demo}
            onSend={onSendMessage}
          />
          <section
            className="shrink-0 rounded-2xl border-2 border-[#c9a86a] bg-[#f7ecd4] px-2.5 py-1.5 shadow-[0_4px_0_rgba(74,44,18,0.25)]"
            aria-label="Banco"
          >
            <div className="mb-1 flex items-center justify-between text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#a08a5e]">
              <span className="flex items-center gap-1.5">
                <Landmark size={13} />
                Banco
              </span>
              <span>Restantes</span>
            </div>
            <div className="flex gap-1">
              {RESOURCES.map((resource) => (
                <div
                  className="relative flex flex-1 items-center justify-center"
                  key={resource}
                  title={RESOURCE_NAMES[resource]}
                >
                  <img
                    className="h-9 w-auto drop-shadow-[0_2px_2px_rgba(0,0,0,0.25)]"
                    src={RESOURCE_CARD_FILES[resource]}
                    alt={RESOURCE_NAMES[resource]}
                    draggable={false}
                  />
                  <span className="absolute -bottom-1 right-0 grid h-[17px] min-w-[17px] place-items-center rounded-full border-2 border-[#f7ecd4] bg-[#274b66] text-[10px] font-black text-white">
                    {game.bank[resource]}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </main>

      <footer className="z-[25] shrink-0 px-2 pb-2">
        {demo ? (
          <div className="flex items-center justify-center rounded-2xl border-2 border-[#c9a86a] bg-[#f7ecd4] px-2.5 py-2 shadow-[0_4px_0_rgba(74,44,18,0.25)]">
            <p className="max-w-[560px] text-center text-[10px] font-semibold text-[#a08a5e]">
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
        <div className={MODAL_BACKDROP} role="presentation">
          <section className={MODAL} role="dialog" aria-modal="true" aria-labelledby="monopoly-title">
            <div className="flex items-start justify-between gap-2.5">
              <div>
                <p className={MODAL_EYEBROW}>Carta de desarrollo</p>
                <h2 id="monopoly-title" className={MODAL_TITLE}>
                  Monopolio
                </h2>
              </div>
              <button className={MODAL_CLOSE} type="button" aria-label="Cerrar" onClick={resetSelection}>
                ×
              </button>
            </div>
            <p className={MODAL_NOTE}>
              Elegí un recurso. Todos los demás jugadores te entregarán las cartas de ese tipo que tengan.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {RESOURCES.map((resource) => (
                <button
                  key={resource}
                  type="button"
                  className="relative inline-flex h-[60px] w-[43px] items-center justify-center rounded-[4px] transition outline outline-[3px] outline-offset-1 outline-catan-gold enabled:hover:-translate-y-0.5 disabled:opacity-50"
                  title={RESOURCE_NAMES[resource]}
                  disabled={busy}
                  onClick={() => playMonopoly(resource)}
                >
                  <img
                    className="h-full w-full drop-shadow-[0_2px_3px_rgba(0,0,0,0.28)]"
                    src={RESOURCE_CARD_FILES[resource]}
                    alt={RESOURCE_NAMES[resource]}
                    draggable={false}
                  />
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {!demo && selectedCard?.type === "year-of-plenty" && (
        <div className={MODAL_BACKDROP} role="presentation">
          <section className={MODAL} role="dialog" aria-modal="true" aria-labelledby="plenty-title">
            <div className="flex items-start justify-between gap-2.5">
              <div>
                <p className={MODAL_EYEBROW}>Carta de desarrollo</p>
                <h2 id="plenty-title" className={MODAL_TITLE}>
                  Año de la abundancia
                </h2>
              </div>
              <button className={MODAL_CLOSE} type="button" aria-label="Cerrar" onClick={resetSelection}>
                ×
              </button>
            </div>
            <p className={MODAL_NOTE}>
              Elegí {requiredPlentyCards} recurso{requiredPlentyCards === 1 ? "" : "s"} del banco.
              Seleccionados: {plentyResources.length}/{requiredPlentyCards}.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {RESOURCES.map((resource) => {
                const selectedCount = plentyResources.filter((candidate) => candidate === resource).length;
                return (
                  <button
                    key={resource}
                    type="button"
                    className={`relative inline-flex h-[60px] w-[43px] items-center justify-center rounded-[4px] transition disabled:opacity-50 ${
                      selectedCount > 0
                        ? "outline outline-[3px] outline-offset-1 outline-catan-gold"
                        : "enabled:hover:-translate-y-0.5"
                    }`}
                    title={`Banco: ${game.bank[resource]}`}
                    disabled={busy || game.bank[resource] === 0}
                    onClick={() => togglePlentyResource(resource)}
                  >
                    <img
                      className="h-full w-full drop-shadow-[0_2px_3px_rgba(0,0,0,0.28)]"
                      src={RESOURCE_CARD_FILES[resource]}
                      alt={RESOURCE_NAMES[resource]}
                      draggable={false}
                    />
                    {selectedCount > 0 && (
                      <span className="absolute -bottom-1.5 -right-1.5 grid h-[19px] min-w-[19px] place-items-center rounded-full border-2 border-paper-soft bg-[#274b66] text-[11px] font-black text-white">
                        {selectedCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className={MODAL_ACTIONS}>
              <button
                className={CG_BUTTON_NEUTRAL}
                type="button"
                disabled={plentyResources.length === 0}
                onClick={() => setPlentyResources((current) => current.slice(0, -1))}
              >
                Deshacer
              </button>
              <button className={CG_BUTTON_NEUTRAL} type="button" onClick={resetSelection}>
                Cancelar
              </button>
              <button
                className={CG_BUTTON_ACCEPT}
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
        <div className={MODAL_BACKDROP} role="presentation">
          <section className={MODAL} role="dialog" aria-modal="true" aria-labelledby="victim-title">
            <div className="flex items-start justify-between gap-2.5">
              <div>
                <p className={MODAL_EYEBROW}>Ladrón en {robberTargetName}</p>
                <h2 id="victim-title" className={MODAL_TITLE}>
                  Elegí a quién robar
                </h2>
              </div>
              <button
                className={MODAL_CLOSE}
                type="button"
                aria-label="Cerrar"
                onClick={() => setPendingRobberHexId(null)}
              >
                ×
              </button>
            </div>
            <p className={MODAL_NOTE}>Hay varios rivales con construcciones junto a este territorio.</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
              {eligibleVictims.map((player) => (
                <button
                  key={player.id}
                  className={CG_BUTTON_NEUTRAL}
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
  const offline = Boolean(lobbyPlayer && !lobbyPlayer.online);
  const isBot = Boolean(lobbyPlayer?.isBot);
  const stat = room.turnStats[player.id];
  const averageMs = stat && stat.turns > 0 ? stat.totalMs / stat.turns : null;
  const averageLabel =
    averageMs === null ? "Sin turnos registrados" : `${formatDuration(averageMs)} por turno`;
  const statsDetail =
    stat && stat.turns > 0
      ? `${stat.turns} ${stat.turns === 1 ? "turno" : "turnos"} · último ${formatDuration(stat.lastTurnMs)}`
      : "Todavía no jugó turnos";
  const tone = player.isCurrentPlayer
    ? "border-[#d9a44a] bg-[#fff3d6] ring-2 ring-[#d9a44a]/40"
    : self
      ? "border-[#c9a86a] bg-[#fdf6e3]"
      : "border-[#c9a86a] bg-[#f7ecd4]";

  return (
    <article
      className={`group relative rounded-2xl border-2 px-2.5 py-2 shadow-[0_3px_0_rgba(74,44,18,0.25)] max-[940px]:min-w-[190px] ${tone} ${
        offline ? "opacity-70" : ""
      }`}
      title={`Ritmo de juego de ${player.name}: ${averageLabel} (${statsDetail})`}
    >
      <div className="flex items-center gap-2">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-[#8a5a1e] font-display text-xs font-extrabold text-white shadow-[0_2px_0_rgba(74,44,18,0.35)]"
          style={{ backgroundColor: player.color }}
        >
          {player.name.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1.5">
            <strong className="block truncate font-display text-[13px] font-extrabold text-[#4a2c12]">
              {isBot ? "🤖 " : ""}
              {player.name}
              {self ? " (vos)" : ""}
            </strong>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border-2 border-[#d9a44a] bg-[#ffe9b8] px-1.5 py-px text-[11px] font-black text-[#7a5320]">
              <Crown size={11} /> {points}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2.5 text-[11px] font-bold text-[#7a5320]">
            <span className="inline-flex items-center gap-1" title="Cartas de recurso">
              <Layers size={13} />
              {player.resourceCardCount}
            </span>
            <span className="inline-flex items-center gap-1" title="Cartas de desarrollo">
              <ScrollText size={13} />
              {player.developmentCardCount}
            </span>
            <span className="inline-flex items-center gap-1" title="Caballeros jugados">
              <Swords size={13} />
              {player.playedKnights}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2.5 text-[10px] font-semibold text-[#a08a5e]">
            <span className="inline-flex items-center gap-1" title="Caminos construidos">
              <Route size={12} />
              {player.roadsBuilt}
            </span>
            <span className="inline-flex items-center gap-1" title="Poblados construidos">
              <Home size={12} />
              {player.settlementsBuilt}
            </span>
            <span className="inline-flex items-center gap-1" title="Ciudades construidas">
              <Castle size={12} />
              {player.citiesBuilt}
            </span>
            {offline && <span className="font-bold text-[#a4462f]">Desconectado</span>}
          </div>
        </div>
      </div>
      {(longestRoad || largestArmy) && (
        <div className="mt-1 flex flex-wrap gap-1">
          {longestRoad && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#e4f0cf] px-1.5 py-0.5 text-[9px] font-extrabold text-[#4a6b28]">
              <Route size={10} /> Camino más largo
            </span>
          )}
          {largestArmy && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#f6dcd6] px-1.5 py-0.5 text-[9px] font-extrabold text-[#8a3a22]">
              <Swords size={10} /> Ejército más grande
            </span>
          )}
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 z-10 hidden flex-col items-center justify-center gap-0.5 rounded-2xl bg-[#4a2e1c]/95 px-2 text-center group-hover:flex">
        <span className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-[#e8d3a8]">
          Ritmo de juego
        </span>
        <span className="font-display text-[12px] font-extrabold text-[#ffe9b8]">{averageLabel}</span>
        <span className="text-[9px] font-semibold text-[#d9bd8d]">{statsDetail}</span>
      </div>
    </article>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${String(seconds % 60).padStart(2, "0")} s`;
}

function TurnTimer({ deadlineAt }: { deadlineAt: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [deadlineAt]);

  const remainingMs = Math.max(0, deadlineAt - now);
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const urgent = remainingMs <= 10_000;
  const label = `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;

  return (
    <span
      className={`rounded-full px-2.5 py-[3px] font-mono text-[11px] font-bold ${
        urgent ? "bg-[#ffe1d9] text-[#9c3b28]" : "bg-[#dcecf7] text-[#1f4f6e]"
      }`}
      title="Tiempo restante del turno"
    >
      ⏱ {label}
    </span>
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
