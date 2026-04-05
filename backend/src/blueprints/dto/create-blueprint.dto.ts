import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { QuestionDifficulty } from '@prisma/client';

class BlueprintRuleDto {
  @IsUUID()
  chapterId!: string;

  @IsInt()
  @Min(1)
  questionCount!: number;

  @IsOptional()
  @IsEnum(QuestionDifficulty)
  difficulty?: QuestionDifficulty;
}

export class CreateBlueprintDto {
  @IsUUID()
  subjectId!: string;

  @IsString()
  name!: string;

  @IsInt()
  @Min(1)
  totalQuestions!: number;

  @IsInt()
  @Min(1)
  timeLimitMinutes!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BlueprintRuleDto)
  rules!: BlueprintRuleDto[];
}

