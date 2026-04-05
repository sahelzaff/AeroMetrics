import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
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

class DifficultyDistributionDto {
  @IsInt()
  @Min(0)
  easy!: number;

  @IsInt()
  @Min(0)
  medium!: number;

  @IsInt()
  @Min(0)
  hard!: number;
}

class AutoBlueprintConfigDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  chapterIds!: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  minimumPerChapter?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxPerChapter?: number;

  @IsOptional()
  @IsBoolean()
  prioritizeWeakChapters?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  weaknessBoostPercent?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => DifficultyDistributionDto)
  difficultyDistribution?: DifficultyDistributionDto;
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

  @IsOptional()
  @IsIn(['manual', 'auto'])
  mode?: 'manual' | 'auto';

  @ValidateIf((o: CreateBlueprintDto) => (o.mode ?? 'manual') === 'manual')
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BlueprintRuleDto)
  rules?: BlueprintRuleDto[];

  @ValidateIf((o: CreateBlueprintDto) => o.mode === 'auto')
  @ValidateNested()
  @Type(() => AutoBlueprintConfigDto)
  autoConfig?: AutoBlueprintConfigDto;
}
