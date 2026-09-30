import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { RESOURCES } from "@catan/engine";
import type { HeldDevelopmentCard, Resource, ResourceBundle } from "@catan/engine";
import { Dices, Eye, EyeOff, Handshake, Hourglass, Layers, Lock } from "lucide-react";
import type { BoardMode } from "./BoardSvg";
import type { GameActionPayload, RoomSnapshot } from "../model";
import { bundleTotal, canAfford, emptyBundle, RESOURCE_NAMES } from "./TradePanels";
import {
  DEV_CARD_BACK_FILE,
  DEV_CARD_FILES,
  PIRATE_ICON_FILE,
  pieceFile,
  RESOURCE_CARD_FILES,
  ROBBER_ICON_FILE,
} from "../assets";
import {
  CG_BUTTON_ACCEPT,
  CG_BUTTON_NEUTRAL,
  MODAL,
  MODAL_ACTIONS,
  MODAL_BACKDROP,
} from "../ui";

interface GameActionsProps {
  room: RoomSnapshot;
  mode: BoardMode;
  selectedCard: HeldDevelopmentCard | null;
  busy: boolean;
  onModeChange: (mode: BoardMode) => void;
  onSelectedCard: (card: HeldDevelopmentCard | null) => void;
  onAction: (action: GameActionPayload) => Promise<void>;
  onOpenTrade: () => void;
}

const CARD_NAMES: Record<HeldDevelopmentCard["type"], string> = {
  knight: "Caballero",
  "victory-point": "Punto de victoria",
  "road-building": "Construcción de caminos",
  "year-of-plenty": "Año de la abundancia",
  monopoly: "Monopolio",
};

const PHASE_LABEL: Record<string, string> = {
  "setup-settlement": "Colocá tu poblado inicial",
  "setup-road": "Colocá tu camino o barco inicial",
  "awaiting-roll": "Tirá los dados",
  discard: "Descartá por el siete",
  activate: "Ladrón o pirata",
  robber: "Movés al ladrón",
  "robber-victim": "Elegís a quién robar",
  pirate: "Movés al pirata",
  "pirate-victim": "Elegís a quién robar",
  gold: "Campos de oro",
  main: "Acciones",
  trade: "Comercio en curso",
  finished: "Partida terminada",
};

const DIE_PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function DieFace({ value, big = false }: { value: number; big?: boolean }) {
  const pips = DIE_PIPS[value] ?? [];
  return (
    <span
      className={`grid ${big ? "h-12 w-12" : "h-10 w-10"} grid-cols-3 grid-rows-3 place-items-center rounded-[9px] border-2 border-[#8a5a1e] bg-gradient-to-b from-white to-[#f3e7cf] p-[3px] shadow-[0_2px_0_#8a5a1e]`}
      title={`Dado: ${value}`}
      aria-label={`Dado: ${value}`}
    >
      {Array.from({ length: 9 }, (_, index) => (
        <span
          key={index}
          className={`${big ? "h-[7px] w-[7px]" : "h-[6px] w-[6px]"} rounded-full bg-[#4a2c12] ${pips.includes(index) ? "" : "opacity-0"}`}
        />
      ))}
    </span>
  );
}

function ResourceStack({
  resource,
  count,
  onClick,
}: {
  resource: Resource;
  count: number;
  onClick?: (() => void) | undefined;
}) {
  const individual = count < 3 ? count : 1;
  const content = (
    <span className="flex items-end gap-0.5">
      {Array.from({ length: individual }, (_, index) => (
        <span key={index} className="relative">
          <img
            className="h-11 w-auto drop-shadow-[0_2px_2px_rgba(0,0,0,0.3)]"
            src={RESOURCE_CARD_FILES[resource]}
            alt={RESOURCE_NAMES[resource]}
            draggable={false}
          />
          {count >= 3 && (
            <span className="absolute -bottom-1 -right-1 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-[#f7ecd4] bg-[#274b66] px-0.5 text-[10px] font-black text-white">
              ×{count}
            </span>
          )}
        </span>
      ))}
    </span>
  );

  if (!onClick) {
    return (
      <span
        className="flex items-end gap-0.5"
        title={`${count} ${RESOURCE_NAMES[resource].toLowerCase()}`}
      >
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      className="cursor-pointer rounded-lg transition enabled:hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a9793a]"
      title={`${count} ${RESOURCE_NAMES[resource].toLowerCase()} · tocar para comerciar`}
      onClick={onClick}
    >
      {content}
    </button>
  );
}

function ActionButton({
  icon,
  label,
  title,
  onClick,
  disabled,
  active = false,
  primary = false,
  count,
}: {
  icon: ReactNode;
  label: string;
  title: string;
  onClick: () => void;
  disabled: boolean;
  active?: boolean;
  primary?: boolean;
  count?: number;
}) {
  const tone = primary
    ? "border-[#8a5a1e] bg-gradient-to-b from-[#e8b25a] to-[#c98a34] text-[#4a2c12] shadow-[0_3px_0_#8a5a1e]"
    : active
      ? "border-[#d9a44a] bg-[#ffe9b8] text-[#4a2c12] shadow-[0_3px_0_#d9a44a]"
      : "border-[#c9a86a] bg-[#fdf6e3] text-[#7a5320] shadow-[0_3px_0_#c9a86a]";
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`relative flex h-[44px] w-[60px] shrink-0 flex-col items-center justify-center gap-0 rounded-xl border-2 px-0.5 transition ${tone} ${
        disabled
          ? "cursor-not-allowed opacity-55 saturate-50"
          : "enabled:hover:brightness-105 enabled:active:translate-y-0.5"
      }`}
    >
      <span className="leading-none">{icon}</span>
      <span className="text-[9px] font-extrabold leading-none">{label}</span>
      {count !== undefined && (
        <span className="absolute -right-1 -top-1 grid h-[17px] min-w-[17px] place-items-center rounded-full border-2 border-[#f7ecd4] bg-[#274b66] text-[9px] font-black text-white">
          {count}
        </span>
      )}
      {disabled && <Lock size={11} className="absolute bottom-0.5 right-0.5 text-[#8a6a3a]" />}
    </button>
  );
}

export default function GameActions({
  room,
  mode,
  selectedCard,
  busy,
  onModeChange,
  onSelectedCard,
  onAction,
  onOpenTrade,
}: GameActionsProps) {
  const game = room.game!;
  const selfPlayer = game.players.find((player) => player.id === room.selfPlayerId);
  const isMyTurn = game.currentPlayerId === room.selfPlayerId;
  const isMainTurn = game.phase === "main" && isMyTurn;
  const [discard, setDiscard] = useState<ResourceBundle>(emptyBundle);
  const [discardSubmitted, setDiscardSubmitted] = useState(false);
  const [goldPicks, setGoldPicks] = useState<Resource[]>([]);
  const [handHidden, setHandHidden] = useState(() => {
    try {
      return window.localStorage.getItem("catan:hand-hidden") === "1";
    } catch {
      return false;
    }
  });

  const pendingCount = game.self.pendingDiscardCount;
  const discardTotal = bundleTotal(discard);
  const currentPlayer = game.players.find((player) => player.id === game.currentPlayerId);
  const currentPlayerIsBot = room.players.some(
    (player) => player.id === game.currentPlayerId && player.isBot,
  );
  const isPlayableTurn = isMyTurn && (game.phase === "main" || game.phase === "awaiting-roll");
  const readyToRoll = isMyTurn && game.phase === "awaiting-roll";
  const selfColor = selfPlayer?.color ?? "#3f4249";

  const toggleHandHidden = () => {
    setHandHidden((current) => {
      const next = !current;
      try {
        window.localStorage.setItem("catan:hand-hidden", next ? "1" : "0");
      } catch {
        // sin persistencia disponible
      }
      return next;
    });
  };

  useEffect(() => {
    setDiscard(emptyBundle());
    setDiscardSubmitted(false);
  }, [pendingCount]);

  const pendingGold = game.self.pendingGoldCount;
  useEffect(() => {
    setGoldPicks([]);
  }, [pendingGold]);

  const toggleMode = (next: BoardMode) => {
    onSelectedCard(null);
    onModeChange(mode === next ? null : next);
  };

  const setDiscardAmount = (resource: Resource, value: number) => {
    setDiscard((current) => ({ ...current, [resource]: value }));
    setDiscardSubmitted(false);
  };

  const submitDiscard = () => {
    setDiscardSubmitted(true);
    if (discardTotal !== pendingCount || busy) return;
    void onAction({ type: "discard", resources: discard });
  };

  const isCardPlayable = (card: HeldDevelopmentCard) =>
    isPlayableTurn &&
    card.type !== "victory-point" &&
    card.boughtOnTurn < game.turnNumber &&
    !game.playedDevelopmentCardThisTurn;

  const roadsLeft = 15 - (selfPlayer?.roadsBuilt ?? 0);
  const shipsLeft = 15 - (selfPlayer?.shipsBuilt ?? 0);
  const settlementsLeft = 5 - (selfPlayer?.settlementsBuilt ?? 0);
  const citiesLeft = 4 - (selfPlayer?.citiesBuilt ?? 0);
  const canBuyDevelopmentCard =
    canAfford(game.self.resources, { wood: 0, brick: 0, sheep: 1, wheat: 1, ore: 1 }) &&
    game.developmentDeckCount > 0;
  const ownedResources = RESOURCES.filter((resource) => game.self.resources[resource] > 0);

  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-2xl border-2 border-[#c9a86a] bg-[#f7ecd4] px-2.5 py-1.5 shadow-[0_4px_0_rgba(74,44,18,0.3)] max-[940px]:max-h-[300px] max-[940px]:grid-cols-1 max-[940px]:overflow-y-auto">
        <section className="flex min-w-0 flex-col justify-center gap-1" aria-label="Tu mano">
          <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#a08a5e]">
            <Layers size={13} />
            <button
              type="button"
              className="ml-auto inline-flex items-center gap-1 rounded-lg border-2 border-[#c9a86a] bg-[#fdf6e3] px-1.5 py-0.5 text-[9px] font-extrabold text-[#7a5320] transition enabled:hover:brightness-105"
              title={handHidden ? "Mostrar mis cartas" : "Ocultar mis cartas"}
              aria-pressed={handHidden}
              onClick={toggleHandHidden}
            >
              {handHidden ? <EyeOff size={12} /> : <Eye size={12} />}
              {handHidden ? "Mostrar" : "Ocultar"}
            </button>
          </div>
          {handHidden ? (
            <div className="flex items-center gap-2">
              <img
                className="h-11 w-auto drop-shadow-[0_2px_2px_rgba(0,0,0,0.3)]"
                src={DEV_CARD_BACK_FILE}
                alt="Cartas ocultas"
              />
              <span className="text-[11px] font-semibold text-[#b08a4a]">
                Cartas ocultas · usá el ojo para mostrarlas
              </span>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-1.5">
                {ownedResources.length === 0 && game.self.developmentCards.length === 0 ? (
                  <span className="text-[11px] font-semibold text-[#b08a4a]">Sin cartas</span>
                ) : (
                  ownedResources.map((resource) => (
                    <ResourceStack
                      key={resource}
                      resource={resource}
                      count={game.self.resources[resource]}
                      onClick={isMainTurn ? onOpenTrade : undefined}
                    />
                  ))
                )}
                {game.self.developmentCards.map((card) => {
                  const playable = isCardPlayable(card);
                  const selected = selectedCard?.id === card.id;
                  return (
                    <span
                      key={card.id}
                      className={`flex items-center gap-1 rounded-xl border-2 px-1 py-0.5 ${
                        selected ? "border-[#d9a44a] bg-[#ffe9b8]" : "border-[#c9a86a] bg-[#fdf6e3]"
                      }`}
                    >
                      <img
                        className="h-8 w-auto drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]"
                        src={DEV_CARD_FILES[card.type]}
                        alt={CARD_NAMES[card.type]}
                        title={CARD_NAMES[card.type]}
                        draggable={false}
                      />
                      {card.type === "victory-point" ? (
                        <span
                          className="pr-1 text-[9px] font-bold text-[#8a6a3a]"
                          title="Solo vos podés verla; cuenta +1 punto"
                        >
                          Secreta · +1 PV
                        </span>
                      ) : card.boughtOnTurn >= game.turnNumber ? (
                        <span className="pr-1 text-[9px] font-bold text-[#a08a5e]">Nueva</span>
                      ) : (
                        <button
                          className="rounded-lg border-2 border-[#8a5a1e] bg-gradient-to-b from-[#e8b25a] to-[#c98a34] px-1.5 py-0.5 font-display text-[10px] font-extrabold text-[#4a2c12] shadow-[0_2px_0_#8a5a1e] disabled:cursor-not-allowed disabled:opacity-50"
                          type="button"
                          disabled={!playable || busy}
                          onClick={() => onSelectedCard(card)}
                        >
                          Jugar
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            </>
          )}
        </section>

        <section
          className="flex min-w-[168px] flex-col items-center justify-center gap-0.5 border-x-2 border-[#e3cfa5] px-3 max-[1180px]:min-w-[150px] max-[1180px]:px-2 max-[940px]:min-w-0 max-[940px]:border-x-0 max-[940px]:border-y-2 max-[940px]:border-[#e3cfa5] max-[940px]:py-1.5"
          aria-label="Estado del turno"
        >
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#7a5320]">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full border border-[#8a5a1e]"
              style={{ backgroundColor: currentPlayer?.color ?? "#5b6b78" }}
            />
            {isMyTurn
              ? "Tu turno"
              : `Turno de ${currentPlayerIsBot ? "🤖 " : ""}${currentPlayer?.name ?? "…"}`}
          </div>
          {game.lastRoll ? (
            <div
              className={`flex items-center gap-1.5 ${
                readyToRoll ? "animate-[turn-pulse_1.8s_ease-in-out_infinite]" : ""
              }`}
            >
              <DieFace value={game.lastRoll.dice[0]} big={readyToRoll} />
              <DieFace value={game.lastRoll.dice[1]} big={readyToRoll} />
            </div>
          ) : (
            <span
              className={`flex items-center gap-1 text-[11px] font-semibold text-[#b08a4a] ${
                readyToRoll ? "animate-[turn-pulse_1.8s_ease-in-out_infinite]" : ""
              }`}
            >
              <Dices size={13} /> Sin tirar
            </span>
          )}
          {isMyTurn && game.phase === "awaiting-roll" ? (
            <button
              className="inline-flex min-h-[32px] items-center gap-1.5 rounded-xl border-2 border-[#8a5a1e] bg-gradient-to-b from-[#e8b25a] to-[#c98a34] px-3 font-display text-xs font-extrabold text-[#4a2c12] shadow-[0_3px_0_#8a5a1e] transition enabled:hover:brightness-105 enabled:active:translate-y-0.5 disabled:opacity-50"
              type="button"
              disabled={busy}
              onClick={() => void onAction({ type: "roll" })}
            >
              <Dices size={14} /> Tirar
            </button>
          ) : isMyTurn && game.phase === "activate" ? (
            <span className="flex flex-wrap items-center justify-center gap-1.5">
              <button
                className="inline-flex min-h-[30px] items-center gap-1 rounded-xl border-2 border-[#8a5a1e] bg-[#fdf6e3] px-2 font-display text-[11px] font-extrabold text-[#7a5320] shadow-[0_2px_0_#8a5a1e] transition enabled:hover:brightness-105 disabled:opacity-50"
                type="button"
                disabled={busy}
                onClick={() => void onAction({ type: "activate-robber" })}
              >
                <img className="h-5 w-auto" src={ROBBER_ICON_FILE} alt="" /> Ladrón
              </button>
              <button
                className="inline-flex min-h-[30px] items-center gap-1 rounded-xl border-2 border-[#8a5a1e] bg-[#fdf6e3] px-2 font-display text-[11px] font-extrabold text-[#7a5320] shadow-[0_2px_0_#8a5a1e] transition enabled:hover:brightness-105 disabled:opacity-50"
                type="button"
                disabled={busy}
                onClick={() => void onAction({ type: "activate-pirate" })}
              >
                <img className="h-5 w-auto" src={PIRATE_ICON_FILE} alt="" /> Pirata
              </button>
            </span>
          ) : isMyTurn && game.phase === "pirate" ? (
            <button
              className="inline-flex min-h-[30px] items-center gap-1 rounded-xl border-2 border-[#8a5a1e] bg-[#fdf6e3] px-2 font-display text-[11px] font-extrabold text-[#7a5320] shadow-[0_2px_0_#8a5a1e] transition enabled:hover:brightness-105 disabled:opacity-50"
              type="button"
              disabled={busy}
              onClick={() => void onAction({ type: "move-pirate", hexId: null })}
            >
              Mover al marco
            </button>
          ) : (
            <p className="max-w-[200px] text-center text-[10px] font-semibold text-[#b08a4a]">
              {PHASE_LABEL[game.phase] ?? game.phase}
              {game.phase === "trade" && !isMyTurn ? " · esperando al oferente" : ""}
            </p>
          )}
        </section>

        <section
          className="flex flex-wrap items-center justify-end gap-1 max-[940px]:justify-stretch"
          aria-label="Acciones"
        >
          <ActionButton
            icon={<Handshake size={16} />}
            label="Comercio"
            title="Cambiar cartas con el banco o proponer un intercambio a la mesa"
            disabled={busy || !isMainTurn}
            onClick={onOpenTrade}
          />
          <ActionButton
            icon={<img className="h-6 w-auto" src={DEV_CARD_BACK_FILE} alt="" draggable={false} />}
            label="Carta"
            title={
              game.developmentDeckCount === 0
                ? "No quedan cartas de desarrollo"
                : `Comprar carta de desarrollo (oveja + trigo + mineral) · quedan ${game.developmentDeckCount}`
            }
            disabled={busy || !isMainTurn || !canBuyDevelopmentCard}
            onClick={() => void onAction({ type: "buy-development-card" })}
          />
          <ActionButton
            icon={
              <img
                className="h-6 w-auto"
                src={pieceFile("road", selfColor)}
                alt=""
                draggable={false}
              />
            }
            label="Camino"
            title="Construir camino (madera + ladrillo)"
            active={mode === "road"}
            disabled={busy || !isMainTurn || room.legal.roadIds.length === 0}
            count={roadsLeft}
            onClick={() => toggleMode("road")}
          />
          <ActionButton
            icon={
              <img
                className="h-8 w-auto"
                src={pieceFile("settlement", selfColor)}
                alt=""
                draggable={false}
              />
            }
            label="Poblado"
            title="Construir poblado (madera + ladrillo + oveja + trigo)"
            active={mode === "settlement"}
            disabled={busy || !isMainTurn || room.legal.settlementVertexIds.length === 0}
            count={settlementsLeft}
            onClick={() => toggleMode("settlement")}
          />
          <ActionButton
            icon={
              <img
                className="h-6 w-auto"
                src={pieceFile("city", selfColor)}
                alt=""
                draggable={false}
              />
            }
            label="Ciudad"
            title="Mejorar a ciudad (2 trigo + 3 mineral)"
            active={mode === "city"}
            disabled={busy || !isMainTurn || room.legal.cityVertexIds.length === 0}
            count={citiesLeft}
            onClick={() => toggleMode("city")}
          />
          <ActionButton
            icon={
              <img
                className="h-6 w-auto"
                src={pieceFile("ship", selfColor)}
                alt=""
                draggable={false}
              />
            }
            label="Barco"
            title="Construir barco (madera + oveja)"
            active={mode === "ship"}
            disabled={busy || !isMainTurn || room.legal.shipIds.length === 0}
            count={shipsLeft}
            onClick={() => toggleMode("ship")}
          />
          <ActionButton
            icon={<img className="h-6 w-auto" src={pieceFile("ship", selfColor)} alt="" draggable={false} />}
            label="Mover"
            title="Mover un barco (una vez por turno)"
            active={mode === "move-ship"}
            disabled={busy || !isMainTurn || room.legal.movableShipIds.length === 0}
            onClick={() => toggleMode("move-ship")}
          />
          <ActionButton
            icon={<Hourglass size={16} />}
            label="Terminar"
            title="Terminar el turno"
            primary
            disabled={busy || !isMainTurn}
            onClick={() => void onAction({ type: "end-turn" })}
          />
        </section>
      </div>

      {game.phase === "discard" && pendingCount > 0 && (
        <div className={MODAL_BACKDROP} role="presentation">
          <section className={MODAL} role="dialog" aria-modal="true" aria-labelledby="discard-title">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#a9793a]">
                Salió un siete
              </p>
              <h2 id="discard-title" className="mt-1 font-display text-[22px] font-black text-[#4a2c12]">
                Descartá {pendingCount} cartas
              </h2>
            </div>
            <p className="mt-2 text-xs font-semibold leading-[1.5] text-[#8a6a3a]">
              Elegí qué recursos devolver al banco para poder mover al ladrón.
            </p>
            <div className="mt-3">
              {RESOURCES.map((resource) => (
                <label
                  key={resource}
                  className="mt-1.5 flex items-center justify-between gap-2 text-xs font-semibold text-[#7a5320]"
                >
                  <span className="flex items-center gap-2">
                    <img
                      className="h-9 w-auto drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]"
                      src={RESOURCE_CARD_FILES[resource]}
                      alt=""
                      draggable={false}
                    />
                    {RESOURCE_NAMES[resource]}{" "}
                    <small>({game.self.resources[resource]})</small>
                  </span>
                  <input
                    className="w-[58px] rounded-xl border-2 border-[#c9a86a] bg-[#fffaf0] px-2 py-1 text-center font-bold text-[#4a2c12] outline-none focus:border-[#a9793a]"
                    type="number"
                    min={0}
                    max={game.self.resources[resource]}
                    value={discard[resource]}
                    onChange={(event) =>
                      setDiscardAmount(
                        resource,
                        Math.min(
                          game.self.resources[resource],
                          Math.max(0, Number(event.target.value)),
                        ),
                      )
                    }
                  />
                </label>
              ))}
            </div>
            <div
              className={`mt-3 text-xs font-bold ${
                discardTotal === pendingCount ? "text-[#4a6b28]" : "text-[#a4462f]"
              }`}
            >
              Seleccionadas: {discardTotal} / {pendingCount}
            </div>
            {discardSubmitted && discardTotal !== pendingCount && (
              <p className="mt-2 text-xs font-semibold leading-[1.5] text-[#8a6a3a]">
                Elegí exactamente {pendingCount} cartas.
              </p>
            )}
            <div className={MODAL_ACTIONS}>
              <button
                className={CG_BUTTON_ACCEPT}
                type="button"
                disabled={busy || discardTotal !== pendingCount}
                onClick={submitDiscard}
              >
                Descartar
              </button>
            </div>
          </section>
        </div>
      )}

      {game.phase === "gold" && pendingGold > 0 && (
        <div className={MODAL_BACKDROP} role="presentation">
          <section className={MODAL} role="dialog" aria-modal="true" aria-labelledby="gold-title">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#a9793a]">
                Campos de oro
              </p>
              <h2 id="gold-title" className="mt-1 font-display text-[22px] font-black text-[#4a2c12]">
                Elegí {pendingGold} recurso{pendingGold === 1 ? "" : "s"}
              </h2>
            </div>
            <p className="mt-2 text-xs font-semibold leading-[1.5] text-[#8a6a3a]">
              Tus poblados y ciudades sobre campos de oro produjeron {pendingGold}{" "}
              recurso{pendingGold === 1 ? "" : "s"}. Elegí cuáles tomar del banco.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {RESOURCES.map((resource) => {
                const selectedCount = goldPicks.filter((candidate) => candidate === resource).length;
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
                    disabled={busy || selectedCount >= game.bank[resource]}
                    onClick={() =>
                      setGoldPicks((current) =>
                        current.length >= pendingGold ? current : [...current, resource],
                      )
                    }
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
                disabled={goldPicks.length === 0}
                onClick={() => setGoldPicks((current) => current.slice(0, -1))}
              >
                Deshacer
              </button>
              <button
                className={CG_BUTTON_ACCEPT}
                type="button"
                disabled={busy || goldPicks.length !== pendingGold}
                onClick={() =>
                  void onAction({ type: "choose-gold", resources: goldPicks })
                }
              >
                Tomar recursos
              </button>
            </div>
          </section>
        </div>
      )}

    </>
  );
}
