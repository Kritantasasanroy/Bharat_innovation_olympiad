import {
    Body,
    Controller,
    Get,
    Headers,
    HttpCode,
    Param,
    Post,
    UnauthorizedException,
    UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProctorService } from './proctor.service';

@Controller('proctor')
export class ProctorController {
    constructor(private proctorService: ProctorService) {}

    // ── Session Endpoints (student-facing) ──

    /**
     * Create a Meazure proctoring session for the current student's attempt.
     * Called by the exam player immediately after startAttempt() succeeds.
     *
     * Returns { sessionId, launchUrl, status } — the frontend opens launchUrl
     * in a new tab so the student can launch the Meazure Guardian browser.
     */
    @Post('sessions')
    @UseGuards(JwtAuthGuard)
    async createSession(
        @Body() body: { attemptId: string; examTitle: string; durationMinutes: number },
        @CurrentUser('id') userId: string,
    ) {
        return this.proctorService.createSession(
            body.attemptId,
            userId,
            body.examTitle,
            body.durationMinutes,
        );
    }

    /**
     * Poll the current status of a Meazure proctoring session.
     * Used by the frontend to confirm the student has launched the session.
     */
    @Get('sessions/:sessionId')
    @UseGuards(JwtAuthGuard)
    async getSessionStatus(@Param('sessionId') sessionId: string) {
        return this.proctorService.getSessionStatus(sessionId);
    }

    // ── Event Endpoints ──

    /**
     * Log a client-side proctoring event (fullscreen exit, tab switch, window blur).
     * These are Layer 1 & 2 anti-cheat violations detected by useFullscreenMonitor.
     */
    @Post('events')
    @UseGuards(JwtAuthGuard)
    @HttpCode(200)
    async createEvent(
        @Body() body: { attemptId: string; type: string; details?: Record<string, any> },
    ) {
        return this.proctorService.createEvent(body.attemptId, body.type as any, body.details);
    }

    /**
     * Internal callback — receives Meazure events forwarded by the proctor-service bridge.
     * NOT exposed to students; protected by the shared PROCTOR_API_KEY secret.
     *
     * The proctor-service (Python) validates the Meazure HMAC signature then
     * calls this endpoint with the mapped ProctorEventType.
     */
    @Post('meazure-event')
    @HttpCode(200)
    async handleMeazureEvent(
        @Body() body: { attemptId: string; type: string; details?: Record<string, any> },
        @Headers('x-api-key') apiKey: string,
    ) {
        const expected = process.env.PROCTOR_API_KEY || 'dev-proctor-key';
        if (apiKey !== expected) {
            throw new UnauthorizedException('Invalid API key');
        }
        return this.proctorService.createEvent(body.attemptId, body.type as any, body.details);
    }

    // ── Admin Endpoints ──

    /**
     * Full proctoring event timeline for an attempt (Admin only).
     */
    @Get('report/:attemptId')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async getReport(@Param('attemptId') attemptId: string) {
        return this.proctorService.getReport(attemptId);
    }

    /**
     * Health check — confirms the proctoring subsystem is up.
     */
    @Get('health')
    async health() {
        return {
            status: 'ok',
            provider: 'meazure-learning',
            bridge: process.env.PROCTOR_SERVICE_URL || 'http://localhost:5000',
        };
    }
}
