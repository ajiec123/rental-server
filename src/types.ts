export type ConsoleType = string;

export type PaymentMethod = 'QRIS' | 'Cash' | 'Debit' | 'E-Wallet';

export type StationStatus = 'available' | 'occupied' | 'warning' | 'maintenance';

export type TabType = 'dashboard' | 'units' | 'history' | 'users' | 'settings' | 'absensi';

export type UserRole = 'Owner' | 'Karyawan';

export type FeaturePermission =
  | 'dashboard'
  | 'units'
  | 'history'
  | 'users'
  | 'settings'
  | 'absensi'
  | 'new_session';

export interface RolePermissions {
  dashboard: boolean;
  units: boolean;
  history: boolean;
  users: boolean;
  settings: boolean;
  absensi: boolean;
  new_session: boolean;
}

export interface UserAccount {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  email?: string;
  pin?: string;
  createdAt?: number;
  createdBy?: string;
}

// Rekam absensi satu karyawan pada satu hari kalender.
// attendanceMap[employeeId][dateKey 'YYYY-MM-DD'] = record.
export interface AttendanceRecord {
  clockIn: number;   // timestamp ms saat absen masuk
  clockOut?: number; // timestamp ms saat absen keluar (undefined = masih bekerja)
}

// Statistik gaji satu karyawan dalam satu periode (tgl 25 → tgl 24 bulan depan).
export interface AttendanceStats {
  daysPresent: number;         // jumlah hari Hadir
  totalRevenueHandled: number; // total revenue dari transaksi
  mealAllowance: number;       // Rp 10.000 × daysPresent
  profitShare: number;         // 25% × totalRevenueHandled
  totalSalary: number;         // mealAllowance + profitShare
}

export interface ActiveSession {
  sessionId: string;
  transactionId?: string;
  customerName: string;
  customerPhone?: string;
  vipId?: string; // Linked VIP member, if recognized at start
  startTime: number; // timestamp ms
  durationMinutes: number;
  endTime: number; // timestamp ms
  isMainBebas?: boolean;
  paymentMethod: PaymentMethod;
  paymentStatus: 'Lunas' | 'Belum Lunas' | 'Paid' | 'Pending';
  amount: number;
  gamePlaying?: string;
  cashierName: string;
  notes?: string;
}

export interface GamingStation {
  id: string;
  name: string; // e.g. "Station 04"
  consoleType: ConsoleType;
  ratePerHour: number; // e.g. 20000
  status: StationStatus;
  currentSession?: ActiveSession;
  totalSessionsToday: number;
  totalRevenueToday: number;
}

export interface Transaction {
  id: string;
  stationId: string;
  stationName: string;
  durationMinutes: number;
  durationLabel: string; // e.g. "2 Jam"
  paymentMethod: PaymentMethod;
  paymentStatus?: 'Lunas' | 'Belum Lunas' | 'Paid' | 'Pending';
  amount: number;
  formattedAmount: string; // e.g. "Rp 40k" or "Rp 40.000"
  timeLabel: string; // e.g. "14:30"
  dateLabel: string; // e.g. "2026-08-08"
  timestamp: number;
  cashierName: string;
  customerName: string;
  consoleType: ConsoleType;
  receiptNumber: string;
}

export interface StaffUser {
  id: string;
  name: string;
  role: 'Manager' | 'Head Cashier' | 'Station Specialist' | 'Tech Admin';
  status: 'Hadir' | 'Tidak Hadir';
  clockInTime?: number;          // timestamp ms absen masuk hari ini
  clockOutTime?: number;         // timestamp ms absen keluar hari ini
  transactionsTodayCount: number;
  revenueHandled: number;        // di-reset setiap periode gaji (tgl 25)
}

export interface VIPMember {
  id: string;
  name: string;
  phone: string;
  tier: 'Cyber Elite' | 'Platinum' | 'Gold' | 'Standard';
  playHoursTotal: number;
  loyaltyPoints: number;
  totalSpent: number;
}
