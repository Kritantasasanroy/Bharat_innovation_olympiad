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
