import { Module } from '@nestjs/common';
import { PaymentModule } from '../payment/payment.module';
import { AttemptController } from './attempt.controller';
import { AttemptService } from './attempt.service';

@Module({
    // Exam start is gated on an active access pass (see AttemptService.startAttempt).
    imports: [PaymentModule],
    controllers: [AttemptController],
    providers: [AttemptService],
    exports: [AttemptService],
})
export class AttemptModule { }
