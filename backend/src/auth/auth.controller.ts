import { Body, Controller, Get, Param, Post, Put, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PartnerAdminApiClient } from '../partner/admin-api.client';
import { AuthService } from './auth.service';
import {
    LoginSyncDto,
    PhoneLoginSyncDto,
    SendPhoneOtpDto,
    SyncUserDto,
    UpdateProfileDto,
} from './dto/auth.dto';
import { PhoneOtpService } from './phone-otp.service';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

@Controller('auth')
export class AuthController {
    constructor(
        private authService: AuthService,
        private jwtService: JwtService,
        private partnerAdminApi: PartnerAdminApiClient,
        private phoneOtpService: PhoneOtpService,
    ) { }

    /**
     * Admin login — validates hardcoded credentials, returns a signed JWT.
     */
    @Post('admin-login')
    async adminLogin(@Body() body: { email: string; password: string }) {
        if (!ADMIN_EMAIL || !ADMIN_PASSWORD || body.email !== ADMIN_EMAIL || body.password !== ADMIN_PASSWORD) {
            throw new UnauthorizedException('Invalid admin credentials');
        }
        const user = await this.authService.getOrCreateAdmin(ADMIN_EMAIL);
        const token = this.jwtService.sign(
            { sub: user.id, email: user.email, role: user.role },
            { expiresIn: '8h' },
        );
        return { accessToken: token, user };
    }

    /**
     * PUBLIC — called after Neon Auth OTP verification (registration).
     * Accepts email + profile data in the body (Neon Auth already verified ownership via OTP).
     * Creates the user in our DB and returns our own signed JWT.
     */
    @Post('sync')
    async syncUser(@Body() dto: SyncUserDto) {
        const user = await this.authService.syncUser(dto.email, dto);

        // Best-effort referral attribution: credit the signup to the partner
        // campaign the student arrived from. Deliberately not awaited — the
        // engine may be cold, and no student should wait on it to register.
        // `tryCaptureSignup` never rejects.
        if (dto.referralCode) {
            void this.partnerAdminApi.tryCaptureSignup(dto.referralCode, user.id);
        }

        // Issue our own HS256 JWT — used for all subsequent API calls
        const token = this.jwtService.sign(
            { sub: user.id, email: user.email, role: user.role },
            { expiresIn: '24h' },
        );
        return { accessToken: token, user };
    }

    /**
     * PUBLIC — called after Neon Auth OTP sign-in (login).
     * Looks up the user by email and returns our own signed JWT.
     */
    @Post('login-sync')
    async loginSync(@Body() dto: LoginSyncDto) {
        const user = await this.authService.getUserByEmail(dto.email);
        if (!user) {
            throw new UnauthorizedException('No account found for this email. Please register first.');
        }
        const token = this.jwtService.sign(
            { sub: user.id, email: user.email, role: user.role },
            { expiresIn: '24h' },
        );
        return { accessToken: token, user };
    }

    /** PUBLIC — issue a WhatsApp sign-in code for a phone number. */
    @Post('phone/send-otp')
    async sendPhoneOtp(@Body() dto: SendPhoneOtpDto) {
        return this.phoneOtpService.sendOtp(dto.phone);
    }

    /**
     * PUBLIC — verify the code and sign in.
     *
     * The code is checked here rather than trusting the client's word that it
     * verified: an endpoint that issued a JWT for any phone number in the body
     * would let anyone sign in as anyone.
     */
    @Post('login-sync-phone')
    async loginSyncPhone(@Body() dto: PhoneLoginSyncDto) {
        const phone = await this.phoneOtpService.verifyOtp(dto.phone, dto.code);

        const user = await this.authService.getUserByPhone(phone);
        if (!user) {
            throw new UnauthorizedException(
                'No account found for this phone number. Please register first.',
            );
        }
        const token = this.jwtService.sign(
            { sub: user.id, email: user.email, role: user.role },
            { expiresIn: '24h' },
        );
        return { accessToken: token, user };
    }

    @Get('me')
    @UseGuards(JwtAuthGuard)
    async getMe(@CurrentUser('id') userId: string) {
        return this.authService.getMe(userId);
    }

    @Put('me')
    @UseGuards(JwtAuthGuard)
    async updateProfile(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
        return this.authService.updateProfile(userId, dto);
    }

    @Get('admin/users')
    @UseGuards(JwtAuthGuard)
    async getAllStudentsWithMarks(@CurrentUser('role') role: string) {
        if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
            throw new UnauthorizedException('Admin access required');
        }
        return this.authService.getAllStudentsWithMarks();
    }

    /**
     * Full student profile for the admin students directory: attempts, scores,
     * payments, bookings, and proctor violation summary in one call.
     */
    @Get('admin/users/:id')
    @UseGuards(JwtAuthGuard)
    async getStudentDetail(@Param('id') id: string, @CurrentUser('role') role: string) {
        if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
            throw new UnauthorizedException('Admin access required');
        }
        const student = await this.authService.getStudentDetail(id);
        if (!student) throw new UnauthorizedException('Student not found');
        return student;
    }
}
