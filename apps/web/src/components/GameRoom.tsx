import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { RESOURCES } from "@catan/engine";
import type {
  HeldDevelopmentCard,
  PlayerGameView,
  PlayerPublicView,
  Resource,
} from "@catan/engine";
import BoardSvg, { type BoardMode } from "./BoardSvg";
import FeedPanel from "./FeedPanel";
import GameActions from "./GameActions";
import GameStats from "./GameStats";
import { Clock, Crown, Landmark, LogOut, Settings, UserPlus } from "lucide-react";
import { RESOURCE_NAMES, TradeComposer, TradeOfferPanel } from "./TradePanels";
import {
  BANK_FILE,
  DEV_CARD_BACK_FILE,
  DEV_CARD_FILES,
  pieceFile,
  RESOURCE_CARD_FILES,
} from "../assets";
import {
  CG_BUTTON_ACCEPT,
  CG_BUTTON_NEUTRAL,
  CG_BUTTON_REJECT,
  MODAL,
  MODAL_ACTIONS,
  MODAL_BACKDROP,
  WOOD_BACKGROUND,
} from "../ui";
import type { ChatMessage, GameActionPayload, GameEvent, RoomSnapshot } from "../model";

interface GameRoomProps {
  room: RoomSnapshot;
  messages: ChatMessage[];
  events: GameEvent[];
  busy: boolean;
  onAction: (action: GameActionPayload) => Promise<void>;
  onSendMessage: (body: string) => Promise<void>;
  onRequestPause: (mode: "pause" | "resume") => Promise<void>;
  onVotePause: (approve: boolean) => Promise<void>;
  onCancelPauseRequest: () => Promise<void>;
  onLeave: () => void;
  onCopyInvite: () => void;
}

const MODAL_EYEBROW = "text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#a4844f]";
const MODAL_TITLE = "mt-1 font-display text-[22px] font-black text-[#4a2c12]";
const MODAL_CLOSE = "border-0 bg-transparent text-[22px] leading-none text-[#8b8271]";
const MODAL_NOTE = "mt-2 text-xs leading-[1.5] text-ink-soft";

export default function GameRoom({
  room,
  messages,
  events,
  busy,
  onAction,
  onSendMessage,
  onRequestPause,
  onVotePause,
  onCancelPauseRequest,
  onLeave,
  onCopyInvite,
}: GameRoomProps) {
  const game = room.game!;
  const paused = room.pausedAt !== null;
  const pauseRequest = room.pauseRequest;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [mode, setMode] = useState<BoardMode>(null);
  const [selectedCard, setSelectedCard] = useState<HeldDevelopmentCard | null>(null);
  const [selectedRoadIds, setSelectedRoadIds] = useState<string[]>([]);
  const [plentyResources, setPlentyResources] = useState<Resource[]>([]);
  const [tradeComposer, setTradeComposer] = useState<null | "new" | "counter">(null);

  const isMyTurn = game.currentPlayerId === room.selfPlayerId;
  const currentPlayer = game.players.find((player) => player.id === game.currentPlayerId);
  const currentIsBot = room.players.some(
    (player) => player.id === game.currentPlayerId && player.isBot,
  );
  const offer = game.activeTrade;
  const pendingVictim = game.pendingRobberVictim;
  const eligibleVictims = pendingVictim
    ? pendingVictim.victimIds
        .map((victimId) => game.players.find((player) => player.id === victimId))
        .filter((player): player is NonNullable<typeof player> => player !== undefined)
    : [];

  const resetSelection = () => {
    setMode(null);
    setSelectedCard(null);
    setSelectedRoadIds([]);
    setPlentyResources([]);
  };

  const handleHexClick = (hexId: string) => {
    if (paused || game.phase !== "robber" || !isMyTurn) return;
    void onAction({ type: "move-robber", hexId, victimId: null }).then(resetSelection);
  };

  const chooseVictim = (victimId: string) => {
    if (paused) return;
    void onAction({ type: "choose-robber-victim", victimId }).then(resetSelection);
  };

  const handleVertexClick = (vertexId: string) => {
    if (paused || !isMyTurn) return;
    if (game.phase === "setup-settlement") {
      void onAction({ type: "place-setup-settlement", vertexId }).then(resetSelection);
    } else if (mode === "settlement") {
      void onAction({ type: "build-settlement", vertexId }).then(resetSelection);
    } else if (mode === "city") {
      void onAction({ type: "build-city", vertexId }).then(resetSelection);
    }
  };

  const handleEdgeClick = (edgeId: string) => {
    if (paused || !isMyTurn) return;
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
    if (!card) {
      setSelectedCard(null);
      return;
    }
    if (card.type === "knight") {
      void onAction({ type: "play-knight", cardId: card.id }).then(resetSelection);
      return;
    }
    setSelectedCard(card);
    setSelectedRoadIds([]);
    setPlentyResources([]);
    setMode(card.type === "road-building" ? "free-road" : null);
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

  const robberTargetName = pendingVictim?.hexId;
  const requiredPlentyCards = Math.min(2, RESOURCES.reduce((sum, resource) => sum + game.bank[resource], 0));
  const otherPlayers = game.players.filter((player) => player.id !== room.selfPlayerId);
  const selfPlayer = game.players.find((player) => player.id === room.selfPlayerId);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (room.turnDeadlineAt === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [room.turnDeadlineAt]);
  const remainingMs = room.turnDeadlineAt !== null ? Math.max(0, room.turnDeadlineAt - now) : null;
  const alarmActive =
    isMyTurn &&
    game.phase !== "finished" &&
    game.phase !== "awaiting-roll" &&
    remainingMs !== null &&
    remainingMs <= 8_000;

  const [flyingCards, setFlyingCards] = useState<
    Array<{ id: string; resource: Resource; from: { x: number; y: number }; to: { x: number; y: number }; delay: number }>
  >([]);
  const previousCountsRef = useRef<Record<string, number> | null>(null);

  useEffect(() => {
    const counts: Record<string, number> = {};
    for (const player of game.players) counts[player.id] = player.resourceCardCount;
    const previousCounts = previousCountsRef.current;
    previousCountsRef.current = counts;

    const roll = game.lastRoll;
    if (!roll || roll.total === 7 || !previousCounts) return;

    const produced = computeProduction(game, roll.total);
    const gainedByPlayer: Record<string, number> = {};
    const isProduction = game.players.every((player) => {
      const expected = produced[player.id]?.length ?? 0;
      const actual = (counts[player.id] ?? 0) - (previousCounts[player.id] ?? 0);
      gainedByPlayer[player.id] = actual;
      return actual === expected;
    });
    if (!isProduction) return;

    const bankElement = document.getElementById("bank-panel");
    if (!bankElement) return;
    const bankRect = bankElement.getBoundingClientRect();
    const flights: Array<{
      id: string;
      resource: Resource;
      from: { x: number; y: number };
      to: { x: number; y: number };
      delay: number;
    }> = [];

    for (const player of game.players) {
      const gained = gainedByPlayer[player.id] ?? 0;
      if (gained <= 0) continue;
      const target = document.getElementById(`player-card-${player.id}`);
      if (!target) continue;
      const targetRect = target.getBoundingClientRect();
      const resources = produced[player.id] ?? [];
      for (let index = 0; index < gained; index += 1) {
        flights.push({
          id: `${player.id}-${roll.dice.join("-")}-${index}`,
          resource: resources[index] ?? resources[0] ?? "wood",
          from: { x: bankRect.left + bankRect.width / 2, y: bankRect.top + bankRect.height / 2 },
          to: { x: targetRect.left + targetRect.width / 2, y: targetRect.top + targetRect.height / 2 },
          delay: index * 220,
        });
      }
    }

    if (flights.length === 0) return;
    setFlyingCards(flights);
    const total = 1_900 + Math.max(...flights.map((flight) => flight.delay));
    const timer = window.setTimeout(() => setFlyingCards([]), total);
    return () => window.clearTimeout(timer);
  }, [game.players, game.lastRoll]);

  useEffect(() => {
    if (!paused) return;
    setMode(null);
    setSelectedCard(null);
    setSelectedRoadIds([]);
    setPlentyResources([]);
    setTradeComposer(null);
  }, [paused]);

  const [awardToast, setAwardToast] = useState<{
    id: number;
    kind: "road" | "army";
    playerName: string;
    playerColor: string;
  } | null>(null);
  const previousAwardsRef = useRef<{ road: string | null; army: string | null }>({
    road: game.longestRoadHolderId,
    army: game.largestArmyHolderId,
  });

  useEffect(() => {
    const previous = previousAwardsRef.current;
    previousAwardsRef.current = {
      road: game.longestRoadHolderId,
      army: game.largestArmyHolderId,
    };
    const armyChanged =
      game.largestArmyHolderId !== null && game.largestArmyHolderId !== previous.army;
    const roadChanged =
      game.longestRoadHolderId !== null && game.longestRoadHolderId !== previous.road;
    const kind = armyChanged ? "army" : roadChanged ? "road" : null;
    if (!kind) return;

    const holderId = kind === "army" ? game.largestArmyHolderId : game.longestRoadHolderId;
    const holder = game.players.find((player) => player.id === holderId);
    setAwardToast({
      id: Date.now(),
      kind,
      playerName: holder?.name ?? "Un jugador",
      playerColor: holder?.color ?? "#d94b3d",
    });
    const timer = window.setTimeout(() => setAwardToast(null), 4_500);
    return () => window.clearTimeout(timer);
  }, [game.longestRoadHolderId, game.largestArmyHolderId, game.players]);

  const selfResourceCount = RESOURCES.reduce(
    (sum, resource) => sum + game.self.resources[resource],
    0,
  );

  const hint = (() => {
    if (game.phase === "finished") return null;
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
    if (game.phase === "robber-victim") {
      return isMyTurn ? "Elegí a quién robarle una carta." : "El jugador activo está eligiendo a quién robar.";
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
    <div
      className={`relative flex h-full w-full flex-col overflow-hidden bg-[#4a2e1c] ${WOOD_BACKGROUND} text-[#4a2c12]`}
    >
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
          {paused && (
            <span className="rounded-full border-2 border-[#7a5a3a] bg-[#3c2415] px-2.5 py-[2px] text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#ffd76a]">
              ⏸ En pausa
              {room.pauseRemainingMs !== null ? ` · ${formatClock(room.pauseRemainingMs)}` : ""}
            </span>
          )}
          {!paused && pauseRequest && (
            <span className="rounded-full border-2 border-[#7a5a3a] bg-[#3c2415] px-2.5 py-[2px] text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#e8d3a8]">
              Votación {pauseRequest.mode === "pause" ? "de pausa" : "de reanudación"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            className="inline-flex min-h-[30px] items-center gap-1.5 rounded-xl border-2 border-[#8a5a1e] bg-[#fdf6e3] px-2.5 font-display text-[11px] font-extrabold text-[#7a5320] shadow-[0_2px_0_#8a5a1e] transition enabled:hover:brightness-105 enabled:active:translate-y-0.5"
            type="button"
            onClick={onCopyInvite}
          >
            <UserPlus size={13} /> Invitar
          </button>
          <button
            className="inline-flex min-h-[30px] items-center gap-1.5 rounded-xl border-2 border-[#8a5a1e] bg-[#fdf6e3] px-2.5 font-display text-[11px] font-extrabold text-[#7a5320] shadow-[0_2px_0_#8a5a1e] transition enabled:hover:brightness-105 enabled:active:translate-y-0.5"
            type="button"
            onClick={onLeave}
          >
            <LogOut size={13} /> Salir
          </button>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[232px_minmax(0,1fr)_288px] gap-2 overflow-hidden p-2 max-[1180px]:grid-cols-[204px_minmax(0,1fr)_244px] max-[940px]:grid-cols-1 max-[940px]:grid-rows-[auto_minmax(280px,1fr)_minmax(150px,240px)]">
        <aside
          className="flex min-h-0 flex-col gap-1.5 overflow-x-hidden overflow-y-auto max-[940px]:flex-row max-[940px]:overflow-x-auto max-[940px]:overflow-y-hidden"
          aria-label="Jugadores"
        >
          <h2 className="font-display text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#e8d3a8] max-[940px]:hidden">
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

        <section
          className={`relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-[#8a5a1e] bg-gradient-to-b from-ocean-light to-ocean-deep shadow-[0_4px_0_rgba(30,16,6,0.35),inset_0_0_0_1px_rgba(255,255,255,0.12)] ${
            alarmActive ? "alarm-active" : ""
          }`}
        >
          <BoardSvg
            game={game}
            legal={room.legal}
            selfPlayerId={room.selfPlayerId}
            mode={mode}
            selectedRoadIds={selectedRoadIds}
            onVertexClick={handleVertexClick}
            onEdgeClick={handleEdgeClick}
            onHexClick={handleHexClick}
          />

          {alarmActive && (
            <div className="alarm-overlay pointer-events-none absolute inset-0 z-[4] rounded-2xl" />
          )}

          {game.phase !== "finished" && room.turnDeadlineAt !== null && (
            <TurnClock
              deadlineAt={room.turnDeadlineAt}
              totalMs={room.turnTimeLimitSeconds * 1000}
              isMyTurn={isMyTurn}
              paused={paused}
            />
          )}

          {paused && (
            <div className="absolute inset-0 z-[6] grid place-items-center bg-[#2a1810]/45">
              <span className="rounded-2xl border-2 border-[#c9a86a] bg-[#f7ecd4] px-5 py-2.5 font-display text-base font-extrabold text-[#4a2c12] shadow-[0_4px_0_rgba(74,44,18,0.35)]">
                ⏸ Partida en pausa
              </span>
            </div>
          )}

          {!paused && game.phase === "trade" && offer && (
            <TradeOfferPanel
              game={game}
              selfPlayerId={room.selfPlayerId}
              busy={busy}
              respondDeadlineAt={room.tradeRespondDeadlineAt}
              onAction={onAction}
              onCounter={() => setTradeComposer("counter")}
            />
          )}

          {hint && (
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

            </div>
          )}

          {game.phase === "finished" && (
            <div className="absolute inset-0 z-40 grid place-items-center bg-[#2a1810]/70">
              <div className="rounded-3xl border-2 border-[#c9a86a] bg-[#f7ecd4] px-8 py-5 text-center shadow-[0_8px_0_rgba(74,44,18,0.35),0_18px_50px_rgba(5,22,36,0.45)]">
                <h2 className="font-display text-[26px] font-extrabold text-[#4a2c12]">
                  {game.winnerId === room.selfPlayerId
                    ? "¡Ganaste la partida!"
                    : `Ganó ${game.players.find((player) => player.id === game.winnerId)?.name ?? "un jugador"}`}
                </h2>
                <p className="mt-1.5 text-[13px] font-semibold text-[#8a6a3a]">
                  10 puntos de victoria
                </p>
                <button
                  className={`${CG_BUTTON_ACCEPT} mt-3`}
                    type="button"
                  onClick={() => setStatsOpen(true)}
                >
                  📊 Ver estadísticas
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="flex min-h-0 flex-col gap-2 overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              <button
                type="button"
                className={`inline-flex min-h-[30px] w-full items-center justify-center gap-1.5 rounded-xl border-2 font-display text-[11px] font-extrabold shadow-[0_2px_0_#8a5a1e] transition enabled:hover:brightness-105 ${
                  settingsOpen
                    ? "border-[#8a5a1e] bg-[#ffe9b8] text-[#7a5320]"
                    : "border-[#8a5a1e] bg-[#fdf6e3] text-[#7a5320]"
                }`}
                title="Configuración de la partida"
                aria-expanded={settingsOpen}
                onClick={() => setSettingsOpen((open) => !open)}
              >
                <Settings size={13} /> Configuración
              </button>
              {paused && (
                <span className="rounded-full border-2 border-[#7a5a3a] bg-[#3c2415] px-2 py-[3px] text-[9px] font-extrabold uppercase tracking-[0.08em] text-[#ffd76a]">
                  ⏸ En pausa
                </span>
              )}
              {!paused && pauseRequest && (
                <span className="rounded-full border-2 border-[#e3cfa5] bg-[#fffaf0] px-2 py-[3px] text-[9px] font-extrabold uppercase tracking-[0.08em] text-[#b08a4a]">
                  Votación en curso
                </span>
              )}
          </div>

          {settingsOpen && (
            <section
              className="shrink-0 rounded-2xl border-2 border-[#c9a86a] bg-[#f7ecd4] p-2.5 shadow-[0_4px_0_rgba(74,44,18,0.25)]"
              aria-label="Configuración"
            >
              <h2 className="font-display text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#a08a5e]">
                Pausa de la partida
              </h2>
              {pauseRequest ? (
                <>
                  <p className="mt-1 text-[11px] font-semibold text-[#8a6a3a]">
                    {pauseRequest.mode === "pause"
                      ? "Votación para pausar: se necesita el voto de todos."
                      : "Votación para reanudar: se necesita el voto de todos."}
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {room.players.map((player) => {
                      const voted = pauseRequest.votes[player.id] === true;
                      return (
                        <li
                          key={player.id}
                          className={`rounded-full border-2 px-2 py-[2px] text-[10px] font-extrabold ${
                            voted
                              ? "border-[#8fae5a] bg-[#eef4dc] text-[#4a6b28]"
                              : "border-[#e3cfa5] bg-[#fffaf0] text-[#b08a4a]"
                          }`}
                        >
                          {voted ? "✓" : "…"} {player.name}
                        </li>
                      );
                    })}
                  </ul>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {pauseRequest.votes[room.selfPlayerId] !== true && (
                      <>
                        <button
                          className={CG_BUTTON_ACCEPT}
                          type="button"
                          disabled={busy}
                          onClick={() => void onVotePause(true)}
                        >
                          Aceptar
                        </button>
                        <button
                          className={CG_BUTTON_REJECT}
                          type="button"
                          disabled={busy}
                          onClick={() => void onVotePause(false)}
                        >
                          Rechazar
                        </button>
                      </>
                    )}
                    {(pauseRequest.requestedBy === room.selfPlayerId ||
                      room.hostPlayerId === room.selfPlayerId) && (
                      <button
                        className={CG_BUTTON_NEUTRAL}
                        type="button"
                        disabled={busy}
                        onClick={() => void onCancelPauseRequest()}
                      >
                        Cancelar propuesta
                      </button>
                    )}
                  </div>
                </>
              ) : paused ? (
                <>
                  <p className="mt-1 text-[11px] font-semibold text-[#8a6a3a]">
                    La partida está pausada y el tiempo del turno quedó congelado
                    {room.pauseRemainingMs !== null
                      ? ` (quedaban ${formatDuration(room.pauseRemainingMs)})`
                      : ""}
                    . Se necesita el voto de todos para reanudar.
                  </p>
                  <button
                    className={`${CG_BUTTON_ACCEPT} mt-2.5`}
                    type="button"
                    disabled={busy}
                    onClick={() => void onRequestPause("resume")}
                  >
                    Proponer reanudación
                  </button>
                </>
              ) : (
                <>
                  <p className="mt-1 text-[11px] font-semibold text-[#8a6a3a]">
                    Se envía una votación a todos los jugadores. Si todos aceptan, la partida se
                    pausa y el tiempo del turno se detiene.
                  </p>
                  <button
                    className={`${CG_BUTTON_ACCEPT} mt-2.5`}
                    type="button"
                    disabled={busy}
                    onClick={() => void onRequestPause("pause")}
                  >
                    Proponer pausa
                  </button>
                </>
              )}
            </section>
          )}

          <FeedPanel
            messages={messages}
            events={events}
            disabled={busy}
            onSend={onSendMessage}
          />
          <section
            id="bank-panel"
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
        <GameActions
          room={room}
          mode={mode}
          selectedCard={selectedCard}
          busy={busy || paused}
          onModeChange={setMode}
          onSelectedCard={selectDevelopmentCard}
          onAction={onAction}
          onOpenTrade={() => setTradeComposer("new")}
        />
      </footer>

      {tradeComposer && !paused && (
        <TradeComposer
          game={game}
          busy={busy}
          counter={tradeComposer === "counter"}
          tradeRatios={room.legal.tradeRatios}
          onClose={() => setTradeComposer(null)}
          onAction={onAction}
        />
      )}

      {selectedCard?.type === "monopoly" && (
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

      {selectedCard?.type === "year-of-plenty" && (
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

      {pendingVictim && isMyTurn && (
        <div className={MODAL_BACKDROP} role="presentation">
          <section className={MODAL} role="dialog" aria-modal="true" aria-labelledby="victim-title">
            <div className="flex items-start justify-between gap-2.5">
              <div>
                <p className={MODAL_EYEBROW}>Ladrón en {robberTargetName}</p>
                <h2 id="victim-title" className={MODAL_TITLE}>
                  Elegí a quién robar
                </h2>
              </div>
            </div>
            <p className={MODAL_NOTE}>
              Hay varios rivales con construcciones junto a este territorio. Si no elegís, se
              resuelve al azar.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
              {eligibleVictims.map((player) => (
                <button
                  key={player.id}
                  className={CG_BUTTON_NEUTRAL}
                  type="button"
                  disabled={busy}
                  onClick={() => chooseVictim(player.id)}
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

      {awardToast && (
        <div
          key={awardToast.id}
          className="pointer-events-none fixed left-1/2 top-14 z-[110] -translate-x-1/2 animate-[toast-pop_0.45s_ease-out] rounded-2xl border-2 border-[#c9a86a] bg-[#f7ecd4] px-4 py-2 text-center shadow-[0_6px_0_rgba(74,44,18,0.35),0_14px_36px_rgba(0,0,0,0.4)]"
          role="status"
        >
          <span className="flex items-center justify-center gap-2">
            {awardToast.kind === "army" ? (
              <img className="h-8 w-auto" src={DEV_CARD_FILES.knight} alt="" />
            ) : (
              <img
                className="h-5 w-auto"
                src={pieceFile("road", awardToast.playerColor)}
                alt=""
              />
            )}
            <span className="font-display text-sm font-extrabold text-[#4a2c12]">
              {awardToast.kind === "army" ? "¡Ejército más grande!" : "¡Camino más largo!"}
            </span>
          </span>
          <p className="mt-0.5 text-[11px] font-bold text-[#8a6a3a]">
            {awardToast.playerName} gana 2 puntos de victoria.
          </p>
        </div>
      )}

      {statsOpen && game.phase === "finished" && (
        <GameStats
          game={game}
          turnStats={room.turnStats}
          selfPlayerId={room.selfPlayerId}
          onClose={() => setStatsOpen(false)}
        />
      )}

      {flyingCards.length > 0 && (
        <div className="pointer-events-none fixed inset-0 z-[80]">
          {flyingCards.map((card) => (
            <img
              key={card.id}
              className="absolute h-11 w-auto animate-[card-fly_1.7s_ease-in-out_forwards] drop-shadow-[0_4px_8px_rgba(0,0,0,0.4)]"
              style={
                {
                  left: card.from.x,
                  top: card.from.y,
                  animationDelay: `${card.delay}ms`,
                  "--fly-x": `${card.to.x - card.from.x}px`,
                  "--fly-y": `${card.to.y - card.from.y}px`,
                } as CSSProperties
              }
              src={RESOURCE_CARD_FILES[card.resource]}
              alt=""
            />
          ))}
        </div>
      )}
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
      id={`player-card-${player.id}`}
      className={`group relative rounded-2xl border-2 px-2.5 py-2 shadow-[0_3px_0_rgba(74,44,18,0.25)] max-[940px]:min-w-[190px] ${tone} ${
        offline ? "opacity-70" : ""
      } ${player.isCurrentPlayer ? "turn-glow" : ""}`}
      title={`Ritmo de juego de ${player.name}: ${averageLabel} (${statsDetail}) · Camino más largo: ${player.longestRoadLength}`}
    >
      {player.isCurrentPlayer && (
        <span
          className="absolute -right-1 top-1/2 h-9 w-1.5 -translate-y-1/2 animate-pulse rounded-full bg-gradient-to-b from-[#e8b25a] to-[#c98a34] shadow-[0_0_10px_rgba(217,164,74,0.95)]"
          title="Es su turno"
        />
      )}
      <div className="flex items-center gap-2">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-[#8a5a1e] font-display text-[13px] font-extrabold text-white shadow-[0_2px_0_rgba(74,44,18,0.35)]"
          style={{ backgroundColor: player.color }}
        >
          {player.name.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1.5">
            <strong className="block truncate font-display text-[15px] font-extrabold text-[#4a2c12]">
              {isBot ? "🤖 " : ""}
              {player.name}
              {self ? " (vos)" : ""}
            </strong>
            <span className="flex shrink-0 items-center gap-1">
              {player.isCurrentPlayer && (
                <span className="animate-pulse rounded-full bg-[#e8b25a] px-1.5 py-px font-display text-[8px] font-black uppercase tracking-[0.06em] text-[#4a2c12] shadow-[0_1px_0_#8a5a1e]">
                  turno
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full border-2 border-[#d9a44a] bg-[#ffe9b8] px-1.5 py-px text-[12px] font-black text-[#7a5320]">
                <Crown size={13} />
                {points}
              </span>
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2.5 text-[13px] font-bold text-[#7a5320]">
            <span
              className={`inline-flex items-center gap-1 ${
                player.resourceCardCount >= 8 ? "text-[#c92a2a]" : ""
              }`}
              title={
                player.resourceCardCount >= 8
                  ? "8 o más cartas: si sale un 7 tiene que descartar"
                  : "Cartas de recurso"
              }
            >
              <img className="h-5 w-auto" src={BANK_FILE} alt="" />
              {player.resourceCardCount}
            </span>
            <span className="inline-flex items-center gap-1" title="Cartas de desarrollo">
              <img className="h-5 w-auto" src={DEV_CARD_BACK_FILE} alt="" />
              {player.developmentCardCount}
            </span>
            <span className="inline-flex items-center gap-1" title="Caballeros jugados">
              <img className="h-5 w-auto" src={DEV_CARD_FILES.knight} alt="" />
              {player.playedKnights}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2.5 text-[11px] font-semibold text-[#a08a5e]">
            <span className="inline-flex items-center gap-1" title="Caminos construidos">
              <img className="h-4 w-auto" src={pieceFile("road", player.color)} alt="" />
              {player.roadsBuilt}
            </span>
            <span className="inline-flex items-center gap-1" title="Poblados construidos">
              <img className="h-4 w-auto" src={pieceFile("settlement", player.color)} alt="" />
              {player.settlementsBuilt}
            </span>
            <span className="inline-flex items-center gap-1" title="Ciudades construidas">
              <img className="h-4 w-auto" src={pieceFile("city", player.color)} alt="" />
              {player.citiesBuilt}
            </span>
            {offline && <span className="font-bold text-[#a4462f]">Desconectado</span>}
          </div>
        </div>
      </div>
      {(longestRoad || largestArmy) && (
        <div className="mt-1 flex flex-wrap gap-1">
          {longestRoad && (
            <span className="inline-flex animate-[award-pop_0.5s_ease-out] items-center gap-1 rounded-full bg-[#e4f0cf] px-1.5 py-0.5 text-[9px] font-extrabold text-[#4a6b28]">
              <img className="h-3 w-auto" src={pieceFile("road", player.color)} alt="" /> Camino más
              largo · {player.longestRoadLength}
            </span>
          )}
          {largestArmy && (
            <span className="inline-flex animate-[award-pop_0.5s_ease-out] items-center gap-1 rounded-full bg-[#f6dcd6] px-1.5 py-0.5 text-[9px] font-extrabold text-[#8a3a22]">
              <img className="h-3.5 w-auto" src={DEV_CARD_FILES.knight} alt="" /> Ejército más
              grande
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

function computeProduction(game: PlayerGameView, roll: number): Record<string, Resource[]> {
  const produced: Record<string, Resource[]> = {};
  for (const hex of game.board.hexes) {
    if (hex.number !== roll || hex.id === game.robberHexId) continue;
    const terrain = hex.terrain;
    if (terrain === "desert") continue;
    for (const vertex of game.board.vertices) {
      if (!vertex.hexIds.includes(hex.id)) continue;
      const owner = game.players.find(
        (player) =>
          player.settlementVertexIds.includes(vertex.id) ||
          player.cityVertexIds.includes(vertex.id),
      );
      if (!owner) continue;
      const amount = owner.cityVertexIds.includes(vertex.id) ? 2 : 1;
      const list = produced[owner.id] ?? (produced[owner.id] = []);
      for (let index = 0; index < amount; index += 1) list.push(terrain);
    }
  }
  return produced;
}

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${String(seconds % 60).padStart(2, "0")} s`;
}

function TurnClock({
  deadlineAt,
  totalMs,
  isMyTurn,
  paused,
}: {
  deadlineAt: number;
  totalMs: number;
  isMyTurn: boolean;
  paused: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [deadlineAt]);

  const remainingMs = Math.max(0, deadlineAt - now);
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const label = `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
  const ratio = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
  const urgent = remainingMs <= 10_000;
  const warning = remainingMs <= 25_000;
  const tone = urgent
    ? { text: "text-[#a4462f]", ring: "#d64545", border: "border-[#a4462f]", bg: "bg-[#f6dcd6]" }
    : warning
      ? { text: "text-[#8a6a1a]", ring: "#e0a53c", border: "border-[#d9a44a]", bg: "bg-[#ffe9b8]" }
      : { text: "text-[#4a6b28]", ring: "#7fb04a", border: "border-[#8a9a5a]", bg: "bg-[#eef4dc]" };
  const circumference = 2 * Math.PI * 16;

  return (
    <div
      className={`pointer-events-none absolute right-3 top-3 z-[8] flex items-center gap-2.5 rounded-2xl border-2 px-3 py-1.5 shadow-[0_4px_0_rgba(74,44,18,0.3),0_10px_24px_rgba(10,20,30,0.3)] ${tone.border} ${tone.bg} ${
        urgent && isMyTurn && !paused ? "animate-pulse" : ""
      } ${paused ? "opacity-80" : ""}`}
      title="Tiempo restante del turno"
    >
      <span className="relative grid h-11 w-11 shrink-0 place-items-center">
        <svg viewBox="0 0 40 40" className="absolute inset-0 h-full w-full -rotate-90">
          <circle cx="20" cy="20" r="16" fill="none" stroke="#e3cfa5" strokeWidth="5" />
          <circle
            cx="20"
            cy="20"
            r="16"
            fill="none"
            stroke={tone.ring}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${ratio * circumference} ${circumference}`}
          />
        </svg>
        <Clock size={15} className={tone.text} />
      </span>
      <span className="flex flex-col">
        <span
          className={`font-display text-[26px] font-black leading-none tabular-nums ${tone.text}`}
        >
          {paused ? "⏸" : label}
        </span>
        <span className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-[#8a6a3a]">
          {isMyTurn ? "Tu tiempo" : "Tiempo del turno"}
        </span>
      </span>
    </div>
  );
}

