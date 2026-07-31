import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
    PublishFinalReportDto,
    ReleaseResultsDto,
    RevokeFinalReportDto,
    RevokeResultsDto,
} from './dto/results.dto';
import { ResultsExportService } from './results-export.service';
import { ResultsService } from './results.service';

/** Fair-score processing + result-release gating. Staff only (spec Admin §19/§20). */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class ResultsController {
    constructor(
        private resultsService: ResultsService,
        private exportService: ResultsExportService,
    ) {}

    @Get('results')
    listInstances() {
        return this.resultsService.listInstances();
    }

    @Get('exam-instances/:id/results-status')
    status(@Param('id') examInstanceId: string) {
        return this.resultsService.getStatus(examInstanceId);
    }

    @Post('exam-instances/:id/normalize')
    normalize(@Param('id') examInstanceId: string, @CurrentUser('id') adminId: string) {
        return this.resultsService.normalize(examInstanceId, adminId);
    }

    /** Release to one or more audiences (students / schools / partners). */
    @Post('exam-instances/:id/release')
    release(
        @Param('id') examInstanceId: string,
        @Body() dto: ReleaseResultsDto,
        @CurrentUser('id') adminId: string,
    ) {
        return this.resultsService.release(
            examInstanceId,
            adminId,
            dto.reason,
            dto.audiences ?? ['STUDENTS'],
        );
    }

    /** Take results back from an audience — the undo for a mistaken release. */
    @Post('exam-instances/:id/revoke')
    revoke(
        @Param('id') examInstanceId: string,
        @Body() dto: RevokeResultsDto,
        @CurrentUser('id') adminId: string,
    ) {
        return this.resultsService.revoke(examInstanceId, adminId, dto.reason, dto.audiences);
    }

    /**
     * Stage two — publish the final report.
     *
     * Turns every provisional score for this instance into a final one and opens
     * the rank, the dimension analysis and (unless suppressed) the answer key.
     */
    @Post('exam-instances/:id/publish-final')
    publishFinal(
        @Param('id') examInstanceId: string,
        @Body() dto: PublishFinalReportDto,
        @CurrentUser('id') adminId: string,
    ) {
        return this.resultsService.publishFinalReport(
            examInstanceId,
            adminId,
            dto.reason,
            dto.withAnswerKey ?? true,
        );
    }

    /** The undo — returns every score in this instance to provisional. */
    @Post('exam-instances/:id/revoke-final')
    revokeFinal(
        @Param('id') examInstanceId: string,
        @Body() dto: RevokeFinalReportDto,
        @CurrentUser('id') adminId: string,
    ) {
        return this.resultsService.revokeFinalReport(examInstanceId, adminId, dto.reason);
    }

    /** The full results sheet for an instance — every student, every school. */
    @Get('exam-instances/:id/results.xlsx')
    async exportXlsx(@Param('id') examInstanceId: string, @Res() res: Response) {
        const status = await this.resultsService.getStatus(examInstanceId);
        const rows = await this.exportService.adminRows(examInstanceId);
        const buffer = await this.exportService.workbook(status.examTitle, rows);

        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${ResultsExportService.filename(status.examTitle, 'all')}"`,
        );
        res.send(buffer);
    }

    /** The results a single partner may see — used by admin to preview what a partner gets. */
    @Get('exam-instances/:id/results/partner/:partnerId.xlsx')
    async exportPartnerXlsx(
        @Param('id') examInstanceId: string,
        @Param('partnerId') partnerId: string,
        @Res() res: Response,
    ) {
        const status = await this.resultsService.getStatus(examInstanceId);
        const schoolIds = await this.exportService.schoolIdsForPartner(partnerId);
        const rows = await this.exportService.rows(examInstanceId, schoolIds);
        const buffer = await this.exportService.workbook(status.examTitle, rows);

        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${ResultsExportService.filename(status.examTitle, 'partner')}"`,
        );
        res.send(buffer);
    }
}
