import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, authHeaders } from '../api/client';
import { useAuth } from '../context/AuthContext';

interface AttemptHistoryItem {
  attemptId: string;
  blueprintId: string;
  blueprintName: string;
  score: number;
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  skippedCount: number;
  accuracy: number;
  weightedScore: number;
  qualityScore: number;
  timeSpentSeconds: number;
  submittedAt: string | null;
}

interface AttemptHistoryResponse {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  items: AttemptHistoryItem[];
}

function formatDate(date: string | null) {
  if (!date) {
    return '-';
  }
  return new Date(date).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function ResultsPage() {
  const { accessToken } = useAuth();

  const historyQuery = useQuery({
    queryKey: ['attempt-history'],
    queryFn: async () => {
      const { data } = await api.get<AttemptHistoryResponse>('/attempts/history', {
        headers: authHeaders(accessToken),
      });
      return data;
    },
  });

  if (historyQuery.isLoading) {
    return <div className="card">Loading saved results...</div>;
  }

  if (historyQuery.isError || !historyQuery.data) {
    return <div className="card text-[var(--error)]">Unable to load saved results.</div>;
  }

  const history = historyQuery.data;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="card">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-extrabold headline-tight">Saved Test Results</h2>
            <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
              Every submitted test is stored with score, wrong/skipped counts, weighted score, and review breakdown.
            </p>
          </div>
          <span className="rounded-full bg-[var(--secondary-container)] px-3 py-1 text-xs font-bold text-[var(--primary)]">
            {history.total} Attempts Saved
          </span>
        </div>
      </section>

      <section className="card overflow-hidden p-0">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="surface-low text-xs font-bold uppercase tracking-[0.1em] text-[var(--on-surface-variant)]">
            <tr>
              <th className="px-5 py-4">Test</th>
              <th className="px-5 py-4">Submitted</th>
              <th className="px-5 py-4">Score</th>
              <th className="px-5 py-4">Accuracy</th>
              <th className="px-5 py-4">Wrong / Skipped</th>
              <th className="px-5 py-4">Weighted</th>
              <th className="px-5 py-4">Time</th>
              <th className="px-5 py-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {history.items.map((item) => (
              <tr key={item.attemptId} className="border-t ghost-separator hover:bg-[var(--surface-low)]/50">
                <td className="px-5 py-4">
                  <p className="font-semibold text-[var(--on-surface)]">{item.blueprintName}</p>
                  <p className="text-xs text-[var(--on-surface-variant)]">Attempt #{item.attemptId.slice(0, 8)}</p>
                </td>
                <td className="px-5 py-4 text-[var(--on-surface-variant)]">{formatDate(item.submittedAt)}</td>
                <td className="px-5 py-4 font-bold">{item.score}/{item.totalQuestions}</td>
                <td className="px-5 py-4">{Math.round(item.accuracy)}%</td>
                <td className="px-5 py-4">
                  <span className="font-semibold text-[var(--error)]">{item.incorrectCount}</span>
                  <span className="mx-1 text-[var(--on-surface-variant)]">/</span>
                  <span className="font-semibold text-slate-500">{item.skippedCount}</span>
                </td>
                <td className="px-5 py-4">{item.weightedScore.toFixed(2)}</td>
                <td className="px-5 py-4">{formatDuration(item.timeSpentSeconds)}</td>
                <td className="px-5 py-4">
                  <Link
                    className="inline-flex items-center gap-1 rounded-lg bg-[var(--primary)]/10 px-3 py-1.5 text-xs font-bold text-[var(--primary)] hover:bg-[var(--primary)]/15"
                    to={`/review/${item.attemptId}`}
                  >
                    <span className="material-symbols-outlined text-sm">visibility</span>
                    View Result
                  </Link>
                </td>
              </tr>
            ))}

            {history.items.length === 0 ? (
              <tr>
                <td className="px-5 py-8 text-center text-[var(--on-surface-variant)]" colSpan={8}>
                  No submitted tests yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
