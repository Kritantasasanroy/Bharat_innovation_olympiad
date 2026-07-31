import { Module } from '@nestjs/common';
import { GuardianModule } from '../guardian/guardian.module';
import { PaymentModule } from '../payment/payment.module';
import { ProctorModule } from '../proctor/proctor.module';
import { AttemptController } from './attempt.controller';
import { AttemptService } from './attempt.service';

@Module({
    // Exam start is gated on an active access pass and on parental consent
    // (see AttemptService.startAttempt); submitting flags risky attempts for
    // human review (see AttemptService.flagForReview).
    imports: [PaymentModule, GuardianModule, ProctorModule],
    controllers: [AttemptController],
    providers: [AttemptService],
    exports: [AttemptService],
})
export class AttemptModule { }
