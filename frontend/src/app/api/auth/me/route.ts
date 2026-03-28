import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/jwt';

export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload: any = verifyToken(token);

        if (!payload || !payload.sub) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: payload.sub },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
                classBand: true,
                schoolId: true,
                school: { select: { name: true } },
                profileImageUrl: true,
                isActive: true,
                createdAt: true,
            },
        });

        if (!user || !user.isActive) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        return NextResponse.json(user);

    } catch (error) {
        console.error('Get Me Error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
