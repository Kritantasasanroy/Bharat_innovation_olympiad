import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AttemptModule } from './attempt/attempt.module';
import { AuthModule } from './auth/auth.module';
import { ExamModule } from './exam/exam.module';
import { HealthController } from './health.controller';
import { PaymentModule } from './payment/payment.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProctorModule } from './proctor/proctor.module';
import { SlotModule } from './slot/slot.module';
import { TimerModule } from './timer/timer.module';
import { UserModule } from './user/user.module';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuthModule,
        UserModule,
        ExamModule,
        AttemptModule,
        ProctorModule,
        TimerModule,
        SlotModule,
        PaymentModule,
    ],
    controllers: [HealthController],
})
export class AppModule { }
