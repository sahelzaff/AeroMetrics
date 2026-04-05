import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
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

type DeleteModalTarget =
  | { type: 'question'; question: QuestionItem }
  | { type: 'bulk' }
  | { type: 'chapter'; chapterId: string; chapterName: string }
  | null;

export function QuestionBankPage() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const [subjectId, setSubjectId] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);

  const [isRenamingChapter, setIsRenamingChapter] = useState(false);
  const [chapterNameDraft, setChapterNameDraft] = useState('');

  const [deleteModalTarget, setDeleteModalTarget] = useState<DeleteModalTarget>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

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

  useEffect(() => {
    setSelectedQuestionIds([]);
    setIsRenamingChapter(false);
    setChapterNameDraft(selectedChapter?.name ?? '');
  }, [selectedChapter?.id, selectedChapter?.name]);

  const renameChapterMutation = useMutation({
    mutationFn: async (payload: { chapterId: string; name: string }) => {
      await api.patch(`/question-bank/chapters/${payload.chapterId}`, { name: payload.name }, {
        headers: authHeaders(accessToken),
      });
      return payload;
    },
    onSuccess: async (payload) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['structure'] }),
        queryClient.invalidateQueries({ queryKey: ['question-bank', payload.chapterId] }),
      ]);
      setIsRenamingChapter(false);
    },
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: async (question: QuestionItem) => {
      await api.delete(`/question-bank/questions/${question.id}`, {
        headers: authHeaders(accessToken),
      });
      return question;
    },
    onSuccess: async (question) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['question-bank', question.chapterId] }),
        queryClient.invalidateQueries({ queryKey: ['structure'] }),
      ]);
      setSelectedQuestionIds((prev) => prev.filter((id) => id !== question.id));
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (questionIds: string[]) => {
      await api.post('/question-bank/questions/bulk-delete', { questionIds }, {
        headers: authHeaders(accessToken),
      });
      return questionIds;
    },
    onSuccess: async (questionIds) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['question-bank', selectedChapter?.id] }),
        queryClient.invalidateQueries({ queryKey: ['structure'] }),
      ]);
      setSelectedQuestionIds((prev) => prev.filter((id) => !questionIds.includes(id)));
    },
  });

  const deleteChapterMutation = useMutation({
    mutationFn: async (chapter: { id: string; name: string }) => {
      await api.delete(`/question-bank/chapters/${chapter.id}`, {
        headers: authHeaders(accessToken),
      });
      return chapter;
    },
    onSuccess: async (chapter) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['structure'] }),
        queryClient.invalidateQueries({ queryKey: ['question-bank', chapter.id] }),
      ]);
      setChapterId('');
      setSelectedQuestionIds([]);
    },
  });

  const totalQuestionCount = useMemo(
    () =>
      structureQuery.data?.reduce(
        (sum, subject) =>
          sum + subject.chapters.reduce((chapterSum, chapter) => chapterSum + chapter.questionCount, 0),
        0,
      ) ?? 0,
    [structureQuery.data],
  );

  const deleteIsLoading =
    deleteQuestionMutation.isPending || bulkDeleteMutation.isPending || deleteChapterMutation.isPending;

  const openDeleteModal = (target: DeleteModalTarget) => {
    setDeleteModalTarget(target);
    setDeleteConfirmText('');
  };

  const closeDeleteModal = () => {
    if (deleteIsLoading) {
      return;
    }
    setDeleteModalTarget(null);
    setDeleteConfirmText('');
  };

  const executeDelete = async () => {
    if (!deleteModalTarget) {
      return;
    }

    if (deleteModalTarget.type === 'question') {
      await deleteQuestionMutation.mutateAsync(deleteModalTarget.question);
    } else if (deleteModalTarget.type === 'bulk') {
      await bulkDeleteMutation.mutateAsync([...selectedQuestionIds]);
    } else if (deleteModalTarget.type === 'chapter') {
      await deleteChapterMutation.mutateAsync({
        id: deleteModalTarget.chapterId,
        name: deleteModalTarget.chapterName,
      });
    }

    closeDeleteModal();
  };

  const toggleQuestion = (questionId: string) => {
    setSelectedQuestionIds((prev) =>
      prev.includes(questionId) ? prev.filter((id) => id !== questionId) : [...prev, questionId],
    );
  };

  const selectAllVisible = () => {
    const ids = (questionsQuery.data ?? []).map((q) => q.id);
    setSelectedQuestionIds(ids);
  };

  const clearSelection = () => {
    setSelectedQuestionIds([]);
  };

  const deleteEnabled = deleteConfirmText.toLowerCase() === 'delete';

  const deleteErrorMessage =
    (deleteQuestionMutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message
    ?? (bulkDeleteMutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message
    ?? (deleteChapterMutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message;

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
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-[260px]">
              {isRenamingChapter && selectedChapter ? (
                <div className="flex items-center gap-2">
                  <input
                    className="input"
                    value={chapterNameDraft}
                    onChange={(e) => setChapterNameDraft(e.target.value)}
                    placeholder="Chapter name"
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={renameChapterMutation.isPending || !chapterNameDraft.trim()}
                    onClick={() => renameChapterMutation.mutate({ chapterId: selectedChapter.id, name: chapterNameDraft })}
                  >
                    Save
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => { setIsRenamingChapter(false); setChapterNameDraft(selectedChapter.name); }}>
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <h3 className="text-lg font-bold">{selectedChapter?.name ?? 'Questions'}</h3>
                  <p className="text-sm text-[var(--on-surface-variant)]">{selectedChapter?.questionCount ?? 0} questions in this chapter</p>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectedChapter && !isRenamingChapter ? (
                <button
                  type="button"
                  onClick={() => {
                    setChapterNameDraft(selectedChapter.name);
                    setIsRenamingChapter(true);
                  }}
                  className="rounded-lg border border-[var(--outline-ghost)] bg-white px-3 py-2 text-xs font-bold text-[var(--on-surface)] transition hover:bg-[var(--surface-low)]"
                >
                  Rename Chapter
                </button>
              ) : null}

              {selectedChapter ? (
                <button
                  type="button"
                  onClick={() => openDeleteModal({ type: 'chapter', chapterId: selectedChapter.id, chapterName: selectedChapter.name })}
                  disabled={deleteChapterMutation.isPending}
                  className="rounded-lg border border-[var(--error)]/30 bg-[var(--error-container)] px-3 py-2 text-xs font-bold text-[var(--error)] transition hover:brightness-95 disabled:opacity-60"
                >
                  Delete Chapter
                </button>
              ) : null}
            </div>
          </div>

          {deleteErrorMessage ? (
            <div className="mb-4 rounded-xl bg-[var(--error-container)] px-4 py-3 text-sm text-[var(--error)]">
              {deleteErrorMessage}
            </div>
          ) : null}

          {selectedQuestionIds.length > 0 ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--outline-ghost)] bg-[var(--surface-low)] p-3">
              <p className="text-sm font-semibold">{selectedQuestionIds.length} selected</p>
              <div className="flex items-center gap-2">
                <button type="button" className="btn-secondary" onClick={clearSelection}>
                  Clear Selection
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-[var(--error)]/30 bg-[var(--error-container)] px-3 py-2 text-xs font-bold text-[var(--error)] transition hover:brightness-95"
                  onClick={() => openDeleteModal({ type: 'bulk' })}
                >
                  Delete Selected
                </button>
              </div>
            </div>
          ) : null}

          <div className="mb-3 flex items-center gap-2 text-xs">
            <button type="button" className="btn-secondary" onClick={selectAllVisible}>Select All Visible</button>
            <button type="button" className="btn-secondary" onClick={clearSelection}>Clear</button>
          </div>

          <div className="space-y-4">
            {questionsQuery.data?.map((question, index) => {
              const checked = selectedQuestionIds.includes(question.id);
              return (
                <article key={question.id} className="surface-low rounded-xl p-4">
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={checked} onChange={() => toggleQuestion(question.id)} />
                      <span className="font-bold text-[var(--on-surface-variant)]">Q{index + 1}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-[var(--secondary-container)] px-2 py-0.5 font-semibold">{question.difficulty}</span>
                      <span className="rounded-full bg-white px-2 py-0.5 font-semibold">v{question.version}</span>
                      <button
                        type="button"
                        onClick={() => openDeleteModal({ type: 'question', question })}
                        disabled={deleteQuestionMutation.isPending}
                        className="rounded-md bg-[var(--error-container)] px-2 py-1 font-bold text-[var(--error)] transition hover:brightness-95 disabled:opacity-60"
                      >
                        Delete
                      </button>
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
              );
            })}

            {!questionsQuery.isLoading && (questionsQuery.data?.length ?? 0) === 0 ? (
              <div className="surface-low rounded-xl p-8 text-center text-sm text-[var(--on-surface-variant)]">
                No questions found for this chapter yet.
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {deleteModalTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h4 className="text-lg font-bold text-[var(--on-surface)]">Confirm Deletion</h4>
            <p className="mt-2 text-sm text-[var(--on-surface-variant)]">
              {deleteModalTarget.type === 'question'
                ? `This will permanently delete the selected question.`
                : deleteModalTarget.type === 'bulk'
                  ? `This will permanently delete ${selectedQuestionIds.length} selected questions.`
                  : `This will permanently delete chapter "${deleteModalTarget.chapterName}".`}
            </p>
            <p className="mt-2 text-sm font-semibold text-[var(--error)]">
              Type <span className="rounded bg-[var(--error-container)] px-1 py-0.5">delete</span> to enable the delete button.
            </p>

            <input
              className="input mt-3"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type delete"
            />

            <div className="mt-5 flex items-center justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={closeDeleteModal}>
                Cancel
              </button>
              <button
                type="button"
                disabled={!deleteEnabled || deleteIsLoading}
                onClick={() => void executeDelete()}
                className="rounded-lg border border-[var(--error)]/30 bg-[var(--error-container)] px-4 py-2 text-sm font-bold text-[var(--error)] disabled:opacity-50"
              >
                {deleteIsLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
