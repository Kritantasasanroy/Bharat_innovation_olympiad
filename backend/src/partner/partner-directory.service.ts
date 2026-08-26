import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Who a school's partner is, and what a school is allowed to know about them.
 *
 * Every school has a partner. Most are onboarded *by* one (`School.partnerId`);
 * the rest — schools that self-applied, or that a student added to the directory
 * — fall back to the **house partner**, which is Lemon Ideas operating the
 * olympiad directly. That fallback is what makes "if no partner, default to
 * Bharat Innovation Olympiad — Partner access" true without having to backfill a
 * `partnerId` onto every existing school row.
 *
 * The partner's **access token is never returned here.** It is the partner's
 * sign-in credential; a school has no business holding it. Schools get contact
 * details and the portal URL, nothing more.
 */

/** The house partner, used for any school with no partner of its own. */
export const HOUSE_PARTNER = {
    id: 'e95c5ab7-9edc-438e-a846-9f770ebbce11',
    orgName: 'Lemon Ideas',
    contactPerson: 'Abhishek - Lemon Ideas',
    email: 'abhishek@lemonideas.in',
    phone: '9823469422',
    /** What a school sees as the relationship, rather than a bare org name. */
    label: 'Bharat Innovation Olympiad — Partner access',
} as const;

export interface PartnerDetails {
    partnerId: string;
    orgName: string;
    contactPerson: string;
    email: string;
    phone: string;
    portalUrl: string;
    /** True when this is the house partner rather than one that onboarded the school. */
    isDefault: boolean;
    label: string;
}

@Injectable()
export class PartnerDirectoryService {
    constructor(
        private prisma: PrismaService,
        private config: ConfigService,
    ) {}

    /** Overridable per environment, so a staging deploy is not pointed at the live partner. */
    get defaultPartnerId(): string {
        return this.config.get<string>('DEFAULT_PARTNER_ID') || HOUSE_PARTNER.id;
    }

    private get portalUrl(): string {
        return (
            this.config.get<string>('PARTNER_APP_URL') || 'https://partner.innovationolympiad.in'
        );
    }

    /**
     * Resolves one partner's public-facing details.
     *
     * Details are read from `PartnerRequest` (the backend owns partner identity —
     * see DOCUMENTATION.md §0.18), falling back to the mirrored engine `Partner`
     * row, and finally to the house-partner constant. The last fallback matters:
     * a school portal must always be able to render a partner card, even on an
     * environment where the partner rows have not been seeded.
     */
    async detailsFor(partnerId: string, isDefault: boolean): Promise<PartnerDetails> {
        const request = await this.prisma.partnerRequest.findFirst({
            where: { partnerId },
            select: { orgName: true, contactPerson: true, email: true, phone: true },
        });

        const engine = request
            ? null
            : await this.prisma.partner.findUnique({
                  where: { id: partnerId },
                  select: { orgName: true, contactPerson: true, email: true, phone: true },
              });

        const source =
            request ??
            engine ??
            (isDefault || partnerId === this.defaultPartnerId
                ? {
                      orgName: HOUSE_PARTNER.orgName,
                      contactPerson: HOUSE_PARTNER.contactPerson,
                      email: HOUSE_PARTNER.email,
                      phone: HOUSE_PARTNER.phone,
                  }
                : null);

        if (!source) {
            // A school pointed at a partner that no longer exists. Rather than 404
            // the whole school dashboard, show the house partner — the school is
            // still, in fact, running under the olympiad.
            return this.detailsFor(this.defaultPartnerId, true);
        }

        return {
            partnerId,
            orgName: source.orgName,
            contactPerson: source.contactPerson,
            email: source.email,
            phone: source.phone,
            portalUrl: this.portalUrl,
            isDefault,
            label: isDefault ? HOUSE_PARTNER.label : source.orgName,
        };
    }

    /** The partner a school reports to — its own, or the house partner. */
    async forSchool(schoolId: string): Promise<PartnerDetails> {
        const school = await this.prisma.school.findUnique({
            where: { id: schoolId },
            select: { partnerId: true },
        });

        const partnerId = school?.partnerId ?? null;
        return this.detailsFor(partnerId ?? this.defaultPartnerId, partnerId === null);
    }

    /**
     * The schools a partner may see. A partner sees the schools explicitly
     * assigned to it — **the house partner additionally sees every unassigned
     * school**, because those schools are precisely the ones it is running.
     */
    async schoolsForPartner(partnerId: string) {
        const isHouse = partnerId === this.defaultPartnerId;

        return this.prisma.school.findMany({
            where: isHouse
                ? { OR: [{ partnerId }, { partnerId: null }] }
                : { partnerId },
            select: {
                id: true,
                name: true,
                code: true,
                city: true,
                state: true,
                pincode: true,
                board: true,
                onboardedAt: true,
                partnerId: true,
                _count: { select: { users: true } },
            },
            orderBy: { name: 'asc' },
        });
    }

    async schoolIdsForPartner(partnerId: string): Promise<string[]> {
        const schools = await this.schoolsForPartner(partnerId);
        return schools.map((s) => s.id);
    }
}
