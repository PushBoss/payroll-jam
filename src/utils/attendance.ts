import { BranchLocation, CompanySettings, Employee, User, WeeklyTimesheet } from '../core/types';

export interface ClockInPayload {
  company_id: string;
  location_id: string;
  issued_at: string;
  expires_at: string;
  signature: string;
}

const SIGNING_CONTEXT = 'payroll-jam-qr-attendance';
const CLOCK_IN_QR_ISSUED_AT = '2026-01-01T00:00:00.000Z';
const CLOCK_IN_QR_EXPIRES_AT = '2099-12-31T23:59:59.999Z';
const DEFAULT_KINGSTON_LOCATION = {
  latitude: 18.0179,
  longitude: -76.8099,
};

const encodeBase64 = (value: string) => btoa(unescape(encodeURIComponent(value)));
const decodeBase64 = (value: string) => decodeURIComponent(escape(atob(value)));

export const createClockInSignature = (companyId: string, locationId: string, issuedAt: string, expiresAt: string) =>
  encodeBase64(`${companyId}:${locationId}:${issuedAt}:${expiresAt}:${SIGNING_CONTEXT}`);

export const normalizeAttendancePassCode = (passCode: string) => passCode.replace(/\D/g, '').slice(0, 6);

export const encodeClockInPayload = (companyId: string, locationId: string) => {
  const issuedAt = CLOCK_IN_QR_ISSUED_AT;
  const expiresAt = CLOCK_IN_QR_EXPIRES_AT;
  const payload: ClockInPayload = {
    company_id: companyId,
    location_id: locationId,
    issued_at: issuedAt,
    expires_at: expiresAt,
    signature: createClockInSignature(companyId, locationId, issuedAt, expiresAt),
  };

  return encodeBase64(JSON.stringify(payload));
};

export const decodeClockInPayload = (encodedPayload: string | null): ClockInPayload | null => {
  if (!encodedPayload) return null;

  try {
    const payload = JSON.parse(decodeBase64(encodedPayload)) as ClockInPayload;
    const expected = createClockInSignature(payload.company_id, payload.location_id, payload.issued_at, payload.expires_at);
    if (payload.signature !== expected) return null;
    const expiresAt = new Date(payload.expires_at).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
};

export const getCompanyLocations = (companyData?: CompanySettings): BranchLocation[] => {
  if (companyData?.locations?.length) return companyData.locations;

  return [{
    id: `${companyData?.id || 'company'}-main`,
    name: 'Main Branch',
    latitude: DEFAULT_KINGSTON_LOCATION.latitude,
    longitude: DEFAULT_KINGSTON_LOCATION.longitude,
    geofenceRadiusMeters: 100,
  }];
};

export const calculateHaversineDistanceMeters = (
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
) => {
  const earthRadiusMeters = 6371000;
  const toRadians = (value: number) => value * Math.PI / 180;
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
};

const getWeekBounds = (date: Date) => {
  const monday = new Date(date);
  const dayOfWeek = monday.getDay();
  monday.setDate(monday.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    weekStartDate: monday.toISOString().split('T')[0],
    weekEndDate: sunday.toISOString().split('T')[0],
  };
};

export const createAutoQrTimesheet = (
  user: User,
  employee: Employee | undefined,
  companyId: string,
  location: BranchLocation
): WeeklyTimesheet => {
  const now = new Date();
  const { weekStartDate, weekEndDate } = getWeekBounds(now);
  const employeeName = employee ? `${employee.firstName} ${employee.lastName}` : user.name;

  return {
    id: `TS-QR-${now.getTime()}`,
    employeeId: employee?.id || user.id,
    employeeName,
    companyId,
    locationId: location.id,
    locationName: location.name,
    source: 'AUTO_QR',
    clockInAt: now.toISOString(),
    weekStartDate,
    weekEndDate,
    status: 'SUBMITTED',
    totalRegularHours: 0,
    totalOvertimeHours: 0,
    entries: [{
      id: `ENTRY-QR-${now.getTime()}`,
      date: now.toISOString().split('T')[0],
      startTime: now.toTimeString().slice(0, 5),
      endTime: '',
      breakDuration: 0,
      totalHours: 0,
      isOvertime: false,
    }],
  };
};
