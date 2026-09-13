import { useEffect, useRef, useState } from "react";
import type { ConvaiSocket } from "../networking/convaiSocket";
import { createInterviewerAudioPlayer } from "./interviewerAudioPlayer";

// No explicit "utterance ended" event exists in this protocol (unlike the
// real pipeline's interviewer.audio.end) — the agent just stops sending
// "audio" events when it's done talking. A gap this long between chunks
// stands in for that missing signal, just to keep isSpeaking/the speaking
// badge accurate. Janky but sufficient for judging the conversational feel.
const SILENCE_END_MS = 600;

/** Convai reports e.g. "pcm_16000"; interviewerAudioPlayer.ts expects
 * "pcm_s16le_16000" — same bytes (16-bit signed PCM, platform/little-endian,
 * mono; confirmed against @elevenlabs/client's own source, see
 * networking/convaiSocket.ts's header comment), different naming
 * convention between ElevenLabs' own products. Translate rather than fork
 * the player for one string format. */
function toPlayerFormat(convaiFormat: string): string {
  const match = /^pcm_(\d+)$/.exec(convaiFormat);
  return match ? `pcm_s16le_${match[1]}` : convaiFormat;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Convai analog of media/useInterviewerAudioPlayback.ts — reuses
 * interviewerAudioPlayer.ts (Web Audio scheduling, mute gain, level meter)
 * completely unchanged; only the event source differs.
 */
export function useConvaiAudioPlayback(socket: ConvaiSocket | null) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [player] = useState(() =>
    createInterviewerAudioPlayer({ onSpeakingChange: setIsSpeaking }),
  );
  const outputFormatRef = useRef("pcm_s16le_16000");
  const utteranceOpenRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!socket) return;

    function endUtterance() {
      player.handleEnd();
      utteranceOpenRef.current = false;
    }

    const unsubscribe = socket.onEvent((event) => {
      if (event.type === "metadata") {
        outputFormatRef.current = toPlayerFormat(event.metadata.agentOutputAudioFormat);
      } else if (event.type === "audio") {
        if (!utteranceOpenRef.current) {
          player.handleStart(outputFormatRef.current);
          utteranceOpenRef.current = true;
        }
        player.handleChunk(base64ToArrayBuffer(event.base64));
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(endUtterance, SILENCE_END_MS);
      } else if (event.type === "interruption") {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        endUtterance();
      }
    });

    return () => {
      unsubscribe();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, [socket, player]);

  function toggleMute() {
    const next = !player.isMuted();
    player.setMuted(next);
    setIsMuted(next);
  }

  return { isSpeaking, isMuted, toggleMute, getAnalyser: player.getAnalyser };
}
