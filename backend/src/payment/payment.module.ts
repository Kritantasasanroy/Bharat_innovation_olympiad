import { Module } from '@nestjs/common';
import { PartnerModule } from '../partner/partner.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SlotModule } from '../slot/slot.module';
import { AccessPassService } from './access-pass.service';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';

// SlotModule is imported for `SlotService.notifySchedule` — a paid
// booking is confirmed here, not in SlotService, so this is where the student's
// schedule message has to be triggered from. No cycle: SlotModule does not
// depend on payments.
@Module({
    imports: [PrismaModule, PartnerModule, SlotModule],
    controllers: [PaymentController],
    providers: [PaymentService, AccessPassService],
    // AttemptModule imports this to gate exam start on an active pass.
    exports: [PaymentService, AccessPassService],
})
export class PaymentModule {}
