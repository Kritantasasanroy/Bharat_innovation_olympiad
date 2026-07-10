import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsEmail,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
    Max,
    Min,
    ValidateNested,
} from 'class-validator';
import { PINCODE_PATTERN } from '../school-directory.helpers';

const PINCODE_MESSAGE = 'A pincode is six digits, e.g. 441108.';

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

    @Matches(PINCODE_PATTERN, { message: PINCODE_MESSAGE })
    pincode: string;

    // City and state are filled from the pincode by the client, but are still
    // sent (and required) so a lookup outage never blocks an application.
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

    /// The campaign referral code the school arrived on (`/activate?ref=CODE`),
    /// if it followed a partner's onboarding link. Resolved to the partner at
    /// apply time; a bad code is ignored, never an error.
    @IsOptional()
    @IsString()
    referralCode?: string;
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

/** A student adding their own school to the directory (name + pincode only). */
export class AddSchoolDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @Matches(PINCODE_PATTERN, { message: PINCODE_MESSAGE })
    pincode: string;
}

export class RegisterStudentDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsEmail()
    email: string;

    @IsInt()
    @Min(1)
    @Max(12)
    classBand: number;
}

export class RegisterStudentsDto {
    @IsArray()
    @ArrayMinSize(1)
    // A CSV upload is bounded so one request cannot walk the whole table.
    @ArrayMaxSize(500)
    @ValidateNested({ each: true })
    @Type(() => RegisterStudentDto)
    students: RegisterStudentDto[];
}
