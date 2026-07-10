import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ReleaseResultsDto } from './dto/results.dto';
import { ResultsService } from './results.service';

/** Fair-score processing + result-release gating. Staff only (spec Admin §19/§20). */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class ResultsController {
    constructor(private resultsService: ResultsService) {}

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

    @Post('exam-instances/:id/release')
    release(
        @Param('id') examInstanceId: string,
        @Body() dto: ReleaseResultsDto,
        @CurrentUser('id') adminId: string,
    ) {
        return this.resultsService.release(examInstanceId, adminId, dto.reason);
    }
}
