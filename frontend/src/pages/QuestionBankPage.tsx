import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api, authHeaders } from '../api/client';
import { useAuth } from '../context/AuthContext';

interface StructureSubject {
  id: string;
  name: string;
  chapters: Array<{ id: string; name: string; questionCount: number }>;
}

interface QuestionItem {
  id: string;
  chapterId: string;
  chapterName: string;
  subjectName: string;
  questionText: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  sourceRef?: string | null;
  tags: string[];
  version: number;
  options: Array<{ id: string; text: string; sortOrder: number; isCorrect: boolean }>;
}

export function QuestionBankPage() {
  const { accessToken } = useAuth();
  const [subjectId, setSubjectId] = useState('');
  const [chapterId, setChapterId] = useState('');

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
    () => structureQuery.data?.find((subject) => subject.id === subjectId) ?? structureQuery.data?.[0],
    [structureQuery.data, subjectId],
  );

  const selectedChapter = useMemo(() => {
    if (!selectedSubject) {
      return undefined;
    }

    return selectedSubject.chapters.find((chapter) => chapter.id === chapterId) ?? selectedSubject.chapters[0];
  }, [selectedSubject, chapterId]);

  const questionsQuery = useQuery({
    queryKey: ['question-bank', selectedChapter?.id],
    queryFn: async () => {
      if (!selectedChapter?.id) {
        return [] as QuestionItem[];
      }
      const { data } = await api.get<QuestionItem[]>('/question-bank/questions', {
        headers: authHeaders(accessToken),
        params: { chapterId: selectedChapter.id, limit: 200 },
      });
      return data;
    },
    enabled: Boolean(selectedChapter?.id),
  });

  const totalQuestionCount = useMemo(
    () => structureQuery.data?.reduce((sum, subject) => sum + subject.chapters.reduce((chapterSum, chapter) => chapterSum + chapter.questionCount, 0), 0) ?? 0,
    [structureQuery.data],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h2 className="headline-tight text-3xl font-bold">Question Bank</h2>
        <p className="mt-1 text-sm text-[var(--on-surface-variant)]">Explore questions by subject and chapter with live counts.</p>
      </div>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="card lg:col-span-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold">Library Structure</h3>
            <span className="rounded-full bg-[var(--secondary-container)] px-3 py-1 text-xs font-semibold">{totalQuestionCount} questions</span>
          </div>

          <label className="mb-2 block text-xs font-bold uppercase tracking-[0.1em] text-[var(--on-surface-variant)]">Subject</label>
          <select className="input" value={selectedSubject?.id ?? ''} onChange={(e) => { setSubjectId(e.target.value); setChapterId(''); }}>
            {structureQuery.data?.map((subject) => (
              <option key={subject.id} value={subject.id}>{subject.name}</option>
            ))}
          </select>

          <div className="mt-5 space-y-2">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--on-surface-variant)]">Chapters</p>
            {selectedSubject?.chapters.map((chapter) => {
              const active = chapter.id === selectedChapter?.id;
              return (
                <button
                  key={chapter.id}
                  type="button"
                  onClick={() => setChapterId(chapter.id)}
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${active ? 'bg-[var(--primary)] text-white' : 'surface-low text-[var(--on-surface)] hover:bg-[var(--surface-container)]'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{chapter.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${active ? 'bg-white/20' : 'bg-white'}`}>{chapter.questionCount}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="card lg:col-span-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">{selectedChapter?.name ?? 'Questions'}</h3>
              <p className="text-sm text-[var(--on-surface-variant)]">{selectedChapter?.questionCount ?? 0} questions in this chapter</p>
            </div>
          </div>

          <div className="space-y-4">
            {questionsQuery.data?.map((question, index) => (
              <article key={question.id} className="surface-low rounded-xl p-4">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-bold text-[var(--on-surface-variant)]">Q{index + 1}</span>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-[var(--secondary-container)] px-2 py-0.5 font-semibold">{question.difficulty}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 font-semibold">v{question.version}</span>
                  </div>
                </div>
                <p className="font-medium">{question.questionText}</p>
                <div className="mt-3 grid gap-2">
                  {question.options.map((option, optionIndex) => (
                    <div key={option.id} className={`rounded-lg px-3 py-2 text-sm ${option.isCorrect ? 'bg-emerald-100 text-emerald-800' : 'bg-white'}`}>
                      <span className="mr-2 font-semibold">{String.fromCharCode(65 + optionIndex)}.</span>
                      {option.text}
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--on-surface-variant)]">
                  <span>Source: {question.sourceRef ?? 'N/A'}</span>
                  {question.tags.map((tag) => (
                    <span key={`${question.id}-${tag}`} className="rounded-full bg-white px-2 py-0.5">#{tag}</span>
                  ))}
                </div>
              </article>
            ))}

            {!questionsQuery.isLoading && (questionsQuery.data?.length ?? 0) === 0 ? (
              <div className="surface-low rounded-xl p-8 text-center text-sm text-[var(--on-surface-variant)]">
                No questions found for this chapter yet.
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
