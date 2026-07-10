import { Controller, Get, Param } from '@nestjs/common';
import { PincodeService } from './pincode.service';

@Controller('geo')
export class GeoController {
    constructor(private pincodeService: PincodeService) {}

    /**
     * PUBLIC — a school request and a student's "add my school" form both fill
     * city and state from this, so the two never disagree about where a school is.
     * Proxied through the backend rather than called from the browser: it keeps
     * the upstream off our CORS surface and lets one cache serve every visitor.
     */
    @Get('pincode/:pincode')
    lookup(@Param('pincode') pincode: string) {
        return this.pincodeService.lookup(pincode);
    }
}
