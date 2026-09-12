export function EndReviewButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="shrink-0 rounded-md border border-panel-border bg-card-bg px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-panel-bg disabled:cursor-not-allowed disabled:opacity-40"
    >
      End & review
    </button>
  );
}
