import {
    IsBoolean,
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
 * The participant's date of birth and gender are collected once, on the
 * registration details step, and arrive through `/auth/sync` — asking again
 * here was a duplicated question, so they are not part of this submission.
 *
 * The two consent booleans stay separate because the DPDP Act treats them as
 * distinct permissions: consenting to *participation* is not the same as
 * consenting to *data being processed*. `GuardianService` rejects the
 * submission unless both are true.
 */
export class SubmitGuardianDto {
    // ── Kept so an existing profile's values survive a re-submit ──

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
