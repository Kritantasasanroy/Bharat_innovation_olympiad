import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ExamService } from './exam.service';

@Controller()
export class ExamController {
    constructor(
        private examService: ExamService,
    ) { }

    // ── Student routes ──

    @Get('exams')
    @UseGuards(JwtAuthGuard)
    async listExams(@CurrentUser('classBand') classBand: number, @CurrentUser('id') userId: string) {
        return this.examService.findAvailableExams(classBand, userId);
    }

    @Get('exams/upcoming')
    @UseGuards(JwtAuthGuard)
    async listUpcomingExams(@CurrentUser('classBand') classBand: number, @CurrentUser('id') userId: string) {
        return this.examService.findAvailableExams(classBand, userId);
    }

    @Get('exams/:id')
    @UseGuards(JwtAuthGuard)
    async getExam(@Param('id') id: string, @CurrentUser('id') userId: string, @CurrentUser('role') role: string) {
        const shuffleUserId = role === 'STUDENT' ? userId : undefined;
        return this.examService.findExamById(id, shuffleUserId);
    }

    // ── Admin: exams ──

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
        feeAmount?: number;
        easyPct?: number;
        mediumPct?: number;
        hardPct?: number;
    }) {
        return this.examService.createExam(body);
    }

    @Put('admin/exams/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async updateExam(@Param('id') id: string, @Body() body: {
        title?: string;
        description?: string | null;
        classBands?: number[];
        totalMarks?: number;
        durationMinutes?: number;
        feeAmount?: number | null;
        easyPct?: number;
        mediumPct?: number;
        hardPct?: number;
        isPublished?: boolean;
        isResultReleased?: boolean;
    }) {
        return this.examService.updateExam(id, body);
    }

    @Delete('admin/exams/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async deleteExam(@Param('id') id: string) {
        return this.examService.deleteExam(id);
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

    // ── Admin: sections ──

    @Post('admin/exams/:id/sections')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async createSection(
        @Param('id') examId: string,
        @Body() body: { title: string; sortOrder: number; questionsToAssign?: number },
    ) {
        return this.examService.createSection(examId, body);
    }

    // ── Admin: question media upload ──

    @Get('admin/questions/media-upload-url')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async getQuestionMediaUploadUrl(
        @Query('filename') filename: string,
        @Query('contentType') contentType: string,
    ) {
        return this.examService.getQuestionMediaUploadUrl(filename, contentType);
    }

    @Put('admin/sections/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async updateSection(@Param('id') id: string, @Body() body: any) {
        return this.examService.updateSection(id, body);
    }

    @Delete('admin/sections/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async deleteSection(@Param('id') id: string) {
        return this.examService.deleteSection(id);
    }

    // ── Admin: questions & bank ──

    @Post('admin/questions')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async createBankQuestion(@Body() body: any) {
        return this.examService.createBankQuestion(body);
    }

    @Post('admin/questions/bulk')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async bulkCreateBankQuestions(@Body() body: { questions: any[] }) {
        return this.examService.bulkCreateBankQuestions(body.questions || []);
    }

    @Get('admin/questions')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async listBankQuestions(
        @Query('q') q?: string,
        @Query('difficulty') difficulty?: string,
        @Query('examId') examId?: string,
    ) {
        return this.examService.listBankQuestions({ q, difficulty, examId });
    }

    @Post('admin/sections/:id/questions')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async createQuestion(@Param('id') sectionId: string, @Body() body: any) {
        return this.examService.createQuestion(sectionId, body);
    }

    @Post('admin/sections/:id/questions/bulk')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async bulkCreateQuestions(@Param('id') sectionId: string, @Body() body: { questions: any[] }) {
        return this.examService.bulkCreateQuestions(sectionId, body.questions || []);
    }

    @Post('admin/sections/:id/questions/attach')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async attachQuestion(@Param('id') sectionId: string, @Body() body: { questionId: string }) {
        return this.examService.attachQuestionToSection(sectionId, body.questionId);
    }

    @Delete('admin/sections/:sectionId/questions/:questionId')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async detachQuestion(
        @Param('sectionId') sectionId: string,
        @Param('questionId') questionId: string,
    ) {
        return this.examService.detachQuestionFromSection(sectionId, questionId);
    }

    @Put('admin/sections/:sectionId/questions/:questionId')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async reorderSectionQuestion(
        @Param('sectionId') sectionId: string,
        @Param('questionId') questionId: string,
        @Body() body: { sortOrder: number },
    ) {
        return this.examService.reorderSectionQuestion(sectionId, questionId, body.sortOrder);
    }

    @Post('admin/sections/:sectionId/questions/:questionId/move')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async moveQuestion(
        @Param('sectionId') sourceSectionId: string,
        @Param('questionId') questionId: string,
        @Body() body: { targetSectionId: string },
    ) {
        return this.examService.moveQuestionAcrossSections(sourceSectionId, questionId, body.targetSectionId);
    }

    @Put('admin/questions/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async updateQuestion(@Param('id') id: string, @Body() body: any) {
        return this.examService.updateQuestion(id, body);
    }

    @Delete('admin/questions/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async deleteQuestion(@Param('id') id: string) {
        return this.examService.deleteQuestion(id);
    }

    // ── Admin: instances (Pack C) ──

    @Get('admin/exams/:id/instances')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async listInstances(@Param('id') examId: string) {
        return this.examService.listInstances(examId);
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

    @Put('admin/instances/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async updateInstance(@Param('id') id: string, @Body() body: {
        startsAt?: Date;
        endsAt?: Date;
        requireSeb?: boolean;
        browserExamKey?: string;
        configKey?: string;
        quitUrl?: string;
    }) {
        return this.examService.updateInstance(id, body);
    }

    @Delete('admin/instances/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async deleteInstance(@Param('id') id: string) {
        return this.examService.deleteInstance(id);
    }
}
