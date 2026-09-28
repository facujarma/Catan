import type { RoomSnapshot } from "../model";
import { BTN_PRIMARY, BTN_SECONDARY, CARD, EYEBROW, FIELD } from "../ui";

interface RoomLobbyProps {
  room: RoomSnapshot;
  name: string;
  busy: boolean;
  onNameChange: (name: string) => void;
  onSaveName: () => void;
  onToggleReady: (ready: boolean) => void;
  onAddBot: () => void;
  onRemoveBot: (botId: string) => void;
  onTurnTimeLimitChange: (seconds: number) => void;
  onStart: () => void;
  onLeave: () => void;
  onCopyInvite: () => void;
}

const TURN_TIME_OPTIONS = [
  { value: 0, label: "Sin límite" },
  { value: 10, label: "10 segundos" },
  { value: 15, label: "15 segundos" },
  { value: 30, label: "30 segundos" },
  { value: 60, label: "60 segundos" },
  { value: 90, label: "90 segundos" },
  { value: 120, label: "2 minutos" },
  { value: 180, label: "3 minutos" },
];

export default function RoomLobby({
  room,
  name,
  busy,
  onNameChange,
  onSaveName,
  onToggleReady,
  onAddBot,
  onRemoveBot,
  onTurnTimeLimitChange,
  onStart,
  onLeave,
  onCopyInvite,
}: RoomLobbyProps) {
  const me = room.players.find((player) => player.isSelf);
  const canStart = room.players.length >= 3 && room.players.every((player) => player.ready);
  const turnTimeOptions = TURN_TIME_OPTIONS.some(
    (option) => option.value === room.turnTimeLimitSeconds,
  )
    ? TURN_TIME_OPTIONS
    : [
        ...TURN_TIME_OPTIONS,
        { value: room.turnTimeLimitSeconds, label: `${room.turnTimeLimitSeconds} segundos` },
      ].sort((left, right) => left.value - right.value);
  const turnTimeLimitLabel =
    room.turnTimeLimitSeconds === 0
      ? "Sin límite"
      : `${room.turnTimeLimitSeconds} segundos por turno`;

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className={`${CARD} p-6 sm:p-8`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className={EYEBROW}>Sala privada</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-[#18372b] sm:text-4xl">
              Código <span className="font-mono tracking-[0.16em] text-[#b77b2d]">{room.code}</span>
            </h1>
          </div>
          <button className={BTN_SECONDARY} onClick={onCopyInvite} type="button">
            Copiar invitación
          </button>
        </div>

        <div className="mt-7 rounded-2xl border border-[#e9dfc9] bg-[#faf6eb] p-4">
          <label className="block text-xs font-bold uppercase tracking-wider text-[#6d776a]" htmlFor="lobby-name">
            Tu nombre
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="lobby-name"
              className={`${FIELD} min-w-0 flex-1`}
              maxLength={24}
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
            />
            <button className={BTN_SECONDARY} type="button" onClick={onSaveName} disabled={busy}>
              Guardar
            </button>
          </div>
        </div>

        <div className="mt-7 rounded-2xl border border-[#e9dfc9] bg-[#faf6eb] p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <label
                className="block text-xs font-bold uppercase tracking-wider text-[#6d776a]"
                htmlFor="lobby-turn-limit"
              >
                Tiempo máximo por turno
              </label>
              <p className="mt-1 max-w-md text-xs leading-5 text-[#8b9083]">
                Cuando se agota, el servidor resuelve el turno por el jugador (tira, descarta, mueve
                al ladrón y pasa). Ideal para evaluar a quienes demoran demasiado.
              </p>
            </div>
            {me?.isHost ? (
              <select
                id="lobby-turn-limit"
                className={`${FIELD} w-auto min-w-[150px]`}
                value={room.turnTimeLimitSeconds}
                disabled={busy}
                onChange={(event) => onTurnTimeLimitChange(Number(event.target.value))}
              >
                {turnTimeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <span className="rounded-xl border border-[#e2dac9] bg-white/70 px-3 py-2 text-sm font-bold text-[#4d4738]">
                {turnTimeLimitLabel}
              </span>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#eee7d8] pt-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#6d776a]">
                Bots de prueba
              </p>
              <p className="mt-1 max-w-md text-xs leading-5 text-[#8b9083]">
                Esperan 5 segundos, tiran si les toca y pasan el turno. Descartan al azar.
              </p>
            </div>
            <button
              type="button"
              className={BTN_SECONDARY}
              disabled={busy || !me?.isHost || room.players.length >= 4}
              onClick={onAddBot}
            >
              + Agregar bot
            </button>
          </div>
        </div>

        <div className="mt-7 flex items-end justify-between gap-3">
          <div>
            <p className={EYEBROW}>Jugadores</p>
            <h2 className="mt-1 text-xl font-bold text-[#18372b]">
              {room.players.length} <span className="font-medium text-[#899083]">/ 4</span>
            </h2>
          </div>
          <span className="text-sm text-[#697568]">Se necesitan 3 para empezar</span>
        </div>

        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {room.players.map((player) => (
            <li
              key={player.id}
              className={`flex items-center gap-3 rounded-2xl border p-4 ${
                player.isSelf ? "border-[#d3a14f] bg-[#fff9ea]" : "border-[#e8e1d2] bg-white/80"
              }`}
            >
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  player.online
                    ? "bg-[#62a867] shadow-[0_0_0_3px_rgba(98,168,103,0.14)]"
                    : "bg-[#c3c2b6]"
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-[#263c2e]">
                  {player.isBot && <span aria-hidden="true">🤖 </span>}
                  {player.name}{" "}
                  {player.isSelf && <small className="font-medium text-[#9a7a43]">(vos)</small>}
                </span>
                <span className="mt-0.5 block text-xs text-[#8b9083]">
                  {player.isHost
                    ? "Anfitrión"
                    : player.isBot
                      ? "Bot de prueba"
                      : player.online
                        ? "En línea"
                        : "Desconectado"}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {me?.isHost && player.isBot && (
                  <button
                    type="button"
                    className="text-[11px] font-bold text-[#a2564a] enabled:hover:underline disabled:opacity-50"
                    disabled={busy}
                    onClick={() => onRemoveBot(player.id)}
                  >
                    Quitar
                  </button>
                )}
                <span
                  className={`rounded-full px-2 py-[5px] text-[10px] font-extrabold ${
                    player.ready ? "bg-[#e7f1df] text-[#4d8050]" : "bg-[#f1efe8] text-[#8c8c7d]"
                  }`}
                >
                  {player.ready ? "Listo" : "Esperando"}
                </span>
              </span>
            </li>
          ))}
          {Array.from({ length: Math.max(0, 4 - room.players.length) }, (_, index) => (
            <li
              key={`empty-${index}`}
              className="flex items-center gap-3 rounded-2xl border border-dashed border-[#d6d3c7] p-4 text-sm text-[#9a9d91]"
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-[#c4c3b7] bg-transparent" />
              Esperando a un amigo…
            </li>
          ))}
        </ul>

        <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-[#eee7d8] pt-6">
          <button
            type="button"
            className={me?.ready ? BTN_SECONDARY : BTN_PRIMARY}
            disabled={busy}
            onClick={() => onToggleReady(!me?.ready)}
          >
            {me?.ready ? "Cambiar a no listo" : "Estoy listo"}
          </button>
          {me?.isHost ? (
            <button type="button" className={BTN_PRIMARY} disabled={busy || !canStart} onClick={onStart}>
              Empezar partida
            </button>
          ) : (
            <p className="text-sm text-[#778071]">El anfitrión inicia cuando todos estén listos.</p>
          )}
          {me?.isHost && !canStart && (
            <p className="w-full text-xs text-[#9a7c4d]">
              Falta que se unan 3 jugadores y todos marquen “Listo”. Podés completar la sala con
              bots.
            </p>
          )}
          <button
            type="button"
            className="ml-auto text-sm font-semibold text-[#8b6d50] hover:text-[#593c2a]"
            onClick={onLeave}
          >
            Salir de la sala
          </button>
        </div>
      </section>

      <aside className={`${CARD} flex flex-col justify-center p-6`}>
        <span className="text-4xl" aria-hidden="true">
          🎲
        </span>
        <h2 className="mt-4 text-2xl font-black text-[#18372b]">Prepará tus recursos</h2>
        <p className="mt-3 leading-7 text-[#687365]">
          Compartí el código con tus amigos. Al iniciar, el tablero se genera en el servidor y las jugadas se validan contra las reglas de la partida.
        </p>
        <div className="mt-6 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-[#eef2e5] p-3">
            <strong className="block text-xl text-[#477451]">3–4</strong>
            <small className="text-[#75806f]">jugadores</small>
          </div>
          <div className="rounded-xl bg-[#f8efda] p-3">
            <strong className="block text-xl text-[#b78132]">10</strong>
            <small className="text-[#827968]">puntos</small>
          </div>
          <div className="rounded-xl bg-[#f5e7df] p-3">
            <strong className="block text-xl text-[#b85b45]">1</strong>
            <small className="text-[#82766e]">ladrón</small>
          </div>
        </div>
      </aside>
    </div>
  );
}
