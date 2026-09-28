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

  return (
    <section className="cg-feed">
      <div className="cg-feed-tabs">
        <button
          type="button"
          className={`cg-feed-tab ${activeTab === "chat" ? "is-active" : ""}`}
          onClick={() => setActiveTab("chat")}
        >
          Chat · {messages.length}
        </button>
        <button
          type="button"
          className={`cg-feed-tab ${activeTab === "log" ? "is-active" : ""}`}
          onClick={() => setActiveTab("log")}
        >
          Registro · {events.length}
        </button>
      </div>

      <div ref={listRef} className="cg-feed-scroll" aria-live="polite">
        {activeTab === "chat" ? (
          messages.length === 0 ? (
            <p className="cg-feed-empty">Todavía no hay mensajes. ¡Saluden!</p>
          ) : (
            messages.map((message) => (
              <div key={message.id} className="cg-feed-item">
                <strong>{message.playerName}</strong>
                <time>{timeLabel(message.createdAt)}</time>
                <p>{message.body}</p>
              </div>
            ))
          )
        ) : events.length === 0 ? (
          <p className="cg-feed-empty">El registro aparecerá al empezar.</p>
        ) : (
          events.map((item) => (
            <div key={item.id} className="cg-feed-item is-event">
              <span>{timeLabel(item.createdAt)}</span>
              {item.message}
            </div>
          ))
        )}
      </div>

      {activeTab === "chat" && (
        <form className="cg-feed-form" onSubmit={submit}>
          <input
            className="cg-feed-input"
            maxLength={500}
            placeholder={disabled ? "Chat no disponible" : "Enviar un mensaje"}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            disabled={disabled || sending}
          />
          <button className="cg-feed-send" disabled={disabled || sending || !body.trim()} type="submit">
            Enviar
          </button>
        </form>
      )}
    </section>
  );
}
