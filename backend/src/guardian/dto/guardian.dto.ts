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

/** Kept open-ended — an unusual family arrangement must still be representable. */
export const RELATIONSHIPS = ['Mother', 'Father', 'Legal guardian', 'Other'] as const;

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

    @IsString()
    @Length(1, 80)
    guardianLastName: string;

    @IsIn(RELATIONSHIPS as unknown as string[])
    relationship: string;

    @IsEmail()
    guardianEmail: string;

    @IsString()
    @Length(6, 20)
    guardianPhone: string;

    // ── Demographics — optional, for cohort reporting only. Never gates. ──

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

    @IsString()
    @MaxLength(10)
    @IsOptional()
    pincode?: string;

    // ── Consents. Both mandatory. ──

    @IsBoolean()
    parentalConsent: boolean;

    @IsBoolean()
    dataConsent: boolean;
}
