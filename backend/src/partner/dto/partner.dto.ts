import { IsEmail, IsIn, IsNotEmpty, IsString, MinLength } from 'class-validator';

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

export class PartnerLoginDto {
    @IsEmail()
    email: string;

    @IsString()
    @IsNotEmpty()
    password: string;
}

export class DecidePartnerDto {
    @IsIn(['APPROVED', 'REJECTED', 'REVOKED'])
    decision: 'APPROVED' | 'REJECTED' | 'REVOKED';

    @IsString()
    @IsNotEmpty()
    reason: string;
}
