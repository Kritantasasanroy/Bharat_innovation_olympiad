import { Body, Controller, Get, Param, Post, Put, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PartnerAdminApiClient } from '../partner/admin-api.client';
import { AuthService } from './auth.service';
import {
    LoginSyncDto,
    PhoneLoginSyncDto,
    SendEmailOtpDto,
    SendPhoneOtpDto,
    SyncUserDto,
    UpdateProfileDto,
} from './dto/auth.dto';
import { EmailOtpService } from '../common/email-otp.service';
import { PhoneOtpService } from './phone-otp.service';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

/**
 * Who issues and checks the email sign-in code.
 *
 * `backend` — we do, and `/auth/sync` + `/auth/login-sync` will not mint a JWT
 * without a valid one.
 *
 * Anything else (the default) — Neon Auth does, in the browser, and those two
 * endpoints trust the caller's word that it happened. That is how this has
 * always worked and it is why the switch exists: an environment is moved over
 * deliberately, once its frontend is sending codes, rather than by a deploy
 * that silently starts rejecting every login.
 */
const EMAIL_OTP_BY_BACKEND =
    (process.env.EMAIL_OTP_PROVIDER?.trim().toLowerCase() ?? '') === 'backend';

@Controller('auth')
export class AuthController {
    constructor(
        private authService: AuthService,
        private jwtService: JwtService,
        private partnerAdminApi: PartnerAdminApiClient,
        private phoneOtpService: PhoneOtpService,
        private emailOtpService: EmailOtpService,
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
     * PUBLIC — issue a sign-in / registration code to an email address.
     *
     * `recordPendingApplicant` runs first and is fire-and-forget-safe (it
     * swallows its own errors) — a student waiting on a code must never be
     * blocked by the admin follow-up list failing to write.
     */
    @Post('email/send-otp')
    async sendEmailOtp(@Body() dto: SendEmailOtpDto) {
        await this.authService.recordPendingApplicant(dto);
        return this.emailOtpService.sendOtp('STUDENT', dto.email, dto.name);
    }

    /**
     * Prove the caller controls the address before any token is minted.
     *
     * Where the backend owns the code, a missing or wrong one is fatal. Where
     * it does not, this is a no-op and the old Neon-verified-in-the-browser
     * behaviour stands.
     */
    private async assertEmailOwnership(email: string, code?: string): Promise<void> {
        if (!EMAIL_OTP_BY_BACKEND) return;
        if (!code) {
            throw new UnauthorizedException(
                'A verification code is required. Request one first.',
            );
        }
        await this.emailOtpService.verifyOtp('STUDENT', email, code);
    }

    /**
     * PUBLIC — registration.
     *
     * The code is checked here rather than trusting the client's word that it
     * verified, for the same reason `login-sync-phone` checks it: an endpoint
     * that issued a JWT for any address in the body would let anyone register —
     * and then sign in — as anyone.
     */
    @Post('sync')
    async syncUser(@Body() dto: SyncUserDto) {
        await this.assertEmailOwnership(dto.email, dto.code);
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
     * PUBLIC — sign in with an email code.
     *
     * Until the backend owned the code this endpoint took an address and
     * returned a 24-hour JWT for it, trusting that the browser had been through
     * Neon Auth first. Nothing stopped a caller skipping that step — the same
     * hole `login-sync-phone` was written to avoid, on the other channel.
     */
    @Post('login-sync')
    async loginSync(@Body() dto: LoginSyncDto) {
        await this.assertEmailOwnership(dto.email, dto.code);
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

    /** PUBLIC — issue a sign-in code for a phone number, by SMS (default) or call. */
    @Post('phone/send-otp')
    async sendPhoneOtp(@Body() dto: SendPhoneOtpDto) {
        return this.phoneOtpService.sendOtp(dto.phone, dto.channel ?? 'sms');
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
