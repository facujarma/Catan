import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { RESOURCES } from "@catan/engine";
import type { HeldDevelopmentCard, Resource, ResourceBundle } from "@catan/engine";
import type { BoardMode } from "./BoardSvg";
import type { GameActionPayload, RoomSnapshot } from "../model";
import {
  bundleTotal,
  emptyBundle,
  RESOURCE_NAMES,
  RESOURCE_SYMBOLS,
  ResourceCard,
} from "./TradePanels";

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

  return (
    <>
      <div className="cg-dock-inner">
        <section className="cg-hand" aria-label="Tu mano">
          <div className="cg-hand-title">
            Tu mano
            <small>{bundleTotal(game.self.resources)} recursos</small>
          </div>
          <div className="cg-hand-row">
            {RESOURCES.map((resource) => (
              <ResourceCard
                key={resource}
                resource={resource}
                count={game.self.resources[resource]}
              />
            ))}
          </div>
          {game.self.developmentCards.length > 0 && (
            <div className="cg-dev-row">
              {game.self.developmentCards.map((card) => {
                const playable = isCardPlayable(card);
                return (
                  <span
                    key={card.id}
                    className={`cg-dev-card ${selectedCard?.id === card.id ? "is-selected" : ""} ${playable ? "is-playable" : ""}`}
                  >
                    {CARD_NAMES[card.type]}
                    {card.type === "victory-point" ? (
                      <small>+1 PV</small>
                    ) : card.boughtOnTurn >= game.turnNumber ? (
                      <small>Nueva</small>
                    ) : (
                      <button
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
            <p className="cg-dev-hint">Ya jugaste una carta de desarrollo este turno.</p>
          )}
        </section>

        <section className="cg-status" aria-label="Estado del turno">
          <div className="cg-status-player">
            <i style={{ backgroundColor: currentPlayer?.color ?? "#5b6b78" }} />
            {isMyTurn ? "Tu turno" : `Turno de ${currentPlayer?.name ?? "…"}`}
          </div>
          <div className="cg-dice">
            <span className={`cg-die ${game.lastRoll ? "" : "is-empty"}`}>
              {game.lastRoll ? game.lastRoll.dice[0] : "·"}
            </span>
            <span className={`cg-die ${game.lastRoll ? "" : "is-empty"}`}>
              {game.lastRoll ? game.lastRoll.dice[1] : "·"}
            </span>
          </div>
          {isMyTurn && game.phase === "awaiting-roll" ? (
            <button className="cg-roll-button" type="button" disabled={busy} onClick={() => void onAction({ type: "roll" })}>
              🎲 Tirar dados
            </button>
          ) : (
            <p className="cg-status-note">
              {PHASE_LABEL[game.phase] ?? game.phase}
              {game.phase === "trade" && !isMyTurn ? " · esperando al oferente" : ""}
            </p>
          )}
        </section>

        <section className="cg-actions" aria-label="Acciones">
          <button
            className="cg-action-button"
            type="button"
            disabled={busy || !isMainTurn}
            onClick={onOpenTrade}
          >
            <span className="cg-action-icon">⇄</span>
            <span className="cg-action-label">Comercio</span>
          </button>
          <button
            className="cg-action-button"
            type="button"
            disabled={busy || !isMainTurn}
            onClick={() => void onAction({ type: "buy-development-card" })}
          >
            <span className="cg-action-icon">🃏</span>
            <span className="cg-action-label">Desarrollo</span>
            <span className="cg-action-cost">🐑🌾⛰️</span>
          </button>
          <button
            className={`cg-action-button ${mode === "road" ? "is-active" : ""}`}
            type="button"
            disabled={busy || !isMainTurn || room.legal.roadIds.length === 0}
            onClick={() => toggleMode("road")}
          >
            <span className="cg-action-icon">🛤️</span>
            <span className="cg-action-label">Camino</span>
            <span className="cg-action-cost">🌲🧱</span>
            <span className="cg-action-count">{roadsLeft}</span>
          </button>
          <button
            className={`cg-action-button ${mode === "settlement" ? "is-active" : ""}`}
            type="button"
            disabled={busy || !isMainTurn || room.legal.settlementVertexIds.length === 0}
            onClick={() => toggleMode("settlement")}
          >
            <span className="cg-action-icon">🏠</span>
            <span className="cg-action-label">Poblado</span>
            <span className="cg-action-cost">🌲🧱🐑🌾</span>
            <span className="cg-action-count">{settlementsLeft}</span>
          </button>
          <button
            className={`cg-action-button ${mode === "city" ? "is-active" : ""}`}
            type="button"
            disabled={busy || !isMainTurn || room.legal.cityVertexIds.length === 0}
            onClick={() => toggleMode("city")}
          >
            <span className="cg-action-icon">🏰</span>
            <span className="cg-action-label">Ciudad</span>
            <span className="cg-action-cost">🌾🌾⛰️⛰️⛰️</span>
            <span className="cg-action-count">{citiesLeft}</span>
          </button>
          <button
            className="cg-action-button"
            type="button"
            disabled={busy || !isMainTurn}
            onClick={() => setMaritimeOpen(true)}
          >
            <span className="cg-action-icon">⚓</span>
            <span className="cg-action-label">Banco</span>
            <span className="cg-action-cost">{room.legal.tradeRatios[giveResource]}:1</span>
          </button>
          <button
            className="cg-action-button is-primary"
            type="button"
            disabled={busy || !isMainTurn}
            onClick={() => void onAction({ type: "end-turn" })}
          >
            <span className="cg-action-icon">⏳</span>
            <span className="cg-action-label">Terminar turno</span>
          </button>
        </section>
      </div>

      {game.phase === "discard" && pendingCount > 0 && (
        <div className="cg-modal-backdrop" role="presentation">
          <section className="cg-modal" role="dialog" aria-modal="true" aria-labelledby="discard-title">
            <div className="cg-modal-head">
              <div>
                <p className="cg-modal-eyebrow">Salió un siete</p>
                <h2 id="discard-title">Descartá {pendingCount} cartas</h2>
              </div>
            </div>
            <p className="cg-modal-note">Elegí qué recursos devolver al banco para poder mover al ladrón.</p>
            <div className="mt-3">
              {RESOURCES.map((resource) => (
                <label key={resource} className="cg-discard-row">
                  <span>
                    {RESOURCE_SYMBOLS[resource]} {RESOURCE_NAMES[resource]}{" "}
                    <small>({game.self.resources[resource]})</small>
                  </span>
                  <input
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
            <div className={`cg-discard-total ${discardTotal === pendingCount ? "is-ok" : "is-bad"}`}>
              Seleccionadas: {discardTotal} / {pendingCount}
            </div>
            {discardSubmitted && discardTotal !== pendingCount && (
              <p className="cg-modal-note">Elegí exactamente {pendingCount} cartas.</p>
            )}
            <div className="cg-modal-actions">
              <button
                className="cg-button is-accept"
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
        <div className="cg-modal-backdrop" role="presentation" onClick={() => setMaritimeOpen(false)}>
          <section
            className="cg-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="maritime-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cg-modal-head">
              <div>
                <p className="cg-modal-eyebrow">Comercio marítimo</p>
                <h2 id="maritime-title">Intercambiar con el banco</h2>
              </div>
              <button className="cg-modal-close" type="button" aria-label="Cerrar" onClick={() => setMaritimeOpen(false)}>
                ×
              </button>
            </div>
            <form onSubmit={submitMaritimeTrade}>
              <div className="cg-trade-grid">
                <div className="cg-trade-section">
                  <span>Entregás</span>
                  <div className="cg-trade-cards">
                    {RESOURCES.map((resource) => (
                      <button
                        key={resource}
                        type="button"
                        className={`cg-res-card is-small is-${resource} ${giveResource === resource ? "is-picked" : ""}`}
                        title={RESOURCE_NAMES[resource]}
                        onClick={() => setGiveResource(resource)}
                      >
                        {RESOURCE_SYMBOLS[resource]}
                      </button>
                    ))}
                  </div>
                  <input
                    className="cg-feed-input"
                    type="number"
                    min={1}
                    value={giveAmount}
                    onChange={(event) => setGiveAmount(event.target.value)}
                  />
                  <small className="cg-dev-hint">
                    Tasa {room.legal.tradeRatios[giveResource]}:1 para {RESOURCE_NAMES[giveResource]}
                  </small>
                </div>
                <div className="cg-trade-arrow">⇄</div>
                <div className="cg-trade-section">
                  <span>Recibís</span>
                  <div className="cg-trade-cards">
                    {RESOURCES.filter((resource) => resource !== giveResource).map((resource) => (
                      <button
                        key={resource}
                        type="button"
                        className={`cg-res-card is-small is-${resource} ${wantResource === resource ? "is-picked" : ""}`}
                        title={RESOURCE_NAMES[resource]}
                        onClick={() => setWantResource(resource)}
                      >
                        {RESOURCE_SYMBOLS[resource]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="cg-modal-actions">
                <button className="cg-button is-neutral" type="button" onClick={() => setMaritimeOpen(false)}>
                  Cancelar
                </button>
                <button
                  className="cg-button is-accept"
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
