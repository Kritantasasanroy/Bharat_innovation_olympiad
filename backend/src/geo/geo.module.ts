import { Module } from '@nestjs/common';
import { GeoController } from './geo.controller';
import { PincodeService } from './pincode.service';

@Module({
    controllers: [GeoController],
    // The default `fetchImpl` parameter only applies when Nest is not resolving
    // the constructor, so bind it explicitly.
    providers: [{ provide: PincodeService, useFactory: () => new PincodeService(fetch) }],
    exports: [PincodeService],
})
export class GeoModule {}
