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
                phone: true,
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

    /**
     * Updates only the fields a student owns. The keys are picked out explicitly
     * rather than spreading `data` — the caller's DTO already whitelists them, and
     * this makes the endpoint safe even if someone later loosens that DTO.
     */
    async updateProfile(
        id: string,
        data: {
            firstName?: string;
            lastName?: string;
            phone?: string;
            profileImageUrl?: string;
        },
    ) {
        return this.prisma.user.update({
            where: { id },
            data: {
                ...(data.firstName !== undefined ? { firstName: data.firstName.trim() } : {}),
                ...(data.lastName !== undefined ? { lastName: data.lastName.trim() } : {}),
                ...(data.phone !== undefined ? { phone: data.phone.trim() || null } : {}),
                ...(data.profileImageUrl !== undefined
                    ? { profileImageUrl: data.profileImageUrl }
                    : {}),
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
                role: true,
                classBand: true,
                profileImageUrl: true,
            },
        });
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
