import type { RoomSnapshot } from "../model";

interface RoomLobbyProps {
  room: RoomSnapshot;
  name: string;
  busy: boolean;
  onNameChange: (name: string) => void;
  onSaveName: () => void;
  onToggleReady: (ready: boolean) => void;
  onStart: () => void;
  onLeave: () => void;
  onCopyInvite: () => void;
}

export default function RoomLobby({
  room,
  name,
  busy,
  onNameChange,
  onSaveName,
  onToggleReady,
  onStart,
  onLeave,
  onCopyInvite,
}: RoomLobbyProps) {
  const me = room.players.find((player) => player.isSelf);
  const canStart = room.players.length >= 3 && room.players.every((player) => player.ready);

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="panel-card p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Sala privada</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-[#18372b] sm:text-4xl">
              Código <span className="font-mono tracking-[0.16em] text-[#b77b2d]">{room.code}</span>
            </h1>
          </div>
          <button className="button-secondary" onClick={onCopyInvite} type="button">
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
              className="field-input min-w-0 flex-1"
              maxLength={24}
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
            />
            <button className="button-secondary" type="button" onClick={onSaveName} disabled={busy}>
              Guardar
            </button>
          </div>
        </div>

        <div className="mt-7 flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Jugadores</p>
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
              className={`flex items-center gap-3 rounded-2xl border p-4 ${player.isSelf ? "border-[#d3a14f] bg-[#fff9ea]" : "border-[#e8e1d2] bg-white/80"}`}
            >
              <span className={`status-dot ${player.online ? "status-online" : "status-offline"}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-[#263c2e]">
                  {player.name} {player.isSelf && <small className="font-medium text-[#9a7a43]">(vos)</small>}
                </span>
                <span className="mt-0.5 block text-xs text-[#8b9083]">
                  {player.isHost ? "Anfitrión" : player.online ? "En línea" : "Desconectado"}
                </span>
              </span>
              <span className={`ready-pill ${player.ready ? "ready-pill-on" : "ready-pill-off"}`}>
                {player.ready ? "Listo" : "Esperando"}
              </span>
            </li>
          ))}
          {Array.from({ length: Math.max(0, 4 - room.players.length) }, (_, index) => (
            <li key={`empty-${index}`} className="flex items-center gap-3 rounded-2xl border border-dashed border-[#d6d3c7] p-4 text-sm text-[#9a9d91]">
              <span className="status-dot status-empty" />
              Esperando a un amigo…
            </li>
          ))}
        </ul>

        <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-[#eee7d8] pt-6">
          <button
            type="button"
            className={me?.ready ? "button-secondary" : "button-primary"}
            disabled={busy}
            onClick={() => onToggleReady(!me?.ready)}
          >
            {me?.ready ? "Cambiar a no listo" : "Estoy listo"}
          </button>
          {me?.isHost ? (
            <button type="button" className="button-primary" disabled={busy || !canStart} onClick={onStart}>
              Empezar partida
            </button>
          ) : (
            <p className="text-sm text-[#778071]">El anfitrión inicia cuando todos estén listos.</p>
          )}
          {me?.isHost && !canStart && (
            <p className="w-full text-xs text-[#9a7c4d]">Falta que se unan 3 jugadores y todos marquen “Listo”.</p>
          )}
          <button type="button" className="ml-auto text-sm font-semibold text-[#8b6d50] hover:text-[#593c2a]" onClick={onLeave}>
            Salir de la sala
          </button>
        </div>
      </section>

      <aside className="panel-card flex flex-col justify-center p-6">
        <span className="text-4xl" aria-hidden="true">🎲</span>
        <h2 className="mt-4 text-2xl font-black text-[#18372b]">Prepará tus recursos</h2>
        <p className="mt-3 leading-7 text-[#687365]">
          Compartí el código con tus amigos. Al iniciar, el tablero se genera en el servidor y las jugadas se validan contra las reglas de la partida.
        </p>
        <div className="mt-6 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-[#eef2e5] p-3"><strong className="block text-xl text-[#477451]">3–4</strong><small className="text-[#75806f]">jugadores</small></div>
          <div className="rounded-xl bg-[#f8efda] p-3"><strong className="block text-xl text-[#b78132]">10</strong><small className="text-[#827968]">puntos</small></div>
          <div className="rounded-xl bg-[#f5e7df] p-3"><strong className="block text-xl text-[#b85b45]">1</strong><small className="text-[#82766e]">ladrón</small></div>
        </div>
      </aside>
    </div>
  );
}
