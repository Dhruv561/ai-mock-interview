export function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="font-mono text-[11px] tracking-wider text-ink-faint">
        AI MOCK INTERVIEW
      </div>
      <p className="max-w-[26ch] text-sm text-ink-muted">
        Starting records your microphone and reads the code editor on this
        page. You can pause or end at any time.
      </p>
      <button
        type="button"
        onClick={onStart}
        className="rounded-md bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
      >
        Start AI Interview
      </button>
    </div>
  );
}
