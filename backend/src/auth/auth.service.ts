import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SyncUserDto, UpdateProfileDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
    constructor(private prisma: PrismaService) { }

    async syncUser(email: string, dto: SyncUserDto) {
        let user = await this.prisma.user.findUnique({ where: { email } });

        if (!user) {
            let schoolId: string | undefined;
            if (dto.schoolCode) {
                const school = await this.prisma.school.findUnique({ where: { code: dto.schoolCode } });
                if (school) {
                    schoolId = school.id;
                } else {
                    throw new BadRequestException('Invalid school code');
                }
            }

            user = await this.prisma.user.create({
                data: {
                    email,
                    firstName: dto.firstName,
                    lastName: dto.lastName,
                    role: dto.role || 'STUDENT',
                    classBand: dto.classBand,
                    schoolId,
                }
            });
        }

        return user;
    }

    async getUserByEmail(email: string) {
        return this.prisma.user.findUnique({
            where: { email },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
                classBand: true,
                schoolId: true,
                school: { select: { name: true } },
                isActive: true,
            },
        });
    }

    async getOrCreateAdmin(email: string) {
        let user = await this.prisma.user.findUnique({ where: { email } });
        if (!user) {
            user = await this.prisma.user.create({
                data: {
                    email,
                    firstName: 'Admin',
                    lastName: 'BIO',
                    role: 'ADMIN',
                },
            });
        }
        return user;
    }

    async getMe(userId: string) {
        return this.prisma.user.findUnique({
            where: { id: userId },
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
    }

    async updateProfile(userId: string, dto: UpdateProfileDto) {
        const user = await this.prisma.user.update({
            where: { id: userId },
            data: {
                firstName: dto.firstName,
                lastName: dto.lastName,
                classBand: dto.classBand,
            },
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
        return user;
    }

    async getAllStudentsWithMarks() {
        return this.prisma.user.findMany({
            where: { role: 'STUDENT' },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                classBand: true,
                school: { select: { name: true } },
                createdAt: true,
                attempts: {
                    select: {
                        id: true,
                        status: true,
                        totalScore: true,
                        maxScore: true,
                        submittedAt: true,
                        examInstance: {
                            select: {
                                exam: { select: { title: true } }
                            }
                        }
                    },
                    orderBy: { submittedAt: 'desc' },
                }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

}
