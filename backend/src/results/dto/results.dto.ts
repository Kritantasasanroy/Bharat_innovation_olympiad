import {
    ArrayNotEmpty,
    IsArray,
    IsBoolean,
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
} from 'class-validator';
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

/**
 * Taking the final report back.
 *
 * Deliberately NOT reusing `RevokeResultsDto`: that one requires `audiences`,
 * and relaxing it to serve both would let a per-audience revoke through with no
 * audiences at all, where `ResultsService.revoke` reads `audiences.length` and
 * would fail with a 500 instead of a clean 400. A "final" score is final for
 * everyone or nobody, so this carries no audience at all.
 */
export class RevokeFinalReportDto {
    @IsString()
    @IsNotEmpty()
    reason: string;
}

/** Publishing the final report — stage two of the two-stage results release. */
export class PublishFinalReportDto {
    @IsString()
    @IsNotEmpty()
    reason: string;

    /**
     * Defaults to true. Set false to publish final scores and analysis while
     * holding the answer key back — the case being a re-sit still pending for a
     * few students, who would otherwise be handed the paper.
     */
    @IsOptional()
    @IsBoolean()
    withAnswerKey?: boolean;
}
