import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ConsentService } from './consent.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class ConsentController {
    constructor(private consentService: ConsentService) {}

    /** Printable admit card for a confirmed booking (spec Student §17). */
    @Get('admit-card/:bookingId')
    admitCard(@CurrentUser('id') userId: string, @Param('bookingId') bookingId: string) {
        return this.consentService.admitCard(userId, bookingId);
    }
}
