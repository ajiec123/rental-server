import { UserAccount, RolePermissions } from '../types';

// Pre-computed SHA-256 hashes of the seed PINs (see pinCrypto.ts).
// Format: 'sha256:<hex>'. Generated via:
//   hashPin('681232')  for Owner (username: owner-rental)
//   hashPin('123456')  for Rian   (username: rian)
//   hashPin('234567')  for Maya   (username: maya)
//   hashPin('345678')  for Dimas  (username: dimas)
//
// IMPORTANT: Setiap kali ada perubahan PIN seed, hash harus dihitung ulang
// pakai hashPin() di browser console.

export const DEFAULT_OWNER_ACCOUNT: UserAccount = {
  id: 'usr-owner-01',
  username: 'owner-rental',
  name: 'Super Administrator',
  role: 'Owner',
  email: 'owner@cmdcenter.app',
  pin: 'sha256:97fa8839f2a57048b7a3efafeb665c503cb34ba00b72ee1331f7fcafc943fe0f',
  createdAt: 0, // seed (built-in)
};

export const INITIAL_EMPLOYEE_ACCOUNTS: UserAccount[] = [
  {
    id: 'usr-karyawan-01',
    username: 'rian',
    name: 'Rian Hidayat (Kasir Pagi)',
    role: 'Karyawan',
    email: 'rian@cmdcenter.app',
    // hash('123456') — akan di-migrate via PIN Migration effect jika localStorage masih versi lama
    pin: 'sha256:4ff8aeaa07debcdf02912a700a4861838a899fa6dc8da6a243617a2b1cf3fc1e',
    createdAt: 0,
  },
  {
    id: 'usr-karyawan-02',
    username: 'maya',
    name: 'Maya Lin (Kasir Malam)',
    role: 'Karyawan',
    email: 'maya@cmdcenter.app',
    // hash('234567')
    pin: 'sha256:7fbcccd9e1595fea71eadbebe03902b9a4a8dbe848706f18d0ead355274b157b',
    createdAt: 0,
  },
  {
    id: 'usr-karyawan-03',
    username: 'dimas',
    name: 'Dimas Pratama (Teknisi & Shift)',
    role: 'Karyawan',
    email: 'dimas@cmdcenter.app',
    // hash('345678')
    pin: 'sha256:fb0b6cd0bca47544db6485eeac460dd7a7d991295cf9e9debf0a33f8a400454a',
    createdAt: 0,
  },
];

export const DEFAULT_FULL_PERMISSIONS: RolePermissions = {
  dashboard: true,
  units: true,
  history: true,
  users: true,
  settings: true,
  absensi: true,
  new_session: true,
};

export const DEFAULT_CASHIER_PERMISSIONS: RolePermissions = {
  dashboard: false,
  units: true,
  history: true,
  users: true,
  settings: false,
  absensi: true, // semua karyawan wajib punya akses absensi
  new_session: true,
};

export const INITIAL_USER_PERMISSIONS: Record<string, RolePermissions> = {
  'usr-karyawan-01': { ...DEFAULT_CASHIER_PERMISSIONS }, // Rian: Kasir standar
  'usr-karyawan-02': { ...DEFAULT_FULL_PERMISSIONS, settings: false }, // Maya: Akses luas tanpa settings
  'usr-karyawan-03': { ...DEFAULT_CASHIER_PERMISSIONS, dashboard: true }, // Dimas: Kasir + Dashboard
};

