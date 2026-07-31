import { Body, Controller, Get, Ip, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SubmitGuardianDto } from './dto/guardian.dto';
import { GuardianService } from './guardian.service';

/** Registration part 2 — parent/guardian details and parental consent. */
@Controller()
@UseGuards(JwtAuthGuard)
export class GuardianController {
    constructor(private guardianService: GuardianService) {}

    @Get('guardian/me')
    status(@CurrentUser('id') userId: string) {
        return this.guardianService.status(userId);
    }

    @Post('guardian')
    submit(
        @CurrentUser('id') userId: string,
        @Body() dto: SubmitGuardianDto,
        @Ip() ip: string,
    ) {
        return this.guardianService.submit(userId, dto, ip);
    }
}
