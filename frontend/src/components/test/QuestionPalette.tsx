export type PaletteStatus = 'attempted' | 'current' | 'review' | 'not_attempted';

interface PaletteItem {
  id: string;
  index: number;
  status: PaletteStatus;
}

interface QuestionPaletteProps {
  items: PaletteItem[];
  currentIndex: number;
  onJump: (index: number) => void;
}

function statusClasses(status: PaletteStatus) {
  switch (status) {
    case 'attempted':
      return 'bg-emerald-100 text-emerald-700';
    case 'review':
      return 'bg-[var(--tertiary-fixed)] text-[var(--tertiary)]';
    case 'current':
      return 'bg-[var(--primary)] text-white shadow-md';
    case 'not_attempted':
    default:
      return 'bg-[var(--surface-high)] text-[var(--on-surface-variant)]';
  }
}

export function QuestionPalette({ items, currentIndex, onJump }: QuestionPaletteProps) {
  return (
    <aside className="card h-full">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">Question Navigator</h3>
        <span className="text-xs text-[var(--on-surface-variant)]">{currentIndex + 1}/{items.length}</span>
      </div>

      <div className="grid max-h-[46vh] grid-cols-5 gap-2 overflow-y-auto pr-1">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onJump(item.index)}
            className={`aspect-square rounded-lg text-xs font-bold transition hover:scale-105 ${statusClasses(item.status)}`}
          >
            {item.index + 1}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2 border-t ghost-separator pt-4 text-xs text-[var(--on-surface-variant)]">
        <p><span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" /> Attempted</p>
        <p><span className="inline-block h-2 w-2 rounded-sm bg-[var(--primary)]" /> Current</p>
        <p><span className="inline-block h-2 w-2 rounded-sm bg-[var(--tertiary)]" /> Marked for Review</p>
        <p><span className="inline-block h-2 w-2 rounded-sm bg-[var(--surface-high)]" /> Not Attempted</p>
      </div>
    </aside>
  );
}
