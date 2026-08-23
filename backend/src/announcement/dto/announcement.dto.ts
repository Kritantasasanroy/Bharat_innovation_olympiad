import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

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
}

export class AnnouncementParamsDto {
    @IsUUID()
    id: string;
}
