import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ExamService } from './exam.service';
import { SebConfigService } from './seb-config.service';

@Controller()
export class ExamController {
    constructor(
        private examService: ExamService,
        private sebConfigService: SebConfigService,
    ) { }

    // ── Student routes ──

    @Get('exams')
    @UseGuards(JwtAuthGuard)
    async listExams(@CurrentUser('classBand') classBand: number) {
        return this.examService.findAvailableExams(classBand);
    }

    @Get('exams/upcoming')
    @UseGuards(JwtAuthGuard)
    async listUpcomingExams(@CurrentUser('classBand') classBand: number) {
        return this.examService.findAvailableExams(classBand);
    }

    @Get('exams/:id')
    @UseGuards(JwtAuthGuard)
    async getExam(@Param('id') id: string) {
        return this.examService.findExamById(id);
    }

    // ── SEB config download ──

    @Get('seb/config/:instanceId')
    async getSebConfig(@Param('instanceId') instanceId: string, @Res() res: Response) {
        const config = await this.sebConfigService.generateConfig(instanceId);
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="exam-${instanceId}.seb.json"`);
        res.json(config);
    }

    // ── Admin routes ──

    @Get('admin/exams')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async getAllExamsAdmin() {
        return this.examService.findAllExamsForAdmin();
    }

    @Post('admin/exams')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async createExam(@Body() body: {
        title: string;
        description?: string;
        classBands: number[];
        totalMarks: number;
        durationMinutes: number;
    }) {
        return this.examService.createExam(body);
    }

    @Post('admin/exams/:id/sections')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async createSection(@Param('id') examId: string, @Body() body: { title: string; sortOrder: number }) {
        return this.examService.createSection(examId, body);
    }

    @Post('admin/sections/:id/questions')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async createQuestion(@Param('id') sectionId: string, @Body() body: any) {
        return this.examService.createQuestion(sectionId, body);
    }

    @Post('admin/exams/:id/instances')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async createInstance(@Param('id') examId: string, @Body() body: {
        startsAt: Date;
        endsAt: Date;
        requireSeb?: boolean;
        browserExamKey?: string;
        configKey?: string;
        quitUrl?: string;
    }) {
        return this.examService.createInstance(examId, body);
    }

    @Post('admin/exams/:id/publish')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async publishExam(@Param('id') id: string) {
        return this.examService.publishExam(id);
    }

    @Post('admin/exams/:id/release-question-paper')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async releaseQuestionPaper(@Param('id') id: string) {
        return this.examService.releaseQuestionPaper(id);
    }

    @Post('admin/exams/:id/release-results')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async releaseResults(@Param('id') id: string) {
        return this.examService.releaseResults(id);
    }

    @Get('admin/exams/:id/analytics')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async getAnalytics(@Param('id') id: string) {
        return this.examService.getExamAnalytics(id);
    }
}
