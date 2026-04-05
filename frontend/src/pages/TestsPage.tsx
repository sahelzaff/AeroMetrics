import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, authHeaders } from '../api/client';
import { useAuth } from '../context/AuthContext';

interface BlueprintItem {
  id: string;
  name: string;
  totalQuestions: number;
  timeLimitMinutes: number;
  subject: { name: string };
  rules: Array<{ chapter: { name: string }; questionCount: number; difficulty: 'EASY' | 'MEDIUM' | 'HARD' | null }>;
}

export function TestsPage() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [blueprintId, setBlueprintId] = useState('');
  const [prioritizeWeakChapters, setPrioritizeWeakChapters] = useState(true);

  const blueprintQuery = useQuery({
    queryKey: ['blueprints'],
    queryFn: async () => {
      const { data } = await api.get<BlueprintItem[]>('/blueprints', {
        headers: authHeaders(accessToken),
      });
      return data;
    },
  });

  const selectedBlueprint = useMemo(
    () => blueprintQuery.data?.find((blueprint) => blueprint.id === blueprintId) ?? blueprintQuery.data?.[0],
    [blueprintQuery.data, blueprintId],
  );

  const generateTest = useMutation({
    mutationFn: async () => {
      const idToUse = selectedBlueprint?.id;
      if (!idToUse) {
        throw new Error('No blueprint available');
      }

      const { data } = await api.post<{ attemptId: string }>(
        '/tests/generate-from-blueprint',
        { blueprintId: idToUse, prioritizeWeakChapters },
        { headers: authHeaders(accessToken) },
      );

      await api.post('/attempts/start', { attemptId: data.attemptId }, { headers: authHeaders(accessToken) });
      return data;
    },
    onSuccess: (data) => {
      navigate(`/attempts/${data.attemptId}`);
    },
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h2 className="headline-tight text-3xl font-bold">Take Test</h2>
        <p className="mt-1 text-sm text-[var(--on-surface-variant)]">Choose an existing blueprint and launch a new attempt.</p>
      </div>

      <section className="card grid gap-5 lg:grid-cols-2">
        <div>
          <label className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">Select Blueprint</label>
          <select className="input" value={blueprintId} onChange={(e) => setBlueprintId(e.target.value)}>
            {blueprintQuery.data?.map((blueprint) => (
              <option key={blueprint.id} value={blueprint.id}>
                {blueprint.name} ({blueprint.totalQuestions} Qs)
              </option>
            ))}
          </select>

          <label className="mt-4 flex items-center gap-2 text-sm text-[var(--on-surface-variant)]">
            <input type="checkbox" checked={prioritizeWeakChapters} onChange={(e) => setPrioritizeWeakChapters(e.target.checked)} />
            Prioritize weak chapters
          </label>

          <button type="button" className="btn-primary mt-5 w-full" onClick={() => generateTest.mutate()} disabled={generateTest.isPending || !selectedBlueprint}>
            Start Attempt
          </button>
        </div>

        <div className="surface-low rounded-xl p-4">
          <h3 className="text-lg font-bold">Blueprint Details</h3>
          {selectedBlueprint ? (
            <div className="mt-3 space-y-3 text-sm">
              <p><span className="font-semibold">Name:</span> {selectedBlueprint.name}</p>
              <p><span className="font-semibold">Subject:</span> {selectedBlueprint.subject?.name ?? 'N/A'}</p>
              <p><span className="font-semibold">Questions:</span> {selectedBlueprint.totalQuestions}</p>
              <p><span className="font-semibold">Time Limit:</span> {selectedBlueprint.timeLimitMinutes} min</p>
              <div className="rounded-lg bg-white p-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-[var(--on-surface-variant)]">Chapter Distribution</p>
                <div className="space-y-2">
                  {selectedBlueprint.rules.map((rule, index) => (
                    <div key={`${rule.chapter.name}-${index}`} className="flex items-center justify-between text-xs">
                      <span>{rule.chapter.name}</span>
                      <span className="font-semibold">{rule.questionCount} {rule.difficulty ? `(${rule.difficulty})` : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-[var(--on-surface-variant)]">Create a blueprint first to start tests.</p>
          )}
        </div>
      </section>
    </div>
  );
}
