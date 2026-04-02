
import { Employee, PayFrequency, Role, PayType, Department, Designation, Asset, AssetType, AssetStatus, PerformanceReview } from '../core/types';

export const INITIAL_DEPARTMENTS: Department[] = [
  { id: 'dept-ops', name: 'Operations' },
  { id: 'dept-ath', name: 'Athletics' },
  { id: 'dept-creat', name: 'Creative' },
  { id: 'dept-hr', name: 'Human Resources' },
  { id: 'dept-fin', name: 'Finance' },
  { id: 'dept-it', name: 'IT' }
];

export const INITIAL_DESIGNATIONS: Designation[] = [
  { id: 'desig-mgr', title: 'Track Operations Manager', departmentId: 'dept-ops' },
  { id: 'desig-sprinter', title: 'Senior Sprinter', departmentId: 'dept-ath' },
  { id: 'desig-eng', title: 'Sound Engineer', departmentId: 'dept-creat' },
  { id: 'desig-hr-mgr', title: 'HR Manager', departmentId: 'dept-hr' },
  { id: 'desig-fin-analyst', title: 'Financial Analyst', departmentId: 'dept-fin' },
  { id: 'desig-dev', title: 'Software Developer', departmentId: 'dept-it' }
];

// --- Seed Data ---
export const INITIAL_EMPLOYEES: Employee[] = [
  {
    id: 'EMP-001',
    firstName: 'Usain',
    lastName: 'Bolt',
    email: 'lightning@track.jm',
    trn: '123-456-789',
    nis: 'A123456',
    grossSalary: 500000, // Monthly Fixed
    payType: PayType.SALARIED,
    payFrequency: PayFrequency.MONTHLY,
    role: Role.MANAGER,
    status: 'ACTIVE',
    hireDate: '2020-01-15',
    jobTitle: 'Track Operations Manager',
    department: 'dept-ops',
    phone: '(876) 555-9900',
    address: '100 Main Street, Kingston 5',
    emergencyContact: 'Manager Bolt - (876) 555-1234'
  },
  {
    id: 'EMP-002',
    firstName: 'Shelly-Ann',
    lastName: 'Fraser',
    email: 'shelly@track.jm',
    trn: '987-654-321',
    nis: 'B987654',
    grossSalary: 350000, // Monthly Fixed
    payType: PayType.SALARIED,
    payFrequency: PayFrequency.MONTHLY,
    role: Role.EMPLOYEE,
    status: 'ACTIVE',
    hireDate: '2021-03-10',
    jobTitle: 'Senior Sprinter',
    department: 'dept-ath',
    phone: '(876) 555-8800',
    address: '45 Hope Road, Kingston 6',
    emergencyContact: 'Coach Fraser - (876) 555-5678'
  },
  {
    id: 'EMP-003',
    firstName: 'Bob',
    lastName: 'Marley',
    email: 'bob@music.jm',
    trn: '456-789-123',
    nis: 'C456789',
    grossSalary: 0, // Hourly worker base
    hourlyRate: 1500, // JMD per hour
    payType: PayType.HOURLY,
    payFrequency: PayFrequency.WEEKLY,
    role: Role.EMPLOYEE,
    status: 'ACTIVE',
    hireDate: '2023-06-01',
    jobTitle: 'Sound Engineer',
    department: 'dept-creat',
    phone: '(876) 555-7700',
    address: '56 Trench Town, Kingston',
    emergencyContact: 'Rita M. - (876) 555-9012'
  }
];

export const INITIAL_ASSETS: Asset[] = [
  {
    id: 'ast-001',
    name: 'MacBook Pro 14"',
    type: AssetType.LAPTOP,
    serialNumber: 'C02Y...',
    employeeId: 'EMP-001',
    assignedDate: '2024-01-10',
    status: AssetStatus.ASSIGNED,
    value: 300000
  },
  {
    id: 'ast-002',
    name: 'Company Vehicle - Toyota Axio',
    type: AssetType.VEHICLE,
    serialNumber: 'ABC-1234',
    employeeId: 'EMP-001',
    assignedDate: '2023-05-20',
    status: AssetStatus.ASSIGNED,
    value: 2500000
  }
];

export const INITIAL_REVIEWS: PerformanceReview[] = [
  {
    id: 'rev-001',
    employeeId: 'EMP-001',
    reviewerName: 'Board of Directors',
    date: '2024-12-15',
    rating: 5,
    summary: 'Excellent year managing the track operations. Revenue up by 15%.',
    goals: ['Expand to Montego Bay', 'Reduce overhead by 5%']
  }
];
