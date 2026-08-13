import {
    Body,
    Controller,
    Get,
    Headers,
    HttpCode,
    Param,
    Post,
    Query,
    Req,
    UnauthorizedException,
    UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AccessPassService } from './access-pass.service';
import { PaymentService } from './payment.service';

@Controller()
export class PaymentController {
    constructor(
        private paymentService: PaymentService,
        private accessPassService: AccessPassService,
    ) {}

    // ── Student routes ────────────────────────────────────────────────────────

    @Post('payments/create-order')
    @UseGuards(JwtAuthGuard)
    async createOrder(
        @CurrentUser('id') userId: string,
        @Body() body: { bookingId: string; couponCode?: string },
    ) {
        return this.paymentService.createOrder(userId, body.bookingId, body.couponCode);
    }

    @Post('payments/verify')
    @UseGuards(JwtAuthGuard)
    async verifyPayment(
        @Body()
        body: {
            razorpayOrderId: string;
            razorpayPaymentId: string;
            razorpaySignature: string;
        },
    ) {
        return this.paymentService.verifyPaymentSignature(
            body.razorpayOrderId,
            body.razorpayPaymentId,
            body.razorpaySignature,
        );
    }

    @Get('payments/my-payments')
    @UseGuards(JwtAuthGuard)
    async getMyPayments(@CurrentUser('id') userId: string) {
        return this.paymentService.getMyPayments(userId);
    }

    @Get('coupons/validate')
    @UseGuards(JwtAuthGuard)
    async validateCoupon(@Query('code') code: string) {
        return this.paymentService.validateCoupon(code);
    }

    // Access pass (one-off platform fee, unlocks every exam for the season)

    @Get('access-pass/me')
    @UseGuards(JwtAuthGuard)
    async getMyAccessPass(
        @CurrentUser('id') userId: string,
        @Query('examId') examId?: string,
    ) {
        return this.accessPassService.getMyPass(userId, examId);
    }

    @Post('access-pass/create-order')
    @UseGuards(JwtAuthGuard)
    async createAccessPassOrder(@CurrentUser('id') userId: string) {
        return this.accessPassService.createOrder(userId);
    }

    @Post('access-pass/verify')
    @UseGuards(JwtAuthGuard)
    async verifyAccessPass(
        @CurrentUser('id') userId: string,
        @Body()
        body: {
            razorpayOrderId: string;
            razorpayPaymentId: string;
            razorpaySignature: string;
        },
    ) {
        return this.accessPassService.verifyAndActivate(
            userId,
            body.razorpayOrderId,
            body.razorpayPaymentId,
            body.razorpaySignature,
        );
    }

    // ── Razorpay webhook (PUBLIC — verified via HMAC) ─────────────────────────

    @Post('payments/webhook')
    @HttpCode(200)
    async handleWebhook(
        @Headers('x-razorpay-signature') signature: string,
        @Req() req: Request,
    ) {
        const rawBody: Buffer = (req as any).rawBody;
        if (!rawBody) throw new UnauthorizedException('Raw body missing');

        const valid = this.paymentService.verifyWebhookSignature(rawBody, signature);
        if (!valid) throw new UnauthorizedException('Invalid webhook signature');

        const event = JSON.parse(rawBody.toString());
        await this.paymentService.handleWebhookEvent(event);
        return { received: true };
    }

    // ── Admin routes ──────────────────────────────────────────────────────────

    @Get('admin/payments')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async adminListPayments(@Query('status') status?: string) {
        return this.paymentService.adminListPayments(status);
    }

    @Post('admin/payments/:id/refund')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async adminRefund(@Param('id') paymentId: string) {
        return this.paymentService.adminRefund(paymentId);
    }

    @Post('admin/coupons')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async createCoupon(
        @Body()
        body: {
            code: string;
            discountPct: number;
            maxUses: number;
            expiresAt?: string;
        },
    ) {
        return this.paymentService.createCoupon(body);
    }

    @Get('admin/coupons')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async listCoupons() {
        return this.paymentService.listCoupons();
    }

    @Get('admin/access-passes')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async adminListAccessPasses(@Query('status') status?: string) {
        return this.accessPassService.adminList(status);
    }

    /** Offline/cash payment or a support fix — grants without a Razorpay order. */
    @Post('admin/access-passes/:userId/grant')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async adminGrantAccessPass(@Param('userId') userId: string) {
        return this.accessPassService.adminGrant(userId);
    }

    @Post('admin/access-passes/:userId/revoke')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async adminRevokeAccessPass(@Param('userId') userId: string) {
        return this.accessPassService.adminRevoke(userId);
    }
}
