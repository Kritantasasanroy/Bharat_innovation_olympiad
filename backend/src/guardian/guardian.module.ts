import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GuardianController } from './guardian.controller';
import { GuardianService } from './guardian.service';

@Module({
    imports: [PrismaModule],
    controllers: [GuardianController],
    providers: [GuardianService],
    // Exported because `AttemptModule` gates exam start on `hasGuardianConsent`.
    exports: [GuardianService],
})
export class GuardianModule {}
