import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api, authHeaders } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { SectionConfigurator, type BlueprintSection } from '../components/blueprint/SectionConfigurator';

interface StructureSubject {
  id: string;
  name: string;
  chapters: Array<{ id: string; name: string; questionCount: number }>;
}

function makeSectionId() {
  return `sec-${Math.random().toString(36).slice(2, 10)}`;
}

export function BlueprintPage() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  const [subjectId, setSubjectId] = useState('');
  const [blueprintName, setBlueprintName] = useState('Advanced Weekly Skill Check');
  const [description, setDescription] = useState('Balanced chapter-wise evaluation with weighted randomization.');
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(90);
  const [sections, setSections] = useState<BlueprintSection[]>([
    {
      id: makeSectionId(),
      chapterId: '',
      chapterName: '',
      questionCount: 10,
      marksPerQuestion: 1,
      difficulty: 'MEDIUM',
      negativeMarking: false,
    },
  ]);

  const structureQuery = useQuery({
    queryKey: ['structure'],
    queryFn: async () => {
      const { data } = await api.get<StructureSubject[]>('/question-bank/structure', {
        headers: authHeaders(accessToken),
      });
      return data;
    },
  });

  const selectedSubject = useMemo(
    () => structureQuery.data?.find((subject) => subject.id === subjectId),
    [structureQuery.data, subjectId],
  );

  const chapterOptions = useMemo(
    () =>
      (selectedSubject?.chapters ?? []).map((chapter) => ({
        id: chapter.id,
        name: chapter.name,
        count: chapter.questionCount,
      })),
    [selectedSubject],
  );

  const selectedCount = sections.reduce((sum, section) => sum + section.questionCount, 0);
  const totalMarks = sections.reduce((sum, section) => sum + section.questionCount * section.marksPerQuestion, 0);

  const sectionCompletion = useMemo(() => {
    if (sections.length === 0) {
      return 0;
    }
    const valid = sections.filter((section) => section.chapterId).length;
    return Math.round((valid / sections.length) * 100);
  }, [sections]);

  const canCreate = Boolean(subjectId) && selectedCount > 0 && sections.every((section) => section.chapterId);

  const createBlueprint = useMutation({
    mutationFn: async () => {
      if (!canCreate) {
        throw new Error('Complete blueprint details before publishing.');
      }

      const payload = {
        subjectId,
        name: blueprintName,
        totalQuestions: selectedCount,
        timeLimitMinutes,
        rules: sections.map((section) => ({
          chapterId: section.chapterId,
          questionCount: section.questionCount,
          difficulty: section.difficulty,
        })),
      };

      const { data } = await api.post('/blueprints', payload, {
        headers: authHeaders(accessToken),
      });
      return data as { id: string };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['blueprints'] });
    },
  });

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8">
        <h2 className="headline-tight text-3xl font-bold">Create Test Blueprint</h2>
        <p className="mt-1 text-sm text-[var(--on-surface-variant)]">{description}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <section className="card">
            <h3 className="mb-5 text-lg font-bold">Test Details</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">Blueprint Name</label>
                <input className="input" value={blueprintName} onChange={(e) => setBlueprintName(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">Description</label>
                <textarea className="input min-h-[84px]" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">Subject</label>
                <select className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                  <option value="">Select subject</option>
                  {structureQuery.data?.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">Duration (Minutes)</label>
                <input
                  className="input"
                  type="number"
                  min={5}
                  value={timeLimitMinutes}
                  onChange={(e) => setTimeLimitMinutes(Math.max(5, Number(e.target.value)))}
                />
              </div>
            </div>
          </section>

          <SectionConfigurator
            sections={sections}
            chapterOptions={chapterOptions}
            onAdd={() =>
              setSections((prev) => [
                ...prev,
                {
                  id: makeSectionId(),
                  chapterId: '',
                  chapterName: '',
                  questionCount: 5,
                  marksPerQuestion: 1,
                  difficulty: undefined,
                  negativeMarking: false,
                },
              ])
            }
            onRemove={(id) => setSections((prev) => prev.filter((section) => section.id !== id))}
            onUpdate={(id, patch) =>
              setSections((prev) => prev.map((section) => (section.id === id ? { ...section, ...patch } : section)))
            }
          />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:col-span-4 lg:self-start">
          <section className="card">
            <h3 className="mb-4 text-lg font-bold">Blueprint Summary</h3>
            <div className="space-y-3 text-sm">
              <div className="surface-low rounded-xl p-4">
                <p className="text-xs uppercase tracking-[0.1em] text-[var(--on-surface-variant)]">Questions</p>
                <p className="text-2xl font-bold">{selectedCount}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="surface-low rounded-xl p-3">
                  <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--on-surface-variant)]">Total Marks</p>
                  <p className="text-xl font-bold">{totalMarks}</p>
                </div>
                <div className="surface-low rounded-xl p-3">
                  <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--on-surface-variant)]">Time</p>
                  <p className="text-xl font-bold">{timeLimitMinutes}m</p>
                </div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs text-[var(--on-surface-variant)]">
                  <span>Section Completion</span>
                  <span>{sectionCompletion}%</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--surface-high)]">
                  <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${sectionCompletion}%` }} />
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-3 border-t ghost-separator pt-4">
              <button type="button" className="btn-primary w-full" disabled={!canCreate || createBlueprint.isPending} onClick={() => createBlueprint.mutate()}>
                Publish Blueprint
              </button>
              {createBlueprint.isSuccess ? <p className="text-xs font-semibold text-emerald-700">Blueprint created successfully. Go to Take Test page.</p> : null}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
