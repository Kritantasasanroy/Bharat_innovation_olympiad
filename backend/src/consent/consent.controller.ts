import { Body, Controller, Get, Ip, Param, Post, UseGuards } from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ConsentService } from './consent.service';

export class AcceptConsentDto {
    @IsBoolean()
    dataProcessing: boolean;

    @IsBoolean()
    mediaCapture: boolean;

    @IsBoolean()
    proctoring: boolean;
}

@Controller()
@UseGuards(JwtAuthGuard)
export class ConsentController {
    constructor(private consentService: ConsentService) {}

    @Post('consent')
    accept(@CurrentUser('id') userId: string, @Body() dto: AcceptConsentDto, @Ip() ip: string) {
        return this.consentService.accept(userId, dto, ip);
    }

    @Get('consent/me')
    status(@CurrentUser('id') userId: string) {
        return this.consentService.status(userId);
    }

    /** Printable admit card for a confirmed booking (spec Student §17). */
    @Get('admit-card/:bookingId')
    admitCard(@CurrentUser('id') userId: string, @Param('bookingId') bookingId: string) {
        return this.consentService.admitCard(userId, bookingId);
    }
}
