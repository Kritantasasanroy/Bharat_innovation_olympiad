import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserService {
    constructor(private prisma: PrismaService) { }

    async findById(id: string) {
        return this.prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
                classBand: true,
                school: { select: { id: true, name: true, code: true } },
                profileImageUrl: true,
                isActive: true,
                createdAt: true,
            },
        });
    }

    async findByEmail(email: string) {
        return this.prisma.user.findUnique({ where: { email } });
    }

    async updateProfile(id: string, data: { firstName?: string; lastName?: string; profileImageUrl?: string }) {
        return this.prisma.user.update({ where: { id }, data });
    }

    async storeFaceEmbedding(userId: string, embedding: Buffer) {
        return this.prisma.user.update({
            where: { id: userId },
            data: { faceEmbedding: embedding },
        });
    }

    async getFaceEmbedding(userId: string): Promise<Buffer | null> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { faceEmbedding: true },
        });
        return user?.faceEmbedding || null;
    }
}
