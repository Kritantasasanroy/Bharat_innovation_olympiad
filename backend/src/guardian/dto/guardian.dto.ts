import {
    IsBoolean,
    IsIn,
    IsISO8601,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';

export const GENDERS = ['Female', 'Male', 'Other', 'Prefer not to say'] as const;

/**
 * Student identification — the exam-gate submission.
 *
 * No parent/guardian fields exist any more: the flow is the participant's own
 * identification (ID document + consents + the face scan, which is enrolled
 * separately through proctoring). Old clients still posting guardian fields
 * get a 400 from `forbidNonWhitelisted` rather than silently storing them.
 *
 * The two consent booleans stay separate because the DPDP Act treats them as
 * distinct permissions: consenting to *participation* is not the same as
 * consenting to *data being processed*. `GuardianService` rejects the
 * submission unless both are true.
 */
export class SubmitGuardianDto {
    // ── Student demographics ──
    //
    // Required in the service (not here) so the rejection is one clear sentence
    // a student can act on rather than class-validator's field-by-field list.

    /** ISO date string. Validated as a real, sane date in the service. */
    @IsISO8601()
    @IsOptional()
    studentDob?: string;

    @IsIn(GENDERS as unknown as string[])
    @IsOptional()
    gender?: string;

    @IsString()
    @MaxLength(80)
    @IsOptional()
    city?: string;

    @IsString()
    @MaxLength(80)
    @IsOptional()
    state?: string;

    // ── Student ID Document (school ID card / school-diary page / other) ──
    // The service demands one picture always, and a second (`idDocumentBackUrl`)
    // only for a school ID card.

    @IsString()
    @IsOptional()
    idDocumentType?: string;

    /** The document, or the front of a two-sided school card. */
    @IsString()
    @IsOptional()
    idDocumentUrl?: string;

    /** Back of the school ID card. Demanded by the service only for that type. */
    @IsString()
    @IsOptional()
    idDocumentBackUrl?: string;

    // ── Consents. Both mandatory. ──

    @IsBoolean()
    parentalConsent: boolean;

    @IsBoolean()
    dataConsent: boolean;
}
