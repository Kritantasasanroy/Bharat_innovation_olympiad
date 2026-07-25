import { ArrayNotEmpty, IsArray, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { RESULT_AUDIENCES, ResultAudience } from '../results.service';

export class ReleaseResultsDto {
    @IsString()
    @IsNotEmpty()
    reason: string;

    /**
     * Who the results become visible to. Defaults to students only — which is
     * exactly what this endpoint did before per-audience release existed, so an
     * older client that sends only a reason keeps its previous behaviour.
     */
    @IsOptional()
    @IsArray()
    @ArrayNotEmpty()
    @IsIn(RESULT_AUDIENCES, { each: true })
    audiences?: ResultAudience[];
}

export class RevokeResultsDto {
    @IsString()
    @IsNotEmpty()
    reason: string;

    @IsArray()
    @ArrayNotEmpty()
    @IsIn(RESULT_AUDIENCES, { each: true })
    audiences: ResultAudience[];
}
