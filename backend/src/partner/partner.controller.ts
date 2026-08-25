import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import {
    ConfirmEmailOtpDto,
    ResendEmailVerificationDto,
    ResetPasswordDto,
    VerifyEmailDto,
} from '../common/dto/email-verification.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
    ApplyPartnerDto,
    DecidePartnerDto,
    MarkPayoutPaidDto,
    PartnerLoginDto,
    SetCampaignActiveDto,
    TriggerPayoutDto,
} from './dto/partner.dto';
import { PartnerService } from './partner.service';

@Controller()
export class PartnerController {
    constructor(private partnerService: PartnerService) {}

    /**
     * PUBLIC — step 1 of self-service application: email the contact a
     * 6-digit code before any organisation details are collected.
     */
    @Post('partner/verification/start')
    startVerification(@Body() dto: ResendEmailVerificationDto) {
        return this.partnerService.startVerification(dto.email);
    }

    /**
     * PUBLIC — step 2: check the code and hand back the `verificationTicket`
     * that `partner/apply` requires.
     */
    @Post('partner/verification/confirm')
    confirmVerification(@Body() dto: ConfirmEmailOtpDto) {
        return this.partnerService.confirmVerification(dto.email, dto.code);
    }

    /** PUBLIC — a brand-new partner requests access (no token). */
    @Post('partner/apply')
    apply(@Body() dto: ApplyPartnerDto) {
        return this.partnerService.apply(dto);
    }

    /** PUBLIC — approved partner signs in with email + password, or an access token. */
    @Post('partner/login')
    login(@Body() dto: PartnerLoginDto) {
        return this.partnerService.login(dto);
    }

    /** PUBLIC — forgot-password step 1: email a 6-digit code to an existing password account. */
    @Post('partner/forgot-password')
    forgotPassword(@Body() dto: ResendEmailVerificationDto) {
        return this.partnerService.forgotPassword(dto.email);
    }

    /** PUBLIC — forgot-password step 2: check the code and hand back the `resetTicket` that `reset-password` requires. */
    @Post('partner/reset-password/confirm')
    confirmPasswordReset(@Body() dto: ConfirmEmailOtpDto) {
        return this.partnerService.confirmPasswordReset(dto.email, dto.code);
    }

    /** PUBLIC — forgot-password step 3: set the new password, proven by the step-2 ticket. */
    @Post('partner/reset-password')
    resetPassword(@Body() dto: ResetPasswordDto) {
        return this.partnerService.resetPassword(dto.email, dto.resetTicket, dto.newPassword);
    }

    /** PUBLIC — legacy link-based confirmation, kept for any application submitted before verify-first shipped. */
    @Post('partner/verify-email')
    verifyEmail(@Body() dto: VerifyEmailDto) {
        return this.partnerService.verifyEmail(dto.token);
    }

    /** PUBLIC — resend on the legacy link flow (see `verify-email`). */
    @Post('partner/resend-verification')
    resendVerification(@Body() dto: ResendEmailVerificationDto) {
        return this.partnerService.resendVerification(dto.email);
    }

    /** ADMIN — resend a pending application's email-verification link. */
    @Post('admin/partner-requests/:id/resend-verification')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    resendVerificationForAdmin(@Param('id') id: string, @CurrentUser('id') adminId: string) {
        return this.partnerService.resendVerificationForAdmin(id, adminId);
    }

    /** ADMIN — partner review queue for the admin Access Management page. */
    @Get('admin/partner-requests')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    list() {
        return this.partnerService.list();
    }

    /** ADMIN — grant / reject / revoke / re-grant a partner's access. */
    @Patch('admin/partner-requests/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    decide(
        @Param('id') id: string,
        @Body() dto: DecidePartnerDto,
        @CurrentUser('id') adminId: string,
    ) {
        return this.partnerService.decide(id, dto, adminId);
    }

    /** ADMIN — handover card, including the partner's access token in the clear. */
    @Get('admin/partner-requests/:id/card')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    card(@Param('id') id: string) {
        return this.partnerService.card(id);
    }

    /** ADMIN — issue a fresh token, invalidating the previous one immediately. */
    @Post('admin/partner-requests/:id/rotate-token')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    rotate(@Param('id') id: string, @CurrentUser('id') adminId: string) {
        return this.partnerService.rotateToken(id, adminId);
    }

    /** ADMIN — re-send the current access details, e.g. "they said they never got the email". */
    @Post('admin/partner-requests/:id/resend')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    resend(@Param('id') id: string, @CurrentUser('id') adminId: string) {
        return this.partnerService.resendAccess(id, adminId);
    }

    // ── Admin visibility into the partner engine (campaigns/funnel/payouts/bank details) ──

    /** ADMIN — a partner's whole engine workspace in one call: identity, campaigns, funnel, payouts, masked bank details. */
    @Get('admin/partners/:partnerId/engine')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    engineSnapshot(@Param('partnerId') partnerId: string, @CurrentUser('id') adminId: string) {
        return this.partnerService.engineSnapshot(partnerId, adminId);
    }

    /** ADMIN — no fixed commission: admin decides the amount and triggers a payout directly. */
    @Post('admin/partners/:partnerId/payouts')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    triggerPayout(
        @Param('partnerId') partnerId: string,
        @Body() dto: TriggerPayoutDto,
        @CurrentUser('id') adminId: string,
    ) {
        return this.partnerService.triggerPayout(partnerId, dto.amountPaise, dto.note, adminId);
    }

    /** ADMIN — records that a triggered payout's money has actually gone out. */
    @Patch('admin/partners/:partnerId/payouts/:payoutId')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    markPayoutPaid(
        @Param('partnerId') partnerId: string,
        @Param('payoutId') payoutId: string,
        @Body() _dto: MarkPayoutPaidDto,
        @CurrentUser('id') adminId: string,
    ) {
        return this.partnerService.markPayoutPaid(partnerId, payoutId, adminId);
    }

    /** ADMIN — the decrypted account number + PAN. Audited on admin-api's side. */
    @Get('admin/partners/:partnerId/bank-details/reveal')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    revealBankDetails(@Param('partnerId') partnerId: string, @CurrentUser('id') adminId: string) {
        return this.partnerService.revealBankDetails(partnerId, adminId);
    }

    /** ADMIN — pause/resume one campaign; revoking the whole partner was previously the only lever. */
    @Patch('admin/partners/:partnerId/campaigns/:campaignId')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    setCampaignActive(
        @Param('partnerId') partnerId: string,
        @Param('campaignId') campaignId: string,
        @Body() dto: SetCampaignActiveDto,
    ) {
        return this.partnerService.setCampaignActive(partnerId, campaignId, dto.deactivate);
    }
}
