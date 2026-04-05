interface TimerBadgeProps {
  secondsLeft: number;
}

function formatClock(totalSeconds: number) {
  const safe = Math.max(totalSeconds, 0);
  const hours = Math.floor(safe / 3600)
    .toString()
    .padStart(2, '0');
  const minutes = Math.floor((safe % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor(safe % 60)
    .toString()
    .padStart(2, '0');

  return `${hours}:${minutes}:${seconds}`;
}

export function TimerBadge({ secondsLeft }: TimerBadgeProps) {
  const critical = secondsLeft <= 300;
  return (
    <div className={`rounded-full px-4 py-1.5 text-sm font-bold ${critical ? 'bg-[var(--error-container)] text-[var(--error)]' : 'bg-white text-[var(--on-surface)]'}`}>
      <span className="mr-1 material-symbols-outlined align-[-4px] text-base">timer</span>
      {formatClock(secondsLeft)}
    </div>
  );
}
