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
export type MailChannel = 'EMAIL' | 'SMS' | 'BOTH';

/** An admin-composed message, its channel(s), and who it goes to. */
export class SendAdminMailDto {
    @IsIn(['ALL_STUDENTS', 'CLASS', 'CUSTOM'])
    audience: MailAudience;

    /** Delivery channel. Defaults to EMAIL when omitted. */
    @IsOptional()
    @IsIn(['EMAIL', 'SMS', 'BOTH'])
    channel?: MailChannel;

    /** Required when `audience` is `CLASS`. */
    @IsOptional()
    @IsInt()
    @Min(6)
    @Max(12)
    classBand?: number;

    /** Explicit email recipients, used when `audience` is `CUSTOM`. */
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    emails?: string[];

    /** Explicit SMS recipients (phone numbers), used when `audience` is `CUSTOM`. */
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    phones?: string[];

    /** Required for the email channel; ignored for SMS-only sends. */
    @IsOptional()
    @IsString()
    @MaxLength(200)
    subject?: string;

    @IsString()
    @MinLength(1)
    @MaxLength(10000)
    message: string;
}
