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

interface AutoPlanResponse {
  previewOnly: boolean;
  rules: Array<{
    chapterId: string;
    questionCount: number;
    difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  }>;
  diagnostics: {
    mode: 'new_user_equal_mix' | 'weakness_weighted_mix';
    requestedTotalQuestions: number;
    allocatedTotalQuestions: number;
    chapters: Array<{
      chapterId: string;
      chapterName: string;
      weight: number;
      capacity: number;
      allocated: number;
      accuracy?: number;
      priorityScore?: number;
      trend?: 'UP' | 'DOWN' | 'STABLE';
    }>;
  };
}

function makeSectionId() {
  return `sec-${Math.random().toString(36).slice(2, 10)}`;
}

export function BlueprintPage() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  const [subjectId, setSubjectId] = useState('');
  const [mode, setMode] = useState<'manual' | 'auto'>('manual');
  const [blueprintName, setBlueprintName] = useState('Advanced Weekly Skill Check');
  const [description, setDescription] = useState('Balanced chapter-wise evaluation with weighted randomization.');
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(90);
  const [totalQuestionsAuto, setTotalQuestionsAuto] = useState(30);

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

  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [prioritizeWeakChapters, setPrioritizeWeakChapters] = useState(true);
  const [weaknessBoostPercent, setWeaknessBoostPercent] = useState(100);
  const [minimumPerChapter, setMinimumPerChapter] = useState(1);
  const [maxPerChapter, setMaxPerChapter] = useState<number | ''>('');
  const [difficultyDistribution, setDifficultyDistribution] = useState({ easy: 30, medium: 50, hard: 20 });

  const [autoPlan, setAutoPlan] = useState<AutoPlanResponse | null>(null);

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

  const selectedCountManual = sections.reduce((sum, section) => sum + section.questionCount, 0);
  const totalQuestions = mode === 'manual' ? selectedCountManual : totalQuestionsAuto;
  const totalMarks = mode === 'manual'
    ? sections.reduce((sum, section) => sum + section.questionCount * section.marksPerQuestion, 0)
    : totalQuestionsAuto;

  const sectionCompletion = useMemo(() => {
    if (mode !== 'manual') {
      if (!selectedChapterIds.length) {
        return 0;
      }
      return Math.min(100, Math.round((selectedChapterIds.length / Math.max(chapterOptions.length, 1)) * 100));
    }
    if (sections.length === 0) {
      return 0;
    }
    const valid = sections.filter((section) => section.chapterId).length;
    return Math.round((valid / sections.length) * 100);
  }, [mode, selectedChapterIds, chapterOptions.length, sections]);

  const difficultyTotal =
    difficultyDistribution.easy + difficultyDistribution.medium + difficultyDistribution.hard;

  const canGenerateAutoPlan =
    Boolean(subjectId) &&
    mode === 'auto' &&
    selectedChapterIds.length > 0 &&
    totalQuestionsAuto > 0 &&
    difficultyTotal === 100;

  const canCreateManual =
    Boolean(subjectId) &&
    selectedCountManual > 0 &&
    sections.every((section) => section.chapterId);

  const canCreateAuto = Boolean(subjectId) && selectedChapterIds.length > 0 && totalQuestionsAuto > 0;
  const canCreate = mode === 'manual' ? canCreateManual : canCreateAuto;

  const autoPlanMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        subjectId,
        name: blueprintName,
        totalQuestions: totalQuestionsAuto,
        timeLimitMinutes,
        mode: 'auto' as const,
        autoConfig: {
          chapterIds: selectedChapterIds,
          minimumPerChapter,
          maxPerChapter: maxPerChapter === '' ? undefined : Number(maxPerChapter),
          prioritizeWeakChapters,
          weaknessBoostPercent,
          difficultyDistribution,
        },
      };

      const { data } = await api.post<AutoPlanResponse>('/blueprints/auto-plan', payload, {
        headers: authHeaders(accessToken),
      });
      return data;
    },
    onSuccess: (data) => {
      setAutoPlan(data);
    },
  });

  const createBlueprint = useMutation({
    mutationFn: async () => {
      if (!canCreate) {
        throw new Error('Complete blueprint details before publishing.');
      }

      const payload =
        mode === 'manual'
          ? {
              subjectId,
              name: blueprintName,
              totalQuestions: selectedCountManual,
              timeLimitMinutes,
              mode: 'manual' as const,
              rules: sections.map((section) => ({
                chapterId: section.chapterId,
                questionCount: section.questionCount,
                difficulty: section.difficulty,
              })),
            }
          : {
              subjectId,
              name: blueprintName,
              totalQuestions: totalQuestionsAuto,
              timeLimitMinutes,
              mode: 'auto' as const,
              autoConfig: {
                chapterIds: selectedChapterIds,
                minimumPerChapter,
                maxPerChapter: maxPerChapter === '' ? undefined : Number(maxPerChapter),
                prioritizeWeakChapters,
                weaknessBoostPercent,
                difficultyDistribution,
              },
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

  const toggleChapter = (chapterId: string) => {
    setAutoPlan(null);
    setSelectedChapterIds((prev) =>
      prev.includes(chapterId) ? prev.filter((id) => id !== chapterId) : [...prev, chapterId],
    );
  };

  const switchMode = (nextMode: 'manual' | 'auto') => {
    setMode(nextMode);
    setAutoPlan(null);
  };

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
            <div className="mb-4 inline-flex rounded-xl border border-[var(--outline-ghost)] p-1">
              <button
                type="button"
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  mode === 'manual' ? 'bg-[var(--primary)] text-white' : 'text-[var(--on-surface-variant)]'
                }`}
                onClick={() => switchMode('manual')}
              >
                Manual Setup
              </button>
              <button
                type="button"
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  mode === 'auto' ? 'bg-[var(--primary)] text-white' : 'text-[var(--on-surface-variant)]'
                }`}
                onClick={() => switchMode('auto')}
              >
                Auto (Weakness-Aware)
              </button>
            </div>

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
                <select
                  className="input"
                  value={subjectId}
                  onChange={(e) => {
                    setSubjectId(e.target.value);
                    setSelectedChapterIds([]);
                    setAutoPlan(null);
                  }}
                >
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

          {mode === 'manual' ? (
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
          ) : (
            <section className="card space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">Automatic Rule Generator</h3>
                <span className="rounded-full bg-[var(--secondary-container)] px-3 py-1 text-xs font-bold text-[var(--primary)]">
                  Weighted by Weak Chapters
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">Total Questions</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    value={totalQuestionsAuto}
                    onChange={(e) => {
                      setAutoPlan(null);
                      setTotalQuestionsAuto(Math.max(1, Number(e.target.value)));
                    }}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">Weakness Boost %</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={weaknessBoostPercent}
                    onChange={(e) => {
                      setAutoPlan(null);
                      setWeaknessBoostPercent(Math.max(0, Number(e.target.value)));
                    }}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">Minimum / Chapter</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={minimumPerChapter}
                    onChange={(e) => {
                      setAutoPlan(null);
                      setMinimumPerChapter(Math.max(0, Number(e.target.value)));
                    }}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">Maximum / Chapter (Optional)</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    placeholder="No max"
                    value={maxPerChapter}
                    onChange={(e) => {
                      setAutoPlan(null);
                      setMaxPerChapter(e.target.value ? Math.max(1, Number(e.target.value)) : '');
                    }}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm font-medium text-[var(--on-surface-variant)]">
                <input
                  type="checkbox"
                  checked={prioritizeWeakChapters}
                  onChange={(e) => {
                    setAutoPlan(null);
                    setPrioritizeWeakChapters(e.target.checked);
                  }}
                />
                Prioritize weak chapters based on user performance snapshots
              </label>

              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">Difficulty Distribution (must total 100)</p>
                <div className="grid grid-cols-3 gap-3">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={difficultyDistribution.easy}
                    onChange={(e) => {
                      setAutoPlan(null);
                      setDifficultyDistribution((prev) => ({ ...prev, easy: Math.max(0, Number(e.target.value)) }));
                    }}
                    placeholder="Easy %"
                  />
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={difficultyDistribution.medium}
                    onChange={(e) => {
                      setAutoPlan(null);
                      setDifficultyDistribution((prev) => ({ ...prev, medium: Math.max(0, Number(e.target.value)) }));
                    }}
                    placeholder="Medium %"
                  />
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={difficultyDistribution.hard}
                    onChange={(e) => {
                      setAutoPlan(null);
                      setDifficultyDistribution((prev) => ({ ...prev, hard: Math.max(0, Number(e.target.value)) }));
                    }}
                    placeholder="Hard %"
                  />
                </div>
                <p className={`mt-2 text-xs font-semibold ${difficultyTotal === 100 ? 'text-emerald-700' : 'text-[var(--error)]'}`}>
                  Distribution Total: {difficultyTotal}%
                </p>
              </div>

              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">Select Chapters</p>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {chapterOptions.map((chapter) => {
                    const checked = selectedChapterIds.includes(chapter.id);
                    return (
                      <label
                        key={chapter.id}
                        className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2 text-sm transition ${
                          checked ? 'border-[var(--primary)] bg-[var(--secondary-container)]/30' : 'border-[var(--outline-ghost)]'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <input type="checkbox" checked={checked} onChange={() => toggleChapter(chapter.id)} />
                          {chapter.name}
                        </span>
                        <span className="text-xs text-[var(--on-surface-variant)]">{chapter.count} Qs</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                className="btn-secondary"
                disabled={!canGenerateAutoPlan || autoPlanMutation.isPending}
                onClick={() => autoPlanMutation.mutate()}
              >
                {autoPlanMutation.isPending ? 'Generating Plan...' : 'Generate Auto Plan'}
              </button>

              {autoPlan ? (
                <div className="space-y-4 rounded-xl border border-[var(--outline-ghost)] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-bold text-blue-700">
                      Mode: {autoPlan.diagnostics.mode === 'weakness_weighted_mix' ? 'Weakness Weighted' : 'Equal Mix'}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                      Allocated: {autoPlan.diagnostics.allocatedTotalQuestions}/{autoPlan.diagnostics.requestedTotalQuestions}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-[var(--on-surface-variant)]">
                        <tr>
                          <th className="py-2">Chapter</th>
                          <th className="py-2">Weight</th>
                          <th className="py-2">Capacity</th>
                          <th className="py-2">Allocated</th>
                          <th className="py-2">Accuracy</th>
                          <th className="py-2">Trend</th>
                        </tr>
                      </thead>
                      <tbody>
                        {autoPlan.diagnostics.chapters.map((chapter) => (
                          <tr key={chapter.chapterId} className="border-t border-[var(--outline-ghost)]">
                            <td className="py-2 font-semibold">{chapter.chapterName}</td>
                            <td className="py-2">{chapter.weight}</td>
                            <td className="py-2">{chapter.capacity}</td>
                            <td className="py-2">{chapter.allocated}</td>
                            <td className="py-2">{chapter.accuracy ?? '-'}%</td>
                            <td className="py-2">{chapter.trend ?? '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <p className="mb-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">Generated Rules</p>
                    <div className="space-y-1 text-xs">
                      {autoPlan.rules.map((rule, idx) => {
                        const chapter = chapterOptions.find((c) => c.id === rule.chapterId);
                        return (
                          <p key={`${rule.chapterId}-${rule.difficulty ?? 'ANY'}-${idx}`}>
                            {chapter?.name ?? rule.chapterId}: {rule.questionCount} {rule.difficulty ? `(${rule.difficulty})` : '(ANY)'}
                          </p>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:col-span-4 lg:self-start">
          <section className="card">
            <h3 className="mb-4 text-lg font-bold">Blueprint Summary</h3>
            <div className="space-y-3 text-sm">
              <div className="surface-low rounded-xl p-4">
                <p className="text-xs uppercase tracking-[0.1em] text-[var(--on-surface-variant)]">Questions</p>
                <p className="text-2xl font-bold">{totalQuestions}</p>
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
                  <span>Configuration Completion</span>
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
              {createBlueprint.isError ? <p className="text-xs font-semibold text-[var(--error)]">Failed to create blueprint. Check configuration.</p> : null}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
