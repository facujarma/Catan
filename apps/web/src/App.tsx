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

const TABLE_BACKGROUND =
  "[background-image:repeating-linear-gradient(90deg,#573924_0px,#573924_80px,#4e321f_80px,#4e321f_160px)]";

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
  const addBotMutation = useMutation(api.rooms.addBot);
  const removeBotMutation = useMutation(api.rooms.removeBot);
  const setTurnTimeLimitMutation = useMutation(api.rooms.setTurnTimeLimit);
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

  const addBot = async () => {
    if (!roomCode) return;
    await run(() => addBotMutation({ code: roomCode, playerToken: identity.playerToken }));
  };

  const removeBot = async (botId: string) => {
    if (!roomCode) return;
    await run(() =>
      removeBotMutation({ code: roomCode, playerToken: identity.playerToken, botId }),
    );
  };

  const setTurnTimeLimit = async (seconds: number) => {
    if (!roomCode) return;
    await run(() =>
      setTurnTimeLimitMutation({ code: roomCode, playerToken: identity.playerToken, seconds }),
    );
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
        ? "border-[#c96a4a] bg-[#fde8dd] text-[#8a3a22]"
        : "border-[#8fae5a] bg-[#eef4dc] text-[#4a6b28]";
    const dismiss = tone === "error" ? setError : setNotice;
    return (
      <div
        className={`mx-auto mb-4 flex max-w-xl items-center justify-between gap-3 rounded-2xl border-2 px-4 py-2.5 text-sm font-bold shadow-[0_3px_0_rgba(74,44,18,0.3)] ${palette}`}
        role={tone === "error" ? "alert" : "status"}
      >
        {message}
        <button
          className="border-0 bg-transparent text-lg leading-none opacity-60 enabled:hover:opacity-100"
          type="button"
          aria-label="Cerrar"
          onClick={() => dismiss("")}
        >
          ×
        </button>
      </div>
    );
  };

  const frame = (content: ReactNode) => (
    <div className={`min-h-screen bg-[#4a2e1c] ${TABLE_BACKGROUND}`}>
      <div className="flex min-h-screen flex-col bg-[radial-gradient(ellipse_at_50%_-10%,rgba(255,214,140,0.16),transparent_55%)]">
        <header className="mx-auto flex w-[min(100%-32px,960px)] items-center gap-3 pt-6">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border-2 border-[#8a5a1e] bg-gradient-to-b from-[#e8b25a] to-[#c98a34] text-2xl shadow-[0_4px_0_#8a5a1e]">
            🎲
          </span>
          <div>
            <p className="font-display text-2xl font-extrabold leading-none text-[#ffe9b8]">Catan</p>
            <p className="mt-0.5 text-xs font-semibold text-[#d9bd8d]">Jugá con amigos</p>
          </div>
        </header>
        <main className="mx-auto w-[min(100%-32px,960px)] flex-1 py-8">
          {error && noticeBanner("error")}
          {notice && noticeBanner("success")}
          {content}
        </main>
        <footer className="pb-6 text-center text-xs font-semibold text-[#c9a97e]">
          Hecho para jugar con amigos
        </footer>
      </div>
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
      <div className={`${CARD} mx-auto max-w-md p-8 text-center font-bold text-[#8a6a3a]`}>
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
            onAddBot={addBot}
            onRemoveBot={removeBot}
            onTurnTimeLimitChange={setTurnTimeLimit}
            onStart={startGame}
            onLeave={leaveRoom}
            onCopyInvite={copyInvite}
          />
          <FeedPanel messages={messages ?? []} events={events ?? []} disabled={busy} onSend={sendMessage} />
        </div>,
      );
    }

    if (!room.game) {
      return gameFrame(<div className={`${CARD} m-6 p-8 text-center font-bold text-[#8a6a3a]`}>Cargando partida…</div>);
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
    <div className="mx-auto flex max-w-xl flex-col items-center">
      <h1 className="text-center font-display text-4xl font-extrabold leading-tight text-[#ffe9b8] drop-shadow-[0_2px_0_rgba(0,0,0,0.3)] sm:text-5xl">
        Construí tu isla
      </h1>
      <p className="mt-2 text-center text-sm font-semibold text-[#d9bd8d]">
        3 a 4 jugadores · sin cuentas
      </p>

      <section className={`${CARD} mt-7 w-full p-6 sm:p-7`}>
        <label className="block text-sm font-bold text-[#7a5320]" htmlFor="guest-name">
          Tu nombre
        </label>
        <input
          id="guest-name"
          className={`${FIELD} mt-1.5`}
          value={name}
          maxLength={24}
          autoComplete="nickname"
          placeholder="Ej.: Catanista"
          onChange={(event) => setName(event.target.value)}
        />

        <form className="mt-5" onSubmit={submitCreateRoom}>
          <button className={`${BTN_PRIMARY} w-full`} type="submit" disabled={busy}>
            Crear sala
          </button>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs font-extrabold uppercase tracking-widest text-[#c0a273]">
          <span className="h-0.5 flex-1 rounded bg-[#e3cfa5]" /> o <span className="h-0.5 flex-1 rounded bg-[#e3cfa5]" />
        </div>

        <form className="flex gap-2" onSubmit={submitJoinRoom}>
          <input
            className={`${FIELD} min-w-0 flex-1 text-center font-display text-lg tracking-[0.3em]`}
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
      </section>

      <button className={`${BTN_LINK} mt-5`} type="button" onClick={() => setShowDemo(true)}>
        Ver una partida de muestra
      </button>
    </div>,
  );
}

function ConfigurationNotice({ onPreview }: { onPreview: () => void }) {
  return (
    <div className={`grid min-h-screen place-items-center bg-[#4a2e1c] p-6 ${TABLE_BACKGROUND}`}>
      <section className={`${CARD} w-full max-w-md p-7 text-center`}>
        <span className="text-4xl" aria-hidden="true">🎲</span>
        <p className={`${EYEBROW} mt-3`}>Configuración</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold text-[#4a2c12]">
          Falta conectar Convex
        </h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-[#8a6a3a]">
          Agregá <code className="rounded bg-[#efe0bd] px-1">VITE_CONVEX_URL</code> en{" "}
          <code className="rounded bg-[#efe0bd] px-1">apps/web/.env.local</code> y corré{" "}
          <code className="rounded bg-[#efe0bd] px-1">bun run convex:dev</code>.
        </p>
        <button className={`${BTN_PRIMARY} mt-5 w-full`} type="button" onClick={onPreview}>
          Ver una partida de muestra
        </button>
      </section>
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
