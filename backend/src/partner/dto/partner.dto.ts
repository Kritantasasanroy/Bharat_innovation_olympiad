import {
    IsEmail,
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
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
