const IDENTITY_KEY = "catan:guest-identity";
const ROOM_KEY = "catan:room-code";
const NAME_KEY = "catan:guest-name";

export interface GuestIdentity {
  playerId: string;
  playerToken: string;
}

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function loadGuestIdentity(): GuestIdentity {
  const stored = localStorage.getItem(IDENTITY_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Partial<GuestIdentity>;
      if (parsed.playerId && parsed.playerToken) {
        return { playerId: parsed.playerId, playerToken: parsed.playerToken };
      }
    } catch {
      localStorage.removeItem(IDENTITY_KEY);
    }
  }

  const identity = { playerId: randomHex(16), playerToken: randomHex(32) };
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  return identity;
}

export function loadGuestName(): string {
  return localStorage.getItem(NAME_KEY) ?? "";
}

export function saveGuestName(name: string): void {
  localStorage.setItem(NAME_KEY, name);
}

export function loadRoomCode(): string {
  const fromUrl = new URLSearchParams(window.location.search).get("room");
  const code = (fromUrl ?? localStorage.getItem(ROOM_KEY) ?? "").trim().toUpperCase();
  if (fromUrl) localStorage.setItem(ROOM_KEY, code);
  return code;
}

export function saveRoomCode(code: string | null): void {
  if (code) localStorage.setItem(ROOM_KEY, code);
  else localStorage.removeItem(ROOM_KEY);
}

export function createRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(4);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}
