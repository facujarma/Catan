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

  const frame = (content: ReactNode) => (
    <div className="app-shell">
      <header className="site-header">
        <span className="brand-mark">C</span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#d1a64f]">Catan Online</p>
          <p className="text-sm text-[#d7e1d6]">Comerciá, construí, conquistá.</p>
        </div>
        <span className="ml-auto hidden rounded-full border border-white/15 px-3 py-1 text-xs text-[#d8e4d7] sm:inline-flex">Partidas en tiempo real</span>
      </header>
      <main className="app-content">
        {error && <div className="notice notice-error" role="alert">{error}<button type="button" aria-label="Cerrar" onClick={() => setError("")}>×</button></div>}
        {notice && <div className="notice notice-success" role="status">{notice}<button type="button" aria-label="Cerrar" onClick={() => setNotice("")}>×</button></div>}
        {content}
      </main>
      <footer className="site-footer">Un juego de estrategia para construir juntos. <span>Hecho para jugar con amigos.</span></footer>
    </div>
  );

  const gameFrame = (content: ReactNode) => (
    <div className="game-app-shell">
      {error && <div className="game-toast game-toast-error" role="alert">{error}<button type="button" aria-label="Cerrar" onClick={() => setError("")}>×</button></div>}
      {notice && <div className="game-toast game-toast-success" role="status">{notice}<button type="button" aria-label="Cerrar" onClick={() => setNotice("")}>×</button></div>}
      {content}
    </div>
  );

  if (showDemo) return <DemoPreview onBack={() => setShowDemo(false)} />;

  if (roomCode && room === undefined) {
    return frame(<div className="panel-card mx-auto max-w-md p-8 text-center text-[#687365]">Conectando con la sala…</div>);
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

    if (!room.game) return gameFrame(<div className="panel-card p-8 text-center">Cargando partida…</div>);
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
    <section className="home-grid">
      <div className="home-copy">
        <p className="eyebrow text-[#dbb65f]">El clásico de estrategia, ahora online</p>
        <h1>Un camino más.<br /><em>Una isla nueva.</em></h1>
        <p className="home-description">Juntá recursos, negociá con tus amigos y conectá tus poblados. Sin cuentas: elegí un nombre y entrá a una sala.</p>
        <div className="home-points">
          <span>⌂ Tablero aleatorio</span><span>↗ 3–4 jugadores</span><span>◈ Reglas validadas en servidor</span>
        </div>
      </div>

      <div className="home-card panel-card">
        <div className="mb-5 flex gap-2 border-b border-[#ece5d7] pb-4">
          <span className="home-card-icon">🎲</span>
          <div>
            <p className="eyebrow">Partida rápida</p>
            <h2 className="text-2xl font-black text-[#1d392b]">¿Cómo te llamamos?</h2>
          </div>
        </div>
        <label className="field-label" htmlFor="guest-name">Nombre de jugador</label>
        <input
          id="guest-name"
          className="field-input mt-1.5 w-full"
          value={name}
          maxLength={24}
          autoComplete="nickname"
          placeholder="Ej.: Catanista"
          onChange={(event) => setName(event.target.value)}
        />

        <form className="mt-5" onSubmit={submitCreateRoom}>
          <button className="button-primary w-full" type="submit" disabled={busy}>
            Crear una sala
          </button>
        </form>

        <div className="my-5 flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-[#a5a394]">
          <span className="h-px flex-1 bg-[#ece5d7]" /> o unirse <span className="h-px flex-1 bg-[#ece5d7]" />
        </div>

        <form className="flex gap-2" onSubmit={submitJoinRoom}>
          <input
            className="field-input min-w-0 flex-1 font-mono uppercase tracking-[0.18em]"
            aria-label="Código de sala"
            maxLength={4}
            placeholder="ABCD"
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
          />
          <button className="button-secondary" type="submit" disabled={busy}>Unirse</button>
        </form>
        <button className="button-link mt-4 w-full" type="button" onClick={() => setShowDemo(true)}>
          Ver una partida de muestra
        </button>
        <p className="mt-4 text-center text-xs text-[#959487]">Tu identidad anónima se guarda en este navegador.</p>
      </div>
    </section>,
  );
}

function ConfigurationNotice({ onPreview }: { onPreview: () => void }) {
  return (
    <div className="app-shell">
      <header className="site-header"><span className="brand-mark">C</span><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#d1a64f]">Catan Online</p></header>
      <main className="app-content flex min-h-[70vh] items-center justify-center">
        <section className="panel-card max-w-xl p-8">
          <p className="eyebrow">Configuración necesaria</p>
          <h1 className="mt-2 text-3xl font-black text-[#1f3c2e]">Conectá el proyecto Convex</h1>
          <p className="mt-3 leading-7 text-[#6a7567]">Copiá <code>apps/web/.env.example</code> a <code>apps/web/.env.local</code>, agregá la URL de tu deployment y corré <code>bun run convex:dev</code>.</p>
          <button className="button-primary mt-6" type="button" onClick={onPreview}>Ver una partida de muestra</button>
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
