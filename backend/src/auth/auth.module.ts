import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { getJwtSecret } from '../common/jwt-secret';
import { PartnerModule } from '../partner/partner.module';
import { SlotModule } from '../slot/slot.module';
import { UserModule } from '../user/user.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PhoneOtpService } from './phone-otp.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
    imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
            secret: getJwtSecret(),
            signOptions: { expiresIn: '15m' },
        }),
        SlotModule,
        PartnerModule,
        // For RollNumberService — registration issues the student's roll number.
        UserModule,
    ],
    controllers: [AuthController],
    providers: [AuthService, PhoneOtpService, JwtStrategy],
    exports: [AuthService, JwtModule],
})
export class AuthModule { }
