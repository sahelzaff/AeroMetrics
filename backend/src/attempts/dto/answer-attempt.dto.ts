import { IsUUID } from 'class-validator';

export class AnswerAttemptDto {
  @IsUUID()
  attemptQuestionId!: string;

  @IsUUID()
  selectedOptionId!: string;
}

