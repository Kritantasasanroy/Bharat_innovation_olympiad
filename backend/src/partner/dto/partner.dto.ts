import {
    IsBoolean,
    IsEmail,
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
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

/** ADMIN — close out a commission period for a partner (engine proxy). */
export class GenerateStatementDto {
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'period must be in "YYYY-MM" form, e.g. 2026-06.' })
    period: string;
}

/** ADMIN/FINANCE — advance a payout ledger entry (engine proxy). */
export class UpdatePayoutStatusDto {
    @IsIn(['SIGNED_OFF', 'RELEASED'])
    status: 'SIGNED_OFF' | 'RELEASED';

    /** Required by the engine when signing off; who approved the payout. */
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    approver?: string;

    @IsOptional()
    @IsString()
    reason?: string;
}

/** ADMIN — pause/resume a partner's campaign without revoking the whole partner (engine proxy). */
export class SetCampaignActiveDto {
    @IsBoolean()
    deactivate: boolean;
}
