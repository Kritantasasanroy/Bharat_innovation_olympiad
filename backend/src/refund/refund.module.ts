import { Module } from '@nestjs/common';
import { PaymentModule } from '../payment/payment.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RefundController } from './refund.controller';
import { RefundService } from './refund.service';

@Module({
    // PaymentModule exports PaymentService, whose adminRefund() performs the
    // actual Razorpay issuance once a refund request is approved.
    imports: [PrismaModule, PaymentModule],
    controllers: [RefundController],
    providers: [RefundService],
    exports: [RefundService],
})
export class RefundModule {}
