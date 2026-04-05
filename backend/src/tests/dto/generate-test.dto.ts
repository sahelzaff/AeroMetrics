import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class GenerateTestDto {
  @IsUUID()
  blueprintId!: string;

  @IsOptional()
  @IsBoolean()
  prioritizeWeakChapters?: boolean;
}
