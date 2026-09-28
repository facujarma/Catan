import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { RESOURCES } from "@catan/engine";
import type { HeldDevelopmentCard, Resource, ResourceBundle } from "@catan/engine";
import type { BoardMode } from "./BoardSvg";
import type { GameActionPayload, RoomSnapshot } from "../model";
import {
  bundleTotal,
  emptyBundle,
  RESOURCE_CARD_TONES,
  RESOURCE_NAMES,
  RESOURCE_SYMBOLS,
  ResourceCard,
} from "./TradePanels";
import { CG_BUTTON_ACCEPT, CG_BUTTON_NEUTRAL, MODAL, MODAL_ACTIONS, MODAL_BACKDROP } from "../ui";

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
  "setup-settlement": "Colocación inicial · poblado",
  "setup-road": "Colocación inicial · camino",
  "awaiting-roll": "Tirar los dados",
  discard: "Descartar por el siete",
  robber: "Mover al ladrón",
  main: "Acciones",
  trade: "Comercio en curso",
  finished: "Partida terminada",
};

function actionButtonClass(variant: "default" | "active" | "primary"): string {
  const base =
    "relative flex min-h-[52px] flex-col items-center justify-center gap-px rounded-[10px] border px-1 py-[5px] transition disabled:opacity-50";
  if (variant === "primary") {
    return `${base} border-[#2c7f3c] bg-gradient-to-b from-[#4cae5c] to-[#2f9e44] text-white shadow-[0_2px_0_#237a34] enabled:hover:brightness-105`;
  }
  if (variant === "active") {
    return `${base} border-[#d0a437] bg-gradient-to-b from-[#fdf0c4] to-[#f5dd9a] text-[#4d4738] shadow-[0_2px_0_#c9bda2] ring-2 ring-[#d0a437]/45 enabled:hover:brightness-105`;
  }
  return `${base} border-[#cfc5ae] bg-gradient-to-b from-[#fdf8ec] to-[#efe5cf] text-[#4d4738] shadow-[0_2px_0_#c9bda2] enabled:hover:brightness-105`;
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
  const [maritimeOpen, setMaritimeOpen] = useState(false);
  const [giveResource, setGiveResource] = useState<Resource>("wood");
  const [wantResource, setWantResource] = useState<Resource>("brick");
  const [giveAmount, setGiveAmount] = useState("1");

  const pendingCount = game.self.pendingDiscardCount;
  const discardTotal = bundleTotal(discard);
  const currentPlayer = game.players.find((player) => player.id === game.currentPlayerId);

  useEffect(() => {
    setDiscard(emptyBundle());
    setDiscardSubmitted(false);
  }, [pendingCount]);

  useEffect(() => {
    if (game.phase !== "main") setMaritimeOpen(false);
  }, [game.phase]);

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

  const submitMaritimeTrade = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number(giveAmount);
    if (!Number.isInteger(amount) || amount <= 0 || giveResource === wantResource) return;
    void onAction({
      type: "maritime-trade",
      giveResource,
      giveAmount: amount,
      receiveResource: wantResource,
    });
    setMaritimeOpen(false);
  };

  const isCardPlayable = (card: HeldDevelopmentCard) =>
    isMainTurn &&
    card.type !== "victory-point" &&
    card.boughtOnTurn < game.turnNumber &&
    !game.playedDevelopmentCardThisTurn;

  const roadsLeft = 15 - (selfPlayer?.roadsBuilt ?? 0);
  const settlementsLeft = 5 - (selfPlayer?.settlementsBuilt ?? 0);
  const citiesLeft = 4 - (selfPlayer?.citiesBuilt ?? 0);

  const actionIcon = "text-lg leading-none";
  const actionLabel = "text-[10px] font-extrabold";
  const actionCount =
    "absolute -right-1.5 -top-1.5 grid h-[19px] min-w-[19px] place-items-center rounded-full border-2 border-paper-soft bg-[#274b66] text-[10px] font-black text-white";
  const actionCost = "text-[8px] text-[#8b8271]";

  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-2 rounded-[14px] border border-black/[0.18] bg-paper-soft px-2.5 py-2 shadow-[0_-2px_14px_rgba(8,30,48,0.25)] max-[940px]:max-h-[320px] max-[940px]:grid-cols-1 max-[940px]:overflow-y-auto">
        <section className="flex min-w-0 flex-col justify-center gap-1.5" aria-label="Tu mano">
          <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-soft">
            Tu mano
            <small className="text-[9px] font-normal normal-case tracking-normal text-[#9a9384]">
              {bundleTotal(game.self.resources)} recursos
            </small>
          </div>
          <div className="flex flex-wrap gap-2">
            {RESOURCES.map((resource) => (
              <ResourceCard
                key={resource}
                resource={resource}
                count={game.self.resources[resource]}
              />
            ))}
          </div>
          {game.self.developmentCards.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {game.self.developmentCards.map((card) => {
                const playable = isCardPlayable(card);
                const selected = selectedCard?.id === card.id;
                return (
                  <span
                    key={card.id}
                    className={`flex items-center gap-1.5 rounded-lg border px-1.5 py-[3px] text-[10px] font-bold text-[#5a5140] ${
                      selected
                        ? "border-[#c99b2f] bg-[#fbeec4]"
                        : "border-line bg-[#f4ecda]"
                    } ${playable ? "ring-1 ring-catan-green/50" : ""}`}
                  >
                    {CARD_NAMES[card.type]}
                    {card.type === "victory-point" ? (
                      <small>+1 PV</small>
                    ) : card.boughtOnTurn >= game.turnNumber ? (
                      <small>Nueva</small>
                    ) : (
                      <button
                        className="rounded-md border-0 bg-catan-green px-1.5 py-0.5 text-[9px] font-extrabold text-white disabled:opacity-50"
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
          )}
          {game.playedDevelopmentCardThisTurn && (
            <p className="text-[10px] text-[#9a9384]">
              Ya jugaste una carta de desarrollo este turno.
            </p>
          )}
        </section>

        <section
          className="flex min-w-[210px] flex-col items-center justify-center gap-1 border-x border-line px-3.5 max-[1180px]:min-w-[170px] max-[1180px]:px-2 max-[940px]:min-w-0 max-[940px]:border-x-0 max-[940px]:border-y max-[940px]:border-line max-[940px]:py-2"
          aria-label="Estado del turno"
        >
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#4d4738]">
            <i
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: currentPlayer?.color ?? "#5b6b78" }}
            />
            {isMyTurn ? "Tu turno" : `Turno de ${currentPlayer?.name ?? "…"}`}
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`grid h-[30px] w-[30px] place-items-center rounded-[7px] border border-[#cfc5ae] bg-white text-[15px] font-black shadow-[0_2px_2px_rgba(0,0,0,0.12)] ${
                game.lastRoll ? "text-[#33302a]" : "text-[#c8c1b0]"
              }`}
            >
              {game.lastRoll ? game.lastRoll.dice[0] : "·"}
            </span>
            <span
              className={`grid h-[30px] w-[30px] place-items-center rounded-[7px] border border-[#cfc5ae] bg-white text-[15px] font-black shadow-[0_2px_2px_rgba(0,0,0,0.12)] ${
                game.lastRoll ? "text-[#33302a]" : "text-[#c8c1b0]"
              }`}
            >
              {game.lastRoll ? game.lastRoll.dice[1] : "·"}
            </span>
          </div>
          {isMyTurn && game.phase === "awaiting-roll" ? (
            <button
              className="rounded-[9px] border-0 bg-catan-green px-[18px] py-[7px] text-xs font-black text-white shadow-[0_3px_0_#237a34] active:translate-y-px active:shadow-[0_2px_0_#237a34] disabled:opacity-50"
              type="button"
              disabled={busy}
              onClick={() => void onAction({ type: "roll" })}
            >
              🎲 Tirar dados
            </button>
          ) : (
            <p className="max-w-[240px] text-center text-[10px] text-[#8b8271]">
              {PHASE_LABEL[game.phase] ?? game.phase}
              {game.phase === "trade" && !isMyTurn ? " · esperando al oferente" : ""}
            </p>
          )}
        </section>

        <section
          className="grid grid-cols-[repeat(3,minmax(74px,96px))] justify-end gap-1.5 max-[1180px]:grid-cols-[repeat(3,minmax(64px,82px))] max-[940px]:grid-cols-3 max-[940px]:justify-stretch"
          aria-label="Acciones"
        >
          <button
            className={actionButtonClass("default")}
            type="button"
            disabled={busy || !isMainTurn}
            onClick={onOpenTrade}
          >
            <span className={actionIcon}>⇄</span>
            <span className={actionLabel}>Comercio</span>
          </button>
          <button
            className={actionButtonClass("default")}
            type="button"
            disabled={busy || !isMainTurn}
            onClick={() => void onAction({ type: "buy-development-card" })}
          >
            <span className={actionIcon}>🃏</span>
            <span className={actionLabel}>Desarrollo</span>
            <span className={actionCost}>🐑🌾⛰️</span>
          </button>
          <button
            className={actionButtonClass(mode === "road" ? "active" : "default")}
            type="button"
            disabled={busy || !isMainTurn || room.legal.roadIds.length === 0}
            onClick={() => toggleMode("road")}
          >
            <span className={actionIcon}>🛤️</span>
            <span className={actionLabel}>Camino</span>
            <span className={actionCost}>🌲🧱</span>
            <span className={actionCount}>{roadsLeft}</span>
          </button>
          <button
            className={actionButtonClass(mode === "settlement" ? "active" : "default")}
            type="button"
            disabled={busy || !isMainTurn || room.legal.settlementVertexIds.length === 0}
            onClick={() => toggleMode("settlement")}
          >
            <span className={actionIcon}>🏠</span>
            <span className={actionLabel}>Poblado</span>
            <span className={actionCost}>🌲🧱🐑🌾</span>
            <span className={actionCount}>{settlementsLeft}</span>
          </button>
          <button
            className={actionButtonClass(mode === "city" ? "active" : "default")}
            type="button"
            disabled={busy || !isMainTurn || room.legal.cityVertexIds.length === 0}
            onClick={() => toggleMode("city")}
          >
            <span className={actionIcon}>🏰</span>
            <span className={actionLabel}>Ciudad</span>
            <span className={actionCost}>🌾🌾⛰️⛰️⛰️</span>
            <span className={actionCount}>{citiesLeft}</span>
          </button>
          <button
            className={actionButtonClass("default")}
            type="button"
            disabled={busy || !isMainTurn}
            onClick={() => setMaritimeOpen(true)}
          >
            <span className={actionIcon}>⚓</span>
            <span className={actionLabel}>Banco</span>
            <span className={actionCost}>{room.legal.tradeRatios[giveResource]}:1</span>
          </button>
          <button
            className={actionButtonClass("primary")}
            type="button"
            disabled={busy || !isMainTurn}
            onClick={() => void onAction({ type: "end-turn" })}
          >
            <span className={actionIcon}>⏳</span>
            <span className={actionLabel}>Terminar turno</span>
          </button>
        </section>
      </div>

      {game.phase === "discard" && pendingCount > 0 && (
        <div className={MODAL_BACKDROP} role="presentation">
          <section className={MODAL} role="dialog" aria-modal="true" aria-labelledby="discard-title">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#a4844f]">
                Salió un siete
              </p>
              <h2 id="discard-title" className="mt-1 text-[22px] font-black text-[#2c3c30]">
                Descartá {pendingCount} cartas
              </h2>
            </div>
            <p className="mt-2 text-xs leading-[1.5] text-ink-soft">
              Elegí qué recursos devolver al banco para poder mover al ladrón.
            </p>
            <div className="mt-3">
              {RESOURCES.map((resource) => (
                <label
                  key={resource}
                  className="mt-1.5 flex items-center justify-between gap-2 text-xs"
                >
                  <span>
                    {RESOURCE_SYMBOLS[resource]} {RESOURCE_NAMES[resource]}{" "}
                    <small>({game.self.resources[resource]})</small>
                  </span>
                  <input
                    className="w-[58px] rounded-[7px] border border-line px-[7px] py-[5px] text-center font-bold"
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
                discardTotal === pendingCount ? "text-[#2f6b34]" : "text-catan-red-dark"
              }`}
            >
              Seleccionadas: {discardTotal} / {pendingCount}
            </div>
            {discardSubmitted && discardTotal !== pendingCount && (
              <p className="mt-2 text-xs leading-[1.5] text-ink-soft">
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

      {maritimeOpen && isMainTurn && (
        <div className={MODAL_BACKDROP} role="presentation" onClick={() => setMaritimeOpen(false)}>
          <section
            className={MODAL}
            role="dialog"
            aria-modal="true"
            aria-labelledby="maritime-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2.5">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#a4844f]">
                  Comercio marítimo
                </p>
                <h2 id="maritime-title" className="mt-1 text-[22px] font-black text-[#2c3c30]">
                  Intercambiar con el banco
                </h2>
              </div>
              <button
                className="border-0 bg-transparent text-[22px] leading-none text-[#8b8271]"
                type="button"
                aria-label="Cerrar"
                onClick={() => setMaritimeOpen(false)}
              >
                ×
              </button>
            </div>
            <form onSubmit={submitMaritimeTrade}>
              <div className="mt-3.5 grid grid-cols-1 items-center gap-2 min-[560px]:grid-cols-[1fr_26px_1fr]">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-ink-soft">
                    Entregás
                  </span>
                  <div className="flex flex-wrap gap-[7px]">
                    {RESOURCES.map((resource) => (
                      <button
                        key={resource}
                        type="button"
                        className={`relative inline-flex h-[34px] w-[42px] items-center justify-center rounded-[7px] border border-black/[0.28] text-[15px] text-white shadow-[0_2px_4px_rgba(0,0,0,0.22)] [text-shadow:0_1px_2px_rgba(0,0,0,0.35)] ${RESOURCE_CARD_TONES[resource]} ${
                          giveResource === resource
                            ? "outline outline-[3px] outline-offset-1 outline-catan-gold"
                            : ""
                        }`}
                        title={RESOURCE_NAMES[resource]}
                        onClick={() => setGiveResource(resource)}
                      >
                        {RESOURCE_SYMBOLS[resource]}
                      </button>
                    ))}
                  </div>
                  <input
                    className="min-h-[42px] rounded-xl border border-line bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-ocean/40"
                    type="number"
                    min={1}
                    value={giveAmount}
                    onChange={(event) => setGiveAmount(event.target.value)}
                  />
                  <small className="text-[10px] text-[#9a9384]">
                    Tasa {room.legal.tradeRatios[giveResource]}:1 para{" "}
                    {RESOURCE_NAMES[giveResource]}
                  </small>
                </div>
                <div className="text-center text-xl font-black text-[#a59a82]">⇄</div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-ink-soft">
                    Recibís
                  </span>
                  <div className="flex flex-wrap gap-[7px]">
                    {RESOURCES.filter((resource) => resource !== giveResource).map((resource) => (
                      <button
                        key={resource}
                        type="button"
                        className={`relative inline-flex h-[34px] w-[42px] items-center justify-center rounded-[7px] border border-black/[0.28] text-[15px] text-white shadow-[0_2px_4px_rgba(0,0,0,0.22)] [text-shadow:0_1px_2px_rgba(0,0,0,0.35)] ${RESOURCE_CARD_TONES[resource]} ${
                          wantResource === resource
                            ? "outline outline-[3px] outline-offset-1 outline-catan-gold"
                            : ""
                        }`}
                        title={RESOURCE_NAMES[resource]}
                        onClick={() => setWantResource(resource)}
                      >
                        {RESOURCE_SYMBOLS[resource]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className={MODAL_ACTIONS}>
                <button
                  className={CG_BUTTON_NEUTRAL}
                  type="button"
                  onClick={() => setMaritimeOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  className={CG_BUTTON_ACCEPT}
                  type="submit"
                  disabled={
                    busy ||
                    giveResource === wantResource ||
                    Number(giveAmount) % room.legal.tradeRatios[giveResource] !== 0
                  }
                >
                  Intercambiar
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
