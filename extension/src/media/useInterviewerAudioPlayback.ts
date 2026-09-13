import { useEffect, useState } from "react";
import type { InterviewSocket } from "../networking/websocket";
import { createInterviewerAudioPlayer } from "./interviewerAudioPlayer";

/**
 * Drives interviewer TTS playback from real backend events (Feature 10,
 * architecture.md §M) — same "hook owns browser-API lifecycle, panel just
 * reads state" shape as useMicrophoneCapture.ts. Playback mechanics
 * (Web Audio scheduling, mute gain) stay inside interviewerAudioPlayer.ts;
 * this hook only surfaces the two booleans the UI needs.
 */
export function useInterviewerAudioPlayback(socket: InterviewSocket) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  // Lazy useState initializer (not useRef(createInterviewerAudioPlayer(...)))
  // so the player/AudioContext is constructed exactly once — React's
  // react-hooks/refs rule disallows reading ref.current during render, and
  // a plain useRef(fn()) call would also construct-and-discard a fresh
  // instance on every render anyway.
  const [player] = useState(() =>
    createInterviewerAudioPlayer({ onSpeakingChange: setIsSpeaking }),
  );

  useEffect(() => {
    const unsubscribeEvent = socket.onEvent((event) => {
      if (event.type === "interviewer.audio.start") player.handleStart(event.format);
      else if (event.type === "interviewer.audio.end") player.handleEnd();
    });
    const unsubscribeAudio = socket.onAudioChunk((chunk) => player.handleChunk(chunk));

    return () => {
      unsubscribeEvent();
      unsubscribeAudio();
    };
  }, [socket, player]);

  function toggleMute() {
    const next = !player.isMuted();
    player.setMuted(next);
    setIsMuted(next);
  }

  return { isSpeaking, isMuted, toggleMute };
}
