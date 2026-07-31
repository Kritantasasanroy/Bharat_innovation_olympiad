import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AttemptService } from './attempt.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class AttemptController {
    constructor(private attemptService: AttemptService) { }

    @Post('exams/:instanceId/start')
    async startAttempt(
        @Param('instanceId') instanceId: string,
        @CurrentUser('id') userId: string,
        @Req() req: Request,
    ) {
        const ipAddress = req.ip || req.headers['x-forwarded-for']?.toString();
        return this.attemptService.startAttempt(userId, instanceId, ipAddress);
    }

    @Get('attempts/results')
    async getResults(@CurrentUser('id') userId: string) {
        return this.attemptService.getResults(userId);
    }

    @Get('attempts/recent')
    async getRecentResults(@CurrentUser('id') userId: string) {
        return this.attemptService.getRecentResults(userId);
    }

    /**
     * Whether the caller has already sat the rehearsal for a given instance.
     *
     * Declared **above** `attempts/:id` deliberately: Nest matches in
     * declaration order, so the wildcard would otherwise swallow this path and
     * treat "trial-status" as an attempt id.
     */
    @Get('attempts/trial-status')
    async getTrialStatus(
        @CurrentUser('id') userId: string,
        @Query('examInstanceId') examInstanceId?: string,
    ) {
        return this.attemptService.getTrialStatus(userId, examInstanceId);
    }

    /**
     * The student's own report for one attempt — provisional, or final with the
     * answer key once it has been published.
     *
     * Ownership is enforced in the service, not here: an attempt id in a URL must
     * never let one student read another's answers.
     */
    @Get('attempts/:id/report')
    async getStudentReport(
        @Param('id') attemptId: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.attemptService.getStudentReport(userId, attemptId);
    }

    @Get('attempts/:id')
    async getAttempt(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.attemptService.findById(id);
    }

    @Post('attempts/:id/answer')
    async saveAnswer(
        @Param('id') attemptId: string,
        @CurrentUser('id') userId: string,
        @Body() body: { questionId: string; answer: any },
    ) {
        return this.attemptService.saveAnswer(attemptId, userId, body.questionId, body.answer);
    }

    @Post('attempts/:id/submit')
    async submitAttempt(
        @Param('id') attemptId: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.attemptService.submitAttempt(attemptId, userId);
    }

    /**
     * Record that the caller has sat the rehearsal paper, unlocking the real
     * exam instance named in the body.
     *
     * The instance id is client-supplied, so this endpoint proves the trial was
     * actually taken before writing anything — otherwise a student could POST
     * here directly and skip the rehearsal entirely.
     */
    @Post('attempts/trial-complete')
    async completeTrial(
        @CurrentUser('id') userId: string,
        @Body() body: { examInstanceId: string },
    ) {
        return this.attemptService.recordTrialCompletion(userId, body?.examInstanceId);
    }

    @Get('admin/attempts/:id/report')
    @UseGuards(RolesGuard)
    @Roles('ADMIN', 'SUPER_ADMIN')
    async getAttemptReportAdmin(@Param('id') id: string) {
        return this.attemptService.getAttemptReportAdmin(id);
    }

}
