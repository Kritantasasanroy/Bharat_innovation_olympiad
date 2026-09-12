import {
    IsBoolean,
    IsEmail,
    IsIn,
    IsISO8601,
    IsOptional,
    IsString,
    Length,
    MaxLength,
} from 'class-validator';

/**
 * Deliberately closed, not "…and Other" — mirrors `GuardianForm.RELATIONSHIPS`
 * on the frontend. The person consenting must actually be one of the three the
 * law recognises as able to give parental consent for a minor; an open "Other"
 * let anyone with no real standing (an uncle, an elder sibling) tick the box.
 * `@IsIn` below is what makes this a real server-side rule and not merely a
 * dropdown the browser happens to offer.
 */
export const RELATIONSHIPS = ['Mother', 'Father', 'Legal guardian'] as const;

export const GENDERS = ['Female', 'Male', 'Other', 'Prefer not to say'] as const;

/**
 * Registration "part 2" — the parent/guardian section.
 *
 * The two consent booleans are separate fields rather than one combined flag
 * because the DPDP Act treats them as distinct permissions: consenting to a
 * child's *participation* is not the same as consenting to *processing their
 * data*. `GuardianService` rejects the submission unless both are true.
 */
export class SubmitGuardianDto {
    @IsString()
    @Length(1, 80)
    guardianFirstName: string;

    // Optional: the registration flow now collects the parent/guardian's name
    // as a single field and sends the whole thing as `guardianFirstName`.
    @IsOptional()
    @IsString()
    @MaxLength(80)
    guardianLastName?: string;

    // Optional: the registration flow doesn't collect this any more.
    @IsOptional()
    @IsIn(RELATIONSHIPS as unknown as string[])
    relationship?: string;

    @IsEmail()
    guardianEmail: string;

    @IsString()
    @Length(6, 20)
    guardianPhone: string;

    // ── Student demographics ──
    //
    // These were optional "for cohort reporting only". They are required now:
    // date of birth decides which age band a student competes in, and a form
    // where half the rows are blank cannot report on a cohort at all.
    //
    // They stay `@IsOptional()` *here* and are demanded in the service, so the
    // rejection is one clear sentence a parent can act on rather than
    // class-validator's field-by-field list.

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

    // `pincode` was removed from both the form and `GuardianProfile`. It stays
    // out of this DTO deliberately: `ValidationPipe` runs with
    // `forbidNonWhitelisted`, so an old client still sending one now gets a
    // clear 400 rather than a 500 from Prisma about an unknown column.

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
