import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AddSchoolDto } from './dto/school.dto';
import { SchoolDirectoryService } from './school-directory.service';

/**
 * PUBLIC. A student is choosing their school mid-registration and has no token
 * yet, so every route here is unauthenticated. Nothing exposes a coordinator's
 * contact details — only what a student needs to recognise their own school.
 */
@Controller('schools')
export class SchoolDirectoryController {
    constructor(private directory: SchoolDirectoryService) {}

    /** Search by name, city or pincode. No query lists onboarded schools first. */
    @Get()
    search(@Query('q') q?: string) {
        return this.directory.search(q);
    }

    /** Resolve the code from a school's handover card; forgiving about how it was typed. */
    @Get('by-code/:code')
    byCode(@Param('code') code: string) {
        return this.directory.findByCode(code);
    }

    /** "My school isn't listed" — add it by name + pincode. Never creates a duplicate. */
    @Post('add')
    add(@Body() dto: AddSchoolDto) {
        return this.directory.addToDirectory(dto);
    }
}
