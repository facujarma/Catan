import { useMemo } from "react";
import { createDemoSnapshot } from "../demo";
import GameRoom from "./GameRoom";

export default function DemoPreview({ onBack }: { onBack: () => void }) {
  const demo = useMemo(createDemoSnapshot, []);

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <GameRoom
        room={demo.room}
        messages={demo.messages}
        events={demo.events}
        busy={false}
        demo
        onAction={async () => undefined}
        onSendMessage={async () => undefined}
        onRequestPause={async () => undefined}
        onVotePause={async () => undefined}
        onCancelPauseRequest={async () => undefined}
        onLeave={onBack}
        onCopyInvite={() => undefined}
      />
    </div>
  );
}
