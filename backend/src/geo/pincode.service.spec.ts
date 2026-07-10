import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PincodeService } from './pincode.service';

const indiaPost = (district: string, state: string) => ({
    ok: true,
    json: async () => [{ Status: 'Success', PostOffice: [{ District: district, State: state }] }],
});

describe('PincodeService', () => {
    it('resolves a pincode to its city and state', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(indiaPost('Nagpur', 'Maharashtra'));
        const service = new PincodeService(fetchImpl as never);

        await expect(service.lookup('441108')).resolves.toEqual({
            pincode: '441108',
            city: 'Nagpur',
            state: 'Maharashtra',
        });
    });

    it('rejects a malformed pincode before making a request', async () => {
        const fetchImpl = jest.fn();
        const service = new PincodeService(fetchImpl as never);

        await expect(service.lookup('4411')).rejects.toBeInstanceOf(BadRequestException);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('caches a hit — pincodes do not change', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(indiaPost('Nagpur', 'Maharashtra'));
        const service = new PincodeService(fetchImpl as never);

        await service.lookup('441108');
        await service.lookup(' 441108 ');

        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('does not cache a failure, so an outage cannot poison later lookups', async () => {
        const fetchImpl = jest
            .fn()
            .mockResolvedValueOnce({ ok: false })
            .mockResolvedValueOnce(indiaPost('Nagpur', 'Maharashtra'));
        const service = new PincodeService(fetchImpl as never);

        await expect(service.lookup('441108')).rejects.toBeInstanceOf(NotFoundException);
        await expect(service.lookup('441108')).resolves.toMatchObject({ city: 'Nagpur' });
    });

    it('reports an unknown pincode as not found rather than crashing', async () => {
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => [{ Status: 'Error', PostOffice: null }],
        });
        const service = new PincodeService(fetchImpl as never);

        await expect(service.lookup('999999')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('survives an upstream that is unreachable, slow, or returns nonsense', async () => {
        for (const impl of [
            jest.fn().mockRejectedValue(new Error('ECONNRESET')),
            jest.fn().mockResolvedValue({ ok: true, json: async () => 'not json at all' }),
            jest.fn().mockResolvedValue({ ok: true, json: async () => [{}] }),
        ]) {
            const service = new PincodeService(impl as never);
            await expect(service.lookup('441108')).rejects.toBeInstanceOf(NotFoundException);
        }
    });
});
