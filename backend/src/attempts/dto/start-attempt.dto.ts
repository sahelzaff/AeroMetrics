import { IsUUID } from 'class-validator';

export class StartAttemptDto {
  @IsUUID()
  attemptId!: string;
}

