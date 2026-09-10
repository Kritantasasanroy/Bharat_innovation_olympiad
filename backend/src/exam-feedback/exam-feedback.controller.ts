import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ExamFeedbackService } from './exam-feedback.service';

export class SubmitExamFeedbackDto {
    @IsString()
    attemptId: string;

    @IsInt()
    @Min(1)
    @Max(5)
    rating: number;

    /// Required below 3 stars — enforced in the service, where the rule lives.
    @IsString()
    @IsOptional()
    comment?: string;
}

@Controller()
export class ExamFeedbackController {
    constructor(private feedback: ExamFeedbackService) {}

    // ── Student ───────────────────────────────────────────────────────────────

    @Post('exam-feedback')
    @UseGuards(JwtAuthGuard)
    submit(@CurrentUser('id') userId: string, @Body() dto: SubmitExamFeedbackDto) {
        return this.feedback.submit(userId, dto.attemptId, dto.rating, dto.comment);
    }

    /** Whether this attempt has already been rated, so the prompt shows once. */
    @Get('exam-feedback/attempt/:attemptId')
    @UseGuards(JwtAuthGuard)
    forAttempt(@CurrentUser('id') userId: string, @Param('attemptId') attemptId: string) {
        return this.feedback.forAttempt(userId, attemptId);
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    @Get('admin/exam-feedback')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    adminList(
        @Query('minRating') minRating?: string,
        @Query('maxRating') maxRating?: string,
        @Query('withComment') withComment?: string,
    ) {
        return this.feedback.adminList({
            minRating: minRating ? Number(minRating) : undefined,
            maxRating: maxRating ? Number(maxRating) : undefined,
            withComment: withComment === 'true',
        });
    }

    @Get('admin/exam-feedback/summary')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    adminSummary() {
        return this.feedback.adminSummary();
    }
}
