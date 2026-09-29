import type { RoomSnapshot } from "../model";
import { BTN_LINK, BTN_PRIMARY, BTN_SECONDARY, CARD, EYEBROW, FIELD } from "../ui";

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
  const missing = Math.max(0, 3 - room.players.length);
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
    <section className={`${CARD} p-6 sm:p-7`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={EYEBROW}>Sala</p>
          <h1 className="mt-1 font-display text-4xl font-extrabold tracking-[0.14em] text-[#4a2c12]">
            {room.code}
          </h1>
        </div>
        <button className={BTN_SECONDARY} onClick={onCopyInvite} type="button">
          Copiar código
        </button>
      </div>

      <div className="mt-5 flex items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="block text-xs font-bold text-[#7a5320]">Tu nombre</span>
          <input
            className={`${FIELD} mt-1`}
            maxLength={24}
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
          />
        </label>
        <button className={BTN_SECONDARY} type="button" onClick={onSaveName} disabled={busy}>
          Guardar
        </button>
      </div>

      <div className="mt-5 rounded-2xl border-2 border-[#e3cfa5] bg-[#fffaf0] p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className={EYEBROW}>Tiempo por turno</p>
            <p className="mt-1 max-w-md text-xs font-semibold leading-5 text-[#a08a5e]">
              El dado se tira solo a los 5 s. El ladrón y el robo tienen 20 s cada uno; comerciar,
              15 s para elegir socio y 5 s para responder. La colocación inicial tiene 2 min por
              poblado y 20 s por camino. El resto del turno usa este límite y se pausa mientras
              resolvés un ladrón o un comercio.
            </p>
          </div>
          {me?.isHost ? (
            <select
              aria-label="Tiempo máximo por turno"
              className={`${FIELD} mt-1 w-auto min-w-[160px]`}
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
            <span className="rounded-2xl border-2 border-[#e3cfa5] bg-white/70 px-3 py-2 text-sm font-bold text-[#7a5320]">
              {turnTimeLimitLabel}
            </span>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t-2 border-dashed border-[#e3cfa5] pt-4">
          <div>
            <p className={EYEBROW}>Bots de prueba</p>
            <p className="mt-1 max-w-md text-xs font-semibold leading-5 text-[#a08a5e]">
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

      <div className="mt-6 flex items-center justify-between">
        <h2 className="font-display text-xl font-extrabold text-[#4a2c12]">
          Jugadores <span className="text-[#b08a4a]">{room.players.length}/4</span>
        </h2>
        {missing > 0 && (
          <span className="text-xs font-bold text-[#b08a4a]">
            {missing === 1 ? "Falta 1 jugador" : `Faltan ${missing} jugadores`}
            {me?.isHost ? " (o bots)" : ""}
          </span>
        )}
      </div>

      <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {room.players.map((player) => (
          <li
            key={player.id}
            className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3 ${
              player.isSelf ? "border-[#d9a44a] bg-[#fff3d6]" : "border-[#e3cfa5] bg-[#fffaf0]"
            }`}
          >
            <span
              className={`h-3 w-3 shrink-0 rounded-full ${
                player.online ? "bg-[#7fb04a]" : "bg-[#c9bfa6]"
              }`}
            />
            <span className="min-w-0 flex-1 truncate font-bold text-[#4a2c12]">
              {player.isBot ? "🤖 " : ""}
              {player.name}{" "}
              {player.isHost && <small className="font-semibold text-[#b08a4a]">· anfitrión</small>}
              {player.isBot && <small className="font-semibold text-[#b08a4a]"> · bot</small>}
            </span>
            {me?.isHost && player.isBot && (
              <button
                type="button"
                className="text-xs font-bold text-[#c96a4a] enabled:hover:underline disabled:opacity-50"
                disabled={busy}
                onClick={() => onRemoveBot(player.id)}
              >
                Quitar
              </button>
            )}
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase ${
                player.ready ? "bg-[#e4f0cf] text-[#4a6b28]" : "bg-[#efe6d2] text-[#a08a5e]"
              }`}
            >
              {player.ready ? "Listo" : "Espera"}
            </span>
          </li>
        ))}
        {Array.from({ length: Math.max(0, 4 - room.players.length) }, (_, index) => (
          <li
            key={`empty-${index}`}
            className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-[#dcc79c] px-4 py-3 text-sm font-semibold text-[#c0a273]"
          >
            <span className="h-3 w-3 shrink-0 rounded-full border-2 border-[#dcc79c]" />
            Libre
          </li>
        ))}
      </ul>

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t-2 border-dashed border-[#e3cfa5] pt-5">
        <button
          type="button"
          className={me?.ready ? BTN_SECONDARY : BTN_PRIMARY}
          disabled={busy}
          onClick={() => onToggleReady(!me?.ready)}
        >
          {me?.ready ? "No estoy listo" : "Estoy listo"}
        </button>
        {me?.isHost ? (
          <button type="button" className={BTN_PRIMARY} disabled={busy || !canStart} onClick={onStart}>
            Empezar partida
          </button>
        ) : (
          <p className="text-sm font-semibold text-[#a08a5e]">El anfitrión inicia la partida.</p>
        )}
        <button type="button" className={`${BTN_LINK} ml-auto`} onClick={onLeave}>
          Salir
        </button>
      </div>
    </section>
  );
}
