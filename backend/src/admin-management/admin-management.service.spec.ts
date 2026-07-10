import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdminManagementService } from './admin-management.service';

/**
 * In-memory fake of the Prisma slice this service uses. Rows really mutate and
 * cascades are modelled just enough to prove the invariants that matter: a
 * delete archives before it removes, a school delete detaches (not deletes) its
 * students, and slot counters are recomputed from surviving bookings.
 */
function createFakeDb() {
    let seq = 0;
    const users: any[] = [];
    const schools: any[] = [];
    const schoolRequests: any[] = [];
    const partnerRequests: any[] = [];
    const bookings: any[] = [];
    const slots: any[] = [];
    const assignments: any[] = [];
    const archive: any[] = [];
    const audit: any[] = [];

    const byId = (rows: any[], id: string) => rows.find((r) => r.id === id) ?? null;

    const tx: any = {
        archivedEntity: {
            create: async ({ data }: any) => {
                const row = { id: `arc-${++seq}`, deletedAt: new Date(), ...data };
                archive.push(row);
                return row;
            },
            findMany: async () => [...archive],
        },
        auditLog: { create: async ({ data }: any) => audit.push(data) },
        user: {
            findUnique: async ({ where, include }: any) => {
                const u = users.find((x) => (where.id ? x.id === where.id : x.email === where.email));
                if (!u) return null;
                if (include?.bookings) {
                    return { ...u, bookings: bookings.filter((b) => b.userId === u.id) };
                }
                return u;
            },
            findMany: async ({ where }: any) =>
                users.filter((u) => (where?.schoolId ? u.schoolId === where.schoolId : true)),
            update: async ({ where, data }: any) => {
                const u = byId(users, where.id);
                Object.assign(u, data);
                return u;
            },
            updateMany: async ({ where, data }: any) => {
                let count = 0;
                for (const u of users) {
                    if (u.schoolId === where.schoolId && (!where.role || u.role === where.role)) {
                        Object.assign(u, data);
                        count += 1;
                    }
                }
                return { count };
            },
            delete: async ({ where }: any) => {
                const i = users.findIndex((u) => u.id === where.id);
                const [removed] = users.splice(i, 1);
                // Cascade: the user's bookings go with them.
                for (let j = bookings.length - 1; j >= 0; j -= 1) {
                    if (bookings[j].userId === where.id) bookings.splice(j, 1);
                }
                return removed;
            },
        },
        school: {
            findUnique: async ({ where }: any) => byId(schools, where.id),
            delete: async ({ where }: any) => {
                const i = schools.findIndex((s) => s.id === where.id);
                return schools.splice(i, 1)[0];
            },
        },
        schoolRequest: {
            update: async ({ where, data }: any) => {
                const r = byId(schoolRequests, where.id);
                Object.assign(r, data);
                return r;
            },
        },
        schoolSlotAssignment: {
            deleteMany: async ({ where }: any) => {
                let count = 0;
                for (let i = assignments.length - 1; i >= 0; i -= 1) {
                    if (assignments[i].schoolId === where.schoolId) {
                        assignments.splice(i, 1);
                        count += 1;
                    }
                }
                return { count };
            },
        },
        partnerRequest: {
            findUnique: async ({ where }: any) => byId(partnerRequests, where.id),
            delete: async ({ where }: any) => {
                const i = partnerRequests.findIndex((p) => p.id === where.id);
                return partnerRequests.splice(i, 1)[0];
            },
        },
        booking: {
            count: async ({ where }: any) =>
                bookings.filter(
                    (b) => b.slotId === where.slotId && where.status.in.includes(b.status),
                ).length,
        },
        examSlot: {
            update: async ({ where, data }: any) => {
                const s = byId(slots, where.id);
                Object.assign(s, data);
                return s;
            },
        },
    };

    const prisma: any = {
        ...tx,
        // The service's user.findUnique for schools/partners uses include shapes;
        // reuse the same handlers for the non-transaction reads.
        $transaction: async (fn: any) => fn(tx),
    };
    // findUnique on the top-level prisma needs the include handling too.
    prisma.school.findUnique = async ({ where, include }: any) => {
        const s = byId(schools, where.id);
        if (!s) return null;
        const result: any = { ...s };
        if (include?.accessRequest) {
            result.accessRequest = schoolRequests.find((r) => r.schoolId === s.id) ?? null;
        }
        if (include?.slotAssignments) {
            result.slotAssignments = assignments.filter((a) => a.schoolId === s.id);
        }
        if (include?._count) {
            result._count = { users: users.filter((u) => u.schoolId === s.id).length };
        }
        return result;
    };
    prisma.user.findUnique = tx.user.findUnique;

    return { prisma, users, schools, schoolRequests, partnerRequests, bookings, slots, assignments, archive, audit };
}

const ADMIN = { id: 'admin-1', email: 'admin@bio.test' };

function setup() {
    const db = createFakeDb();
    return { ...db, service: new AdminManagementService(db.prisma) };
}

describe('deleteUser', () => {
    it('archives the student, then removes them', async () => {
        const { service, users, archive } = setup();
        users.push({ id: 'u1', firstName: 'Aarav', lastName: 'S', email: 'a@x.test', role: 'STUDENT' });

        await service.deleteUser('u1', ADMIN, 'test cleanup');

        expect(users.find((u) => u.id === 'u1')).toBeUndefined();
        expect(archive).toHaveLength(1);
        expect(archive[0]).toMatchObject({
            entityType: 'STUDENT',
            email: 'a@x.test',
            reason: 'test cleanup',
            deletedBy: 'admin-1',
        });
        // The full row is snapshotted for recovery.
        expect(archive[0].snapshot.email).toBe('a@x.test');
    });

    it('recomputes ExamSlot.booked from surviving bookings after the cascade', async () => {
        const { service, users, bookings, slots } = setup();
        slots.push({ id: 'slot-1', capacity: 10, booked: 2 });
        users.push({ id: 'u1', firstName: 'A', lastName: 'B', email: 'a@x.test', role: 'STUDENT' });
        users.push({ id: 'u2', firstName: 'C', lastName: 'D', email: 'c@x.test', role: 'STUDENT' });
        bookings.push({ id: 'b1', userId: 'u1', slotId: 'slot-1', status: 'CONFIRMED' });
        bookings.push({ id: 'b2', userId: 'u2', slotId: 'slot-1', status: 'CONFIRMED' });

        const result = await service.deleteUser('u1', ADMIN);

        // u1's booking is gone; one active booking remains, so booked === 1.
        expect(slots[0].booked).toBe(1);
        expect(result.recomputedSlots).toBe(1);
    });

    it('throws for an unknown user', async () => {
        const { service } = setup();
        await expect(service.deleteUser('nope', ADMIN)).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe('deleteSchool', () => {
    it('detaches students rather than deleting them, and removes the coordinator', async () => {
        const { service, users, schools, schoolRequests, assignments, archive } = setup();
        schools.push({ id: 's1', name: 'DPS', code: 'SCH-AAA' });
        schoolRequests.push({
            id: 'req1',
            schoolId: 's1',
            coordinatorUserId: 'coord1',
            coordinatorEmail: 'coord@x.test',
            coordinatorPhone: '+91',
        });
        users.push({ id: 'coord1', firstName: 'Co', lastName: 'Ord', email: 'coord@x.test', role: 'SCHOOL', schoolId: 's1' });
        users.push({ id: 'stu1', firstName: 'S', lastName: 'One', email: 's1@x.test', role: 'STUDENT', schoolId: 's1' });
        users.push({ id: 'stu2', firstName: 'S', lastName: 'Two', email: 's2@x.test', role: 'STUDENT', schoolId: 's1' });
        assignments.push({ id: 'a1', schoolId: 's1' });

        const result = await service.deleteSchool('s1', ADMIN, 'closed');

        expect(schools.find((s) => s.id === 's1')).toBeUndefined();
        // Students survive, detached.
        expect(users.find((u) => u.id === 'stu1')?.schoolId).toBeNull();
        expect(users.find((u) => u.id === 'stu2')?.schoolId).toBeNull();
        // Coordinator is gone.
        expect(users.find((u) => u.id === 'coord1')).toBeUndefined();
        // Assignments gone; request detached.
        expect(assignments).toHaveLength(0);
        expect(schoolRequests[0].schoolId).toBeNull();
        expect(result.studentsDetached).toBe(2);
        expect(archive[0]).toMatchObject({ entityType: 'SCHOOL', email: 'coord@x.test' });
    });
});

describe('deletePartner', () => {
    it('archives contact details then removes the request', async () => {
        const { service, partnerRequests, archive } = setup();
        partnerRequests.push({
            id: 'p1',
            orgName: 'Acme',
            email: 'p@acme.test',
            phone: '+9199',
            partnerId: 'engine-1',
        });

        const result = await service.deletePartner('p1', ADMIN);

        expect(partnerRequests).toHaveLength(0);
        expect(archive[0]).toMatchObject({
            entityType: 'PARTNER',
            name: 'Acme',
            email: 'p@acme.test',
            phone: '+9199',
        });
        // The engine id is surfaced so a follow-up cleanup can target it.
        expect(result.enginePartnerId).toBe('engine-1');
    });
});

describe('updateUser', () => {
    it('rejects an email already taken by someone else', async () => {
        const { service, users } = setup();
        users.push({ id: 'u1', email: 'a@x.test', firstName: 'A', lastName: 'B', role: 'STUDENT' });
        users.push({ id: 'u2', email: 'taken@x.test', firstName: 'C', lastName: 'D', role: 'STUDENT' });

        await expect(
            service.updateUser('u1', { email: 'taken@x.test' }, ADMIN),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it('applies edits and audits them', async () => {
        const { service, users, audit } = setup();
        users.push({ id: 'u1', email: 'a@x.test', firstName: 'A', lastName: 'B', role: 'STUDENT', classBand: 6, isActive: true });

        await service.updateUser('u1', { classBand: 9, isActive: false }, ADMIN);

        const u = users.find((x) => x.id === 'u1');
        expect(u.classBand).toBe(9);
        expect(u.isActive).toBe(false);
        expect(audit.some((a) => a.action === 'admin.user.updated')).toBe(true);
    });
});
