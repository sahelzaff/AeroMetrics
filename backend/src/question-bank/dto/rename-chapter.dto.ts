import { IsString, MinLength } from 'class-validator';

export class RenameChapterDto {
  @IsString()
  @MinLength(1)
  name!: string;
}
