interface QuestionOptionProps {
  label: string;
  text: string;
  selected: boolean;
  onSelect: () => void;
}

export function QuestionOption({ label, text, selected, onSelect }: QuestionOptionProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group flex w-full items-center rounded-xl px-4 py-4 text-left transition ${
        selected
          ? 'bg-[color:rgba(33,112,228,0.12)] text-[var(--on-surface)] soft-shadow'
          : 'bg-[var(--surface-low)] hover:bg-[color:rgba(33,112,228,0.08)]'
      }`}
    >
      <span
        className={`mr-4 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${
          selected
            ? 'bg-[var(--primary)] text-white'
            : 'bg-[var(--surface-high)] text-[var(--on-surface-variant)]'
        }`}
      >
        {label}
      </span>
      <span className="text-sm font-medium">{text}</span>
    </button>
  );
}
