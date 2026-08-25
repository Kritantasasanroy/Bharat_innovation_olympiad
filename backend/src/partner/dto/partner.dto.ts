import {
    IsBoolean,
    IsEmail,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
    Min,
    MinLength,
    ValidateIf,
} from 'class-validator';

export class ApplyPartnerDto {
    @IsString()
    @IsNotEmpty()
    orgName: string;

    @IsString()
    @IsNotEmpty()
    contactPerson: string;

    @IsEmail()
    email: string;

    @IsString()
    @IsNotEmpty()
    phone: string;

    @IsString()
    @MinLength(8, { message: 'Password must be at least 8 characters.' })
    password: string;

    /// Proves the applicant already confirmed this email via
    /// `POST /partner/verification/start` + `/partner/verify-email` — the
    /// verify-first step. Minted by `issueActivationTicket` and never persisted.
    @IsString()
    @IsNotEmpty()
    verificationTicket: string;
}

/** Either `accessToken`, or the `email` + `password` pair. Never a mix. */
export class PartnerLoginDto {
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    accessToken?: string;

    @ValidateIf((dto: PartnerLoginDto) => !dto.accessToken)
    @IsEmail()
    email?: string;

    @ValidateIf((dto: PartnerLoginDto) => !dto.accessToken)
    @IsString()
    @IsNotEmpty()
    password?: string;
}

export class DecidePartnerDto {
    @IsIn(['APPROVED', 'REJECTED', 'REVOKED'])
    decision: 'APPROVED' | 'REJECTED' | 'REVOKED';

    @IsString()
    @IsNotEmpty()
    reason: string;
}

/**
 * A partner editing its own contact details (item 14).
 *
 * Deliberately excludes `status`, `partnerId` and the access token: those are
 * staff decisions and credentials, not profile fields. The email is *not* editable
 * either — it is a login identity, and changing it here would silently orphan the
 * password credential. Staff can change it from the admin console.
 */
export class UpdatePartnerProfileDto {
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    orgName?: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    contactPerson?: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    phone?: string;
}

/** ADMIN — no fixed commission: admin decides the amount and triggers a payout directly (engine proxy). */
export class TriggerPayoutDto {
    @IsInt()
    @Min(1)
    amountPaise: number;

    /** What this covers, freeform — e.g. "August referrals". */
    @IsOptional()
    @IsString()
    note?: string;
}

/** ADMIN — records that a triggered payout's money has actually gone out (engine proxy). */
export class MarkPayoutPaidDto {
    @IsIn(['PAID'])
    status: 'PAID';
}

/** A partner submitting (or resubmitting) where their payouts get sent. */
export class SubmitBankDetailsDto {
    @IsString()
    @IsNotEmpty()
    accountHolderName: string;

    @IsString()
    @IsNotEmpty()
    bankName: string;

    @Matches(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/, { message: 'ifscCode must be a valid IFSC code (e.g. HDFC0001234).' })
    ifscCode: string;

    @Matches(/^\d{9,18}$/, { message: 'accountNumber must be 9-18 digits.' })
    accountNumber: string;

    @Matches(/^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/, { message: 'pan must be a valid PAN (e.g. ABCDE1234F).' })
    pan: string;
}

/** ADMIN — pause/resume a partner's campaign without revoking the whole partner (engine proxy). */
export class SetCampaignActiveDto {
    @IsBoolean()
    deactivate: boolean;
}
