# Prisma Schema Addons: Attempts, Analytics, Intelligence

This document explains how to use the new schema addons in `prisma/schema.prisma` for:
- advanced attempt tracking
- chapter/question performance analytics
- weak area detection
- recommendation + revision queue generation

## 1) Create Attempt (Example)

```ts
// tests.service.ts
const attempt = await prisma.testAttempt.create({
  data: {
    userId,
    blueprintId, // existing blueprint flow
    testId, // optional direct test flow
    status: 'DRAFT',
    totalQuestions: selectedQuestions.length,
    questions: {
      create: selectedQuestions.map((q, i) => ({
        questionId: q.id,
        sequence: i + 1,
        orderIndex: i + 1,
      })),
    },
  },
  include: {
    questions: true,
  },
});
```

## 2) Submit Attempt (Example)

```ts
// attempts.service.ts
const submitted = await prisma.$transaction(async (tx) => {
  const attempt = await tx.testAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: {
      questions: {
        include: {
          answer: true,
          question: { include: { options: true } },
        },
      },
    },
  });

  const total = attempt.questions.length;
  const correct = attempt.questions.filter((q) => q.answer?.isCorrect).length;
  const score = correct; // +1 / 0 model
  const accuracy = total > 0 ? (correct / total) * 100 : 0;

  const updatedAttempt = await tx.testAttempt.update({
    where: { id: attemptId },
    data: {
      status: 'SUBMITTED',
      score,
      accuracy,
      timeSpentSeconds,
      submittedAt: new Date(),
    },
  });

  await tx.testPerformanceMetric.upsert({
    where: { attemptId: attempt.id },
    update: {
      speed: total > 0 ? total / Math.max(1, timeSpentSeconds / 60) : 0,
      accuracy,
      weightedScore: score, // can be changed to weighted formula
      qualityScore: (accuracy * 0.7) + ((total / Math.max(1, timeSpentSeconds / 60)) * 0.3),
    },
    create: {
      attemptId: attempt.id,
      speed: total > 0 ? total / Math.max(1, timeSpentSeconds / 60) : 0,
      accuracy,
      weightedScore: score,
      qualityScore: (accuracy * 0.7) + ((total / Math.max(1, timeSpentSeconds / 60)) * 0.3),
    },
  });

  return updatedAttempt;
});
```

## 3) Fetch Analytics (Example)

```ts
// analytics.service.ts
const [chapterMetrics, weakAreas, recos] = await Promise.all([
  prisma.chapterMetricSnapshot.findMany({
    where: { userId },
    orderBy: [{ priorityScore: 'desc' }, { accuracy: 'asc' }],
    include: { chapter: { include: { subject: true } } },
  }),
  prisma.weakArea.findMany({
    where: { userId },
    orderBy: { weaknessScore: 'desc' },
    include: { chapter: { include: { subject: true } } },
  }),
  prisma.recommendation.findMany({
    where: { userId, isCompleted: false },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    take: 10,
  }),
]);
```

## 4) Service Logic Outline

### Attempt Submission Pipeline
1. Lock/read attempt with questions + answers.
2. Compute score, accuracy, skipped, speed.
3. Mark attempt as `SUBMITTED`.
4. Upsert `TestPerformanceMetric`.
5. Aggregate by chapter:
   - totalAttempts
   - totalQuestions
   - totalCorrect
   - accuracy
   - masteryScore
   - trend
   - priorityScore
6. Upsert `ChapterMetricSnapshot`.
7. Upsert `QuestionPerformanceMetric` for each question seen.
8. Recompute `WeakArea`.
9. Generate/refresh `Recommendation`.
10. Rebuild `RevisionQueue` entries from:
   - wrong answers (`source = WRONG`)
   - weak chapters (`source = WEAK_CHAPTER`)

### Weak Chapter Strategy (Simple V1)
- `weaknessScore = (100 - chapterAccuracy) * 0.6 + avgWrongRate * 0.4`
- `priorityScore = weaknessScore + trendPenalty`
- Trend:
  - `UP`: accuracy improving over recent windows
  - `DOWN`: declining
  - `STABLE`: flat

### Recommendation Rules (Example)
- `accuracy < 50` => `REVISION` priority 5
- `accuracy between 50 and 75` => `PRACTICE` priority 3
- `slow speed + low qualityScore` => `SPEED_IMPROVEMENT` priority 4

## 5) Migration Notes

After schema change:

```bash
npx prisma format
npx prisma generate
npx prisma migrate dev --name add_analytics_intelligence_models
```

If Windows file lock blocks `prisma generate`, stop running backend/dev processes and retry.
