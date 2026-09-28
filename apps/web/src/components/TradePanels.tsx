import { useMemo, useState } from "react";
import { RESOURCES } from "@catan/engine";
import type { PlayerGameView, Resource, ResourceBundle, TradeOffer } from "@catan/engine";
import type { GameActionPayload } from "../model";

export const RESOURCE_SYMBOLS: Record<Resource, string> = {
  wood: "🌲",
  brick: "🧱",
  sheep: "🐑",
  wheat: "🌾",
  ore: "⛰️",
};

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
      className={`cg-res-card is-${resource} ${small ? "is-small" : ""}`}
      title={RESOURCE_NAMES[resource]}
    >
      {RESOURCE_SYMBOLS[resource]}
      {count !== undefined && count > 0 && <span className="cg-res-count">{count}</span>}
    </span>
  );
}

function ResourceBundleRow({ bundle }: { bundle: ResourceBundle }) {
  return (
    <div className="cg-offer-cards">
      {RESOURCES.filter((resource) => bundle[resource] > 0).map((resource) => (
        <ResourceCard key={resource} resource={resource} count={bundle[resource]} />
      ))}
      {bundleTotal(bundle) === 0 && <span className="cg-dev-hint">Nada</span>}
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
    <div className="cg-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="cg-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trade-composer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="cg-modal-head">
          <div>
            <p className="cg-modal-eyebrow">Comercio entre jugadores</p>
            <h2 id="trade-composer-title">{counter ? "Contraoferta" : "Nueva oferta"}</h2>
          </div>
          <button className="cg-modal-close" type="button" aria-label="Cerrar" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="cg-modal-note">
          {counter
            ? "Tu contraoferta reemplaza la oferta actual y queda visible para toda la mesa."
            : "La oferta es global: todos la ven, los que quieran aceptan, y vos elegís con quién cerrar."}
        </p>

        <div className="cg-trade-grid">
          <TradeSide
            label="Entregás"
            bundle={give}
            max={myResources}
            onAdjust={(resource, delta) => adjust("give", resource, delta)}
          />
          <div className="cg-trade-arrow">⇄</div>
          <TradeSide
            label="Pedís"
            bundle={want}
            onAdjust={(resource, delta) => adjust("want", resource, delta)}
          />
        </div>

        <div className="cg-modal-actions">
          <button className="cg-button is-neutral" type="button" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            className="cg-button is-accept"
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
    <div className="cg-trade-section">
      <span>{label}</span>
      <div className="cg-trade-cards">
        {RESOURCES.map((resource) => {
          const available = max?.[resource];
          return (
            <div key={resource} className="cg-trade-pick">
              <button
                type="button"
                className={`cg-res-card is-small is-${resource} ${bundle[resource] > 0 ? "is-picked" : ""}`}
                title={available === undefined ? RESOURCE_NAMES[resource] : `${RESOURCE_NAMES[resource]} (tenés ${available})`}
                onClick={() => onAdjust(resource, 1)}
              >
                {RESOURCE_SYMBOLS[resource]}
                {bundle[resource] > 0 && <span className="cg-res-count">{bundle[resource]}</span>}
              </button>
              <div className="cg-stepper">
                <button type="button" aria-label={`Quitar ${RESOURCE_NAMES[resource]}`} onClick={() => onAdjust(resource, -1)}>
                  −
                </button>
                <button type="button" aria-label={`Agregar ${RESOURCE_NAMES[resource]}`} onClick={() => onAdjust(resource, 1)}>
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
    <section className="cg-offer-panel" aria-label="Oferta de comercio global">
      <header className="cg-offer-head">
        <span
          className="cg-player-avatar"
          style={{ backgroundColor: offerer?.color ?? "#5b6b78" }}
        >
          {offerer?.name.slice(0, 2).toUpperCase()}
        </span>
        <strong>{isOfferer ? "Tu oferta a la mesa" : `${offerer?.name} ofrece a la mesa`}</strong>
        <small>En vivo</small>
      </header>

      <div className="cg-offer-body">
        <div className="cg-offer-side">
          <span>Entrega</span>
          <ResourceBundleRow bundle={offer.give} />
        </div>
        <div className="cg-offer-vs">⇄</div>
        <div className="cg-offer-side">
          <span>Pide</span>
          <ResourceBundleRow bundle={offer.want} />
        </div>
      </div>

      <div className="cg-offer-status">
        {responders.map((player) => {
          const accepted = offer.acceptedBy.includes(player.id);
          const rejected = offer.rejectedBy.includes(player.id);
          return (
            <span
              key={player.id}
              className={`cg-status-chip ${accepted ? "is-accepted" : rejected ? "is-rejected" : "is-pending"}`}
            >
              {accepted ? "✓" : rejected ? "✕" : "…"} {player.name}
            </span>
          );
        })}
      </div>

      <div className="cg-offer-actions">
        {isOfferer ? (
          offer.acceptedBy.length === 0 ? (
            <span className="cg-dev-hint">Esperando que alguien acepte. Podés cancelar y proponer otra cosa.</span>
          ) : (
            offer.acceptedBy.map((playerId) => (
              <button
                key={playerId}
                className="cg-button is-accept"
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
            <span className="cg-status-chip is-accepted">Aceptaste la oferta</span>
            <button
              className="cg-button is-neutral"
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
              className="cg-button is-accept"
              type="button"
              disabled={busy || !canPay}
              title={canPay ? "Aceptar la oferta" : "No tenés los recursos que pide"}
              onClick={() => void onAction({ type: "accept-offer" })}
            >
              {hasRejected ? "Aceptar igual" : "Aceptar"}
            </button>
            <button
              className="cg-button is-reject"
              type="button"
              disabled={busy}
              onClick={() => void onAction({ type: "reject-offer" })}
            >
              Rechazar
            </button>
            <button className="cg-button is-neutral" type="button" disabled={busy} onClick={onCounter}>
              Contraofertar
            </button>
          </>
        )}
        {isOfferer && (
          <button
            className="cg-button is-reject"
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
