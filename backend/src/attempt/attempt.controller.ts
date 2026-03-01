import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SebGuard } from '../common/guards/seb.guard';
import { AttemptService } from './attempt.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class AttemptController {
    constructor(private attemptService: AttemptService) { }

    @Post('exams/:instanceId/start')
    @UseGuards(SebGuard) // SEB validation applied on exam start
    async startAttempt(
        @Param('instanceId') instanceId: string,
        @CurrentUser('id') userId: string,
        @Req() req: Request,
    ) {
        const ipAddress = req.ip || req.headers['x-forwarded-for']?.toString();
        return this.attemptService.startAttempt(userId, instanceId, ipAddress);
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
}
