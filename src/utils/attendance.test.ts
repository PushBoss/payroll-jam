import { describe, expect, it } from 'vitest';
import {
  decodeClockInPayload,
  encodeClockInPayload,
  getCompanyLocations,
  normalizeAttendancePassCode,
} from './attendance';
import { CompanySettings } from '../core/types';

const company = {
  id: 'company-123',
  name: 'Test Co',
  email: 'test@example.com',
  trn: '',
  address: '',
  phone: '',
  bankName: '',
  accountNumber: '',
  locations: [
    {
      id: 'location-1',
      name: 'Main Branch',
      latitude: 18,
      longitude: -76,
      geofenceRadiusMeters: 100,
    },
    {
      id: 'location-2',
      name: 'Warehouse',
      latitude: 18.1,
      longitude: -76.1,
      geofenceRadiusMeters: 150,
    },
  ],
} as CompanySettings;

describe('attendance helpers', () => {
  it('round-trips a signed QR payload', () => {
    const encoded = encodeClockInPayload('company-123', 'location-1');
    expect(decodeClockInPayload(encoded)).toMatchObject({
      company_id: 'company-123',
      location_id: 'location-1',
    });
  });

  it('normalizes pass codes before sending them to the server', () => {
    expect(normalizeAttendancePassCode(' 12-34 56 ')).toBe('123456');
    expect(normalizeAttendancePassCode('123456789')).toBe('123456');
    expect(normalizeAttendancePassCode('abc')).toBe('');
  });

  it('provides a fallback branch when no locations are configured', () => {
    const locations = getCompanyLocations({ ...company, locations: undefined });
    expect(locations).toHaveLength(1);
    expect(locations[0].name).toBe('Main Branch');
  });
});
