import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AttemptModule } from './attempt/attempt.module';
import { AuthModule } from './auth/auth.module';
import { CertificateModule } from './certificate/certificate.module';
import { S3Module } from './common/services/s3.module';
import { ConsentModule } from './consent/consent.module';
import { ExamModule } from './exam/exam.module';
import { GrievanceModule } from './grievance/grievance.module';
import { HealthController } from './health.controller';
import { PartnerModule } from './partner/partner.module';
import { PaymentModule } from './payment/payment.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProctorModule } from './proctor/proctor.module';
import { RefundModule } from './refund/refund.module';
import { ResultsModule } from './results/results.module';
import { SlotModule } from './slot/slot.module';
import { TimerModule } from './timer/timer.module';
import { UserModule } from './user/user.module';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        S3Module,
        AuthModule,
        UserModule,
        ExamModule,
        AttemptModule,
        ProctorModule,
        TimerModule,
        SlotModule,
        PaymentModule,
        PartnerModule,
        // Phase 3 — results integrity chain, decision loops, consent.
        ResultsModule,
        CertificateModule,
        GrievanceModule,
        RefundModule,
        ConsentModule,
    ],
    controllers: [HealthController],
})
export class AppModule { }
