// The "spectrogram" — a handful of bars driven by real audio levels
// (media/useAudioLevels.ts), not a decorative CSS loop. Used for both the
// candidate's mic input and the interviewer's TTS playback; `tone` just
// picks a palette so it reads correctly against each panel layout's
// background.
const MIN_HEIGHT_PCT = 10;

export function AudioLevelMeter({
  levels,
  tone = "accent",
  label,
}: {
  levels: number[];
  tone?: "accent" | "on-dark";
  label?: string;
}) {
  const barClass = tone === "on-dark" ? "bg-accent-on-dark" : "bg-accent";
  return (
    <div
      className="flex h-[22px] items-end gap-[3px]"
      role="img"
      aria-label={label ?? "Audio level"}
    >
      {levels.map((level, i) => (
        <span
          key={i}
          className={`w-[3px] rounded-full ${barClass} transition-[height] duration-75 ease-out`}
          style={{ height: `${Math.max(MIN_HEIGHT_PCT, level * 100)}%` }}
        />
      ))}
    </div>
  );
}
