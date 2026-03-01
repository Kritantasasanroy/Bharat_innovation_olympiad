import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AttemptModule } from './attempt/attempt.module';
import { AuthModule } from './auth/auth.module';
import { ExamModule } from './exam/exam.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProctorModule } from './proctor/proctor.module';
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
    ],
})
export class AppModule { }
