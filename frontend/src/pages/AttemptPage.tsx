import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, authHeaders } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { QuestionOption } from '../components/test/QuestionOption';
import { QuestionPalette, type PaletteStatus } from '../components/test/QuestionPalette';
import { TimerBadge } from '../components/test/TimerBadge';

interface AttemptQuestion {
  attemptQuestionId: string;
  sequence: number;
  questionText: string;
  chapter: string;
  selectedOptionId: string | null;
  options: Array<{ id: string; text: string; sortOrder: number }>;
}

interface AttemptDetail {
  attemptId: string;
  status: string;
  timeLimitMinutes: number;
  totalQuestions: number;
  questions: AttemptQuestion[];
}

export function AttemptPage() {
  const { id } = useParams();
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [timerInitialized, setTimerInitialized] = useState(false);
  const [reviewMarked, setReviewMarked] = useState<Record<string, boolean>>({});
  const [localAnswers, setLocalAnswers] = useState<Record<string, string | null>>({});

  const attemptQuery = useQuery({
    queryKey: ['attempt', id],
    queryFn: async () => {
      const { data } = await api.get<AttemptDetail>(`/attempts/${id}`, {
        headers: authHeaders(accessToken),
      });
      return data;
    },
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (!attemptQuery.data) {
      return;
    }

    setTimerInitialized(false);
    setSecondsLeft(attemptQuery.data.timeLimitMinutes * 60);
    setLocalAnswers(
      attemptQuery.data.questions.reduce<Record<string, string | null>>((acc, question) => {
        acc[question.attemptQuestionId] = question.selectedOptionId;
        return acc;
      }, {}),
    );
    setCurrentIndex(0);
    setReviewMarked({});
    setTimerInitialized(true);
  }, [attemptQuery.data?.attemptId]);

  useEffect(() => {
    if (!attemptQuery.data || !timerInitialized || secondsLeft <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => prev - 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [attemptQuery.data, secondsLeft, timerInitialized]);

  const answerMutation = useMutation({
    mutationFn: async ({ attemptQuestionId, selectedOptionId }: { attemptQuestionId: string; selectedOptionId: string }) => {
      await api.patch(
        `/attempts/${id}/answer`,
        { attemptQuestionId, selectedOptionId },
        {
          headers: authHeaders(accessToken),
        },
      );
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/attempts/${id}/submit`, {}, { headers: authHeaders(accessToken) });
    },
    onSuccess: () => {
      navigate(`/review/${id}`);
    },
  });

  useEffect(() => {
    if (
      timerInitialized &&
      secondsLeft === 0 &&
      attemptQuery.data &&
      !submitMutation.isPending &&
      !submitMutation.isSuccess
    ) {
      submitMutation.mutate();
    }
  }, [secondsLeft, attemptQuery.data, submitMutation, timerInitialized]);

  const questions = attemptQuery.data?.questions ?? [];
  const currentQuestion = questions[currentIndex];
  const isCurrentMarkedForReview = Boolean(
    currentQuestion ? reviewMarked[currentQuestion.attemptQuestionId] : false,
  );

  const paletteItems = useMemo(() => {
    return questions.map((question, index) => {
      const selected = localAnswers[question.attemptQuestionId];
      let status: PaletteStatus = 'not_attempted';

      if (index === currentIndex) {
        status = 'current';
      } else if (reviewMarked[question.attemptQuestionId]) {
        status = 'review';
      } else if (selected) {
        status = 'attempted';
      }

      return {
        id: question.attemptQuestionId,
        index,
        status,
      };
    });
  }, [questions, localAnswers, reviewMarked, currentIndex]);

  const answeredCount = useMemo(
    () => Object.values(localAnswers).filter(Boolean).length,
    [localAnswers],
  );

  if (attemptQuery.isLoading) {
    return <div className="card">Loading attempt...</div>;
  }

  if (attemptQuery.isError || !attemptQuery.data || !currentQuestion) {
    return <div className="card text-[var(--error)]">Attempt not available.</div>;
  }

  const alphabet = ['A', 'B', 'C', 'D', 'E', 'F'];

  const selectOption = (selectedOptionId: string) => {
    setLocalAnswers((prev) => ({ ...prev, [currentQuestion.attemptQuestionId]: selectedOptionId }));
    answerMutation.mutate({
      attemptQuestionId: currentQuestion.attemptQuestionId,
      selectedOptionId,
    });
  };

  const goPrevious = () => setCurrentIndex((prev) => Math.max(0, prev - 1));
  const goNext = () => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1));

  return (
    <div className="h-[calc(100vh-8rem)] overflow-hidden">
      <header className="mb-4 flex items-center justify-between rounded-xl surface-low px-4 py-3">
        <div>
          <h1 className="headline-tight text-lg font-bold">{`Attempt ${attemptQuery.data.attemptId.slice(0, 8)}`}</h1>
          <p className="text-xs text-[var(--on-surface-variant)]">Answered {answeredCount}/{attemptQuery.data.totalQuestions}</p>
        </div>
        <div className="flex items-center gap-3">
          <TimerBadge secondsLeft={secondsLeft} />
          <button type="button" className="btn-primary" onClick={() => submitMutation.mutate()}>
            Submit Test
          </button>
        </div>
      </header>

      <div className="flex h-full gap-4 overflow-hidden">
        <section className="card flex w-full flex-col lg:w-[70%]">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--primary)]">Question {currentIndex + 1} of {questions.length}</p>
              <h2 className="mt-2 text-xl font-bold">{currentQuestion.questionText}</h2>
              <p className="mt-1 text-xs text-[var(--on-surface-variant)]">Chapter: {currentQuestion.chapter}</p>
            </div>
            <button
              type="button"
              className={`btn-secondary inline-flex h-11 w-[190px] shrink-0 items-center justify-center gap-2 whitespace-nowrap transition ${
                isCurrentMarkedForReview
                  ? 'border-[var(--tertiary)]/40 bg-[var(--tertiary-fixed)] text-[var(--tertiary)] shadow-sm'
                  : 'text-[var(--on-surface-variant)]'
              }`}
              onClick={() =>
                setReviewMarked((prev) => ({
                  ...prev,
                  [currentQuestion.attemptQuestionId]: !prev[currentQuestion.attemptQuestionId],
                }))
              }
            >
              <span
                className="material-symbols-outlined text-base"
                style={{
                  fontVariationSettings: isCurrentMarkedForReview
                    ? "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24"
                    : "'FILL' 0, 'wght' 500, 'GRAD' 0, 'opsz' 24",
                }}
              >
                bookmark
              </span>
              {isCurrentMarkedForReview ? 'Marked for Review' : 'Mark for Review'}
            </button>
          </div>

          <div className="space-y-3 overflow-y-auto pr-1">
            {currentQuestion.options.map((option, optionIndex) => (
              <QuestionOption
                key={option.id}
                label={alphabet[optionIndex] ?? String(optionIndex + 1)}
                text={option.text}
                selected={localAnswers[currentQuestion.attemptQuestionId] === option.id}
                onSelect={() => selectOption(option.id)}
              />
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t ghost-separator pt-4">
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" onClick={goPrevious} disabled={currentIndex === 0}>
                Previous
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setLocalAnswers((prev) => ({ ...prev, [currentQuestion.attemptQuestionId]: null }))}
              >
                Clear Response
              </button>
            </div>
            <button type="button" className="btn-primary" onClick={goNext} disabled={currentIndex === questions.length - 1}>
              Next
            </button>
          </div>
        </section>

        <div className="hidden h-full w-[30%] lg:block">
          <QuestionPalette items={paletteItems} currentIndex={currentIndex} onJump={(index) => setCurrentIndex(index)} />
        </div>
      </div>
    </div>
  );
}
