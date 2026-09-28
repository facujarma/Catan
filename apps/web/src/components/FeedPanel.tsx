import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { ChatMessage, GameEvent } from "../model";

interface FeedPanelProps {
  messages: ChatMessage[];
  events: GameEvent[];
  disabled?: boolean;
  onSend: (body: string) => Promise<void>;
}

function timeLabel(timestamp: number): string {
  return new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit" }).format(timestamp);
}

export default function FeedPanel({ messages, events, disabled = false, onSend }: FeedPanelProps) {
  const [activeTab, setActiveTab] = useState<"chat" | "log">("chat");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const items = activeTab === "chat" ? messages : events;
  const latestItemId = items.at(-1)?.id;

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [activeTab, items.length, latestItemId]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = body.trim();
    if (!content || sending || disabled) return;
    setSending(true);
    try {
      await onSend(content);
      setBody("");
    } finally {
      setSending(false);
    }
  };

  const tabClass = (active: boolean) =>
    `flex-1 rounded-[7px] border-0 px-2 py-[5px] text-[11px] font-extrabold transition ${
      active ? "bg-[#efe6d1] text-[#4d4433]" : "bg-transparent text-ink-soft hover:bg-[#f3ecdc]"
    }`;

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-black/[0.18] bg-paper-soft shadow-[0_4px_14px_rgba(8,30,48,0.22)]">
      <div className="flex gap-1 border-b border-line p-1.5">
        <button
          type="button"
          className={tabClass(activeTab === "chat")}
          onClick={() => setActiveTab("chat")}
        >
          Chat · {messages.length}
        </button>
        <button
          type="button"
          className={tabClass(activeTab === "log")}
          onClick={() => setActiveTab("log")}
        >
          Registro · {events.length}
        </button>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2" aria-live="polite">
        {activeTab === "chat" ? (
          messages.length === 0 ? (
            <p className="px-1.5 py-[22px] text-center text-xs text-[#9a9384]">
              Todavía no hay mensajes. ¡Saluden!
            </p>
          ) : (
            messages.map((message) => (
              <div key={message.id} className="mb-2 text-xs leading-[1.45]">
                <strong className="font-extrabold text-[#3c4c3a]">{message.playerName}</strong>
                <time className="float-right text-[9px] text-[#a8a191]">
                  {timeLabel(message.createdAt)}
                </time>
                <p className="mt-px break-words text-[#5d594c]">{message.body}</p>
              </div>
            ))
          )
        ) : events.length === 0 ? (
          <p className="px-1.5 py-[22px] text-center text-xs text-[#9a9384]">
            El registro aparecerá al empezar.
          </p>
        ) : (
          events.map((item) => (
            <div key={item.id} className="mb-2 text-[11px] leading-[1.45] text-[#6c6656]">
              <span className="mr-[5px] text-[9px] text-[#8b8271]">
                {timeLabel(item.createdAt)}
              </span>
              {item.message}
            </div>
          ))
        )}
      </div>

      {activeTab === "chat" && (
        <form className="flex gap-1.5 border-t border-line p-[7px]" onSubmit={submit}>
          <input
            className="min-w-0 flex-1 rounded-lg border border-line bg-white px-2.5 py-[7px] text-xs text-ink outline-none transition placeholder:text-[#b0afa3] focus:ring-2 focus:ring-ocean/40"
            maxLength={500}
            placeholder={disabled ? "Chat no disponible" : "Enviar un mensaje"}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            disabled={disabled || sending}
          />
          <button
            className="rounded-lg bg-ocean px-3 text-xs font-extrabold text-white transition enabled:hover:brightness-110 disabled:opacity-50"
            disabled={disabled || sending || !body.trim()}
            type="submit"
          >
            Enviar
          </button>
        </form>
      )}
    </section>
  );
}
