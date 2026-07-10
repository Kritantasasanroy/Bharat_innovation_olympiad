import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Post,
    UnauthorizedException,
    UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApplyPartnerDto, DecidePartnerDto, PartnerLoginDto } from './dto/partner.dto';
import { PartnerService } from './partner.service';

@Controller()
export class PartnerController {
    constructor(private partnerService: PartnerService) {}

    /** PUBLIC — a brand-new partner requests access (no token). */
    @Post('partner/apply')
    apply(@Body() dto: ApplyPartnerDto) {
        return this.partnerService.apply(dto);
    }

    /** PUBLIC — approved partner signs in with email + password. */
    @Post('partner/login')
    login(@Body() dto: PartnerLoginDto) {
        return this.partnerService.login(dto);
    }

    /** ADMIN — partner review queue for the admin Partner Management page. */
    @Get('admin/partner-requests')
    @UseGuards(JwtAuthGuard)
    list(@CurrentUser('role') role: string) {
        if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
            throw new UnauthorizedException('Admin access required');
        }
        return this.partnerService.list();
    }

    /** ADMIN — grant / reject / revoke / re-grant a partner's access. */
    @Patch('admin/partner-requests/:id')
    @UseGuards(JwtAuthGuard)
    decide(
        @Param('id') id: string,
        @Body() dto: DecidePartnerDto,
        @CurrentUser('role') role: string,
        @CurrentUser('id') adminId: string,
    ) {
        if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
            throw new UnauthorizedException('Admin access required');
        }
        return this.partnerService.decide(id, dto, adminId);
    }
}
