import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, authHeaders } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { DashboardOverview } from '../types';

function formatDate(date: string) {
  return new Date(date).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function firstNameFromUser(name: string | null | undefined, email: string | null | undefined) {
  if (name && name.trim().length > 0) {
    return name.trim().split(' ')[0];
  }
  if (email && email.includes('@')) {
    return email.split('@')[0];
  }
  return 'Learner';
}

function scoreTone(score: number) {
  if (score >= 85) {
    return 'text-emerald-700 bg-emerald-100';
  }
  if (score >= 70) {
    return 'text-blue-700 bg-blue-100';
  }
  if (score >= 55) {
    return 'text-amber-700 bg-amber-100';
  }
  return 'text-[var(--error)] bg-[var(--error-container)]';
}

export function DashboardPage() {
  const { accessToken, user } = useAuth();

  const overviewQuery = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: async () => {
      const { data } = await api.get<DashboardOverview>('/dashboard/overview', {
        headers: authHeaders(accessToken),
      });
      return data;
    },
  });

  const displayName = firstNameFromUser(user?.name, user?.email);
  const trendBars = useMemo(() => {
    const recent = (overviewQuery.data?.trend ?? []).slice(-8);
    return recent.map((point, index) => ({
      key: point.attemptId,
      value: Math.max(6, Math.round(point.accuracy)),
      delay: `${index * 65}ms`,
      label: `Test ${point.testNumber}: ${Math.round(point.accuracy)}%`,
    }));
  }, [overviewQuery.data?.trend]);

  if (overviewQuery.isLoading) {
    return <div className="card">Loading dashboard...</div>;
  }

  if (overviewQuery.isError || !overviewQuery.data) {
    return <div className="card text-[var(--error)]">Failed to load dashboard data.</div>;
  }

  const data = overviewQuery.data;
  const avgScore = data.trend.length
    ? Math.round(data.trend.reduce((sum, item) => sum + item.accuracy, 0) / data.trend.length)
    : 0;
  const bestScore = data.trend.length ? Math.max(...data.trend.map((item) => Math.round(item.accuracy))) : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[var(--primary)] via-[var(--primary-container)] to-[#4f8ff0] p-6 text-white shadow-[0_22px_55px_rgba(33,112,228,0.35)] md:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-12 h-64 w-64 rounded-full bg-white/10 blur-2xl" />

        <div className="relative grid gap-6 lg:grid-cols-2 lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">Weekly Skill Lab</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">Welcome back, {displayName}</h2>
            <p className="mt-2 max-w-xl text-sm text-white/85 md:text-base">
              You have {data.weakChapters.length} focus chapters this week. Keep your momentum and push your weighted score higher.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link to="/tests" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-[var(--primary)] transition hover:-translate-y-0.5 hover:shadow-lg">
                <span className="material-symbols-outlined text-base">rocket_launch</span>
                Take Test
              </Link>
              <Link to="/results" className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/20">
                <span className="material-symbols-outlined text-base">insights</span>
                View Results
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-white/80">Performance Pulse</p>
            <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-white/70">Average</p>
                <p className="mt-1 text-2xl font-black">{avgScore}%</p>
              </div>
              <div>
                <p className="text-white/70">Best</p>
                <p className="mt-1 text-2xl font-black">{bestScore}%</p>
              </div>
              <div>
                <p className="text-white/70">Tests</p>
                <p className="mt-1 text-2xl font-black">{data.totalSubmittedTests}</p>
              </div>
            </div>

            <div className="mt-4 flex h-20 items-end gap-1.5">
              {trendBars.length === 0 ? (
                <p className="text-xs text-white/75">Take a test to see trend analytics.</p>
              ) : (
                trendBars.map((bar) => (
                  <div
                    key={bar.key}
                    className="group relative flex-1"
                    title={bar.label}
                    style={{ animationDelay: bar.delay }}
                  >
                    <div
                      className="animate-[pulse_2s_ease-in-out_infinite] rounded-t-md bg-white/85 transition-all duration-500 group-hover:bg-white"
                      style={{ height: `${bar.value}%` }}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card border border-[var(--outline-ghost)] bg-gradient-to-br from-white to-blue-50/70 transition hover:-translate-y-1 hover:shadow-xl">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--on-surface-variant)]">Total Tests</p>
          <p className="mt-2 text-3xl font-black text-[var(--on-surface)]">{data.totalSubmittedTests}</p>
          <p className="mt-2 text-xs text-[var(--on-surface-variant)]">Consistency tracker</p>
        </div>

        <div className="card border border-[var(--outline-ghost)] bg-gradient-to-br from-white to-indigo-50/70 transition hover:-translate-y-1 hover:shadow-xl">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--on-surface-variant)]">Recent Attempts</p>
          <p className="mt-2 text-3xl font-black text-[var(--on-surface)]">{data.recentAttempts.length}</p>
          <p className="mt-2 text-xs text-[var(--on-surface-variant)]">Last 5 submissions</p>
        </div>

        <div className="card border border-[var(--outline-ghost)] bg-gradient-to-br from-white to-emerald-50/70 transition hover:-translate-y-1 hover:shadow-xl">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--on-surface-variant)]">Average Score</p>
          <p className="mt-2 text-3xl font-black text-[var(--on-surface)]">{avgScore}%</p>
          <span className={`mt-2 inline-flex w-fit rounded-full px-2 py-1 text-xs font-bold ${scoreTone(avgScore)}`}>
            {avgScore >= 70 ? 'On Track' : 'Needs Lift'}
          </span>
        </div>

        <div className="card border border-[var(--outline-ghost)] bg-gradient-to-br from-white to-amber-50/70 transition hover:-translate-y-1 hover:shadow-xl">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--on-surface-variant)]">Pending Focus</p>
          <p className="mt-2 text-3xl font-black text-[var(--primary)]">{data.weakChapters.length}</p>
          <p className="mt-2 text-xs text-[var(--on-surface-variant)]">Priority chapters</p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold">Recent Tests</h3>
            <Link to="/results" className="text-sm font-semibold text-[var(--primary)] hover:underline">View all results</Link>
          </div>

          <div className="card overflow-hidden p-0">
            <table className="w-full text-left">
              <thead className="surface-low text-xs font-bold uppercase tracking-[0.1em] text-[var(--on-surface-variant)]">
                <tr>
                  <th className="px-6 py-4">Test</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Score</th>
                  <th className="px-6 py-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.recentAttempts.map((attempt, index) => (
                  <tr
                    key={attempt.id}
                    className="border-t ghost-separator text-sm transition hover:bg-[var(--surface-low)]/60"
                    style={{ animation: 'fadeIn 360ms ease-out', animationDelay: `${index * 60}ms` }}
                  >
                    <td className="px-6 py-4 font-semibold text-[var(--on-surface)]">Attempt {attempt.id.slice(0, 8)}</td>
                    <td className="px-6 py-4 text-[var(--on-surface-variant)]">{formatDate(attempt.submittedAt)}</td>
                    <td className="px-6 py-4">
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">Completed</span>
                    </td>
                    <td className="px-6 py-4 font-bold">{attempt.score}/{attempt.totalQuestions}</td>
                    <td className="px-6 py-4">
                      <Link
                        to={`/review/${attempt.id}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-[var(--primary)]/10 px-3 py-1.5 text-xs font-bold text-[var(--primary)] transition hover:bg-[var(--primary)]/15"
                      >
                        <span className="material-symbols-outlined text-sm">visibility</span>
                        View Result
                      </Link>
                    </td>
                  </tr>
                ))}
                {data.recentAttempts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-sm text-[var(--on-surface-variant)]">
                      No attempts yet. Start your first test.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-xl font-bold">Focus Chapters</h3>
          <div className="card relative overflow-hidden space-y-4 bg-gradient-to-br from-white to-[var(--surface-low)]">
            <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[var(--secondary-container)]/45 blur-2xl" />

            {data.weakChapters.slice(0, 5).map((chapter) => (
              <div key={chapter.chapterName} className="relative rounded-xl border border-[var(--outline-ghost)] bg-white/80 p-3 transition hover:border-[var(--primary)]/30 hover:shadow-md">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">{chapter.chapterName}</p>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-amber-700">
                    Focus
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[var(--surface-high)]">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-amber-400 to-[var(--error)]"
                    style={{ width: `${Math.max(8, chapter.accuracy)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-[var(--on-surface-variant)]">Accuracy {chapter.accuracy}%</p>
              </div>
            ))}

            {data.weakChapters.length === 0 ? (
              <p className="text-sm text-[var(--on-surface-variant)]">No weak chapters right now. Performance is balanced.</p>
            ) : null}
          </div>
        </div>
      </section>

      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
