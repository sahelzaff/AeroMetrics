import type { ChangeEvent } from 'react';

export interface BlueprintSection {
  id: string;
  chapterId: string;
  chapterName: string;
  questionCount: number;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  marksPerQuestion: number;
  negativeMarking: boolean;
}

interface SectionConfiguratorProps {
  sections: BlueprintSection[];
  chapterOptions: Array<{ id: string; name: string; count: number }>;
  onUpdate: (id: string, patch: Partial<BlueprintSection>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}

export function SectionConfigurator({
  sections,
  chapterOptions,
  onUpdate,
  onRemove,
  onAdd,
}: SectionConfiguratorProps) {
  return (
    <section className="card">
      <div className="mb-5 flex items-center justify-between">
        <h3 className="text-lg font-bold">Section Configuration</h3>
        <button type="button" className="btn-secondary" onClick={onAdd}>
          <span className="material-symbols-outlined mr-1 align-[-4px] text-base">add</span>
          Add Section
        </button>
      </div>

      <div className="space-y-3">
        {sections.map((section) => (
          <div key={section.id} className="surface-low rounded-xl p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <select
                className="input"
                value={section.chapterId}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                  const option = chapterOptions.find((item) => item.id === event.target.value);
                  onUpdate(section.id, {
                    chapterId: option?.id ?? '',
                    chapterName: option?.name ?? '',
                  });
                }}
              >
                <option value="">Select chapter</option>
                {chapterOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name} ({option.count} Qs)
                  </option>
                ))}
              </select>

              <select
                className="input"
                value={section.difficulty ?? ''}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                  const value = event.target.value as '' | 'EASY' | 'MEDIUM' | 'HARD';
                  onUpdate(section.id, { difficulty: value || undefined });
                }}
              >
                <option value="">All difficulties</option>
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </select>

              <input
                className="input"
                min={1}
                type="number"
                value={section.questionCount}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  onUpdate(section.id, { questionCount: Math.max(1, Number(event.target.value)) })
                }
                placeholder="Question count"
              />

              <input
                className="input"
                min={0.25}
                step={0.25}
                type="number"
                value={section.marksPerQuestion}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  onUpdate(section.id, { marksPerQuestion: Math.max(0.25, Number(event.target.value)) })
                }
                placeholder="Marks per question"
              />
            </div>

            <div className="mt-3 flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-semibold text-[var(--on-surface-variant)]">
                <input
                  checked={section.negativeMarking}
                  type="checkbox"
                  onChange={(event) => onUpdate(section.id, { negativeMarking: event.target.checked })}
                />
                Negative marking
              </label>

              <button type="button" className="text-xs font-semibold text-[var(--error)]" onClick={() => onRemove(section.id)}>
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
