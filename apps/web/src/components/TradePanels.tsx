import { useMemo, useState } from "react";
import { RESOURCES } from "@catan/engine";
import type { PlayerGameView, Resource, ResourceBundle, TradeOffer } from "@catan/engine";
import { RESOURCE_CARD_FILES } from "../assets";
import type { GameActionPayload } from "../model";
import {
  CG_BUTTON_ACCEPT,
  CG_BUTTON_NEUTRAL,
  CG_BUTTON_REJECT,
  MODAL,
  MODAL_ACTIONS,
  MODAL_BACKDROP,
} from "../ui";

export const RESOURCE_NAMES: Record<Resource, string> = {
  wood: "Madera",
  brick: "Ladrillo",
  sheep: "Oveja",
  wheat: "Trigo",
  ore: "Mineral",
};

export function emptyBundle(): ResourceBundle {
  return { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
}

export function bundleTotal(bundle: ResourceBundle): number {
  return RESOURCES.reduce((sum, resource) => sum + bundle[resource], 0);
}

export function canAfford(available: ResourceBundle, requested: ResourceBundle): boolean {
  return RESOURCES.every((resource) => available[resource] >= requested[resource]);
}

export function describeBundle(bundle: ResourceBundle): string {
  const content = RESOURCES.filter((resource) => bundle[resource] > 0)
    .map((resource) => `${bundle[resource]} ${RESOURCE_NAMES[resource].toLowerCase()}`)
    .join(", ");
  return content || "nada";
}

export function ResourceCard({
  resource,
  count,
  small = false,
}: {
  resource: Resource;
  count?: number;
  small?: boolean;
}) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${
        small ? "h-[46px] w-[33px]" : "h-[60px] w-[43px]"
      }`}
      title={RESOURCE_NAMES[resource]}
    >
      <img
        className="h-full w-full drop-shadow-[0_2px_3px_rgba(0,0,0,0.28)]"
        src={RESOURCE_CARD_FILES[resource]}
        alt={RESOURCE_NAMES[resource]}
        draggable={false}
      />
      {count !== undefined && count > 0 && (
        <span className="absolute -bottom-1.5 -right-1.5 grid h-[19px] min-w-[19px] place-items-center rounded-full border-2 border-paper-soft bg-[#274b66] text-[11px] font-black text-white">
          {count}
        </span>
      )}
    </span>
  );
}

function ResourceBundleRow({ bundle }: { bundle: ResourceBundle }) {
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {RESOURCES.filter((resource) => bundle[resource] > 0).map((resource) => (
        <ResourceCard key={resource} resource={resource} count={bundle[resource]} />
      ))}
      {bundleTotal(bundle) === 0 && <span className="text-[10px] text-[#9a9384]">Nada</span>}
    </div>
  );
}

interface TradeComposerProps {
  game: PlayerGameView;
  busy: boolean;
  counter?: boolean;
  onClose: () => void;
  onAction: (action: GameActionPayload) => Promise<void>;
}

export function TradeComposer({
  game,
  busy,
  counter = false,
  onClose,
  onAction,
}: TradeComposerProps) {
  const [give, setGive] = useState<ResourceBundle>(emptyBundle);
  const [want, setWant] = useState<ResourceBundle>(emptyBundle);
  const myResources = game.self.resources;

  const adjust = (side: "give" | "want", resource: Resource, delta: number) => {
    const setter = side === "give" ? setGive : setWant;
    const limit = side === "give" ? myResources[resource] : 99;
    setter((current) => {
      const next = Math.max(0, Math.min(limit, current[resource] + delta));
      return { ...current, [resource]: next };
    });
  };

  const submit = () => {
    if (busy || bundleTotal(give) === 0 || bundleTotal(want) === 0) return;
    void onAction(
      counter
        ? { type: "counter-offer", give, want }
        : { type: "make-offer", give, want },
    ).then(onClose);
  };

  return (
    <div className={MODAL_BACKDROP} role="presentation" onClick={onClose}>
      <section
        className={MODAL}
        role="dialog"
        aria-modal="true"
        aria-labelledby="trade-composer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2.5">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#a4844f]">
              Comercio entre jugadores
            </p>
            <h2
              id="trade-composer-title"
              className="mt-1 text-[22px] font-black text-[#2c3c30]"
            >
              {counter ? "Contraoferta" : "Nueva oferta"}
            </h2>
          </div>
          <button
            className="border-0 bg-transparent text-[22px] leading-none text-[#8b8271]"
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p className="mt-2 text-xs leading-[1.5] text-ink-soft">
          {counter
            ? "Tu contraoferta reemplaza la oferta actual y queda visible para toda la mesa."
            : "La oferta es global: todos la ven, los que quieran aceptan, y vos elegís con quién cerrar."}
        </p>

        <div className="mt-3.5 grid grid-cols-1 items-center gap-2 min-[560px]:grid-cols-[1fr_26px_1fr]">
          <TradeSide
            label="Entregás"
            bundle={give}
            max={myResources}
            onAdjust={(resource, delta) => adjust("give", resource, delta)}
          />
          <div className="rotate-90 text-center text-xl font-black text-[#a59a82] min-[560px]:rotate-0">
            ⇄
          </div>
          <TradeSide
            label="Pedís"
            bundle={want}
            onAdjust={(resource, delta) => adjust("want", resource, delta)}
          />
        </div>

        <div className={MODAL_ACTIONS}>
          <button className={CG_BUTTON_NEUTRAL} type="button" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            className={CG_BUTTON_ACCEPT}
            type="button"
            disabled={busy || bundleTotal(give) === 0 || bundleTotal(want) === 0}
            onClick={submit}
          >
            {counter ? "Enviar contraoferta" : "Ofrecer a todos"}
          </button>
        </div>
      </section>
    </div>
  );
}

function TradeSide({
  label,
  bundle,
  max,
  onAdjust,
}: {
  label: string;
  bundle: ResourceBundle;
  max?: ResourceBundle;
  onAdjust: (resource: Resource, delta: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-ink-soft">
        {label}
      </span>
      <div className="flex flex-wrap gap-[7px]">
        {RESOURCES.map((resource) => {
          const available = max?.[resource];
          return (
            <div key={resource} className="flex flex-col items-center gap-1">
              <button
                type="button"
                className={`relative inline-flex h-[60px] w-[43px] items-center justify-center rounded-[4px] transition ${
                  bundle[resource] > 0 ? "outline outline-[3px] outline-offset-1 outline-catan-gold" : "hover:-translate-y-0.5"
                }`}
                title={
                  available === undefined
                    ? RESOURCE_NAMES[resource]
                    : `${RESOURCE_NAMES[resource]} (tenés ${available})`
                }
                onClick={() => onAdjust(resource, 1)}
              >
                <img
                  className="h-full w-full drop-shadow-[0_2px_3px_rgba(0,0,0,0.28)]"
                  src={RESOURCE_CARD_FILES[resource]}
                  alt={RESOURCE_NAMES[resource]}
                  draggable={false}
                />
                {bundle[resource] > 0 && (
                  <span className="absolute -bottom-1.5 -right-1.5 grid h-[19px] min-w-[19px] place-items-center rounded-full border-2 border-paper-soft bg-[#274b66] text-[11px] font-black text-white">
                    {bundle[resource]}
                  </span>
                )}
              </button>
              <div className="flex items-center gap-[3px]">
                <button
                  type="button"
                  className="grid h-[18px] w-[18px] place-items-center rounded-[5px] border border-[#cfc5ae] bg-white text-[11px] font-black text-[#5a5140]"
                  aria-label={`Quitar ${RESOURCE_NAMES[resource]}`}
                  onClick={() => onAdjust(resource, -1)}
                >
                  −
                </button>
                <button
                  type="button"
                  className="grid h-[18px] w-[18px] place-items-center rounded-[5px] border border-[#cfc5ae] bg-white text-[11px] font-black text-[#5a5140]"
                  aria-label={`Agregar ${RESOURCE_NAMES[resource]}`}
                  onClick={() => onAdjust(resource, 1)}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface TradeOfferPanelProps {
  game: PlayerGameView;
  selfPlayerId: string;
  busy: boolean;
  onAction: (action: GameActionPayload) => Promise<void>;
  onCounter: () => void;
}

export function TradeOfferPanel({
  game,
  selfPlayerId,
  busy,
  onAction,
  onCounter,
}: TradeOfferPanelProps) {
  const offer = game.activeTrade as TradeOffer;
  const offerer = game.players.find((player) => player.id === offer.fromPlayerId);
  const isOfferer = offer.fromPlayerId === selfPlayerId;
  const hasAccepted = offer.acceptedBy.includes(selfPlayerId);
  const hasRejected = offer.rejectedBy.includes(selfPlayerId);
  const canPay = canAfford(game.self.resources, offer.want);
  const responders = useMemo(
    () => game.players.filter((player) => player.id !== offer.fromPlayerId),
    [game.players, offer.fromPlayerId],
  );
  const acceptorName = (playerId: string) =>
    game.players.find((player) => player.id === playerId)?.name ?? "jugador";

  return (
    <section
      className="absolute left-1/2 top-2.5 z-[45] w-[min(560px,calc(100%-20px))] -translate-x-1/2 rounded-3xl border-2 border-[#c9a86a] bg-[#f7ecd4] shadow-[0_6px_0_rgba(74,44,18,0.3),0_14px_40px_rgba(20,10,2,0.4)]"
      aria-label="Oferta de comercio global"
    >
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span
          className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full border-2 border-white/85 text-xs font-black text-white shadow-[0_2px_5px_rgba(0,0,0,0.25)] [text-shadow:0_1px_2px_rgba(0,0,0,0.4)]"
          style={{ backgroundColor: offerer?.color ?? "#5b6b78" }}
        >
          {offerer?.name.slice(0, 2).toUpperCase()}
        </span>
        <strong className="text-[13px] text-[#3b352a]">
          {isOfferer ? "Tu oferta a la mesa" : `${offerer?.name} ofrece a la mesa`}
        </strong>
        <small className="ml-auto text-[10px] font-bold uppercase tracking-[0.08em] text-ink-soft">
          En vivo
        </small>
      </header>

      <div className="flex flex-col items-center justify-center gap-3 px-3 py-2.5 min-[560px]:flex-row">
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-ink-soft">
            Entrega
          </span>
          <ResourceBundleRow bundle={offer.give} />
        </div>
        <div className="text-xl font-black text-[#9a8f76]">⇄</div>
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-ink-soft">
            Pide
          </span>
          <ResourceBundleRow bundle={offer.want} />
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-[5px] border-t border-dashed border-line px-3 pt-[7px]">
        {responders.map((player) => {
          const accepted = offer.acceptedBy.includes(player.id);
          const rejected = offer.rejectedBy.includes(player.id);
          const tone = accepted
            ? "bg-[#dff0d8] text-[#2f6b34]"
            : rejected
              ? "bg-[#f6dcd6] text-[#99402f]"
              : "bg-[#efe9da] text-[#7d7462]";
          return (
            <span key={player.id} className={`rounded-full px-2 py-[2px] text-[10px] font-extrabold ${tone}`}>
              {accepted ? "✓" : rejected ? "✕" : "…"} {player.name}
            </span>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-1.5 px-3 pb-[11px] pt-[9px]">
        {isOfferer ? (
          offer.acceptedBy.length === 0 ? (
            <span className="text-[10px] text-[#9a9384]">
              Esperando que alguien acepte. Podés cancelar y proponer otra cosa.
            </span>
          ) : (
            offer.acceptedBy.map((playerId) => (
              <button
                key={playerId}
                className={CG_BUTTON_ACCEPT}
                type="button"
                disabled={busy}
                onClick={() => void onAction({ type: "confirm-offer", partnerId: playerId })}
              >
                Intercambiar con {acceptorName(playerId)}
              </button>
            ))
          )
        ) : hasAccepted ? (
          <>
            <span className="rounded-full bg-[#dff0d8] px-2 py-[2px] text-[10px] font-extrabold text-[#2f6b34]">
              Aceptaste la oferta
            </span>
            <button
              className={CG_BUTTON_NEUTRAL}
              type="button"
              disabled={busy}
              onClick={() => void onAction({ type: "reject-offer" })}
            >
              Retirar aceptación
            </button>
          </>
        ) : (
          <>
            <button
              className={CG_BUTTON_ACCEPT}
              type="button"
              disabled={busy || !canPay}
              title={canPay ? "Aceptar la oferta" : "No tenés los recursos que pide"}
              onClick={() => void onAction({ type: "accept-offer" })}
            >
              {hasRejected ? "Aceptar igual" : "Aceptar"}
            </button>
            <button
              className={CG_BUTTON_REJECT}
              type="button"
              disabled={busy}
              onClick={() => void onAction({ type: "reject-offer" })}
            >
              Rechazar
            </button>
            <button className={CG_BUTTON_NEUTRAL} type="button" disabled={busy} onClick={onCounter}>
              Contraofertar
            </button>
          </>
        )}
        {isOfferer && (
          <button
            className={CG_BUTTON_REJECT}
            type="button"
            disabled={busy}
            onClick={() => void onAction({ type: "cancel-offer" })}
          >
            Cancelar oferta
          </button>
        )}
      </div>
    </section>
  );
}
