import {
    IsBoolean,
    IsEmail,
    IsInt,
    IsOptional,
    IsString,
    Max,
    Min,
} from 'class-validator';

/** Fields an admin may edit on a user. All optional — only what's sent changes. */
export class UpdateUserDto {
    @IsOptional()
    @IsString()
    firstName?: string;

    @IsOptional()
    @IsString()
    lastName?: string;

    @IsOptional()
    @IsEmail()
    email?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(12)
    classBand?: number;

    /** The school to move the student to; `null` detaches them (independent). */
    @IsOptional()
    @IsString()
    schoolId?: string | null;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

/** A permanent delete carries an optional reason, recorded in the archive + audit log. */
export class DeleteEntityDto {
    @IsOptional()
    @IsString()
    reason?: string;
}
