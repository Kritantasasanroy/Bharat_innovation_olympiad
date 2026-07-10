import { IsNotEmpty, IsString } from 'class-validator';

export class ReleaseResultsDto {
    @IsString()
    @IsNotEmpty()
    reason: string;
}
