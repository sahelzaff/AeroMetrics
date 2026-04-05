import { BadRequestException, Injectable } from '@nestjs/common';
import { QuestionDifficulty } from '@prisma/client';
import { createHash } from 'crypto';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ObservabilityService } from '../observability/observability.service';

const questionSchema = z.object({
  question_text: z.string().min(5),
  options: z.array(z.string().min(1)).min(2),
  correct_option_index: z.number().int().nonnegative(),
  explanation: z.string().optional().nullable(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).default('MEDIUM'),
  source_ref: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().default([]),
});

const baseImportSchema = z.object({
  subject: z.string().min(2),
  chapter: z.string().min(1),
  questions: z.array(z.unknown()).min(1),
});

type ValidQuestion = z.infer<typeof questionSchema> & {
  index: number;
  question_hash: string;
  content_signature: string;
};

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly observabilityService: ObservabilityService,
  ) {}

  async dryRun(payload: unknown) {
    const { subject, chapter, validQuestions, invalidQuestions } = this.validateAndNormalize(payload);

    const existingChapter = await this.prisma.chapter.findFirst({
      where: {
        name: chapter,
        subject: { name: subject },
      },
      include: {
        questions: {
          where: { isLatest: true },
          include: { options: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });

    const existingByHash = new Map<string, { id: string; version: number; signature: string }>();
    for (const question of existingChapter?.questions ?? []) {
      existingByHash.set(question.questionHash, {
        id: question.id,
        version: question.version,
        signature: this.signatureFromStored(question),
      });
    }

    const seenInPayload = new Set<string>();
    let duplicates = 0;
    let updates = 0;

    for (const question of validQuestions) {
      if (seenInPayload.has(question.question_hash)) {
        duplicates += 1;
        continue;
      }
      seenInPayload.add(question.question_hash);

      const existing = existingByHash.get(question.question_hash);
      if (!existing) {
        continue;
      }

      if (existing.signature === question.content_signature) {
        duplicates += 1;
      } else {
        updates += 1;
      }
    }

    const result = {
      subject,
      chapter,
      totalReceived: baseImportSchema.parse(payload).questions.length,
      validQuestions: validQuestions.length,
      invalidQuestions,
      duplicatesDetected: duplicates,
      updatesDetected: updates,
      newQuestionsDetected: validQuestions.length - duplicates - updates,
      readyToImport: true,
    };

    void this.observabilityService.logBusinessEvent('QUESTION_IMPORT_VALIDATED', {
      subject,
      chapter,
      totalReceived: result.totalReceived,
      validQuestions: result.validQuestions,
      invalidCount: result.invalidQuestions.length,
      duplicatesDetected: result.duplicatesDetected,
      updatesDetected: result.updatesDetected,
    });

    return result;
  }

  async commit(payload: unknown) {
    const { subject, chapter, validQuestions, invalidQuestions } = this.validateAndNormalize(payload);

    const subjectRow = await this.prisma.subject.upsert({
      where: { name: subject },
      create: { name: subject },
      update: {},
    });

    const chapterRow = await this.prisma.chapter.upsert({
      where: {
        subjectId_name: {
          subjectId: subjectRow.id,
          name: chapter,
        },
      },
      create: {
        subjectId: subjectRow.id,
        name: chapter,
      },
      update: {},
    });

    const existingLatest = await this.prisma.question.findMany({
      where: {
        chapterId: chapterRow.id,
        isLatest: true,
      },
      include: {
        options: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    const existingByHash = new Map<string, (typeof existingLatest)[number]>();
    existingLatest.forEach((question) => existingByHash.set(question.questionHash, question));

    const seenInPayload = new Set<string>();
    let createdCount = 0;
    let updatedCount = 0;
    let duplicateCount = 0;

    for (const question of validQuestions) {
      if (seenInPayload.has(question.question_hash)) {
        duplicateCount += 1;
        continue;
      }
      seenInPayload.add(question.question_hash);

      const existing = existingByHash.get(question.question_hash);

      if (!existing) {
        await this.createQuestionVersion(chapterRow.id, question, 1);
        createdCount += 1;
        continue;
      }

      const existingSignature = this.signatureFromStored(existing);
      if (existingSignature === question.content_signature) {
        duplicateCount += 1;
        continue;
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.question.update({
          where: { id: existing.id },
          data: { isLatest: false },
        });

        await tx.question.create({
          data: {
            chapterId: chapterRow.id,
            questionHash: question.question_hash,
            version: existing.version + 1,
            isLatest: true,
            questionText: question.question_text,
            explanation: question.explanation ?? null,
            sourceRef: question.source_ref ?? null,
            difficulty: question.difficulty as QuestionDifficulty,
            tags: question.tags,
            options: {
              create: question.options.map((option, optionIndex) => ({
                text: option,
                sortOrder: optionIndex,
                isCorrect: optionIndex === question.correct_option_index,
              })),
            },
          },
        });
      });

      updatedCount += 1;
    }

    const result = {
      subject,
      chapter,
      totalReceived: baseImportSchema.parse(payload).questions.length,
      createdCount,
      updatedCount,
      duplicateCount,
      invalidQuestions,
      importedCount: createdCount + updatedCount,
      failedCount: invalidQuestions.length,
    };

    void this.observabilityService.logBusinessEvent('QUESTION_IMPORT_COMMITTED', {
      subject,
      chapter,
      createdCount,
      updatedCount,
      duplicateCount,
      invalidCount: invalidQuestions.length,
      importedCount: result.importedCount,
    });

    return result;
  }

  private async createQuestionVersion(chapterId: string, question: ValidQuestion, version: number) {
    await this.prisma.question.create({
      data: {
        chapterId,
        questionHash: question.question_hash,
        version,
        isLatest: true,
        questionText: question.question_text,
        explanation: question.explanation ?? null,
        sourceRef: question.source_ref ?? null,
        difficulty: question.difficulty as QuestionDifficulty,
        tags: question.tags,
        options: {
          create: question.options.map((option, optionIndex) => ({
            text: option,
            sortOrder: optionIndex,
            isCorrect: optionIndex === question.correct_option_index,
          })),
        },
      },
    });
  }

  private validateAndNormalize(payload: unknown) {
    const base = baseImportSchema.safeParse(payload);
    if (!base.success) {
      throw new BadRequestException(base.error.flatten());
    }

    const subject = base.data.subject.trim();
    const chapter = base.data.chapter.trim();
    const validQuestions: ValidQuestion[] = [];
    const invalidQuestions: Array<{ index: number; reason: string }> = [];

    base.data.questions.forEach((question, index) => {
      const parsed = questionSchema.safeParse(question);
      if (!parsed.success) {
        invalidQuestions.push({
          index,
          reason: parsed.error.issues.map((issue) => issue.message).join('; '),
        });
        return;
      }

      const normalized = {
        ...parsed.data,
        question_text: parsed.data.question_text.trim(),
        options: parsed.data.options.map((option) => option.trim()),
        tags: parsed.data.tags.map((tag) => tag.trim()).filter(Boolean),
      };

      if (normalized.correct_option_index >= normalized.options.length) {
        invalidQuestions.push({
          index,
          reason: 'correct_option_index out of bounds',
        });
        return;
      }

      const questionHash = this.hashQuestion(normalized.question_text, normalized.options);
      validQuestions.push({
        ...normalized,
        index,
        question_hash: questionHash,
        content_signature: this.hashContentSignature(normalized),
      });
    });

    return {
      subject,
      chapter,
      validQuestions,
      invalidQuestions,
    };
  }

  private hashQuestion(questionText: string, options: string[]) {
    return createHash('sha256')
      .update(`${questionText.toLowerCase()}||${options.map((option) => option.toLowerCase()).join('||')}`)
      .digest('hex');
  }

  private hashContentSignature(question: {
    question_text: string;
    options: string[];
    correct_option_index: number;
    explanation?: string | null;
    difficulty: 'EASY' | 'MEDIUM' | 'HARD';
    source_ref?: string | null;
    tags: string[];
  }) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          question_text: question.question_text,
          options: question.options,
          correct_option_index: question.correct_option_index,
          explanation: question.explanation ?? null,
          difficulty: question.difficulty,
          source_ref: question.source_ref ?? null,
          tags: [...question.tags].sort(),
        }),
      )
      .digest('hex');
  }

  private signatureFromStored(question: {
    questionText: string;
    options: Array<{ text: string; isCorrect: boolean }>;
    explanation: string | null;
    difficulty: QuestionDifficulty;
    sourceRef: string | null;
    tags: string[];
  }) {
    const correctIndex = question.options.findIndex((option) => option.isCorrect);
    return this.hashContentSignature({
      question_text: question.questionText,
      options: question.options.map((option) => option.text),
      correct_option_index: Math.max(correctIndex, 0),
      explanation: question.explanation,
      difficulty: question.difficulty,
      source_ref: question.sourceRef,
      tags: question.tags,
    });
  }
}
