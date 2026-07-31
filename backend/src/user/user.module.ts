import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RollNumberService } from './roll-number.service';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
    imports: [PrismaModule],
    controllers: [UserController],
    providers: [UserService, RollNumberService],
    // `RollNumberService` is exported because AuthModule issues a roll number at
    // the end of registration (`AuthService.syncUser`).
    exports: [UserService, RollNumberService],
})
export class UserModule { }
