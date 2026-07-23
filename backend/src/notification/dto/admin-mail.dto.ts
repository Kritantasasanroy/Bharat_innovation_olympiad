import {
    IsArray,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    MinLength,
} from 'class-validator';

export type MailAudience = 'ALL_STUDENTS' | 'CLASS' | 'CUSTOM';

/** An admin-composed email and who it goes to. */
export class SendAdminMailDto {
    @IsIn(['ALL_STUDENTS', 'CLASS', 'CUSTOM'])
    audience: MailAudience;

    /** Required when `audience` is `CLASS`. */
    @IsOptional()
    @IsInt()
    @Min(6)
    @Max(12)
    classBand?: number;

    /** The explicit recipient list, used when `audience` is `CUSTOM`. */
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    emails?: string[];

    @IsString()
    @MinLength(1)
    @MaxLength(200)
    subject: string;

    @IsString()
    @MinLength(1)
    @MaxLength(10000)
    message: string;
}
