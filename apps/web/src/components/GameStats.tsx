import type { DevelopmentCardType, PlayerGameView } from "@catan/engine";
import { DEV_CARD_FILES } from "../assets";
import type { TurnStat } from "../model";
import { CG_BUTTON_NEUTRAL, MODAL, MODAL_BACKDROP } from "../ui";

interface GameStatsProps {
  game: PlayerGameView;
  turnStats: Record<string, TurnStat>;
  selfPlayerId: string;
  onClose: () => void;
}

const CARD_TYPE_NAMES: Record<DevelopmentCardType, string> = {
  knight: "Caballero",
  "victory-point": "Punto de victoria",
  "road-building": "Construcción de caminos",
  "year-of-plenty": "Año de la abundancia",
  monopoly: "Monopolio",
};

function formatMs(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${String(seconds % 60).padStart(2, "0")} s`;
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border-2 border-[#e3cfa5] bg-[#fffaf0] px-3 py-2 text-center">
      <strong className="block font-display text-lg font-extrabold text-[#4a2c12]">{value}</strong>
      <small className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#a08a5e]">
        {label}
      </small>
    </div>
  );
}

export default function GameStats({ game, turnStats, selfPlayerId, onClose }: GameStatsProps) {
  const stats = game.stats;
  if (!stats) return null;

  const maxRoll = Math.max(1, ...stats.rollCounts.map((entry) => entry.count));
  const totalRolls = stats.rollCounts.reduce((sum, entry) => sum + entry.count, 0);
  const sevens = stats.rollCounts.find((entry) => entry.total === 7)?.count ?? 0;
  const totalTurns = game.players.reduce(
    (sum, player) => sum + (turnStats[player.id]?.turns ?? 0),
    0,
  );

  return (
    <div className={MODAL_BACKDROP} role="presentation" onClick={onClose}>
      <section
        className={`${MODAL} w-[min(780px,100%)]!`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stats-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2.5">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#a4844f]">
              Partida terminada
            </p>
            <h2 id="stats-title" className="mt-1 font-display text-[22px] font-black text-[#4a2c12]">
              Estadísticas
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

        <div className="mt-4 flex flex-col gap-5">
          <section aria-label="Resumen">
            <h3 className="font-display text-sm font-extrabold uppercase tracking-[0.12em] text-[#a08a5e]">
              Resumen
            </h3>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatCard label="Tiradas" value={totalRolls} />
              <StatCard label="Sietes" value={sevens} />
              <StatCard label="Turnos" value={totalTurns} />
              <StatCard
                label="Ganador"
                value={game.players.find((player) => player.id === game.winnerId)?.name ?? "—"}
              />
            </div>
          </section>

          <section aria-label="Dados">
            <h3 className="font-display text-sm font-extrabold uppercase tracking-[0.12em] text-[#a08a5e]">
              Veces que salió cada número
            </h3>
            <div className="mt-3 flex items-end gap-1.5 rounded-2xl border-2 border-[#e3cfa5] bg-[#fffaf0] px-3 py-3">
              {stats.rollCounts.map(({ total, count }) => {
                const height = count === 0 ? 3 : Math.max(8, Math.round((count / maxRoll) * 120));
                const red = total === 6 || total === 8;
                return (
                  <div key={total} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] font-black text-[#4a2c12]">{count}</span>
                    <div
                      className={`w-full rounded-t-md border-2 ${
                        red
                          ? "border-[#a4462f] bg-gradient-to-t from-[#c94a3a] to-[#e5836f]"
                          : "border-[#8a5a1e] bg-gradient-to-t from-[#c98a34] to-[#e8b25a]"
                      }`}
                      style={{ height }}
                      title={`${total}: ${count} ${count === 1 ? "vez" : "veces"}`}
                    />
                    <span
                      className={`font-display text-[12px] font-extrabold ${
                        red ? "text-[#a4462f]" : "text-[#7a5320]"
                      }`}
                    >
                      {total}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section aria-label="Cartas de desarrollo compradas">
            <h3 className="font-display text-sm font-extrabold uppercase tracking-[0.12em] text-[#a08a5e]">
              Cartas de desarrollo compradas
            </h3>
            <ul className="mt-2 flex flex-col gap-1.5">
              {game.players.map((player) => {
                const bought = stats.developmentCardsBought[player.id] ?? [];
                const total = bought.reduce((sum, entry) => sum + entry.count, 0);
                return (
                  <li
                    key={player.id}
                    className="flex flex-wrap items-center gap-2 rounded-2xl border-2 border-[#e3cfa5] bg-[#fffaf0] px-3 py-2"
                  >
                    <span
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-[#8a5a1e] text-[10px] font-black text-white"
                      style={{ backgroundColor: player.color }}
                    >
                      {player.name.slice(0, 2).toUpperCase()}
                    </span>
                    <strong className="min-w-[70px] text-xs font-extrabold text-[#4a2c12]">
                      {player.name}
                      {player.id === selfPlayerId ? " (vos)" : ""}
                    </strong>
                    {bought.length === 0 ? (
                      <span className="text-[11px] font-semibold text-[#b08a4a]">Sin compras</span>
                    ) : (
                      <span className="flex flex-wrap items-center gap-2">
                        {bought.map((entry) => (
                          <span
                            key={entry.type}
                            className="inline-flex items-center gap-1 rounded-full border-2 border-[#c9a86a] bg-[#fdf6e3] py-0.5 pl-0.5 pr-2"
                            title={CARD_TYPE_NAMES[entry.type]}
                          >
                            <img
                              className="h-6 w-auto"
                              src={DEV_CARD_FILES[entry.type]}
                              alt={CARD_TYPE_NAMES[entry.type]}
                              draggable={false}
                            />
                            <small className="text-[11px] font-black text-[#7a5320]">
                              ×{entry.count}
                            </small>
                          </span>
                        ))}
                      </span>
                    )}
                    <small className="ml-auto text-[10px] font-bold text-[#a08a5e]">
                      {total} en total
                    </small>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-label="Jugadores">
            <h3 className="font-display text-sm font-extrabold uppercase tracking-[0.12em] text-[#a08a5e]">
              Jugadores
            </h3>
            <div className="mt-2 overflow-x-auto rounded-2xl border-2 border-[#e3cfa5] bg-[#fffaf0]">
              <table className="w-full min-w-[560px] text-left text-[11px] font-semibold text-[#7a5320]">
                <thead>
                  <tr className="border-b-2 border-[#e3cfa5] text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#a08a5e]">
                    <th className="px-3 py-2">Jugador</th>
                    <th className="px-2 py-2 text-center">Puntos</th>
                    <th className="px-2 py-2 text-center">Poblados</th>
                    <th className="px-2 py-2 text-center">Ciudades</th>
                    <th className="px-2 py-2 text-center">Caminos</th>
                    <th className="px-2 py-2 text-center">Caballeros</th>
                    <th className="px-2 py-2 text-center">Turnos</th>
                    <th className="px-2 py-2 text-center">Promedio</th>
                    <th className="px-2 py-2 text-center">Cartas dev.</th>
                  </tr>
                </thead>
                <tbody>
                  {game.players.map((player) => {
                    const stat = turnStats[player.id];
                    const points =
                      player.id === selfPlayerId
                        ? game.self.totalVictoryPoints
                        : player.publicVictoryPoints;
                    const bought = (stats.developmentCardsBought[player.id] ?? []).reduce(
                      (sum, entry) => sum + entry.count,
                      0,
                    );
                    return (
                      <tr key={player.id} className="border-b border-[#efe6d2] last:border-0">
                        <td className="px-3 py-1.5">
                          <span className="inline-flex items-center gap-1.5 font-extrabold text-[#4a2c12]">
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full border border-[#8a5a1e]"
                              style={{ backgroundColor: player.color }}
                            />
                            {player.name}
                            {player.id === selfPlayerId ? " (vos)" : ""}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-center font-black text-[#4a2c12]">{points}</td>
                        <td className="px-2 py-1.5 text-center">{player.settlementsBuilt}</td>
                        <td className="px-2 py-1.5 text-center">{player.citiesBuilt}</td>
                        <td className="px-2 py-1.5 text-center">
                          {player.roadsBuilt}
                          <small className="ml-1 text-[9px] text-[#a08a5e]">
                            (máx {player.longestRoadLength})
                          </small>
                        </td>
                        <td className="px-2 py-1.5 text-center">{player.playedKnights}</td>
                        <td className="px-2 py-1.5 text-center">{stat?.turns ?? 0}</td>
                        <td className="px-2 py-1.5 text-center">
                          {stat && stat.turns > 0 ? formatMs(stat.totalMs / stat.turns) : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-center">{bought}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="mt-4 flex justify-end">
          <button className={CG_BUTTON_NEUTRAL} type="button" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </section>
    </div>
  );
}
