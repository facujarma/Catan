import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { ConvexProvider, ConvexReactClient, useMutation, useQuery } from "convex/react";
import { api } from "./convexApi";
import FeedPanel from "./components/FeedPanel";
import DemoPreview from "./components/DemoPreview";
import GameRoom from "./components/GameRoom";
import RoomLobby from "./components/RoomLobby";
import {
  createRoomCode,
  loadGuestIdentity,
  loadGuestName,
  loadRoomCode,
  saveGuestName,
  saveRoomCode,
} from "./identity";
import { BTN_LINK, BTN_PRIMARY, BTN_SECONDARY, CARD, EYEBROW, FIELD } from "./ui";
import type { ChatMessage, GameActionPayload, GameEvent, RoomSnapshot } from "./model";

export default function App() {
  const convexUrl = import.meta.env.VITE_CONVEX_URL?.trim();
  const [preview, setPreview] = useState(false);
  if (!convexUrl) {
    return preview
      ? <DemoPreview onBack={() => setPreview(false)} />
      : <ConfigurationNotice onPreview={() => setPreview(true)} />;
  }
  return <ConnectedApp convexUrl={convexUrl} />;
}

function ConnectedApp({ convexUrl }: { convexUrl: string }) {
  const client = useMemo(() => new ConvexReactClient(convexUrl), [convexUrl]);
  return (
    <ConvexProvider client={client}>
      <CatanApp />
    </ConvexProvider>
  );
}

function CatanApp() {
  const [identity] = useState(loadGuestIdentity);
  const [name, setName] = useState(loadGuestName);
  const [roomCode, setRoomCode] = useState(loadRoomCode);
  const [joinCode, setJoinCode] = useState(loadRoomCode);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [showDemo, setShowDemo] = useState(false);

  const room = useQuery(
    api.rooms.getRoom,
    roomCode ? { code: roomCode, playerToken: identity.playerToken } : "skip",
  ) as RoomSnapshot | null | undefined;
  const messages = useQuery(
    api.rooms.listMessages,
    roomCode && room ? { code: roomCode, playerToken: identity.playerToken } : "skip",
  ) as ChatMessage[] | undefined;
  const events = useQuery(
    api.rooms.listEvents,
    roomCode && room ? { code: roomCode, playerToken: identity.playerToken } : "skip",
  ) as GameEvent[] | undefined;

  const createRoomMutation = useMutation(api.rooms.createRoom);
  const joinRoomMutation = useMutation(api.rooms.joinRoom);
  const setReadyMutation = useMutation(api.rooms.setReady);
  const startGameMutation = useMutation(api.rooms.startGame);
  const applyActionMutation = useMutation(api.rooms.applyGameAction);
  const heartbeatMutation = useMutation(api.rooms.heartbeat);
  const leaveRoomMutation = useMutation(api.rooms.leaveRoom);
  const sendMessageMutation = useMutation(api.rooms.sendMessage);

  const run = async <T,>(operation: () => Promise<T>): Promise<T | undefined> => {
    if (busy) return undefined;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      return await operation();
    } catch (cause) {
      setError(readError(cause));
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  const enterRoom = (code: string) => {
    const normalized = code.toUpperCase();
    saveRoomCode(normalized);
    setRoomCode(normalized);
    setJoinCode(normalized);
    setError("");
    setNotice("");
  };

  useEffect(() => {
    if (!roomCode || room !== null) return;
    setError("");
    setNotice(`Ingresá tu nombre para unirte a la sala ${roomCode}.`);
    saveRoomCode(null);
    setRoomCode("");
  }, [room, roomCode]);

  useEffect(() => {
    if (!roomCode || !room) return;
    const ping = () => {
      void heartbeatMutation({ code: roomCode, playerToken: identity.playerToken }).catch(() => undefined);
    };
    ping();
    const timer = window.setInterval(ping, 12_000);
    return () => window.clearInterval(timer);
  }, [roomCode, identity.playerToken, Boolean(room), heartbeatMutation]);

  const submitCreateRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim();
    if (normalizedName.length < 2) {
      setError("Escribí un nombre de al menos dos caracteres.");
      return;
    }
    saveGuestName(normalizedName);
    const created = await run(() =>
      createRoomMutation({
        code: createRoomCode(),
        playerId: identity.playerId,
        playerToken: identity.playerToken,
        name: normalizedName,
      }),
    );
    if (created?.code) enterRoom(created.code);
  };

  const submitJoinRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim();
    const code = joinCode.trim().toUpperCase();
    if (normalizedName.length < 2) {
      setError("Escribí un nombre de al menos dos caracteres.");
      return;
    }
    if (code.length !== 4) {
      setError("El código de sala tiene cuatro caracteres.");
      return;
    }
    saveGuestName(normalizedName);
    const joined = await run(() =>
      joinRoomMutation({
        code,
        playerId: identity.playerId,
        playerToken: identity.playerToken,
        name: normalizedName,
      }),
    );
    if (joined?.code) enterRoom(joined.code);
  };

  const saveNameInRoom = async () => {
    const normalizedName = name.trim();
    if (normalizedName.length < 2 || !roomCode) {
      setError("El nombre debe tener al menos dos caracteres.");
      return;
    }
    const joined = await run(() =>
      joinRoomMutation({
        code: roomCode,
        playerId: identity.playerId,
        playerToken: identity.playerToken,
        name: normalizedName,
      }),
    );
    if (joined) {
      saveGuestName(normalizedName);
      setNotice("Nombre actualizado.");
    }
  };

  const toggleReady = async (ready: boolean) => {
    if (!roomCode) return;
    await run(() => setReadyMutation({ code: roomCode, playerToken: identity.playerToken, ready }));
  };

  const startGame = async () => {
    if (!roomCode) return;
    await run(() => startGameMutation({ code: roomCode, playerToken: identity.playerToken }));
  };

  const submitGameAction = async (action: GameActionPayload) => {
    if (!roomCode) return;
    await run(() =>
      applyActionMutation({ code: roomCode, playerToken: identity.playerToken, action }),
    );
  };

  const sendMessage = async (body: string) => {
    if (!roomCode) return;
    await run(() => sendMessageMutation({ code: roomCode, playerToken: identity.playerToken, body }));
  };

  const leaveRoom = async () => {
    if (roomCode) await run(() => leaveRoomMutation({ code: roomCode, playerToken: identity.playerToken }));
    saveRoomCode(null);
    window.history.replaceState(null, "", window.location.pathname);
    setRoomCode("");
    setError("");
    setNotice("");
  };

  const copyInvite = async () => {
    if (!roomCode) return;
    const invite = `${window.location.origin}/?room=${roomCode}`;
    try {
      await navigator.clipboard.writeText(invite);
      setNotice("Invitación copiada.");
    } catch {
      setNotice(invite);
    }
  };

  const noticeBanner = (tone: "error" | "success") => {
    const message = tone === "error" ? error : notice;
    const palette =
      tone === "error"
        ? "border-[#edc4b9] bg-[#fff0eb] text-[#8a4033]"
        : "border-[#c9ddbf] bg-[#eff7e9] text-[#426846]";
    const dismiss = tone === "error" ? setError : setNotice;
    return (
      <div
        className={`mx-auto mb-3.5 flex items-start justify-between gap-2.5 rounded-xl border px-3.5 py-[11px] text-[13px] ${palette}`}
        role={tone === "error" ? "alert" : "status"}
      >
        {message}
        <button className="border-0 bg-transparent text-[19px] leading-none" type="button" aria-label="Cerrar" onClick={() => dismiss("")}>
          ×
        </button>
      </div>
    );
  };

  const frame = (content: ReactNode) => (
    <div className="min-h-screen bg-[#12372a] bg-gradient-to-br from-[#17402f] via-[#12372a] to-[#0e2c21]">
      <header className="mx-auto flex max-w-[1540px] items-center gap-3 px-6 pb-3.5 pt-[22px] text-[#f5f0df]">
        <span className="inline-grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[14px] border border-[#e2bf6c]/70 bg-gradient-to-br from-[#e0bb67] to-[#a97232] text-[23px] font-black text-[#1c372a] shadow-[0_5px_12px_rgba(27,48,33,0.18)]">
          C
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#d1a64f]">Catan Online</p>
          <p className="text-sm text-[#d7e1d6]">Comerciá, construí, conquistá.</p>
        </div>
        <span className="ml-auto hidden rounded-full border border-white/15 px-3 py-1 text-xs text-[#d8e4d7] sm:inline-flex">
          Partidas en tiempo real
        </span>
      </header>
      <main className="mx-auto min-h-[calc(100vh-150px)] w-[min(100%-32px,1540px)] pb-[34px] pt-[18px]">
        {error && noticeBanner("error")}
        {notice && noticeBanner("success")}
        {content}
      </main>
      <footer className="flex flex-wrap justify-center gap-x-2 gap-y-[5px] p-[18px] text-[11px] text-[#8c8e80]">
        Un juego de estrategia para construir juntos.{" "}
        <span className="text-[#a8a696]">Hecho para jugar con amigos.</span>
      </footer>
    </div>
  );

  const gameFrame = (content: ReactNode) => (
    <div className="relative h-dvh w-full overflow-hidden">
      {error && (
        <div
          className="fixed right-4 top-16 z-[120] flex max-w-[min(520px,calc(100vw-32px))] items-start justify-between gap-2.5 rounded-xl border border-[#edc4b9] bg-[#fff0eb] px-3 py-2.5 text-xs text-[#8a4033] shadow-[0_10px_28px_rgba(10,30,45,0.28)]"
          role="alert"
        >
          {error}
          <button className="border-0 bg-transparent text-[17px] leading-none" type="button" aria-label="Cerrar" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      {notice && (
        <div
          className="fixed right-4 top-16 z-[120] flex max-w-[min(520px,calc(100vw-32px))] items-start justify-between gap-2.5 rounded-xl border border-[#c9ddbf] bg-[#eff7e9] px-3 py-2.5 text-xs text-[#426846] shadow-[0_10px_28px_rgba(10,30,45,0.28)]"
          role="status"
        >
          {notice}
          <button className="border-0 bg-transparent text-[17px] leading-none" type="button" aria-label="Cerrar" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}
      {content}
    </div>
  );

  if (showDemo) return <DemoPreview onBack={() => setShowDemo(false)} />;

  if (roomCode && room === undefined) {
    return frame(
      <div className={`${CARD} mx-auto max-w-md p-8 text-center text-[#687365]`}>
        Conectando con la sala…
      </div>,
    );
  }

  if (roomCode && room) {
    if (room.status === "lobby") {
      return frame(
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <RoomLobby
            room={room}
            name={name}
            busy={busy}
            onNameChange={setName}
            onSaveName={saveNameInRoom}
            onToggleReady={toggleReady}
            onStart={startGame}
            onLeave={leaveRoom}
            onCopyInvite={copyInvite}
          />
          <FeedPanel messages={messages ?? []} events={events ?? []} disabled={busy} onSend={sendMessage} />
        </div>,
      );
    }

    if (!room.game) {
      return gameFrame(<div className={`${CARD} m-6 p-8 text-center`}>Cargando partida…</div>);
    }
    return gameFrame(
      <GameRoom
        room={room}
        messages={messages ?? []}
        events={events ?? []}
        busy={busy}
        onAction={submitGameAction}
        onSendMessage={sendMessage}
        onLeave={leaveRoom}
        onCopyInvite={copyInvite}
      />,
    );
  }

  return frame(
    <section className="mx-auto grid min-h-[min(72vh,680px)] max-w-[1180px] grid-cols-1 items-center gap-[clamp(32px,8vw,112px)] px-[18px] py-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
      <div>
        <p className={`${EYEBROW} text-[#dbb65f]`}>El clásico de estrategia, ahora online</p>
        <h1 className="mt-[18px] text-[clamp(3.15rem,7vw,6.8rem)] font-black leading-[0.97] tracking-[-0.065em] text-[#fff9e9] [text-wrap:balance]">
          Un camino más.
          <br />
          <em className="not-italic text-[#e0bd6c]">Una isla nueva.</em>
        </h1>
        <p className="mt-6 max-w-[490px] text-base leading-[1.8] text-[#d4dfd4]">
          Juntá recursos, negociá con tus amigos y conectá tus poblados. Sin cuentas: elegí un nombre y entrá a una sala.
        </p>
        <div className="mt-[30px] flex flex-wrap gap-[9px]">
          <span className="rounded-full border border-[#e6eede]/[0.16] px-[11px] py-2 text-[11px] text-[#e0e8dd]">⌂ Tablero aleatorio</span>
          <span className="rounded-full border border-[#e6eede]/[0.16] px-[11px] py-2 text-[11px] text-[#e0e8dd]">↗ 3–4 jugadores</span>
          <span className="rounded-full border border-[#e6eede]/[0.16] px-[11px] py-2 text-[11px] text-[#e0e8dd]">◈ Reglas validadas en servidor</span>
        </div>
      </div>

      <div className={`${CARD} px-[clamp(22px,4vw,34px)] py-[clamp(22px,4vw,34px)]`}>
        <div className="mb-5 flex gap-2 border-b border-[#ece5d7] pb-4">
          <span className="grid h-[45px] w-[45px] shrink-0 place-items-center rounded-[15px] bg-[#f4ebd6] text-[23px]">🎲</span>
          <div>
            <p className={EYEBROW}>Partida rápida</p>
            <h2 className="text-2xl font-black text-[#1d392b]">¿Cómo te llamamos?</h2>
          </div>
        </div>
        <label className="text-xs font-bold text-[#737b6e]" htmlFor="guest-name">
          Nombre de jugador
        </label>
        <input
          id="guest-name"
          className={`${FIELD} mt-1.5 w-full`}
          value={name}
          maxLength={24}
          autoComplete="nickname"
          placeholder="Ej.: Catanista"
          onChange={(event) => setName(event.target.value)}
        />

        <form className="mt-5" onSubmit={submitCreateRoom}>
          <button className={`${BTN_PRIMARY} w-full`} type="submit" disabled={busy}>
            Crear una sala
          </button>
        </form>

        <div className="my-5 flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-[#a5a394]">
          <span className="h-px flex-1 bg-[#ece5d7]" /> o unirse <span className="h-px flex-1 bg-[#ece5d7]" />
        </div>

        <form className="flex gap-2" onSubmit={submitJoinRoom}>
          <input
            className={`${FIELD} min-w-0 flex-1 font-mono uppercase tracking-[0.18em]`}
            aria-label="Código de sala"
            maxLength={4}
            placeholder="ABCD"
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
          />
          <button className={BTN_SECONDARY} type="submit" disabled={busy}>
            Unirse
          </button>
        </form>
        <button className={`${BTN_LINK} mt-4 w-full`} type="button" onClick={() => setShowDemo(true)}>
          Ver una partida de muestra
        </button>
        <p className="mt-4 text-center text-xs text-[#959487]">Tu identidad anónima se guarda en este navegador.</p>
      </div>
    </section>,
  );
}

function ConfigurationNotice({ onPreview }: { onPreview: () => void }) {
  return (
    <div className="min-h-screen bg-[#12372a] bg-gradient-to-br from-[#17402f] via-[#12372a] to-[#0e2c21]">
      <header className="mx-auto flex max-w-[1540px] items-center gap-3 px-6 pb-3.5 pt-[22px] text-[#f5f0df]">
        <span className="inline-grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[14px] border border-[#e2bf6c]/70 bg-gradient-to-br from-[#e0bb67] to-[#a97232] text-[23px] font-black text-[#1c372a] shadow-[0_5px_12px_rgba(27,48,33,0.18)]">
          C
        </span>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#d1a64f]">Catan Online</p>
      </header>
      <main className="mx-auto flex min-h-[70vh] w-[min(100%-32px,1540px)] items-center justify-center">
        <section className={`${CARD} max-w-xl p-8`}>
          <p className={EYEBROW}>Configuración necesaria</p>
          <h1 className="mt-2 text-3xl font-black text-[#1f3c2e]">Conectá el proyecto Convex</h1>
          <p className="mt-3 leading-7 text-[#6a7567]">
            Copiá <code>apps/web/.env.example</code> a <code>apps/web/.env.local</code>, agregá la URL de tu deployment y corré <code>bun run convex:dev</code>.
          </p>
          <button className={`${BTN_PRIMARY} mt-6`} type="button" onClick={onPreview}>
            Ver una partida de muestra
          </button>
        </section>
      </main>
    </div>
  );
}

function readError(error: unknown): string {
  if (!(error instanceof Error)) return "Ocurrió un error al conectar con la sala.";
  const message = error.message.replace(/^Uncaught Error:\s*/, "");
  try {
    const parsed = JSON.parse(message) as { data?: { message?: string }; message?: string };
    return parsed.data?.message ?? parsed.message ?? message;
  } catch {
    return message;
  }
}
