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
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProctorService } from './proctor.service';

/** A reviewer's verdict on one attempt. */
export class RecordReviewDto {
    @IsIn(['CLEARED', 'DISQUALIFIED'])
    verdict: 'CLEARED' | 'DISQUALIFIED';

    /**
     * Mandatory for both verdicts — a clearance with no stated reason is as
     * unaccountable as a disqualification with none.
     */
    @IsString()
    @IsNotEmpty()
    @MaxLength(4000)
    notes: string;
}

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
        @Body() body: {
            attemptId: string;
            type: string;
            details?: Record<string, any>;
            /**
             * A webcam still, as a base64 data URL, captured at the moment of a
             * counted violation. Optional and best-effort — see
             * `ProctorService.storeSnapshot` for why nothing is captured
             * routinely.
             */
            snapshot?: string;
        },
    ) {
        return this.proctorService.createEvent(
            body.attemptId,
            body.type as any,
            body.details,
            undefined,
            body.snapshot,
        );
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

    // ── Post-exam human review (admin) ────────────────────────────────────────

    /**
     * The review queue — finished attempts a person should look at, worst first.
     *
     * Declared before `report/:attemptId`-style dynamic segments is unnecessary
     * here (the paths do not overlap), but it is grouped with its siblings so the
     * review endpoints read as one feature.
     */
    @Get('review/queue')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async listReviewQueue(
        @Query('status') status?: string,
        @Query('examInstanceId') examInstanceId?: string,
    ) {
        return this.proctorService.listReviewQueue({
            status: status as any,
            examInstanceId,
        });
    }

    /** Everything a reviewer needs to decide one case: timeline, session, verdict. */
    @Get('review/:attemptId')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async getReviewEvidence(@Param('attemptId') attemptId: string) {
        return this.proctorService.getReviewEvidence(attemptId);
    }

    /** Record a verdict. Notes are mandatory for both outcomes. */
    @Post('review/:attemptId')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    @HttpCode(200)
    async recordReview(
        @Param('attemptId') attemptId: string,
        @Body() body: RecordReviewDto,
        @CurrentUser('id') adminId: string,
    ) {
        return this.proctorService.recordReview(attemptId, adminId, body.verdict, body.notes);
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
