import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Param,
    Post,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProctorService } from './proctor.service';

@Controller('proctor')
@UseGuards(JwtAuthGuard)
export class ProctorController {
    constructor(private proctorService: ProctorService) {}

    /**
     * Analyze a webcam frame for face detection & identity verification.
     */
    @Post('analyze-frame')
    @UseInterceptors(FileInterceptor('frame'))
    async analyzeFrame(
        @UploadedFile() file: Express.Multer.File,
        @Body('attemptId') attemptId: string,
        @CurrentUser('id') userId: string,
    ) {
        if (!file) {
            throw new BadRequestException('No frame uploaded');
        }
        return this.proctorService.analyzeFrame(attemptId, userId, file.buffer);
    }

    /**
     * Enroll a student's face for identity verification during exams.
     */
    @Post('enroll')
    @UseInterceptors(FileInterceptor('image'))
    async enrollFace(
        @UploadedFile() file: Express.Multer.File,
        @CurrentUser('id') userId: string,
    ) {
        if (!file) {
            throw new BadRequestException('No image uploaded');
        }
        return this.proctorService.enrollFace(userId, file.buffer);
    }

    /**
     * Log a client-side proctoring event (e.g., tab switch, fullscreen exit).
     */
    @Post('events')
    async createEvent(
        @Body() body: { attemptId: string; type: string; details?: any },
    ) {
        return this.proctorService.createEvent(body.attemptId, body.type as any, body.details);
    }

    /**
     * Get the proctoring report for an attempt (Admin only).
     */
    @Get('report/:attemptId')
    @UseGuards(RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async getReport(@Param('attemptId') attemptId: string) {
        return this.proctorService.getReport(attemptId);
    }

    /**
     * Health check for the proctoring subsystem.
     */
    @Get('health')
    async health() {
        return {
            status: 'ok',
            mode: 'inline',
            message: 'AI proctoring is running inside the NestJS backend',
        };
    }
}
