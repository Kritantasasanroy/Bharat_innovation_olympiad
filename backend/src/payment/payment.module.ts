import { Module } from '@nestjs/common';
import { PartnerModule } from '../partner/partner.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AccessPassService } from './access-pass.service';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';

@Module({
    imports: [PrismaModule, PartnerModule],
    controllers: [PaymentController],
    providers: [PaymentService, AccessPassService],
    // AttemptModule imports this to gate exam start on an active pass.
    exports: [PaymentService, AccessPassService],
})
export class PaymentModule {}
