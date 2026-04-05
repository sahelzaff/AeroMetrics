import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, authHeaders } from '../api/client';
import { useAuth } from '../context/AuthContext';

interface ReviewQuestion {
  attemptQuestionId: string;
  sequence: number;
  chapter: string;
  questionText: string;
  selectedOptionId: string | null;
  correctOptionId: string | null;
  isCorrect: boolean;
  options: Array<{ id: string; text: string }>;
  explanation?: string | null;
  timeSpentSeconds?: number;
  confidence?: 'LOW' | 'MEDIUM' | 'HIGH' | null;
}

interface ReviewResponse {
  score: number;
  totalQuestions: number;
  accuracy?: number;
  weightedScore?: number;
  qualityScore?: number;
  speed?: number;
  timeSpentSeconds?: number;
  questions: ReviewQuestion[];
}

interface ChapterAnalyticsItem {
  chapterId: string;
  chapterName: string;
  subject: string;
  attemptsCount: number;
  accuracy: number;
  averageScore: number;
  masteryScore?: number;
  trend?: 'UP' | 'DOWN' | 'STABLE';
  priorityScore?: number;
  needsFocus: boolean;
}

function scoreBadge(scorePercent: number) {
  if (scorePercent >= 85) {
    return {
      label: 'Elite Performance',
      className: 'bg-emerald-100 text-emerald-700',
      message: 'Excellent consistency. Keep increasing difficulty to compound gains.',
    };
  }
  if (scorePercent >= 70) {
    return {
      label: 'Strong Performer',
      className: 'bg-blue-100 text-blue-700',
      message: 'Great baseline. Focus on weak chapters to reach elite range.',
    };
  }
  if (scorePercent >= 55) {
    return {
      label: 'Developing',
      className: 'bg-amber-100 text-amber-700',
      message: 'Progress is visible. Tighten accuracy on easier questions first.',
    };
  }
  return {
    label: 'Needs Reinforcement',
    className: 'bg-[var(--error-container)] text-[var(--error)]',
    message: 'Build fundamentals chapter-wise before taking full-length tests.',
  };
}

function formatDuration(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function priorityTone(priorityScore: number) {
  if (priorityScore >= 70) {
    return 'bg-red-100 text-red-700';
  }
  if (priorityScore >= 45) {
    return 'bg-amber-100 text-amber-700';
  }
  return 'bg-emerald-100 text-emerald-700';
}

function trendPill(trend: 'UP' | 'DOWN' | 'STABLE') {
  if (trend === 'UP') {
    return { label: 'Up', className: 'bg-emerald-100 text-emerald-700', icon: 'north' };
  }
  if (trend === 'DOWN') {
    return { label: 'Down', className: 'bg-red-100 text-red-700', icon: 'south' };
  }
  return { label: 'Stable', className: 'bg-slate-100 text-slate-600', icon: 'east' };
}

function metricRow(title: string, value: string, helper?: string) {
  return (
    <div className="rounded-xl border border-[var(--outline-ghost)] bg-white p-4">
      <p className="text-xs uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">{title}</p>
      <p className="mt-1 text-2xl font-black text-[var(--on-surface)]">{value}</p>
      {helper ? <p className="mt-1 text-xs text-[var(--on-surface-variant)]">{helper}</p> : null}
    </div>
  );
}

export function ReviewPage() {
  const { id } = useParams();
  const { accessToken } = useAuth();
  const [activeIndex, setActiveIndex] = useState(0);
  const [animatedScore, setAnimatedScore] = useState(0);

  const reviewQuery = useQuery({
    queryKey: ['review', id],
    queryFn: async () => {
      const { data } = await api.get<ReviewResponse>(`/attempts/${id}/review`, {
        headers: authHeaders(accessToken),
      });
      return data;
    },
    enabled: Boolean(id),
  });

  const chapterQuery = useQuery({
    queryKey: ['chapter-analytics', 'review', id],
    queryFn: async () => {
      const { data } = await api.get<ChapterAnalyticsItem[]>('/analytics/chapters', {
        headers: authHeaders(accessToken),
      });
      return data;
    },
    enabled: Boolean(id),
  });

  const review = reviewQuery.data;

  const computed = useMemo(() => {
    if (!review) {
      return null;
    }

    const total = review.totalQuestions;
    const correct = review.questions.filter((q) => q.isCorrect).length;
    const skipped = review.questions.filter((q) => !q.selectedOptionId).length;
    const incorrect = total - correct - skipped;
    const attempted = total - skipped;

    const accuracy = review.accuracy ?? (total ? (correct / total) * 100 : 0);
    const weightedScore = review.weightedScore ?? Number((accuracy * 0.8).toFixed(2));
    const qualityScore = review.qualityScore ?? Number((accuracy * 0.75).toFixed(2));

    const totalTime =
      review.timeSpentSeconds ??
      Math.max(
        1,
        review.questions.reduce((sum, q) => sum + (q.timeSpentSeconds ?? 0), 0),
      );

    const avgTimePerQuestion = total ? totalTime / total : 0;
    const speedQpm = review.speed ?? (total ? total / Math.max(1, totalTime / 60) : 0);
    const speedScore = Math.max(0, Math.min(100, (speedQpm / 1.5) * 100));

    const highConfidenceCorrect = review.questions.filter(
      (q) => q.confidence === 'HIGH' && q.selectedOptionId && q.isCorrect,
    ).length;
    const highConfidenceWrong = review.questions.filter(
      (q) => q.confidence === 'HIGH' && q.selectedOptionId && !q.isCorrect,
    ).length;
    const lowConfidenceCorrect = review.questions.filter(
      (q) => q.confidence === 'LOW' && q.selectedOptionId && q.isCorrect,
    ).length;

    const guessed = review.questions.filter((q) => q.selectedOptionId && q.confidence === 'LOW').length;
    const guessRate = attempted ? (guessed / attempted) * 100 : 0;
    const conceptErrorRate = attempted ? (incorrect / attempted) * 100 : 0;

    const badge = scoreBadge(accuracy);

    const insights: string[] = [];
    if (highConfidenceWrong >= 2 || highConfidenceWrong / Math.max(1, attempted) > 0.2) {
      insights.push('You are overconfident on some wrong answers. Slow down and verify elimination logic.');
    }
    if (speedQpm > 1.3 && accuracy < 65) {
      insights.push('You are rushing. Accuracy is dropping at your current pace.');
    }
    if (accuracy < 60) {
      insights.push('You need a focused revision cycle before the next full-length test.');
    }
    if (guessRate > 25) {
      insights.push('High guess rate detected. Build first-pass certainty on core concepts.');
    }

    const chapterFromAttempt = new Map<string, { total: number; incorrect: number }>();
    review.questions.forEach((q) => {
      const curr = chapterFromAttempt.get(q.chapter) ?? { total: 0, incorrect: 0 };
      curr.total += 1;
      if (q.selectedOptionId && !q.isCorrect) {
        curr.incorrect += 1;
      }
      chapterFromAttempt.set(q.chapter, curr);
    });

    const weakLocal = Array.from(chapterFromAttempt.entries())
      .map(([chapter, value]) => ({
        chapter,
        errorRate: value.total ? (value.incorrect / value.total) * 100 : 0,
      }))
      .sort((a, b) => b.errorRate - a.errorRate)
      .filter((entry) => entry.errorRate > 30)
      .slice(0, 2);

    weakLocal.forEach((entry) => {
      insights.push(`You need to revise ${entry.chapter}. Error rate is ${Math.round(entry.errorRate)}% in this test.`);
    });

    if (insights.length === 0) {
      insights.push('Performance is stable. Continue with mixed-difficulty practice to improve weighted score.');
    }

    let speedVsAccuracy = 'Balanced execution';
    if (speedQpm >= 1.3 && accuracy < 70) {
      speedVsAccuracy = 'Fast but inaccurate';
    } else if (speedQpm < 0.8 && accuracy >= 80) {
      speedVsAccuracy = 'Accurate but slow';
    }

    return {
      total,
      correct,
      incorrect,
      skipped,
      attempted,
      accuracy,
      weightedScore,
      qualityScore,
      totalTime,
      avgTimePerQuestion,
      speedQpm,
      speedScore,
      speedVsAccuracy,
      highConfidenceCorrect,
      highConfidenceWrong,
      lowConfidenceCorrect,
      guessRate,
      conceptErrorRate,
      badge,
      insights,
    };
  }, [review]);

  const chapterIntelligence = useMemo(() => {
    if (!chapterQuery.data || !review) {
      return [] as ChapterAnalyticsItem[];
    }
    const relevantChapters = new Set(review.questions.map((question) => question.chapter));
    return chapterQuery.data
      .filter((entry) => relevantChapters.has(entry.chapterName))
      .sort((a, b) => (b.priorityScore ?? Number(b.needsFocus) * 100) - (a.priorityScore ?? Number(a.needsFocus) * 100));
  }, [chapterQuery.data, review]);

  useEffect(() => {
    if (!review) {
      return;
    }

    setAnimatedScore(0);
    const target = review.score;
    const duration = 800;
    const start = performance.now();

    const animate = (timestamp: number) => {
      const elapsed = timestamp - start;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(Math.round(target * eased));
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [review?.score]);

  if (reviewQuery.isLoading) {
    return <div className="card">Loading result analytics...</div>;
  }

  if (reviewQuery.isError || !review || !computed) {
    return <div className="card text-[var(--error)]">Result unavailable.</div>;
  }

  const currentQuestion = review.questions[activeIndex];
  const selectedLabel = currentQuestion.options.find((option) => option.id === currentQuestion.selectedOptionId)?.text ?? 'Skipped';
  const correctLabel = currentQuestion.options.find((option) => option.id === currentQuestion.correctOptionId)?.text ?? 'N/A';

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-10">
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="card relative overflow-hidden lg:col-span-2">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(33,112,228,0.18),transparent_45%)]" />
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Final Score</p>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-6xl font-black leading-none">{animatedScore}</span>
            <span className="pb-1 text-2xl text-[var(--on-surface-variant)]">/{review.totalQuestions}</span>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] ${computed.badge.className}`}>
              {computed.badge.label}
            </span>
            <p className="text-sm text-[var(--on-surface-variant)]">{computed.badge.message}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:col-span-3 lg:grid-cols-4">
          {metricRow('Accuracy', `${Math.round(computed.accuracy)}%`)}
          {metricRow('Weighted Score', computed.weightedScore.toFixed(2), 'Composite score from speed + accuracy')}
          {metricRow('Time Taken', formatDuration(computed.totalTime), `${Math.round(computed.avgTimePerQuestion)}s per question`)}
          {metricRow('Quality Score', computed.qualityScore.toFixed(2), computed.speedVsAccuracy)}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold">Speed & Efficiency</h3>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">Live Derived</span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {metricRow('Time / Question', `${Math.round(computed.avgTimePerQuestion)}s`)}
            {metricRow('Speed', `${computed.speedQpm.toFixed(2)} q/min`)}
            {metricRow('Speed Score', `${Math.round(computed.speedScore)}`, computed.speedVsAccuracy)}
          </div>
          <div className="mt-4 h-2 rounded-full bg-[var(--surface-container-high)]">
            <div className="h-2 rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--primary-container)]" style={{ width: `${Math.round(computed.speedScore)}%` }} />
          </div>
        </div>

        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold">Learning Quality</h3>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">Confidence Signals</span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {metricRow('High Conf. Correct', `${computed.highConfidenceCorrect}`)}
            {metricRow('High Conf. Wrong', `${computed.highConfidenceWrong}`)}
            {metricRow('Low Conf. Correct', `${computed.lowConfidenceCorrect}`)}
            {metricRow('Guess Rate', `${Math.round(computed.guessRate)}%`)}
          </div>
          <div className="mt-4 rounded-xl bg-[var(--surface-low)] p-4">
            <p className="text-xs uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">Concept Error Rate</p>
            <p className="mt-1 text-2xl font-black">{Math.round(computed.conceptErrorRate)}%</p>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">Chapter Intelligence</h3>
          <span className="text-xs text-[var(--on-surface-variant)]">Priority-driven chapter focus</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--outline-ghost)] text-xs uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
                <th className="px-3 py-3">Chapter</th>
                <th className="px-3 py-3">Accuracy</th>
                <th className="px-3 py-3">Mastery</th>
                <th className="px-3 py-3">Trend</th>
                <th className="px-3 py-3">Priority</th>
              </tr>
            </thead>
            <tbody>
              {chapterIntelligence.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-[var(--on-surface-variant)]" colSpan={5}>
                    Chapter analytics will populate after submission snapshots are generated.
                  </td>
                </tr>
              ) : (
                chapterIntelligence.map((chapter) => {
                  const trend = trendPill(chapter.trend ?? 'STABLE');
                  const priority = chapter.priorityScore ?? (chapter.needsFocus ? 70 : 30);
                  return (
                    <tr key={chapter.chapterId} className="border-b border-[var(--outline-ghost)]/60 last:border-b-0">
                      <td className="px-3 py-4 font-semibold">{chapter.chapterName}</td>
                      <td className="px-3 py-4">{Math.round(chapter.accuracy)}%</td>
                      <td className="px-3 py-4">{Math.round(chapter.masteryScore ?? chapter.accuracy)}%</td>
                      <td className="px-3 py-4">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${trend.className}`}>
                          <span className="material-symbols-outlined text-sm">{trend.icon}</span>
                          {trend.label}
                        </span>
                      </td>
                      <td className="px-3 py-4">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${priorityTone(priority)}`}>
                          {Math.round(priority)}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="relative overflow-hidden rounded-3xl bg-[#121820] p-6 text-slate-100 shadow-[0_18px_45px_rgba(10,14,20,0.35)] md:p-8">
        <div className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full bg-blue-400/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-24 right-2 text-white/8">
          <span className="material-symbols-outlined text-[210px] leading-none">bolt</span>
        </div>

        <div className="relative">
          <div className="mb-6 flex items-center gap-2 text-blue-100">
            <span className="material-symbols-outlined text-base">auto_awesome</span>
            <h3 className="text-sm font-extrabold uppercase tracking-[0.16em]">AI Coach Insights</h3>
          </div>

          <div className="space-y-5">
            {computed.insights.map((insight, index) => (
              <div key={insight} className="grid grid-cols-[42px_1fr] gap-3 border-b border-white/10 pb-4 last:border-b-0 last:pb-0">
                <span className="text-lg font-black text-blue-200">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <p className="text-sm leading-relaxed text-slate-200">{insight}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-8 lg:flex-row">
        <div className="space-y-6 lg:w-[70%]">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">Question Review</h3>
            <span className="text-sm text-[var(--on-surface-variant)]">
              Q{activeIndex + 1} of {review.totalQuestions}
            </span>
          </div>

          <div className="card p-7">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <span className="rounded-lg bg-[var(--surface-container-high)] px-2.5 py-1 text-xs font-bold">
                Q{currentQuestion.sequence}
              </span>
              <span
                className={`rounded px-2 py-1 text-xs font-bold uppercase ${
                  !currentQuestion.selectedOptionId
                    ? 'bg-slate-100 text-slate-600'
                    : currentQuestion.isCorrect
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-[var(--error-container)] text-[var(--error)]'
                }`}
              >
                {!currentQuestion.selectedOptionId ? 'Skipped' : currentQuestion.isCorrect ? 'Correct' : 'Incorrect'}
              </span>
              <span className="text-xs text-[var(--on-surface-variant)]">Chapter: {currentQuestion.chapter}</span>
              <span className="text-xs text-[var(--on-surface-variant)]">
                Time: {formatDuration(currentQuestion.timeSpentSeconds ?? 0)}
              </span>
            </div>

            <p className="mb-5 text-lg font-semibold leading-relaxed">{currentQuestion.questionText}</p>

            <div className="space-y-3">
              {currentQuestion.options.map((option, optionIndex) => {
                const isSelected = option.id === currentQuestion.selectedOptionId;
                const isCorrect = option.id === currentQuestion.correctOptionId;

                return (
                  <div
                    key={option.id}
                    className={`flex items-center gap-4 rounded-xl border p-4 ${
                      isCorrect
                        ? 'border-emerald-500 bg-emerald-50'
                        : isSelected
                          ? 'border-[var(--error)] bg-[var(--error-container)]/50'
                          : 'border-[var(--outline-ghost)]'
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                        isCorrect
                          ? 'bg-emerald-500 text-white'
                          : isSelected
                            ? 'bg-[var(--error)] text-white'
                            : 'bg-[var(--surface-container-high)] text-[var(--on-surface-variant)]'
                      }`}
                    >
                      {String.fromCharCode(65 + optionIndex)}
                    </span>
                    <span className="flex-1 text-sm">{option.text}</span>
                    {isCorrect ? <span className="material-symbols-outlined text-emerald-600">check</span> : null}
                    {isSelected && !isCorrect ? <span className="material-symbols-outlined text-[var(--error)]">close</span> : null}
                  </div>
                );
              })}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-xl bg-[var(--surface-low)] p-3 text-sm">
                <p className="text-xs uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">Your Answer</p>
                <p className="mt-1 font-semibold">{selectedLabel}</p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3 text-sm">
                <p className="text-xs uppercase tracking-[0.08em] text-emerald-700">Correct Answer</p>
                <p className="mt-1 font-semibold text-emerald-800">{correctLabel}</p>
              </div>
            </div>

            {currentQuestion.explanation ? (
              <div className="mt-5 rounded-xl border-l-4 border-[var(--primary)] bg-blue-50/60 p-5">
                <div className="mb-2 flex items-center gap-2 text-[var(--primary)]">
                  <span className="material-symbols-outlined text-sm">info</span>
                  <span className="text-xs font-bold uppercase tracking-[0.12em]">Explanation</span>
                </div>
                <p className="text-sm text-slate-700">{currentQuestion.explanation}</p>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="space-y-6 lg:w-[30%]">
          <div className="card sticky top-24">
            <h4 className="mb-4 text-sm font-bold">Question Palette</h4>
            <div className="grid grid-cols-5 gap-2">
              {review.questions.map((question, index) => {
                const active = index === activeIndex;
                const statusClass = !question.selectedOptionId
                  ? 'bg-[var(--surface-container-high)] text-[var(--on-surface-variant)]'
                  : question.isCorrect
                    ? 'bg-emerald-500 text-white'
                    : 'bg-[var(--error)] text-white';

                return (
                  <button
                    key={question.attemptQuestionId}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    className={`aspect-square rounded-lg text-xs font-bold transition ${statusClass} ${active ? 'scale-105 ring-4 ring-[var(--primary)]/20' : 'hover:opacity-85'}`}
                  >
                    {question.sequence}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 space-y-2 border-t border-[var(--outline-ghost)] pt-3 text-xs text-[var(--on-surface-variant)]">
              <p><span className="mr-2 inline-block h-3 w-3 rounded bg-emerald-500" />Correct</p>
              <p><span className="mr-2 inline-block h-3 w-3 rounded bg-[var(--error)]" />Incorrect</p>
              <p><span className="mr-2 inline-block h-3 w-3 rounded bg-[var(--surface-container-high)]" />Skipped</p>
            </div>
          </div>
        </aside>
      </div>

      <div className="flex flex-col items-center gap-4 pt-2">
        <Link className="btn-primary px-10 py-3.5 font-bold" to="/tests">
          Retake Test
        </Link>
        <Link
          className="rounded-xl px-10 py-3 text-sm font-semibold text-[var(--primary)] transition hover:bg-[var(--primary)]/5"
          to="/dashboard"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
