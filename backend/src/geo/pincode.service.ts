import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { isValidPincode } from '../school/school-directory.helpers';

export interface PincodeLocation {
    pincode: string;
    city: string;
    state: string;
}

/** India Post's public directory. No key, no quota published, occasionally slow. */
const LOOKUP_URL = (pincode: string) => `https://api.postalpincode.in/pincode/${pincode}`;
const TIMEOUT_MS = 6_000;

interface PostOffice {
    District?: string;
    State?: string;
    Block?: string;
    Name?: string;
}

interface IndiaPostResponse {
    Status?: string;
    PostOffice?: PostOffice[] | null;
}

/**
 * Resolves a pincode to a city and state, so neither a school nor a student has
 * to type them (and so two people entering the same school agree on its city).
 *
 * Pincodes never change, so a successful lookup is cached for the life of the
 * process. Failures are not cached: an upstream outage must not poison the
 * cache for every later request.
 */
@Injectable()
export class PincodeService {
    private readonly logger = new Logger(PincodeService.name);
    private readonly cache = new Map<string, PincodeLocation>();

    constructor(private readonly fetchImpl: typeof fetch = fetch) {}

    async lookup(raw: string): Promise<PincodeLocation> {
        const pincode = raw.trim();
        if (!isValidPincode(pincode)) {
            throw new BadRequestException('A pincode is six digits, e.g. 441108.');
        }

        const cached = this.cache.get(pincode);
        if (cached) return cached;

        const body = await this.fetchUpstream(pincode);
        const office = body?.PostOffice?.[0];
        if (body?.Status !== 'Success' || !office?.District || !office?.State) {
            throw new NotFoundException(`No location found for pincode ${pincode}.`);
        }

        const location: PincodeLocation = {
            pincode,
            city: office.District,
            state: office.State,
        };
        this.cache.set(pincode, location);
        return location;
    }

    private async fetchUpstream(pincode: string): Promise<IndiaPostResponse | null> {
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
        try {
            const response = await this.fetchImpl(LOOKUP_URL(pincode), { signal: abort.signal });
            if (!response.ok) return null;
            const json = (await response.json()) as IndiaPostResponse[] | IndiaPostResponse;
            return Array.isArray(json) ? (json[0] ?? null) : json;
        } catch (error) {
            // A slow or unreachable directory must not become a 500 — the caller
            // falls back to typing the city and state by hand.
            this.logger.warn(`Pincode lookup failed for ${pincode}: ${(error as Error).message}`);
            return null;
        } finally {
            clearTimeout(timer);
        }
    }
}
