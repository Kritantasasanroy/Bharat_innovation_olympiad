import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { signToken } from '@/lib/jwt';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { email, password } = body;

        if (!email || !password) {
            return NextResponse.json({ message: 'Email and password are required' }, { status: 400 });
        }

        const user = await prisma.user.findUnique({
            where: { email },
        });

        if (!user || !user.isActive) {
            return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
            return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
        }

        // Generate tokens
        const accessToken = signToken({ sub: user.id, email: user.email, role: user.role });
        
        const refreshToken = crypto.randomUUID();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

        await prisma.refreshToken.create({
            data: {
                token: refreshToken,
                userId: user.id,
                expiresAt,
            },
        });

        const { passwordHash, ...userData } = user;

        return NextResponse.json({
            user: userData,
            tokens: { accessToken, refreshToken }
        });

    } catch (error) {
        console.error('Login Error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
