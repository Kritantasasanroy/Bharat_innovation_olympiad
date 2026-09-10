import {
    BadRequestException, Body, Controller, Get, Param, Patch, Post, Query,
    UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { GrievanceStatus, GrievanceType, Role } from '@prisma/client';
import { ArrayMinSize, IsArray, IsEnum, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { DOCUMENT_RULES, ObjectStorageService } from '../common/services/object-storage.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { type GrievanceDecision, GrievanceService } from './grievance.service';

export class CreateGrievanceDto {
    @IsEnum(GrievanceType)
    type: GrievanceType;

    @IsString()
    @IsNotEmpty()
    subject: string;

    @IsString()
    @IsNotEmpty()
    description: string;

    @IsString()
    @IsOptional()
    attemptId?: string;

    /// Object keys returned by `POST /grievances/attachment`. At least one —
    /// the requirement itself is enforced in the service.
    @IsArray()
    @IsString({ each: true })
    @ArrayMinSize(1)
    attachmentUrls: string[];
}

export class DecideGrievanceDto {
    @IsIn([GrievanceStatus.RESOLVED, GrievanceStatus.REJECTED])
    status: GrievanceDecision;

    @IsString()
    @IsNotEmpty()
    resolution: string;
}

@Controller()
export class GrievanceController {
    constructor(
        private grievanceService: GrievanceService,
        private storage: ObjectStorageService,
    ) {}

    // ── Student ───────────────────────────────────────────────────────────────

    @Post('grievances')
    @UseGuards(JwtAuthGuard)
    create(@CurrentUser('id') userId: string, @Body() dto: CreateGrievanceDto) {
        return this.grievanceService.create(userId, dto);
    }

    /**
     * Upload one supporting document, get back its object key.
     *
     * Separate from `POST /grievances` for the same reason the guardian ID
     * upload is: a multipart body carrying several megabytes alongside the JSON
     * fields hits Express's body limit and the whole submission is rejected.
     * The student uploads first, then submits the keys.
     */
    @Post('grievances/attachment')
    @UseGuards(JwtAuthGuard)
    @UseInterceptors(
        FileInterceptor('file', { limits: { fileSize: DOCUMENT_RULES.maxBytes, files: 1 } }),
    )
    async uploadAttachment(
        @CurrentUser('id') userId: string,
        @UploadedFile() file?: Express.Multer.File,
    ) {
        if (!file) throw new BadRequestException('Choose a file to upload.');
        const { url } = await this.storage.uploadDocumentBuffer(
            file.buffer,
            file.originalname || 'support-document',
            file.mimetype,
            'bio/support',
            userId,
            'students',
        );
        return { url };
    }

    @Get('grievances/me')
    @UseGuards(JwtAuthGuard)
    listMine(@CurrentUser('id') userId: string) {
        return this.grievanceService.listForUser(userId);
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    @Get('admin/grievances')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    listAll(@Query('status') status?: GrievanceStatus) {
        return this.grievanceService.listAll(status);
    }

    @Patch('admin/grievances/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    decide(
        @Param('id') id: string,
        @Body() dto: DecideGrievanceDto,
        @CurrentUser('id') adminId: string,
    ) {
        return this.grievanceService.decide(id, dto.status, dto.resolution, adminId);
    }
}
