import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ApplySchoolDto {
    @IsString()
    @IsNotEmpty()
    schoolName: string;

    @IsString()
    @IsNotEmpty()
    board: string;

    @IsOptional()
    @IsString()
    udiseCode?: string;

    @IsString()
    @IsNotEmpty()
    city: string;

    @IsString()
    @IsNotEmpty()
    state: string;

    @IsString()
    @IsNotEmpty()
    coordinatorName: string;

    @IsEmail()
    coordinatorEmail: string;

    @IsString()
    @IsNotEmpty()
    coordinatorPhone: string;
}

export class SchoolLoginDto {
    @IsString()
    @IsNotEmpty()
    accessToken: string;
}

export class DecideSchoolDto {
    @IsIn(['APPROVED', 'REJECTED', 'REVOKED'])
    decision: 'APPROVED' | 'REJECTED' | 'REVOKED';

    @IsString()
    @IsNotEmpty()
    reason: string;
}
