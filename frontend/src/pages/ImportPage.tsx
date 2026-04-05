import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, authHeaders } from '../api/client';
import { useAuth } from '../context/AuthContext';

const starterJson = {
  subject: 'Physics',
  chapter: 'Kinematics',
  questions: [
    {
      question_text: 'A body starts from rest and accelerates at 2 m/s². Speed after 5s?',
      options: ['5 m/s', '10 m/s', '12 m/s', '2 m/s'],
      correct_option_index: 1,
      explanation: 'v = u + at = 0 + 2*5',
      difficulty: 'EASY',
      source_ref: 'Testbook-Week-1',
      tags: ['motion', 'equations'],
    },
  ],
};

type InvalidQuestion = { index: number; reason: string };

type ValidationResponse = {
  readyToImport?: boolean;
  invalidQuestions?: InvalidQuestion[];
  validQuestions?: number;
  duplicatesDetected?: number;
  updatesDetected?: number;
  newQuestionsDetected?: number;
};

export function ImportPage() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [payload, setPayload] = useState(JSON.stringify(starterJson, null, 2));
  const [resultText, setResultText] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [validatedPayload, setValidatedPayload] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResponse | null>(null);
  const [fileName, setFileName] = useState('questions_payload.json');
  const [uploadProgress, setUploadProgress] = useState(100);
  const [dragActive, setDragActive] = useState(false);

  const parsedPayload = useMemo(() => {
    try {
      return JSON.parse(payload) as {
        subject?: string;
        chapter?: string;
        questions?: Array<{
          question_text?: string;
          options?: string[];
          correct_option_index?: number;
        }>;
      };
    } catch {
      return null;
    }
  }, [payload]);

  const totalQuestions = parsedPayload?.questions?.length ?? 0;
  const invalidQuestions = validationResult?.invalidQuestions ?? [];
  const invalidSet = new Set(invalidQuestions.map((item) => item.index));
  const invalidByIndex = new Map(invalidQuestions.map((item) => [item.index, item.reason]));
  const validCount = validationResult
    ? Math.max(0, totalQuestions - invalidQuestions.length)
    : totalQuestions;

  const isCommitEnabled = useMemo(
    () => !loading && validatedPayload !== null && validatedPayload === payload,
    [loading, payload, validatedPayload],
  );

  const parseAndSetJson = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.json')) {
      setResultText('Only .json files are supported in this uploader.');
      return;
    }

    try {
      setUploadProgress(15);
      const text = await file.text();
      setUploadProgress(70);
      JSON.parse(text);
      setPayload(JSON.stringify(JSON.parse(text), null, 2));
      setValidatedPayload(null);
      setValidationResult(null);
      setFileName(file.name);
      setUploadProgress(100);
      setResultText('File loaded. Click "Validate File" to validate and enable import.');
    } catch {
      setUploadProgress(0);
      setResultText('Invalid JSON file content. Please upload a valid JSON file.');
    }
  };

  const onDropFile = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) {
      return;
    }
    await parseAndSetJson(file);
  };

  const onBrowseFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    await parseAndSetJson(file);
  };

  const validateImport = async () => {
    setLoading(true);
    try {
      const parsed = JSON.parse(payload);
      const { data } = await api.post<ValidationResponse>('/imports/questions:dry-run', parsed, {
        headers: authHeaders(accessToken),
      });

      const hasInvalid = (data.invalidQuestions?.length ?? 0) > 0;
      const ready = Boolean(data.readyToImport);

      if (ready && !hasInvalid) {
        setValidatedPayload(payload);
      } else {
        setValidatedPayload(null);
      }

      setValidationResult(data);
      setResultText(JSON.stringify(data, null, 2));
    } catch {
      setValidatedPayload(null);
      setValidationResult(null);
      setResultText('Validation failed. Verify JSON schema and token/session.');
    } finally {
      setLoading(false);
    }
  };

  const commitImport = async () => {
    setLoading(true);
    try {
      const parsed = JSON.parse(payload);
      const { data } = await api.post('/imports/questions:commit', parsed, {
        headers: authHeaders(accessToken),
      });
      setResultText(JSON.stringify(data, null, 2));
      setShowSuccessModal(true);
    } catch {
      setResultText('Import failed. Please validate again and retry.');
    } finally {
      setLoading(false);
    }
  };

  const closeModalAndRedirect = () => {
    setShowSuccessModal(false);
    navigate('/dashboard');
  };

  const onPayloadChange = (nextValue: string) => {
    setPayload(nextValue);
    if (validatedPayload !== null && nextValue !== validatedPayload) {
      setValidatedPayload(null);
    }
  };

  return (
    <div className="pb-32">
      <div className="mb-8">
        <nav className="mb-2 flex items-center gap-1 text-xs text-[var(--on-surface-variant)]">
          <span className="hover:text-[var(--primary)] cursor-pointer">Question Bank</span>
          <span className="material-symbols-outlined text-xs">chevron_right</span>
          <span className="font-semibold text-[var(--on-surface)]">Import Questions</span>
        </nav>
        <h1 className="headline-tight text-3xl font-extrabold">Import Questions</h1>
      </div>

      <div className="grid grid-cols-12 gap-8 items-start">
        <div className="col-span-12 space-y-8 lg:col-span-8">
          <section className="card p-8">
            <div
              className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors cursor-pointer ${dragActive ? 'border-[var(--primary)] bg-blue-50/60' : 'border-[var(--outline-variant)] bg-[var(--surface-container-low)]/40 hover:bg-[var(--surface-container-low)]/60'}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(event) => void onDropFile(event)}
            >
              <div className="mb-6 flex justify-center gap-4">
                <div className="w-12 h-12 bg-white rounded-lg shadow-sm flex items-center justify-center text-[var(--primary)] border border-[var(--surface-container-high)]">
                  <span className="material-symbols-outlined text-3xl">description</span>
                </div>
                <div className="w-12 h-12 bg-white rounded-lg shadow-sm flex items-center justify-center text-[var(--tertiary)] border border-[var(--surface-container-high)]">
                  <span className="material-symbols-outlined text-3xl">table_chart</span>
                </div>
                <div className="w-12 h-12 bg-white rounded-lg shadow-sm flex items-center justify-center text-[var(--secondary)] border border-[var(--surface-container-high)]">
                  <span className="material-symbols-outlined text-3xl">data_object</span>
                </div>
              </div>
              <h3 className="text-lg font-bold mb-2">Drag and drop your file here</h3>
              <p className="text-sm text-[var(--on-surface-variant)] mb-6">Support for JSON format (Max 10MB)</p>
              <button type="button" className="bg-white border border-[var(--outline-variant)] px-6 py-2.5 rounded-lg text-sm font-semibold shadow-sm hover:border-[var(--primary)] hover:text-[var(--primary)] transition-all">
                Browse File
              </button>
              <input ref={fileInputRef} className="hidden" type="file" accept=".json,application/json" onChange={(event) => void onBrowseFile(event)} />
            </div>

            <div className="mt-8">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[var(--secondary)]">file_present</span>
                  <span className="text-sm font-medium">{fileName}</span>
                </div>
                <span className="text-sm font-bold text-[var(--primary)]">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-[var(--surface-container-high)] rounded-full h-2">
                <div className="bg-[var(--primary)] h-2 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          </section>

          <section className="card p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold flex items-center">
                <span className="material-symbols-outlined mr-2 text-[var(--primary)]">alt_route</span>
                Field Mapping
              </h3>
              <span className="bg-[var(--secondary-container)] text-[var(--on-secondary-container)] px-3 py-1 rounded-full text-xs font-medium">Automatic Detection Applied</span>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {[['Question Text', 'question_text'], ['Option A', 'options[0]'], ['Option B', 'options[1]']].map(([field, col]) => (
                <div key={field} className="flex items-center justify-between py-2 border-b border-[var(--outline-variant)]/20">
                  <span className="text-sm font-medium">{field}</span>
                  <select className="input w-40"><option>{col}</option></select>
                </div>
              ))}
              {[['Option C', 'options[2]'], ['Option D', 'options[3]'], ['Correct Answer', 'correct_option_index']].map(([field, col]) => (
                <div key={field} className="flex items-center justify-between py-2 border-b border-[var(--outline-variant)]/20">
                  <span className="text-sm font-medium">{field}</span>
                  <select className="input w-40"><option>{col}</option></select>
                </div>
              ))}
            </div>
          </section>

          <section className="card overflow-hidden p-0">
            <div className="p-6 border-b border-[var(--surface-container-high)] bg-white flex justify-between items-center">
              <h3 className="text-lg font-bold">Data Preview</h3>
              <div className="flex gap-2">
                <button type="button" className="p-1.5 hover:bg-[var(--surface-container-low)] rounded transition-colors">
                  <span className="material-symbols-outlined text-sm">filter_list</span>
                </button>
                <button type="button" className="p-1.5 hover:bg-[var(--surface-container-low)] rounded transition-colors">
                  <span className="material-symbols-outlined text-sm">search</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[var(--surface-container-low)]/50">
                  <tr>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-[var(--outline)]">#</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-[var(--outline)]">Question</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-[var(--outline)] text-center">A</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-[var(--outline)] text-center">B</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-[var(--outline)] text-center">C</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-[var(--outline)] text-center">D</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-[var(--outline)] text-center">Correct</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-[var(--outline)] text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--surface-container-high)]">
                  {(parsedPayload?.questions ?? []).slice(0, 12).map((question, index) => {
                    const hasError = invalidSet.has(index);
                    const options = question.options ?? [];
                    const errorReason = invalidByIndex.get(index);
                    return (
                      <tr key={`${question.question_text}-${index}`} className={hasError ? 'bg-red-50/40 hover:bg-red-50/60 transition-colors' : 'hover:bg-green-50/20 transition-colors'}>
                        <td className="px-4 py-4 text-sm font-medium text-[var(--outline)]">{String(index + 1).padStart(3, '0')}</td>
                        <td className="px-4 py-4 text-sm">
                          <span className={hasError ? 'font-medium text-[var(--error)] italic' : ''}>
                            {question.question_text ?? '(missing question_text)'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm text-center">{options[0] ?? '-'}</td>
                        <td className="px-4 py-4 text-sm text-center">{options[1] ?? '-'}</td>
                        <td className="px-4 py-4 text-sm text-center">{options[2] ?? '-'}</td>
                        <td className="px-4 py-4 text-sm text-center">{options[3] ?? '-'}</td>
                        <td className="px-4 py-4 text-sm text-center font-bold">
                          {typeof question.correct_option_index === 'number'
                            ? String.fromCharCode(65 + question.correct_option_index)
                            : '-'}
                        </td>
                        <td className="px-4 py-4 text-center">
                          {hasError ? (
                            <div className="group relative inline-block">
                              <span className="material-symbols-outlined text-[var(--error)] text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
                              <div className="absolute bottom-full left-1/2 z-10 mb-2 hidden w-44 -translate-x-1/2 rounded-lg bg-slate-800 p-2 text-[10px] text-white shadow-xl group-hover:block">
                                {errorReason ?? 'Validation error in this question row.'}
                              </div>
                            </div>
                          ) : (
                            <span className="inline-flex rounded-full bg-green-100 p-1 text-green-700">
                              <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-[0.1em] text-[var(--on-surface-variant)]">JSON Editor</h3>
            <textarea
              className="h-96 w-full rounded-xl border border-[var(--outline-variant)]/40 bg-white p-3 font-mono text-xs outline-none focus:border-[var(--primary)]"
              value={payload}
              onChange={(event) => {
                onPayloadChange(event.target.value);
                setValidationResult(null);
              }}
            />
          </section>
        </div>

        <div className="col-span-12 lg:col-span-4 sticky top-24">
          <section className="card border border-[var(--surface-container-high)]">
            <h3 className="text-base font-bold text-[var(--on-surface)] mb-6">Import Summary</h3>
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-[var(--surface-container-low)] rounded-xl">
                <div>
                  <p className="text-sm text-[var(--on-surface-variant)] font-medium">Total Questions</p>
                  <p className="text-2xl font-black leading-tight">{totalQuestions}</p>
                </div>
                <div className="p-3 bg-white rounded-lg shadow-sm">
                  <span className="material-symbols-outlined text-[var(--primary)]">dataset</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-green-50 rounded-xl border border-green-100">
                  <p className="text-[10px] uppercase font-bold text-green-700 tracking-wider mb-1">Valid</p>
                  <p className="text-xl font-bold text-green-800">{validCount}</p>
                </div>
                <div className="p-4 bg-red-50 rounded-xl border border-red-100">
                  <p className="text-[10px] uppercase font-bold text-red-700 tracking-wider mb-1">Errors</p>
                  <p className="text-xl font-bold text-red-800">{invalidQuestions.length}</p>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex items-center">
                  <span className="material-symbols-outlined text-sm text-[var(--on-surface-variant)] mr-2">description</span>
                  <span className="flex-1">Format Check</span>
                  <span className={parsedPayload ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}>{parsedPayload ? 'Passed' : 'Failed'}</span>
                </div>
                <div className="flex items-center">
                  <span className="material-symbols-outlined text-sm text-[var(--on-surface-variant)] mr-2">schema</span>
                  <span className="flex-1">Mapping Check</span>
                  <span className={isCommitEnabled ? 'text-green-600 font-bold' : 'text-[var(--on-surface-variant)] font-bold'}>{isCommitEnabled ? 'Passed' : 'Pending'}</span>
                </div>
                <div className="flex items-center">
                  <span className="material-symbols-outlined text-sm text-[var(--on-surface-variant)] mr-2">error_outline</span>
                  <span className="flex-1">Integrity Check</span>
                  <span className={invalidQuestions.length > 0 ? 'text-red-500 font-bold' : 'text-green-600 font-bold'}>
                    {invalidQuestions.length > 0 ? `${invalidQuestions.length} Warnings` : 'Passed'}
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--surface-container-high)]">
                <div className="bg-blue-50/50 p-4 rounded-xl">
                  <div className="flex items-start">
                    <span className="material-symbols-outlined text-[var(--primary)] mr-2">info</span>
                    <p className="text-[11px] text-[var(--primary-container)] font-medium leading-relaxed">
                      Questions with errors will be skipped during import. Fix them in JSON and re-validate, or proceed with valid rows.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <section className="mt-8 card">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.1em] text-[var(--on-surface-variant)]">Raw API Response</h3>
        <pre className="max-h-60 overflow-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-100">{resultText || 'No action yet.'}</pre>
      </section>

      <footer className="fixed bottom-0 right-0 left-0 md:left-64 bg-white/80 backdrop-blur-xl border-t border-[var(--surface-container-high)] px-8 py-4 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center text-sm text-[var(--on-surface-variant)]">
            <span className="material-symbols-outlined text-base mr-2 text-[var(--primary)] animate-pulse">sync</span>
            System ready for import validation
          </div>
          <div className="flex items-center space-x-4">
            <button type="button" className="px-6 py-2.5 rounded-lg text-sm font-bold text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)] transition-colors" onClick={() => navigate('/dashboard')}>
              Cancel
            </button>
            <button type="button" className="px-6 py-2.5 rounded-lg text-sm font-bold bg-white border border-[var(--outline-variant)] shadow-sm hover:border-[var(--primary)] hover:text-[var(--primary)] transition-all" disabled={loading} onClick={() => void validateImport()}>
              Validate File
            </button>
            <button type="button" className="px-8 py-2.5 rounded-lg text-sm font-bold bg-gradient-to-br from-[var(--primary)] to-[var(--primary-container)] text-white shadow-md hover:shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!isCommitEnabled} onClick={() => void commitImport()}>
              Import Questions
            </button>
          </div>
        </div>
      </footer>

      {showSuccessModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-xl font-bold text-slate-900">Import Successful</h3>
            <p className="mt-2 text-sm text-slate-600">Questions have been added successfully.</p>
            <div className="mt-5 flex justify-end">
              <button type="button" className="btn-primary" onClick={closeModalAndRedirect}>
                Go To Home
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
