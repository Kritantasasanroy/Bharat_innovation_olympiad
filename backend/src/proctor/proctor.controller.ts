import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    Post,
    Query,
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

    // ── Face Enrollment (student) ──

    /**
     * Store a student's 128-D face descriptor (from face-api.js faceRecognitionNet).
     * Called once during profile setup or before the first exam.
     * Descriptor is stored as binary in User.faceEmbedding.
     */
    @Post('enroll')
    @UseGuards(JwtAuthGuard)
    @HttpCode(200)
    async enrollFace(
        @Body() body: { descriptor: number[] },
        @CurrentUser('id') userId: string,
    ) {
        await this.proctorService.enrollFace(userId, body.descriptor);
        return { enrolled: true };
    }

    /**
     * Check if the current student has a face descriptor stored.
     * Used by the exam instructions page to decide whether to show the enrollment prompt.
     */
    @Get('enrollment')
    @UseGuards(JwtAuthGuard)
    async getEnrollmentStatus(@CurrentUser('id') userId: string) {
        return this.proctorService.getEnrollmentStatus(userId);
    }

    /**
     * Verify a live face descriptor against the stored enrollment.
     * Called by useFaceProctor at exam start to confirm identity.
     * Returns { match: boolean, distance: number }.
     */
    @Post('verify')
    @UseGuards(JwtAuthGuard)
    @HttpCode(200)
    async verifyFace(
        @Body() body: { descriptor: number[] },
        @CurrentUser('id') userId: string,
    ) {
        return this.proctorService.verifyFace(userId, body.descriptor);
    }

    // ── Event Logging (student) ──

    /**
     * Log a proctoring event from the client.
     * Sources: useFullscreenMonitor (tab/fullscreen) + useFaceProctor (NO_FACE, MULTIPLE_FACES,
     * FACE_MISMATCH, LOOKING_AWAY).
     */
    @Post('events')
    @UseGuards(JwtAuthGuard)
    @HttpCode(200)
    async createEvent(
        @Body() body: { attemptId: string; type: string; details?: Record<string, any> },
    ) {
        return this.proctorService.createEvent(body.attemptId, body.type as any, body.details);
    }

    // ── Admin Endpoints ──

    /**
     * Live monitoring feed — all currently IN_PROGRESS attempts with recent events.
     * Admin dashboard polls this every 15 seconds.
     * Query param: ?since=5 (minutes, default 5)
     */
    @Get('live')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async getLiveMonitoring(@Query('since') since?: string) {
        return this.proctorService.getLiveMonitoring(since ? parseInt(since, 10) : 5);
    }

    /**
     * Full proctoring event timeline for a single attempt (admin view).
     */
    @Get('report/:attemptId')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async getReport(@Param('attemptId') attemptId: string) {
        return this.proctorService.getReport(attemptId);
    }

    /**
     * Health check — confirms proctoring subsystem is up.
     */
    @Get('health')
    async health() {
        return {
            status: 'ok',
            provider: 'face-api.js',
            mode: 'client-side',
        };
    }
}
