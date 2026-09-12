import { Module } from '@nestjs/common';
import { PartnerModule } from '../partner/partner.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SlotModule } from '../slot/slot.module';
import { UserModule } from '../user/user.module';
import { AccessPassService } from './access-pass.service';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';

// SlotModule is imported for `SlotService.notifySchedule` (a paid booking is
// confirmed here, not in SlotService) and for `SlotAssignmentService` — a
// pass that just went ACTIVE is also the moment its student's sitting gets
// booked, moved here from registration. UserModule is for `RollNumberService`,
// moved here the same way. No cycle: neither module depends on payments.
@Module({
    imports: [PrismaModule, PartnerModule, SlotModule, UserModule],
    controllers: [PaymentController],
    providers: [PaymentService, AccessPassService],
    // AttemptModule imports this to gate exam start on an active pass.
    exports: [PaymentService, AccessPassService],
})
export class PaymentModule {}
