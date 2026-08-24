import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';

export enum AnnouncementAudienceDto {
    PARTNER = 'PARTNER',
    SCHOOL = 'SCHOOL',
    ALL = 'ALL',
}

export class CreateAnnouncementDto {
    @IsString()
    title: string;

    @IsString()
    body: string;

    @IsEnum(AnnouncementAudienceDto)
    audience: AnnouncementAudienceDto;

    @IsDateString()
    publishedAt: string;

    @IsDateString()
    @IsOptional()
    expiresAt?: string;

    @IsBoolean()
    @IsOptional()
    active?: boolean;

    /** Narrows a SCHOOL/ALL post to one school. Omit (or '') for the original broadcast-to-audience behaviour. */
    @ValidateIf((o) => !!o.targetSchoolId)
    @IsUUID()
    @IsOptional()
    targetSchoolId?: string;
}

export class UpdateAnnouncementDto {
    @IsString()
    @IsOptional()
    title?: string;

    @IsString()
    @IsOptional()
    body?: string;

    @IsEnum(AnnouncementAudienceDto)
    @IsOptional()
    audience?: AnnouncementAudienceDto;

    @IsDateString()
    @IsOptional()
    publishedAt?: string;

    @IsDateString()
    @IsOptional()
    expiresAt?: string;

    @IsBoolean()
    @IsOptional()
    active?: boolean;

    /** Narrows a SCHOOL/ALL post to one school. Send '' to clear back to broadcast. */
    @ValidateIf((o) => !!o.targetSchoolId)
    @IsUUID()
    @IsOptional()
    targetSchoolId?: string;
}

export class AnnouncementParamsDto {
    @IsUUID()
    id: string;
}
