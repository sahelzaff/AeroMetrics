# Performance & Weak-Chapter Monitoring Guide

This document explains how performance tracking currently works in the app, where it is computed, and what to improve next.

## 1) Current Monitoring Flow

### Submission lifecycle
1. User submits an attempt via `POST /attempts/:id/submit`.
2. Backend computes score (`+1` per correct, `0` per wrong/skipped).
3. Attempt is stored as `SUBMITTED`.
4. Chapter snapshots are rebuilt for that user.
5. Dashboard and analytics endpoints read these snapshots + attempts.

Core implementation:
- [attempts.service.ts](/c:/Users/RAKA/Documents/Work/AviationTest/backend/src/attempts/attempts.service.ts)
- [analytics.service.ts](/c:/Users/RAKA/Documents/Work/AviationTest/backend/src/analytics/analytics.service.ts)
- [dashboard.service.ts](/c:/Users/RAKA/Documents/Work/AviationTest/backend/src/dashboard/dashboard.service.ts)

## 2) What Is Stored (Data Model)

Relevant tables from Prisma schema:
- `TestAttempt`: one test run (`score`, `totalQuestions`, `status`, timestamps)
- `AttemptQuestion`: question slots for an attempt
- `AttemptAnswer`: selected option + correctness
- `ChapterMetricSnapshot`: per-user, per-chapter aggregate metrics

Schema reference:
- [schema.prisma](/c:/Users/RAKA/Documents/Work/AviationTest/backend/prisma/schema.prisma)

## 3) Metric Definitions (Current)

### Test-level metrics
- `score`: number of correct answers in the attempt
- `accuracy`: `(score / totalQuestions) * 100`
- `correct`: count of `AttemptAnswer.isCorrect = true`
- `incorrect`: answered but incorrect
- `skipped`: no answer for an attempt question

### Chapter-level metrics
Rebuilt after each submit for all submitted attempts of that user:
- `attemptsCount`: number of distinct submitted attempts touching that chapter
- `accuracy`: `chapter_correct / chapter_total * 100`
- `averageScore`: `chapter_correct / attemptsCount`

Weak chapter flag:
- `needsFocus = accuracy < 60`

## 4) Endpoints Powering Performance UI

- `POST /attempts/:id/submit` -> computes score + chapter breakdown
- `GET /attempts/:id/review` -> detailed question-level result
- `GET /analytics/chapters` -> chapter accuracy + weak chapter flag
- `GET /analytics/wrong-questions` -> wrong-answer review list
- `GET /dashboard/overview` -> recent attempts, weak chapters, trend

## 5) Adaptive Test Behavior (Current)

When generating tests (`POST /tests/generate-from-blueprint`):
- Optional weak-chapter prioritization adjusts chapter question counts.
- Weighted question sampling biases toward unseen/wrongly-answered questions.

Implementation:
- [tests.service.ts](/c:/Users/RAKA/Documents/Work/AviationTest/backend/src/tests/tests.service.ts)

## 6) Known Limitations

1. Snapshot rebuild cost grows with attempt history
- Current logic rebuilds chapter snapshots by scanning all submitted attempts for user each submit.

2. Weak-chapter threshold is static
- Single hardcoded threshold (`60`) may not fit all subjects.

3. Time analytics are estimated, not real
- UI currently estimates duration in result page; not using true elapsed time.

4. No confidence / guess modeling
- All wrong answers treated equally.

5. No decay/recency weighting
- Old attempts affect chapter score as much as recent attempts.

## 7) High-Impact Improvements (Recommended)

### A) Make chapter snapshots incremental (highest ROI)
Instead of full rebuild each submit:
- Update only touched chapters using delta from submitted attempt.
- Maintain counters:
  - `totalAnswered`
  - `totalCorrect`
  - `attemptsCount`
- Compute `accuracy` from counters.

Benefit: much faster submit path as data grows.

### B) Track real timing quality
Store on `TestAttempt`:
- `endedAt` (or use `submittedAt - startedAt`)
- `timeSpentSeconds`

Then add metrics:
- speed (`questions/min`)
- accuracy-speed tradeoff per chapter.

### C) Add recency-weighted mastery
Use weighted accuracy:
- recent attempts higher weight than old attempts.

Example:
- last 4 attempts: weights `[0.4, 0.3, 0.2, 0.1]`

### D) Add confidence-aware analytics
In attempt UI, capture confidence (low/med/high) per question.
Then detect:
- high-confidence wrong answers -> conceptual gaps
- low-confidence correct answers -> unstable knowledge

### E) Per-subject weak threshold and policy
Instead of global `<60`:
- subject-level configs (`weakThreshold`, `warningThreshold`)
- optional chapter criticality weights.

### F) Add trend by chapter, not only overall
Expose endpoint with chapter trend over last N tests:
- chapter accuracy per attempt index/time
- supports better revision planning.

## 8) Suggested Next API Additions

1. `GET /analytics/chapters/trend?chapterId=...&limit=...`
2. `GET /analytics/overview/advanced`
- includes speed, recency-weighted mastery, confidence breakdown
3. `POST /attempts/:id/answer` payload extension
- add optional `confidence: LOW|MEDIUM|HIGH`

## 9) Suggested Frontend Enhancements

1. Weak chapter cards with priority score
- combine low accuracy + high attempt count + recent decline.

2. Revision queue
- auto-generate next practice set from wrong questions and weak chapters.

3. Chapter detail drill-down page
- attempt history, common error topics, wrong-option patterns.

## 10) Operational Utilities

Reset script (already available):
- `npm run reset:metrics -- --yes`
- optional: `--include-blueprints`

Script file:
- [reset-metrics.js](/c:/Users/RAKA/Documents/Work/AviationTest/backend/scripts/reset-metrics.js)

---

If you want, next step can be implementing **A + B** together (incremental snapshots + real timing) since they give the biggest practical improvement with low UI disruption.
