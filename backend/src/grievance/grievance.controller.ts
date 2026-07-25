import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { GrievanceStatus, GrievanceType, Role } from '@prisma/client';
import { IsEnum, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
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
    constructor(private grievanceService: GrievanceService) {}

    // ── Student ───────────────────────────────────────────────────────────────

    @Post('grievances')
    @UseGuards(JwtAuthGuard)
    create(@CurrentUser('id') userId: string, @Body() dto: CreateGrievanceDto) {
        return this.grievanceService.create(userId, dto);
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
