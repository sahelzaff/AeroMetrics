import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class TrackSelectDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsIn(['test', 'question', 'user', 'attempt', 'analytics', 'action'])
  type!: 'test' | 'question' | 'user' | 'attempt' | 'analytics' | 'action';

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  route!: string;

  @IsOptional()
  @IsString()
  query?: string;
}
