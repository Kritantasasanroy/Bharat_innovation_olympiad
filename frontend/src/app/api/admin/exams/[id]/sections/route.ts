import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/jwt';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = getUserFromRequest(request);
        if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const { id: examId } = await params;
        const body = await request.json();
        const { title, sortOrder } = body;

        const section = await prisma.examSection.create({
            data: {
                examId,
                title,
                sortOrder: sortOrder || 0,
            }
        });

        return NextResponse.json(section);
    } catch (error) {
        console.error('Add Section Error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
