import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { ChatMessage, GameEvent } from "../model";

interface FeedPanelProps {
  messages: ChatMessage[];
  events: GameEvent[];
  disabled?: boolean;
  onSend: (body: string) => Promise<void>;
}

const TIME_FORMATTER = new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit" });

function timeLabel(timestamp: number): string {
  return TIME_FORMATTER.format(timestamp);
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
    `flex-1 rounded-lg border-2 px-2 py-1 font-display text-[11px] font-extrabold transition ${
      active
        ? "border-[#d9a44a] bg-[#ffe9b8] text-[#7a5320] shadow-[0_2px_0_#d9a44a]"
        : "border-transparent text-[#a08a5e] hover:bg-[#f0e2c4]"
    }`;

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border-2 border-[#c9a86a] bg-[#f7ecd4] shadow-[0_4px_0_rgba(74,44,18,0.25)]">
      <div className="flex gap-1.5 border-b-2 border-[#e3cfa5] p-1.5">
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
            <p className="px-1.5 py-[22px] text-center text-xs font-semibold text-[#b08a4a]">
              Todavía no hay mensajes. ¡Saluden!
            </p>
          ) : (
            messages.map((message) => (
              <div key={message.id} className="mb-2 text-xs leading-[1.45]">
                <strong className="font-extrabold text-[#4a2c12]">{message.playerName}</strong>
                <time className="float-right text-[9px] font-semibold text-[#b08a4a]">
                  {timeLabel(message.createdAt)}
                </time>
                <p className="mt-px break-words font-semibold text-[#7a5320]">{message.body}</p>
              </div>
            ))
          )
        ) : events.length === 0 ? (
          <p className="px-1.5 py-[22px] text-center text-xs font-semibold text-[#b08a4a]">
            El registro aparecerá al empezar.
          </p>
        ) : (
          events.map((item) => (
            <div key={item.id} className="mb-2 text-[11px] font-semibold leading-[1.45] text-[#8a6a3a]">
              <span className="mr-[5px] text-[9px] text-[#b08a4a]">
                {timeLabel(item.createdAt)}
              </span>
              {item.message}
            </div>
          ))
        )}
      </div>

      {activeTab === "chat" && (
        <form className="flex gap-1.5 border-t-2 border-[#e3cfa5] p-[7px]" onSubmit={submit}>
          <input
            className="min-w-0 flex-1 rounded-xl border-2 border-[#c9a86a] bg-[#fffaf0] px-2.5 py-[7px] text-xs font-semibold text-[#4a2c12] outline-none transition placeholder:text-[#c0a273] focus:border-[#a9793a]"
            maxLength={500}
            placeholder={disabled ? "Chat no disponible" : "Enviar un mensaje"}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            disabled={disabled || sending}
          />
          <button
            className="rounded-xl border-2 border-[#8a5a1e] bg-gradient-to-b from-[#e8b25a] to-[#c98a34] px-3 font-display text-xs font-extrabold text-[#4a2c12] shadow-[0_3px_0_#8a5a1e] transition enabled:hover:brightness-105 enabled:active:translate-y-0.5 disabled:opacity-50"
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
