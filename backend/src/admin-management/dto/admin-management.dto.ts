import {
    ArrayNotEmpty,
    IsArray,
    IsBoolean,
    IsEmail,
    IsInt,
    IsOptional,
    IsString,
    Matches,
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
    @IsString()
    phone?: string;

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

/** Move a batch of students to a school at once, or detach them all (`schoolId: null`). */
export class MoveStudentsDto {
    @IsArray()
    @ArrayNotEmpty()
    @IsString({ each: true })
    userIds: string[];

    @IsOptional()
    @IsString()
    schoolId?: string | null;
}

/**
 * Fields an admin may edit on a school, including **which partner it belongs to**.
 * `partnerId: null` detaches it, and the school then falls back to the house
 * partner at read time.
 */
export class UpdateSchoolDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    city?: string;

    @IsOptional()
    @IsString()
    state?: string;

    @IsOptional()
    @Matches(/^\d{6}$/, { message: 'Pincode must be 6 digits.' })
    pincode?: string;

    @IsOptional()
    @IsString()
    board?: string;

    @IsOptional()
    @IsString()
    udiseCode?: string;

    /** The admin-api `Partner.id` to assign this school to; `null` detaches it. */
    @IsOptional()
    @IsString()
    partnerId?: string | null;
}

/** Fields an admin may edit on a partner. The access token is rotated separately. */
export class UpdatePartnerDto {
    @IsOptional()
    @IsString()
    orgName?: string;

    @IsOptional()
    @IsString()
    contactPerson?: string;

    /** Staff may move a partner's login email; the partner itself may not. */
    @IsOptional()
    @IsEmail()
    email?: string;

    @IsOptional()
    @IsString()
    phone?: string;
}

/** A permanent delete carries an optional reason, recorded in the archive + audit log. */
export class DeleteEntityDto {
    @IsOptional()
    @IsString()
    reason?: string;
}
