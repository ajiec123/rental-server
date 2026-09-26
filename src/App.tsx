import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useWebSocketTimer } from './hooks/useWebSocketTimer';
import {
  TabType,
  GamingStation,
  Transaction,
  StaffUser,
  VIPMember,
  PaymentMethod,
  UserAccount,
  RolePermissions,
  FeaturePermission,
  AttendanceRecord,
} from './types';
import {
  INITIAL_STATIONS,
  INITIAL_TRANSACTIONS,
  INITIAL_VIPS,
} from './data/mockData';
import {
  DEFAULT_OWNER_ACCOUNT,
  INITIAL_EMPLOYEE_ACCOUNTS,
  INITIAL_USER_PERMISSIONS,
  DEFAULT_CASHIER_PERMISSIONS,
} from './data/authData';
import { Header } from './components/Header';
import { BottomNavBar } from './components/BottomNavBar';
import { RevenueCard } from './components/RevenueCard';
import { OutstandingReceivableCard } from './components/OutstandingReceivableCard';
import { RecentTransactions } from './components/RecentTransactions';
import { StationCard } from './components/StationCard';
import { NewSessionModal } from './components/NewSessionModal';
import { ReceiptModal } from './components/ReceiptModal';
import { HistoryTab } from './components/HistoryTab';
import { UnitsTab } from './components/UnitsTab';
import { UsersTab } from './components/UsersTab';
import { SettingsTab } from './components/SettingsTab';
import { EndSessionModal } from './components/EndSessionModal';
import { SessionExpiredModal } from './components/SessionExpiredModal';
import { ExpiredSessionAlertBar } from './components/ExpiredSessionAlertBar';
import { AttendanceSelfCard } from './components/AttendanceSelfCard';
import { AttendancePage } from './components/AttendancePage';
import { MoveStationModal } from './components/MoveStationModal';
import { TVControlPanel } from './components/TVControlPanel';
import { LoginModal } from './components/LoginModal';
import { PermissionManagerModal } from './components/PermissionManagerModal';
import { ProfileSettingsModal } from './components/ProfileSettingsModal';
import {
  computeDailyRevenue,
  computeWeeklyRevenue,
  computeMonthlyRevenue,
  computeOutstandingRevenue,
} from './utils/revenueUtils';
import { StationTvPairing, resolveStationTvChannel, getTvChannelCandidates as getResolvedTvChannelCandidates } from './utils/tvPairing';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  // Stations source of truth: server (PGlite via WS broadcast). Local state
  // is a cache for fast UI render between server updates. Order of priority:
  //   1. localStorage (instant render on same device) — BUT superseded by
  //      server INIT_STATE the moment WS connects, so cross-device stays in sync.
  //   2. Server INIT_STATE (real source, broadcast to all clients).
  //   3. Empty array (placeholder while waiting for server). We deliberately
  //      do NOT fall back to INITIAL_STATIONS because that would override the
  //      server's true state (e.g. when Owner deleted stations, Browser B fresh
  //      install would still see INITIAL_STATIONS and overwrite server).
  //
  // NOTE: stations and transactions are NOT loaded from localStorage on mount
  // because stale cache from previous sessions would override the server's
  // current state (e.g. after Owner deleted all stations from DB). Server is
  // always source of truth; localStorage is no longer consulted on mount.
  const [stations, setStations] = useState<GamingStation[]>([]);

  // We still write stations/transactions to localStorage on every change for
  // crash-recovery inspection only — but we never *read* from it on mount.
  useEffect(() => {
    localStorage.setItem('cmdcenter_gaming_stations', JSON.stringify(stations));
  }, [stations]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [tvPairings, setTvPairings] = useState<StationTvPairing[]>([]);

  useEffect(() => {
    localStorage.setItem('cmdcenter_rental_transactions', JSON.stringify(transactions));
  }, [transactions]);

  // ===== Sistem Absensi Karyawan =====
  // attendanceMap[employeeId][dateKey 'YYYY-MM-DD'] = { clockIn, clockOut? }
  // Disimpan ke localStorage supaya rekam jejak tetap ada setelah refresh.
  const [attendanceMap, setAttendanceMap] = useState<
    Record<string, Record<string, AttendanceRecord>>
  >(() => {
    const saved = localStorage.getItem('cmdcenter_attendance_map');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return {};
  });

  useEffect(() => {
    localStorage.setItem(
      'cmdcenter_attendance_map',
      JSON.stringify(attendanceMap)
    );
  }, [attendanceMap]);

  // Helper format tanggal 'YYYY-MM-DD'
  const getDateKey = (ts: number): string => {
    const d = new Date(ts);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  // Absen Masuk — catat clockIn di hari ini. Toggle status jadi 'Hadir'.
  const handleClockIn = (employeeId: string) => {
    const now = Date.now();
    const dateKey = getDateKey(now);
    setAttendanceMap((prev) => {
      const current = prev[employeeId] || {};
      // Kalau sudah ada record hari ini & belum clock-out, jangan override
      if (current[dateKey] && !current[dateKey].clockOut) return prev;
      return {
        ...prev,
        [employeeId]: {
          ...current,
          [dateKey]: { clockIn: now },
        },
      };
    });
    updateStaffState(employeeId, { status: 'Hadir', clockInTime: now });
    triggerActionToast?.(
      `✅ Absen masuk tercatat untuk ${employeeId}`,
      'success'
    );
  };

  // Absen Keluar — catat clockOut di record hari ini. Status kembali 'Tidak Hadir'.
  const handleClockOut = (employeeId: string) => {
    const now = Date.now();
    const dateKey = getDateKey(now);
    setAttendanceMap((prev) => {
      const current = prev[employeeId] || {};
      const todayRec = current[dateKey];
      if (!todayRec || todayRec.clockOut) return prev;
      return {
        ...prev,
        [employeeId]: {
          ...current,
          [dateKey]: { ...todayRec, clockOut: now },
        },
      };
    });
    updateStaffState(employeeId, { status: 'Tidak Hadir', clockOutTime: now });
    triggerActionToast?.(
      `👋 Absen keluar tercatat untuk ${employeeId}`,
      'info'
    );
  };

  // ===== Auto-reset revenueHandled setiap tanggal 25 =====
  // Logika: jika hari ini tanggal 25 dan lastResetDate bukan bulan ini,
  // archive nilai lama ke cmdcenter_salary_archive lalu reset ke 0.
  useEffect(() => {
    const now = new Date();
    const today = now.getDate();
    const ymKey = `${now.getFullYear()}-${(now.getMonth() + 1)
      .toString()
      .padStart(2, '0')}`;
    const lastResetKey = localStorage.getItem('cmdcenter_last_payroll_reset');

    // Reset hanya tanggal 25 ATAU jika marker bulan ini belum ada (mis. app
    // baru dibuka setelah lewat tanggal 25 bulan sebelumnya & belum reset).
    const isPayrollDay = today >= 25;
    const needReset = isPayrollDay && lastResetKey !== ymKey;

    if (needReset) {
      // Arsipkan snapshot gaji bulan sebelumnya ke localStorage
      const archive = staffList.map((s) => ({
        employeeId: s.id,
        employeeName: s.name,
        role: s.role,
        revenueHandled: s.revenueHandled,
        daysPresent: Object.keys(attendanceMap[s.id] || {}).length,
        archivedAt: Date.now(),
        periodEnd: now.toISOString(),
      }));
      const existingArchive = JSON.parse(
        localStorage.getItem('cmdcenter_salary_archive') || '[]'
      );
      localStorage.setItem(
        'cmdcenter_salary_archive',
        JSON.stringify([...existingArchive, ...archive])
      );
      // Reset revenue di staffStateMap (Owner tidak ikut, hanya karyawan)
      setStaffStateMap((prev) => {
        const next = { ...prev };
        for (const id of Object.keys(next)) {
          // Skip reset untuk Owner
          if (id === DEFAULT_OWNER_ACCOUNT.id) continue;
          next[id] = {
            ...next[id],
            revenueHandled: 0,
            transactionsTodayCount: 0,
          };
        }
        return next;
      });
      setAttendanceMap({});
      localStorage.setItem('cmdcenter_last_payroll_reset', ymKey);
      triggerActionToast?.(
        '📊 Periode gaji baru dimulai (reset tanggal 25). Snapshot periode sebelumnya diarsipkan.',
        'info'
      );
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [vipList, setVipList] = useState<VIPMember[]>(() => {
    const saved = localStorage.getItem('cmdcenter_vip_list');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return INITIAL_VIPS;
  });

  useEffect(() => {
    localStorage.setItem('cmdcenter_vip_list', JSON.stringify(vipList));
  }, [vipList]);

  // Owner profile — bisa di-edit via ProfileSettingsModal, persisted ke localStorage.
  // Tanpa ini, perubahan PIN/nama Owner tidak akan berlaku setelah logout karena
  // DEFAULT_OWNER_ACCOUNT hard-coded di module.
  const [ownerProfile, setOwnerProfile] = useState<UserAccount>(() => {
    const saved = localStorage.getItem('cmdcenter_owner_profile');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return DEFAULT_OWNER_ACCOUNT;
  });

  useEffect(() => {
    localStorage.setItem(
      'cmdcenter_owner_profile',
      JSON.stringify(ownerProfile)
    );
  }, [ownerProfile]);

  // Auth & Roles state
  const [currentUser, setCurrentUser] = useState<UserAccount>(() => {
    const saved = localStorage.getItem('cmdcenter_current_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return DEFAULT_OWNER_ACCOUNT;
  });

  const [employeeAccounts, setEmployeeAccounts] = useState<UserAccount[]>(() => {
    const saved = localStorage.getItem('cmdcenter_employee_accounts');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return INITIAL_EMPLOYEE_ACCOUNTS;
  });

  const [userPermissionsMap, setUserPermissionsMap] = useState<Record<string, RolePermissions>>(() => {
    const saved = localStorage.getItem('cmdcenter_user_permissions');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return INITIAL_USER_PERMISSIONS;
  });

  // ===== Daftar Staf (1-to-1 dengan akun Owner + karyawan) =====
  // Sumber otoritatifnya adalah employeeAccounts + DEFAULT_OWNER_ACCOUNT.
  // staffList adalah representasi turunan yang menambahkan state runtime
  // (status Hadir/Tidak Hadir, clockIn/Out, transaksi hari ini).
  const [staffStateMap, setStaffStateMap] = useState<Record<string, StaffUser>>(() => {
    const saved = localStorage.getItem('cmdcenter_staff_state_map');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return {};
  });

  useEffect(() => {
    localStorage.setItem(
      'cmdcenter_staff_state_map',
      JSON.stringify(staffStateMap)
    );
  }, [staffStateMap]);

  // Daftar staf final = Owner + semua karyawan, dengan state runtime di-merge
  const staffList: StaffUser[] = useMemo(() => {
    const allAccounts: UserAccount[] = [
      DEFAULT_OWNER_ACCOUNT,
      ...employeeAccounts,
    ];
    return allAccounts.map((acc) => {
      const state = staffStateMap[acc.id];
      return {
        id: acc.id,
        name: acc.name,
        role:
          acc.role === 'Owner'
            ? 'Owner'
            : (state?.role as StaffUser['role']) || 'Station Specialist',
        status: state?.status || 'Tidak Hadir',
        clockInTime: state?.clockInTime,
        clockOutTime: state?.clockOutTime,
        transactionsTodayCount: state?.transactionsTodayCount || 0,
        revenueHandled: state?.revenueHandled || 0,
      };
    });
  }, [employeeAccounts, staffStateMap]);

  // Helper update state runtime satu karyawan
  const updateStaffState = (employeeId: string, updates: Partial<StaffUser>) => {
    setStaffStateMap((prev) => {
      const current = prev[employeeId] || {
        id: employeeId,
        name: '',
        role: 'Station Specialist' as StaffUser['role'],
        status: 'Tidak Hadir' as const,
        transactionsTodayCount: 0,
        revenueHandled: 0,
      };
      return {
        ...prev,
        [employeeId]: { ...current, ...updates },
      };
    });
  };

  // ===== Auto-compute revenueHandled & transactionsTodayCount per karyawan =====
  // Mapping: karyawan.name === transaction.cashierName → akumulasi.
  const todayDateKey = useMemo(() => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, []);

  useEffect(() => {
    setStaffStateMap((prev) => {
      let changed = false;
      const next = { ...prev };
      const employees: UserAccount[] = [
        DEFAULT_OWNER_ACCOUNT,
        ...employeeAccounts,
      ];
      for (const emp of employees) {
        if (emp.role !== 'Karyawan') continue;
        let totalRevenue = 0;
        let todayCount = 0;
        for (const tx of transactions) {
          if (tx.cashierName !== emp.name) continue;
          totalRevenue += tx.amount;
          if (tx.dateLabel === todayDateKey) todayCount += 1;
        }
        const current = next[emp.id];
        if (
          !current ||
          current.revenueHandled !== totalRevenue ||
          current.transactionsTodayCount !== todayCount
        ) {
          next[emp.id] = {
            ...(current || {
              id: emp.id,
              name: emp.name,
              role: 'Station Specialist' as StaffUser['role'],
              status: 'Tidak Hadir' as const,
            }),
            revenueHandled: totalRevenue,
            transactionsTodayCount: todayCount,
          };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [transactions, employeeAccounts, todayDateKey]);

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    // Wajib login saat pertama buka. Hanya restore session kalau user
    // sebelumnya sudah login di sesi browser ini (localStorage).
    // Untuk reset bersih, hapus cmdcenter_current_user di DevTools.
    const saved = localStorage.getItem('cmdcenter_current_user');
    return !!saved;
  });
  const [isPermissionManagerOpen, setIsPermissionManagerOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [restrictedToast, setRestrictedToast] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<{
    message: string;
    tone: 'info' | 'warning' | 'success';
  } | null>(null);

  // Per-station TV reconnect progress tracker.
  // status: 'idle' | 'sending' | 'ack_received' | 'online' | 'timeout'
  // Updated via onTvCommandAck + presence map changes.
  const [tvReconnectStatus, setTvReconnectStatus] = useState<Record<string, {
    status: 'sending' | 'ack_received' | 'online' | 'timeout';
    startedAt: number;
  }>>({});

  // Sync auth & permissions state to localStorage
  useEffect(() => {
    localStorage.setItem('cmdcenter_current_user', JSON.stringify(currentUser));
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('cmdcenter_employee_accounts', JSON.stringify(employeeAccounts));
  }, [employeeAccounts]);

  useEffect(() => {
    localStorage.setItem('cmdcenter_user_permissions', JSON.stringify(userPermissionsMap));
  }, [userPermissionsMap]);

  // ===== PIN Migration & Seed Sync =====
  // 1. Upgrade plaintext PINs in localStorage to hashed form.
  // 2. Sync seed karyawan dengan versi terbaru di INITIAL_EMPLOYEE_ACCOUNTS.
  //    Penting: hash karyawan pernah berubah (5678/2345/3456 → 123456/234567/345678).
  //    Tanpa sync ini, user yang sudah pernah load app akan gagal login karena
  //    hash di localStorage mereka adalah hash lama, sementara LoginModal bandingkan
  //    terhadap INITIAL_EMPLOYEE_ACCOUNTS (hash baru).
  useEffect(() => {
    const upgrade = async () => {
      const { hashPin } = await import('./utils/pinCrypto');
      const ensureHashed = async (acc: UserAccount): Promise<UserAccount> => {
        if (!acc.pin || acc.pin.startsWith('sha256:')) return acc;
        return { ...acc, pin: await hashPin(acc.pin) };
      };

      // Sinkronkan currentUser dengan ownerProfile kalau hash/PIN berbeda.
      // ownerProfile adalah single source of truth untuk Owner setelah edit Profile.
      setCurrentUser((prev) =>
        prev.id === DEFAULT_OWNER_ACCOUNT.id && prev.pin !== ownerProfile.pin
          ? { ...prev, pin: ownerProfile.pin, name: ownerProfile.name, email: ownerProfile.email }
          : prev
      );

      // Sync seed karyawan: untuk ID seed, sinkronkan username (jika berubah)
      // tapi JANGAN overwrite PIN — user bisa ganti PIN sendiri via
      // ProfileSettings, dan itu harus persistent.
      //
      // Catatan: logika ini dulu pernah overwrite PIN ke seed default setiap
      // reload, yang mana akan me-reset PIN baru yang baru saja di-set user.
      // Sekarang kita hanya sync field non-PIN (username) bila seed defaultnya
      // berubah, dan biarkan PIN user-edit tetap utuh.
      const seedIdMap = new Map(INITIAL_EMPLOYEE_ACCOUNTS.map((a) => [a.id, a]));
      const upgradedEmployees = await Promise.all(
        employeeAccounts.map(async (acc) => {
          const hashed = await ensureHashed(acc);
          const seedVersion = seedIdMap.get(acc.id);
          if (seedVersion) {
            // Akun ini adalah seed — sync username jika berubah, tapi
            // pertahankan PIN yang sudah di-edit user.
            return {
              ...hashed,
              username: seedVersion.username,
              name: seedVersion.name, // sync nama seed default juga (mis. "Super Administrator")
            };
          }
          return hashed;
        })
      );
      if (upgradedEmployees.some((u, i) => u !== employeeAccounts[i])) {
        setEmployeeAccounts(upgradedEmployees);
      }

      // 3. Permission migration: pastikan setiap entry punya field terbaru.
      //    Tanpa ini, permission lama yang disimpan di localStorage akan
      //    kehilangan field baru (mis. 'absensi') yang ditambahkan kemudian,
      //    sehingga hasPermission('absensi') = false untuk semua user.
      setUserPermissionsMap((prev) => {
        let changed = false;
        const next: Record<string, RolePermissions> = {};
        for (const [userId, perms] of Object.entries(prev)) {
          const typedPerms = perms as RolePermissions;
          // Tambah field yang hilang dari DEFAULT_CASHIER_PERMISSIONS
          const merged: RolePermissions = {
            ...DEFAULT_CASHIER_PERMISSIONS,
            ...typedPerms,
            absensi:
              typedPerms.absensi ?? DEFAULT_CASHIER_PERMISSIONS.absensi,
          };
          if (
            merged.dashboard !== typedPerms.dashboard ||
            merged.units !== typedPerms.units ||
            merged.history !== typedPerms.history ||
            merged.users !== typedPerms.users ||
            merged.settings !== typedPerms.settings ||
            merged.absensi !== typedPerms.absensi ||
            merged.new_session !== typedPerms.new_session
          ) {
            changed = true;
          }
          next[userId] = merged;
        }
        return changed ? next : prev;
      });
    };
    upgrade();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Permission check helper (Owner has all access; Employees check userPermissionsMap)
  const hasPermission = (feature: FeaturePermission): boolean => {
    if (currentUser.role === 'Owner') return true;
    const userPerms = userPermissionsMap[currentUser.id] || DEFAULT_CASHIER_PERMISSIONS;
    return !!userPerms[feature];
  };

  const handleSaveUserPermissions = (userId: string, updatedPerms: RolePermissions) => {
    setUserPermissionsMap((prev) => ({
      ...prev,
      [userId]: updatedPerms,
    }));
  };

  const handleAddEmployeeAccount = (newAcc: UserAccount) => {
    setEmployeeAccounts((prev) => [...prev, newAcc]);
    setUserPermissionsMap((prev) => ({
      ...prev,
      [newAcc.id]: DEFAULT_CASHIER_PERMISSIONS,
    }));
    // Auto-create entry StaffUser (1-to-1 dengan akun).
    // Hanya karyawan yang di-track; Owner sudah punya entry statis.
    if (newAcc.role === 'Karyawan') {
      updateStaffState(newAcc.id, {
        id: newAcc.id,
        name: newAcc.name,
        role: 'Station Specialist',
        status: 'Tidak Hadir',
        transactionsTodayCount: 0,
        revenueHandled: 0,
      });
    }
  };

  // Logout: hapus sesi dari localStorage & state, kembali ke auth gate.
  // Dipakai oleh tombol Logout di Header.
  const handleLogout = () => {
    localStorage.removeItem('cmdcenter_current_user');
    setIsAuthenticated(false);
    setIsLoginModalOpen(false);
  };

  const triggerRestrictedToast = (label: string) => {
    setRestrictedToast(`Akses ke tab "${label}" dibatasi oleh Owner.`);
    setTimeout(() => {
      setRestrictedToast(null);
    }, 3500);
  };

  const triggerActionToast = (
    message: string,
    tone: 'info' | 'warning' | 'success' = 'info'
  ) => {
    setActionToast({ message, tone });
    setTimeout(() => {
      setActionToast(null);
    }, 4500);
  };

  // Redirect if current active tab is restricted
  useEffect(() => {
    if (activeTab === 'dashboard' && !hasPermission('dashboard')) {
      setActiveTab('absensi');
    } else if (activeTab === 'units' && !hasPermission('units')) {
      setActiveTab('absensi');
    } else if (activeTab === 'history' && !hasPermission('history')) {
      setActiveTab('absensi');
    } else if (activeTab === 'users' && !hasPermission('users')) {
      setActiveTab('absensi');
    } else if (activeTab === 'settings' && !hasPermission('settings')) {
      setActiveTab('absensi');
    } else if (activeTab === 'absensi' && !hasPermission('absensi')) {
      setActiveTab('units');
    }
  }, [currentUser.id, currentUser.role, userPermissionsMap, activeTab]);

  const [rates, setRates] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('cmdcenter_rental_rates');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return {
      'PS3': 10000,
      'PS4': 15000,
      'PS5': 20000,
      'PS5 Pro': 25000,
      'Nintendo Switch': 15000,
      'VIP Sim Rig': 35000,
    };
  });

  useEffect(() => {
    localStorage.setItem('cmdcenter_rental_rates', JSON.stringify(rates));
  }, [rates]);

  // ===== TV Auto Power (Owner control: nyala/mati TV otomatis saat mulai/akhir sewa) =====
  // Default ON: ketika sewa mulai → TV power_on; sewa selesai / timer habis → TV power_off.
  const [tvAutoPower, setTvAutoPower] = useState<boolean>(() => {
    const saved = localStorage.getItem('cmdcenter_tv_auto_power');
    return saved === null ? true : saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('cmdcenter_tv_auto_power', String(tvAutoPower));
  }, [tvAutoPower]);

  // ===== Modal states =====
  const [isNewSessionOpen, setIsNewSessionOpen] = useState(false);
  const [selectedStationIdForNewSession, setSelectedStationIdForNewSession] = useState<string | undefined>(undefined);
  const [selectedTransactionForReceipt, setSelectedTransactionForReceipt] = useState<Transaction | null>(null);
  const [stationToEnd, setStationToEnd] = useState<GamingStation | null>(null);
  const [autoExpiredStation, setAutoExpiredStation] = useState<GamingStation | null>(null);
  const [dismissedExpiredIds, setDismissedExpiredIds] = useState<string[]>([]);
  const [stationToMove, setStationToMove] = useState<GamingStation | null>(null);
  const [tvStationForControl, setTvStationForControl] = useState<GamingStation | null>(null);
  const [tvFeedback, setTvFeedback] = useState<{
    stationId: string;
    command: string;
    messages: string[];
    timestamp: number;
  } | null>(null);

  // ===== Anti-fraud: TV presence map =====
  // { 'tv:PS5_01': { subscribers, lastSeen, online } }
  // Updated via WS TV_PRESENCE_UPDATE + periodic refresh.
  const [tvPresenceMap, setTvPresenceMap] = useState<Record<string, {
    subscribers: number;
    lastSeen: number;
    online: boolean;
  }>>({});

  // ===== Klaim channel dari TV receiver (self-registration via POST /api/tv/pair) =====
  // { 'tv:PS5_01': { deviceId, model, version, claimedAt } }
  // Dipakai TVControlPanel untuk menampilkan daftar TV nyata yang terdeteksi,
  // supaya Owner bisa pairing station↔channel tanpa salah ketik nama channel.
  const [tvClaims, setTvClaims] = useState<Record<string, {
    deviceId: string;
    model: string;
    version: string;
    claimedAt: number;
  }>>({});

  // Throttle warning "publish 0 penerima" per channel (hindari spam toast
  // saat broadcast branding ke banyak station yang TV-nya offline semua).
  const publishWarnRef = useRef<Record<string, number>>({});

  // Ambil klaim channel yang sudah ada saat mount (update selanjutnya datang
  // via broadcast TV_PAIR_UPDATE setiap kali TV boot / pair).
  useEffect(() => {
    fetch('/api/tv/pair')
      .then((r) => r.json())
      .then((d) => { if (d?.claims) setTvClaims(d.claims); })
      .catch(() => {});
  }, []);

  // Pending high-risk action awaiting Owner PIN override.
  // Set when operator tries to start/end a session but TV appears offline —
  // we don't refuse outright, but require Owner PIN confirmation to proceed.
  const [pendingOwnerOverride, setPendingOwnerOverride] = useState<{
    action: 'start_session' | 'end_session';
    station: GamingStation;
    sessionData?: {
      stationId: string;
      customerName: string;
      customerPhone: string;
      vipId?: string;
      durationMinutes: number;
      isMainBebas?: boolean;
      paymentMethod: PaymentMethod;
      paymentStatus: 'Lunas' | 'Belum Lunas';
      amount: number;
      gamePlaying: string;
      cashierName: string;
    };
    endDetails?: {
      actualMinutes: number;
      finalAmount: number;
      paymentMethod: PaymentMethod;
      paymentStatus?: 'Lunas' | 'Belum Lunas';
    };
    reason: string;
  } | null>(null);

  // ===== Global branding config (Owner sets once; applies to all TVs) =====
  const [brandingConfig, setBrandingConfig] = useState<{
    text: string;
    subtitle: string;
    color: string;
    bg: string;
    enabled: boolean;
    position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    timerPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    timerColor: string;
    timerSize: number;
  }>(() => {
    const saved = localStorage.getItem('cmdcenter_tv_branding');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Backward-compat: legacy saves have no `position`, default to bottom-right.
        if (!parsed.position) parsed.position = 'bottom-right';
        if (!parsed.timerPosition) parsed.timerPosition = 'top-right';
        if (!parsed.timerColor) parsed.timerColor = '#FFD700';
        if (!parsed.timerSize) parsed.timerSize = 16;
        return parsed;
      } catch (e) {}
    }
    return {
      text: 'COMMAND CENTER',
      subtitle: '',
      color: '#00E5FF',
      bg: '#80000000',
      enabled: false,
      position: 'bottom-right',
      timerPosition: 'top-right',
      timerColor: '#FFD700',
      timerSize: 16,
    };
  });

  useEffect(() => {
    localStorage.setItem('cmdcenter_tv_branding', JSON.stringify(brandingConfig));
    // Also persist the rental name to the server so the TV screensaver can show it.
    fetch('/api/branding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rentalName: brandingConfig.text }),
    }).catch(() => {});
  }, [brandingConfig]);

  // ===== WebSocket live connection =====
  // We use the WS hook primarily for: (1) live broadcast receipt of server-driven
  // mutations (e.g. other cashier ends a session), (2) emitting TV control commands.
  // All local mutations stay in React state for snappy UX; the server is informed
  // for cross-device sync and persistence.
  const wsRef = useRef<ReturnType<typeof useWebSocketTimer> | null>(null);
  const ws = useWebSocketTimer({
    onStateUpdate: (serverStations, serverTx) => {
      // Server is source of truth for multi-device sync. Always adopt server
      // state when it broadcasts, regardless of local length. This prevents
      // Browser B (fresh install, empty localStorage) from keeping its
      // default INITIAL_STATIONS when server has fewer stations.
      setStations(serverStations as GamingStation[]);
      setTransactions(serverTx);
    },
    onActionMessage: (msg) => triggerActionToast(msg, 'info'),
    onPublishAck: (ack) => {
      // recipients=0 → perintah jatuh ke channel kosong (TV offline / nama
      // channel tidak cocok). Beri peringatan agar tidak gagal diam-diam.
      if (ack.recipients > 0) return;
      const now = Date.now();
      const last = publishWarnRef.current[ack.channel] || 0;
      if (now - last < 5000) return; // throttle per channel
      publishWarnRef.current[ack.channel] = now;
      triggerActionToast(
        `⚠ Perintah ke ${ack.channel} tidak terkirim: tidak ada TV tersubscriksi di channel itu. Cek nama channel di Settings TV, atau simpan pairing yang benar di panel TV.`,
        'warning'
      );
    },
    onTvClaimsUpdate: (claims) => {
      setTvClaims(claims);
    },
    onTvPresenceUpdate: (presence) => {
      setTvPresenceMap(presence);
      // Phase 3 feedback: detect when a station that was reconnecting comes
      // back online. Check each station whose presence just became online.
      setTvReconnectStatus((prev) => {
        const next = { ...prev };
        for (const st of stations) {
          const ch = stationChannelMap(st);
          const p = presence[ch];
          const current = next[st.id];
          // If station is in ack_received OR sending state and presence just
          // became online, trigger success toast (Phase 3).
          if (
            current &&
            (current.status === 'sending' || current.status === 'ack_received') &&
            p && p.subscribers > 0
          ) {
            const elapsedMs = Date.now() - current.startedAt;
            triggerActionToast(
              `✅ TV ${st.name} berhasil reconnect (${(elapsedMs / 1000).toFixed(1)}s)`,
              'success'
            );
            delete next[st.id];
          }
        }
        return next;
      });
    },
    onTvCommandAck: (ack) => {
      // Audit log untuk anti-fraud: setiap ACK dari TV dicatat + toast warning
      // kalau gagal. Owner bisa review via Settings → Audit (future).
      console.log('[tv-ack]', ack);

      // Phase 2 feedback (reconnect flow): if this ACK matches a station in
      // reconnecting state, show "TV merespons" toast and clear timeout.
      if (ack.command === 'RECONNECT_TV' && ack.success) {
        // Find station by channel
        const targetStation = stations.find((s) => stationChannelMap(s) === ack.channel);
        if (targetStation) {
          // Cancel timeout (Phase 4 won't fire)
          const t = reconnectTimeoutsRef.current.get(targetStation.id);
          if (t) {
            window.clearTimeout(t);
            reconnectTimeoutsRef.current.delete(targetStation.id);
          }
          // Update state to ack_received (Phase 2)
          setTvReconnectStatus((prev) => ({
            ...prev,
            [targetStation.id]: { status: 'ack_received', startedAt: prev[targetStation.id]?.startedAt ?? Date.now() },
          }));
          triggerActionToast(
            `✅ TV ${targetStation.name} terhubung & merespons!`,
            'success'
          );
        }
      }

      if (!ack.success) {
        triggerActionToast(
          `⚠ TV gagal eksekusi ${ack.command} di ${ack.stationId || ack.channel}: ${ack.error || 'unknown'}`,
          'warning'
        );
      }
    },
    onTvPairingsUpdate: (pairings) => {
      setTvPairings(pairings);
    },
    onTvTamperAlert: (alert) => {
      // Server detected: occupied station has TV offline. Possible fraud:
      // kasir claims TV rusak, timer keeps running.
      console.warn('[tv-tamper]', alert);
      triggerActionToast(
        `🚨 TAMPER: ${alert.stationName} occupied tapi TV offline. ${alert.reason}`,
        'warning'
      );
    },
  });
  wsRef.current = ws;

  // Refetch server state when user returns to the tab. Without this, a tab
  // left in the background for hours would keep rendering its stale mount-time
  // state (which is now [] until WS reconnects).
  useEffect(() => {
    const refetch = () => {
      // WS hook auto-resubscribes on socket reconnect; we just nudge it.
      // The next STATE_UPDATE from server will overwrite local state.
      if (wsRef.current?.isConnected) {
        // Already connected — STATE_UPDATE was sent on connect. No-op needed.
        return;
      }
      // Not connected — nothing we can do here; hook will retry.
    };
    const onFocus = () => refetch();
    const onVisible = () => {
      if (!document.hidden) refetch();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // TV control handler — sends command via WebSocket; receives feedback broadcast
  // Map stationId → channel name for TV commands
// Convention: "tv:<consoleType_shortId>" e.g. "tv:PS5_01", "tv:SWITCH_03"
// In production, this map should be persisted on the server (paired with TV's
// own channel name). For now we derive from station metadata.
const stationChannelMap = (station: { id: string; consoleType: string }): string => {
  return resolveStationTvChannel(station, tvPairings);
};

const getTvChannelCandidates = (station: { id: string; consoleType: string }): string[] => {
  return getResolvedTvChannelCandidates(station, tvPairings, Object.keys(tvPresenceMap));
};

const handleTvControl = useCallback((stationId: string, command: string) => {
    const station = stations.find((s) => s.id === stationId);
    const channel = station ? stationChannelMap(station) : `tv:${stationId}`;

    // Preferred: publish via WebSocket channel
    const published = wsRef.current?.publishToChannel?.(channel, { command });
    if (!published) {
      // Fallback: REST publish endpoint
      fetch('/api/channel/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, data: { command } }),
      }).catch((e) => {
        setTvFeedback({ stationId, command, messages: [`Error: ${(e as Error).message}`], timestamp: Date.now() });
        setTimeout(() => setTvFeedback(null), 4000);
      });
    } else {
      setTvFeedback({
        stationId,
        command,
        messages: [`[ws-channel] → ${channel}`],
        timestamp: Date.now(),
      });
      setTimeout(() => setTvFeedback(null), 3000);
    }
  }, [stations]);

  /**
   * Auto power helper: kirim power_on saat sewa mulai dan power_off saat sewa selesai.
   * Hanya jalan jika tvAutoPower = true (Owner toggle).
   *
   * Anti-fraud note: tidak return early kalau TV "offline" — frontend tidak punya
   * hak menolak aksi operator. Tapi pre-flight check di handleConfirmNewSession /
   * handleConfirmEndSession menampilkan warning toast + minta konfirmasi Owner
   * sebelum lanjut. Audit log dicatat di server.
   */
  const sendTvPowerCommand = useCallback((station: GamingStation, command: 'power_on' | 'power_off') => {
    if (!tvAutoPower) return;
    const channel = stationChannelMap(station);
    const published = wsRef.current?.publishToChannel?.(channel, { command });
    if (!published) {
      fetch('/api/channel/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, data: { command } }),
      }).catch((e) => console.error(`[tv-auto-power] ${command} → ${channel} failed:`, e));
    }
  }, [tvAutoPower]);

  /**
   * Pre-flight anti-fraud check: cek apakah TV channel punya subscriber aktif.
   * Return { online, subscribers, lastSeen }. Dipakai sebelum start/end session
   * kalau tvAutoPower ON. Kalau offline → caller harus konfirmasi Owner dulu.
   */
  const checkTvOnline = useCallback((station: GamingStation): {
    online: boolean;
    subscribers: number;
    lastSeen: number | null;
    latencyMs: number | null;
    status: 'online' | 'idle' | 'offline' | 'unknown';
  } => {
    const channels = getTvChannelCandidates(station);
    const presenceEntries = channels
      .map((channel) => tvPresenceMap[channel])
      .filter((presence): presence is NonNullable<typeof presence> => Boolean(presence));

    if (presenceEntries.length === 0) {
      return { online: false, subscribers: 0, lastSeen: null, latencyMs: null, status: 'unknown' };
    }

    const bestPresence = presenceEntries.reduce((best, current) => {
      if (!best) return current;
      if (current.subscribers > best.subscribers) return current;
      if (current.subscribers === best.subscribers && current.lastSeen > best.lastSeen) return current;
      return best;
    });

    const ageMs = bestPresence.lastSeen ? Date.now() - bestPresence.lastSeen : null;
    let status: 'online' | 'idle' | 'offline' | 'unknown' = 'unknown';
    // Base status on HEARTBEAT AGE (not subscriber count). The server keeps
    // lastSeen at the last heartbeat even during a transient WS drop, so a
    // brief reconnect does not flip the UI. Heartbeat ≈ 5s.
    if (ageMs === null || ageMs > 60_000) status = 'offline';
    else if (ageMs > 15_000) status = 'idle';
    else status = 'online';
    return {
      online: status === 'online' || status === 'idle',
      subscribers: bestPresence.subscribers,
      lastSeen: bestPresence.lastSeen,
      latencyMs: ageMs,
      status,
    };
  }, [tvPresenceMap]);

  // Notify operator when a station's TV transitions to offline.
  const prevTvStatusRef = useRef<Record<string, string>>({});
  useEffect(() => {
    for (const st of stations) {
      const s = checkTvOnline(st);
      const prev = prevTvStatusRef.current[st.id];
      if (s.status === 'offline' && prev && prev !== 'offline') {
        triggerActionToast(
          `⚠ ${st.name}: TV tidak terhubung. Silakan periksa receiver / klik Connect.`,
          'warning'
        );
      }
      prevTvStatusRef.current[st.id] = s.status;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tvPresenceMap, stations]);

  /**
   * Test reconnect (WS-only, anti-fraud):
   *   Mengirim RECONNECT_TV ke channel. TV receiver HANYA close WS → scheduleReconnect()
   *   refresh handshake. TIDAK wake screen atau ubah hardware TV state.
   *
   * Mengapa TIDAK wake TV:
   *   Anti-fraud. Kalau tombol ini juga nyalakan TV, kasir bisa curang dengan
   *   klik "Connect" di tengah sesi (TV nyala manual, customer pakai, timer tetap
   *   jalan tanpa bayar). Reconnect adalah operasi NON-DESTRUCTIF — hanya
   *   memverifikasi WS connectivity.
   *   Power on/off TV tetap eksklusif lewat:
   *     - Auto: handleConfirmNewSession/EndSession (saat mulai/akhir sewa)
   *     - Manual: TVControlPanel (Owner only)
   *
   * Multi-phase feedback:
   *   1. "Test koneksi TV..." (info, immediate)
   *   2. "TV merespons! Reconnect dimulai..." (info, on ACK)
   *   3. "TV berhasil reconnect" (success, when presence becomes online again)
   *   4. "TV tidak merespons" (warning, timeout after 8s)
   */
  const reconnectTimeoutsRef = useRef<Map<string, number>>(new Map());

  const triggerTvReconnect = useCallback((station: GamingStation) => {
    const channel = stationChannelMap(station);
    const stationKey = station.id;

    // Phase 1: Sending
    triggerActionToast(`📡 Test koneksi TV ${station.name} (ping + reconnect WS)...`, 'info');
    setTvReconnectStatus((prev) => ({
      ...prev,
      [stationKey]: { status: 'sending', startedAt: Date.now() },
    }));

    // Clear any previous timeout for this station
    const prevTimeout = reconnectTimeoutsRef.current.get(stationKey);
    if (prevTimeout) {
      window.clearTimeout(prevTimeout);
      reconnectTimeoutsRef.current.delete(stationKey);
    }

    // Phase 4 (timeout fallback): if no ACK in 8s, warn operator.
    const timeoutId = window.setTimeout(() => {
      setTvReconnectStatus((prev) => {
        const current = prev[stationKey];
        if (current && (current.status === 'sending' || current.status === 'ack_received')) {
          triggerActionToast(
            `⚠ ${station.name}: TV tidak merespons dalam 8 detik. Periksa kabel / koneksi receiver.`,
            'warning'
          );
          return { ...prev, [stationKey]: { status: 'timeout', startedAt: current.startedAt } };
        }
        return prev;
      });
      reconnectTimeoutsRef.current.delete(stationKey);
    }, 8_000);
    reconnectTimeoutsRef.current.set(stationKey, timeoutId);

    // Publish RECONNECT_TV to channel (WS preferred, REST fallback).
    const published = wsRef.current?.publishToChannel?.(channel, { command: 'RECONNECT_TV' });
    if (!published) {
      fetch('/api/channel/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, data: { command: 'RECONNECT_TV' } }),
      }).catch((e) => {
        triggerActionToast(`❌ Gagal kirim reconnect ke ${station.name}: ${(e as Error).message}`, 'warning');
        const t = reconnectTimeoutsRef.current.get(stationKey);
        if (t) { window.clearTimeout(t); reconnectTimeoutsRef.current.delete(stationKey); }
      });
    }
  }, []);

  // Listen for TV_COMMAND_ACK → Phase 2: "TV merespons"
  // We reuse the onTvCommandAck from useWebSocketTimer hook below; this is
  // handled inline so we can match ACK by station channel.
  const lastAckChannelRef = useRef<{ channel: string; command: string; success: boolean; at: number } | null>(null);

  // Send branding payload to a specific TV channel
  const handleSendBranding = useCallback((
    stationId: string,
    payload: { action: 'show' | 'hide' | 'set'; text?: string; subtitle?: string; color?: string; bg?: string; position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' }
  ) => {
    const station = stations.find((s) => s.id === stationId);
    const channel = station ? stationChannelMap(station) : `tv:${stationId}`;

    const published = wsRef.current?.publishToChannel?.(channel, { payload });
    if (!published) {
      fetch('/api/channel/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, data: { payload } }),
      }).catch((e) => {
        setTvFeedback({ stationId, command: 'branding', messages: [`Error: ${(e as Error).message}`], timestamp: Date.now() });
        setTimeout(() => setTvFeedback(null), 4000);
      });
    }
  }, [stations]);

  // Broadcast branding to ALL stations via their respective channels
  const handleBroadcastBrandingAll = useCallback((action: 'show' | 'hide' | 'set') => {
    const payload = {
      action,
      text: brandingConfig.text,
      subtitle: brandingConfig.subtitle,
      color: brandingConfig.color,
      bg: brandingConfig.bg,
      position: brandingConfig.position,
      timerPosition: brandingConfig.timerPosition,
      timerColor: brandingConfig.timerColor,
      timerSize: brandingConfig.timerSize,
    };
    stations.forEach((st) => {
      const channel = stationChannelMap(st);
      wsRef.current?.publishToChannel?.(channel, { payload });
    });
    triggerActionToast(
      `Branding "${brandingConfig.text}" ${action === 'hide' ? 'disembunyikan' : 'ditampilkan'} di ${stations.length} station`,
      action === 'hide' ? 'info' : 'success'
    );
  }, [stations, brandingConfig, triggerActionToast]);

  // Compute revenue figures — purely from actual transactions (no hardcoded baseline)
  const dailyAmount = useMemo(() => computeDailyRevenue(transactions), [transactions]);
  const weeklyAmount = useMemo(() => computeWeeklyRevenue(transactions), [transactions]);
  const monthlyAmount = useMemo(() => computeMonthlyRevenue(transactions), [transactions]);
  const outstandingReceivable = useMemo(
    () => computeOutstandingRevenue(transactions),
    [transactions]
  );

  const occupiedCount = stations.filter(
    (s) => s.status === 'occupied' || s.status === 'warning'
  ).length;

  // Handlers
  const handleOpenStartSession = (station?: GamingStation) => {
    if (station) {
      setSelectedStationIdForNewSession(station.id);
    } else {
      setSelectedStationIdForNewSession(undefined);
    }
    setIsNewSessionOpen(true);
  };

  const handleConfirmNewSession = (sessionData: {
    stationId: string;
    customerName: string;
    customerPhone: string;
    vipId?: string;
    durationMinutes: number;
    isMainBebas?: boolean;
    paymentMethod: PaymentMethod;
    paymentStatus: 'Lunas' | 'Belum Lunas';
    amount: number;
    gamePlaying: string;
    cashierName: string;
  }) => {
    const station = stations.find((s) => s.id === sessionData.stationId);
    if (!station) {
      console.error(
        `[start-session] stationId "${sessionData.stationId}" not found in stations list — ` +
        `timer cannot start. Available: [${stations.map((s) => s.id).join(', ')}]`
      );
      triggerActionToast(
        `Gagal mulai sesi: Station tidak ditemukan. Coba tutup & buka modal lagi.`,
        'warning'
      );
      return;
    }

    // ===== ANTI-FRAUD PRE-FLIGHT (start) =====
    // Untuk mencegah false-positive, kita hanya memberi warning jika receiver
    // belum terlihat online. Sesi tetap boleh dimulai agar timer bisa berjalan.
    if (tvAutoPower) {
      const presence = checkTvOnline(station);
      if (presence.status === 'offline') {
        triggerActionToast(
          `⚠ ${station.name}: TV receiver belum terlihat online, tetapi sesi tetap dilanjutkan. Cek channel ${stationChannelMap(station)} jika layar tidak muncul.`,
          'warning'
        );
      }
    }
    // Continue to existing logic below...

    const now = Date.now();

    if (sessionData.isMainBebas) {
      // 1. For Main Bebas (Pasca Bayar), start session with chosen paymentStatus
      const mainBebasSession = {
        sessionId: `sess-${Date.now()}`,
        customerName: sessionData.customerName,
        customerPhone: sessionData.customerPhone,
        startTime: now,
        durationMinutes: 0,
        endTime: 0,
        isMainBebas: true,
        paymentMethod: sessionData.paymentMethod,
        paymentStatus: sessionData.paymentStatus,
        amount: 0,
        gamePlaying: sessionData.gamePlaying,
        cashierName: sessionData.cashierName,
      };
      setStations((prev) =>
        prev.map((st) => {
          if (st.id === station.id) {
            return {
              ...st,
              status: 'occupied',
              currentSession: mainBebasSession,
            };
          }
          return st;
        })
      );
      // Sync Main Bebas "session start" to DB (no transaction yet — billed at end)
      // We send a minimal placeholder transaction record (amount=0) so station+session persist.
      const placeholderTx: Transaction = {
        id: `tx-pending-${Date.now()}`,
        stationId: station.id,
        stationName: station.name,
        durationMinutes: 0,
        durationLabel: 'Main Bebas (belum diakhiri)',
        paymentMethod: sessionData.paymentMethod,
        paymentStatus: sessionData.paymentStatus,
        amount: 0,
        formattedAmount: 'Rp 0',
        timeLabel: '',
        dateLabel: '',
        timestamp: now,
        cashierName: sessionData.cashierName,
        customerName: sessionData.customerName,
        consoleType: station.consoleType,
        receiptNumber: '',
      };
      const wsSent = wsRef.current?.sendStartSessionViaWS?.({
        stationId: station.id,
        session: mainBebasSession,
        transaction: placeholderTx,
      }) || false;
      if (!wsSent) {
        fetch('/api/sessions/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stationId: station.id,
            session: mainBebasSession,
            transaction: placeholderTx,
          }),
        }).catch((e) => console.error('[start-main-bebas] REST fallback failed:', e));
      }
      // Auto power ON the TV (if Owner enabled the setting)
      sendTvPowerCommand(station, 'power_on');
      return;
    }

    // 2. For fixed package (Prabayar), create transaction upfront with paymentStatus
    const durationHours = sessionData.durationMinutes / 60;
    const durationLabel = `${durationHours} Jam`;

    const formattedAmount =
      sessionData.amount >= 1000
        ? `Rp ${Math.round(sessionData.amount / 1000)}k`
        : `Rp ${sessionData.amount}`;

    const pad = (n: number) => n.toString().padStart(2, '0');
    const dateObj = new Date();
    const timeLabel = `${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
    const dateLabel = `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}`;

    const txId = `tx-${Date.now()}`;
    const receiptNumber = `NEX-${dateObj.getFullYear()}${pad(dateObj.getMonth() + 1)}${pad(dateObj.getDate())}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newTx: Transaction = {
      id: txId,
      stationId: station.id,
      stationName: station.name,
      durationMinutes: sessionData.durationMinutes,
      durationLabel,
      paymentMethod: sessionData.paymentMethod,
      paymentStatus: sessionData.paymentStatus,
      amount: sessionData.amount,
      formattedAmount,
      timeLabel,
      dateLabel,
      timestamp: now,
      cashierName: sessionData.cashierName,
      customerName: sessionData.customerName,
      consoleType: station.consoleType,
      receiptNumber,
    };

    setTransactions((prev) => [newTx, ...prev]);

    setStations((prev) =>
      prev.map((st) => {
        if (st.id === station.id) {
          return {
            ...st,
            status: 'occupied',
            currentSession: {
              sessionId: `sess-${Date.now()}`,
              transactionId: txId,
              customerName: sessionData.customerName,
              customerPhone: sessionData.customerPhone,
              vipId: sessionData.vipId,
              startTime: now,
              durationMinutes: sessionData.durationMinutes,
              endTime: now + sessionData.durationMinutes * 60 * 1000,
              isMainBebas: false,
              paymentMethod: sessionData.paymentMethod,
              paymentStatus: sessionData.paymentStatus,
              amount: sessionData.amount,
              gamePlaying: sessionData.gamePlaying,
              cashierName: sessionData.cashierName,
            },
            totalSessionsToday: st.totalSessionsToday + 1,
            totalRevenueToday: st.totalRevenueToday + sessionData.amount,
          };
        }
        return st;
      })
    );

    // Only show receipt modal if status is Lunas. "Belum Lunas" stays in history but no auto-print.
    if (sessionData.paymentStatus === 'Lunas') {
      setSelectedTransactionForReceipt(newTx);
    } else {
      triggerActionToast(
        `Sesi ${station.name} dimulai (Belum Lunas). Struk tidak dicetak otomatis — tersedia di menu History.`
      );
    }

    // 3. Sync to server (WS preferred, REST fallback) so this persists to DB
    //    and broadcasts to other connected operators (multi-device sync).
    const sessionObj = {
      sessionId: `sess-${Date.now()}`,
      transactionId: txId,
      customerName: sessionData.customerName,
      customerPhone: sessionData.customerPhone,
      vipId: sessionData.vipId,
      startTime: now,
      durationMinutes: sessionData.durationMinutes,
      endTime: now + sessionData.durationMinutes * 60 * 1000,
      isMainBebas: false,
      paymentMethod: sessionData.paymentMethod,
      paymentStatus: sessionData.paymentStatus,
      amount: sessionData.amount,
      gamePlaying: sessionData.gamePlaying,
      cashierName: sessionData.cashierName,
    };
    const wsSent = wsRef.current?.sendStartSessionViaWS?.({
      stationId: station.id,
      session: sessionObj,
      transaction: newTx,
    }) || false;
    if (!wsSent) {
      fetch('/api/sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId: station.id,
          session: sessionObj,
          transaction: newTx,
        }),
      }).catch((e) => console.error('[start-session] REST fallback failed:', e));
    }

    // Auto power ON the TV (if Owner enabled the setting)
    sendTvPowerCommand(station, 'power_on');
  };

  const handleEndSession = (station: GamingStation) => {
    setStationToEnd(station);
  };

  const handleConfirmEndSession = (
    station: GamingStation,
    endDetails?: {
      actualMinutes: number;
      finalAmount: number;
      paymentMethod: PaymentMethod;
      paymentStatus?: 'Lunas' | 'Belum Lunas';
    }
  ) => {
    const session = station.currentSession;
    const now = Date.now();

    // ===== ANTI-FRAUD PRE-FLIGHT (end) =====
    // Karena receiver bisa belum muncul di presence map walau channel sudah benar,
    // kami hanya memberi warning dan tetap melanjutkan proses akhir sesi.
    if (tvAutoPower) {
      const presence = checkTvOnline(station);
      if (presence.status === 'offline') {
        triggerActionToast(
          `⚠ ${station.name}: TV receiver belum terlihat online saat sesi diakhiri, tetapi proses tetap dilanjutkan.`,
          'warning'
        );
      }
    }

    if (session && (session.isMainBebas || session.durationMinutes === 0)) {
      const actualMinutes = endDetails?.actualMinutes || Math.max(1, Math.ceil((now - session.startTime) / (1000 * 60)));
      const finalAmount = endDetails?.finalAmount !== undefined ? endDetails.finalAmount : Math.round((actualMinutes / 60) * station.ratePerHour);
      const finalPaymentMethod = endDetails?.paymentMethod || session.paymentMethod;
      const finalPaymentStatus = endDetails?.paymentStatus || (session.paymentStatus === 'Belum Lunas' || session.paymentStatus === 'Pending' ? 'Belum Lunas' : 'Lunas');

      const pad = (n: number) => n.toString().padStart(2, '0');
      const dateObj = new Date();
      const timeLabel = `${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
      const dateLabel = `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}`;

      const txId = `tx-${Date.now()}`;
      const receiptNumber = `NEX-${dateObj.getFullYear()}${pad(dateObj.getMonth() + 1)}${pad(dateObj.getDate())}-${Math.floor(1000 + Math.random() * 9000)}`;

      const formattedAmount =
        finalAmount >= 1000
          ? `Rp ${Math.round(finalAmount / 1000)}k`
          : `Rp ${finalAmount}`;

      const newTx: Transaction = {
        id: txId,
        stationId: station.id,
        stationName: station.name,
        durationMinutes: actualMinutes,
        durationLabel: `${actualMinutes} Menit (Main Bebas)`,
        paymentMethod: finalPaymentMethod,
        paymentStatus: finalPaymentStatus,
        amount: finalAmount,
        formattedAmount,
        timeLabel,
        dateLabel,
        timestamp: now,
        cashierName: session.cashierName,
        customerName: session.customerName,
        consoleType: station.consoleType,
        receiptNumber,
      };

      setTransactions((prev) => [newTx, ...prev]);

      setStations((prev) =>
        prev.map((st) => {
          if (st.id === station.id) {
            return {
              ...st,
              status: 'available',
              currentSession: undefined,
              totalSessionsToday: st.totalSessionsToday + 1,
              totalRevenueToday: st.totalRevenueToday + finalAmount,
            };
          }
          return st;
        })
      );

      // Main Bebas: only auto-show receipt if status Lunas
      if (finalPaymentStatus === 'Lunas') {
        setSelectedTransactionForReceipt(newTx);
      } else {
        triggerActionToast(
          `Sesi ${station.name} (Main Bebas) diakhiri — Belum Lunas. Struk tersedia di menu History.`
        );
      }
    } else if (session) {
      // Fixed session ending: update payment status and payment method in transaction history
      const finalPaymentMethod = endDetails?.paymentMethod || session.paymentMethod;
      const finalPaymentStatus = endDetails?.paymentStatus || (session.paymentStatus === 'Belum Lunas' || session.paymentStatus === 'Pending' ? 'Belum Lunas' : 'Lunas');

      let updatedReceiptTx: Transaction | null = null;

      setTransactions((prev) => {
        let found = false;
        const next = prev.map((tx) => {
          if (
            (session.transactionId && tx.id === session.transactionId) ||
            (!session.transactionId && tx.stationId === station.id && tx.customerName === session.customerName)
          ) {
            found = true;
            const updatedTx: Transaction = {
              ...tx,
              paymentMethod: finalPaymentMethod,
              paymentStatus: finalPaymentStatus,
            };
            updatedReceiptTx = updatedTx;
            return updatedTx;
          }
          return tx;
        });

        if (!found) {
          const pad = (n: number) => n.toString().padStart(2, '0');
          const dateObj = new Date();
          const timeLabel = `${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
          const dateLabel = `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}`;
          const txId = session.transactionId || `tx-${Date.now()}`;
          const receiptNumber = `NEX-${dateObj.getFullYear()}${pad(dateObj.getMonth() + 1)}${pad(dateObj.getDate())}-${Math.floor(1000 + Math.random() * 9000)}`;
          const durationHours = session.durationMinutes / 60;
          const formattedAmount =
            session.amount >= 1000 ? `Rp ${Math.round(session.amount / 1000)}k` : `Rp ${session.amount}`;

          const fallbackTx: Transaction = {
            id: txId,
            stationId: station.id,
            stationName: station.name,
            durationMinutes: session.durationMinutes,
            durationLabel: `${durationHours} Jam`,
            paymentMethod: finalPaymentMethod,
            paymentStatus: finalPaymentStatus,
            amount: session.amount,
            formattedAmount,
            timeLabel,
            dateLabel,
            timestamp: now,
            cashierName: session.cashierName,
            customerName: session.customerName,
            consoleType: station.consoleType,
            receiptNumber,
          };
          updatedReceiptTx = fallbackTx;
          return [fallbackTx, ...next];
        }

        return next;
      });

      setStations((prev) =>
        prev.map((st) => {
          if (st.id === station.id) {
            return {
              ...st,
              status: 'available',
              currentSession: undefined,
            };
          }
          return st;
        })
      );

      // Fixed package: only auto-show receipt if status Lunas
      if (updatedReceiptTx && updatedReceiptTx.paymentStatus === 'Lunas') {
        setSelectedTransactionForReceipt(updatedReceiptTx);
      } else if (updatedReceiptTx) {
        triggerActionToast(
          `Sesi ${station.name} diakhiri (Belum Lunas). Struk tersedia di menu History.`
        );
      }
    }

    // ===== VIP loyalty accrual =====
    if (session?.vipId) {
      const hoursPlayed = session.durationMinutes / 60;
      // Reward: Rp 5.000 per Rp 100.000 spent = 5% in loyalty points (capped)
      const earnedPoints = Math.min(500, Math.floor(session.amount / 1000));
      setVipList((prev) =>
        prev.map((v) => {
          if (v.id !== session.vipId) return v;
          const newTotalSpent = v.totalSpent + session.amount;
          const newHours = v.playHoursTotal + hoursPlayed;
          const newPoints = v.loyaltyPoints + earnedPoints;
          // Auto-promote tier based on totalSpent
          let newTier = v.tier;
          if (newTotalSpent >= 5_000_000) newTier = 'Cyber Elite';
          else if (newTotalSpent >= 2_000_000) newTier = 'Platinum';
          else if (newTotalSpent >= 500_000) newTier = 'Gold';
          return {
            ...v,
            totalSpent: newTotalSpent,
            playHoursTotal: newHours,
            loyaltyPoints: newPoints,
            tier: newTier,
          };
        })
      );
    }

    // ===== Sync end-session to server (WS preferred, REST fallback) =====
    const isMainBebas = !!(session?.isMainBebas || session?.durationMinutes === 0);
    const endPayload = {
      stationId: station.id,
      actualMinutes:
        endDetails?.actualMinutes ||
        Math.max(1, Math.ceil((now - (session?.startTime || now)) / 60000)),
      finalAmount:
        endDetails?.finalAmount !== undefined
          ? endDetails.finalAmount
          : Math.round(((endDetails?.actualMinutes || 60) / 60) * station.ratePerHour),
      paymentMethod:
        endDetails?.paymentMethod || session?.paymentMethod || 'Cash',
      paymentStatus:
        endDetails?.paymentStatus ||
        (session?.paymentStatus === 'Belum Lunas' || session?.paymentStatus === 'Pending'
          ? 'Belum Lunas'
          : 'Lunas'),
    };
    const wsEndMethod = isMainBebas
      ? wsRef.current?.sendEndMainBebasViaWS
      : wsRef.current?.sendEndFixedViaWS;
    const wsEndSent = wsEndMethod?.(endPayload) || false;
    if (!wsEndSent) {
      const endpoint = isMainBebas
        ? '/api/sessions/end-main-bebas'
        : '/api/sessions/end-fixed';
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(endPayload),
      }).catch((e) => console.error('[end-session] REST fallback failed:', e));
    }

    // Auto power OFF the TV (if Owner enabled the setting).
    // Dipanggil di akhir setelah station benar-benar free — TV mati hemat listrik.
    sendTvPowerCommand(station, 'power_off');

    setStationToEnd(null);
  };

  const handleExtendSession = (station: GamingStation, extraMinutes: number) => {
    setStations((prev) =>
      prev.map((st) => {
        if (st.id === station.id && st.currentSession) {
          const newDuration = st.currentSession.durationMinutes + extraMinutes;
          const newEndTime = st.currentSession.endTime + extraMinutes * 60 * 1000;
          return {
            ...st,
            currentSession: {
              ...st.currentSession,
              durationMinutes: newDuration,
              endTime: newEndTime,
            },
          };
        }
        return st;
      })
    );
  };

  // ===== Move session from one station to another, PRESERVING remaining duration =====
  const handleOpenMoveSession = (station: GamingStation) => {
    if (!station.currentSession) return;
    setStationToMove(station);
  };

  const handleConfirmMoveSession = (targetStationId: string) => {
    if (!stationToMove || !stationToMove.currentSession) return;
    if (targetStationId === stationToMove.id) return;

    const sourceSess = stationToMove.currentSession;
    const now = Date.now();
    const sourceStationId = stationToMove.id;

    // ===== Preserve full session timeline =====
    // Strategy: keep the ORIGINAL startTime, endTime, and durationMinutes intact.
    // This way the countdown, progress bar, and "Main Bebas" elapsed counter
    // continue exactly where they were — no visible reset.
    const movedSession: typeof sourceSess = {
      ...sourceSess,
      // Keep all timing fields identical to source
      startTime: sourceSess.startTime,
      endTime: sourceSess.endTime,
      durationMinutes: sourceSess.durationMinutes,
    };

    // 1. Update local React state immediately for snappy UX
    setStations((prev) =>
      prev.map((st) => {
        if (st.id === sourceStationId) {
          // Source becomes available again
          return {
            ...st,
            status: 'available',
            currentSession: undefined,
          };
        }
        if (st.id === targetStationId) {
          // Target takes over the session
          let targetStatus: 'occupied' | 'warning' | 'available' = 'occupied';
          if (!sourceSess.isMainBebas && sourceSess.durationMinutes > 0) {
            const remainingMs = Math.max(0, sourceSess.endTime - now);
            targetStatus =
              remainingMs > 0 && remainingMs <= 15 * 60 * 1000
                ? 'warning'
                : 'occupied';
          }
          return {
            ...st,
            status: targetStatus,
            currentSession: movedSession,
          };
        }
        return st;
      })
    );

    // 2. Send MOVE_SESSION to server.ts via WebSocket for:
    //    - Persistence to data-server/stations.json
    //    - Broadcast to other connected operators (multi-device sync)
    //    - Audit log via console
    const wsSent = wsRef.current?.sendMoveSessionViaWS?.(sourceStationId, targetStationId) || false;
    if (!wsSent) {
      // Fallback to REST if WS not connected
      fetch('/api/stations/move-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceStationId, targetStationId }),
      }).catch((e) =>
        console.error('[move-session] REST fallback failed:', e)
      );
    }

    // 3. Auto-broadcast branding to the NEW target channel
    // (keeps the overlay on the same station after move)
    if (brandingConfig.enabled && brandingConfig.text) {
      const targetStation = stations.find((s) => s.id === targetStationId);
      const sourceStation = stationToMove;
      if (targetStation && sourceStation) {
        const sourceChannel = stationChannelMap(sourceStation);
        const targetChannel = stationChannelMap(targetStation);
        // Hide on source, show on target
        wsRef.current?.publishToChannel?.(sourceChannel, { payload: { action: 'hide' } });
        wsRef.current?.publishToChannel?.(targetChannel, {
          payload: {
            action: 'show',
            text: brandingConfig.text,
            subtitle: brandingConfig.subtitle,
            color: brandingConfig.color,
            bg: brandingConfig.bg,
            position: brandingConfig.position,
          },
        });
      }
    }

    // Compute human-readable summary for toast
    let summaryLabel: string;
    if (sourceSess.isMainBebas || sourceSess.durationMinutes === 0) {
      const elapsedMin = Math.max(1, Math.ceil((now - sourceSess.startTime) / (1000 * 60)));
      summaryLabel = `Main Bebas lanjut (${elapsedMin} mnt berjalan)`;
    } else {
      const remainingMs = Math.max(0, sourceSess.endTime - now);
      const remainingMin = Math.max(1, Math.ceil(remainingMs / (1000 * 60)));
      summaryLabel = `${remainingMin} mnt lagi`;
    }

    triggerActionToast(
      `Sesi ${stationToMove.name} → ${stations.find((s) => s.id === targetStationId)?.name || targetStationId}: durasi dipertahankan (${summaryLabel}). Tersinkron ke server.`,
      'success'
    );

    setStationToMove(null);
  };

  const handleAddVip = (newVipData: Omit<VIPMember, 'id'>) => {
    const newVip: VIPMember = {
      ...newVipData,
      id: `vip-${Date.now()}`,
    };
    setVipList((prev) => [newVip, ...prev]);

    // Sync VIP add to server (WS preferred, REST fallback)
    const wsSent = wsRef.current?.sendAddVipViaWS?.(newVip) || false;
    if (!wsSent) {
      fetch('/api/vips/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newVip),
      }).catch((e) => console.error('[add-vip] REST fallback failed:', e));
    }
  };

  const handleUpdateVip = (id: string, updates: Partial<VIPMember>) => {
    setVipList((prev) =>
      prev.map((v) => (v.id === id ? { ...v, ...updates } : v))
    );
  };

  const handleDeleteVip = (id: string) => {
    setVipList((prev) => prev.filter((v) => v.id !== id));
  };

  // ===== CRUD Akun Karyawan (hanya Owner yang punya akses dari UI) =====
  const handleUpdateEmployeeAccount = (id: string, updates: Partial<UserAccount>) => {
    setEmployeeAccounts((prev) =>
      prev.map((acc) => (acc.id === id ? { ...acc, ...updates } : acc))
    );
  };

  const handleDeleteEmployeeAccount = (id: string) => {
    setEmployeeAccounts((prev) => prev.filter((acc) => acc.id !== id));
    // Bersihkan permission map untuk akun yang dihapus
    setUserPermissionsMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  // ===== Update profil sendiri (semua user: Owner & Karyawan) =====
  // Field yang bisa diubah: name, email, pin (sudah di-hash oleh ProfileSettingsModal).
  // Username tidak diubah lewat sini — itu identitas login immutable.
  const handleUpdateOwnProfile = (
    userId: string,
    updates: { name?: string; email?: string; pin?: string }
  ) => {
    if (userId === DEFAULT_OWNER_ACCOUNT.id) {
      // Update profil Owner: tulis ke ownerProfile (single source of truth)
      setOwnerProfile((prev) => ({ ...prev, ...updates }));
      setCurrentUser((prev) =>
        prev.id === DEFAULT_OWNER_ACCOUNT.id
          ? { ...prev, ...updates }
          : prev
      );
    } else {
      // Update profil Karyawan
      setEmployeeAccounts((prev) =>
        prev.map((acc) => (acc.id === userId ? { ...acc, ...updates } : acc))
      );
      // Jika user sedang login sebagai karyawan ini, sinkronkan juga currentUser
      setCurrentUser((prev) =>
        prev.id === userId ? { ...prev, ...updates } : prev
      );
    }
  };

  const handleSaveStation = (stationData: {
    id?: string;
    name: string;
    consoleType: string;
    ratePerHour: number;
  }) => {
    if (stationData.id) {
      // Edit existing — patch local state, then sync to server (WS-first, REST fallback).
      const updated: GamingStation = {
        // Look up full station to preserve counters/status/session; only fields the form edits change.
        ...(stations.find((s) => s.id === stationData.id) as GamingStation),
        name: stationData.name,
        consoleType: stationData.consoleType,
        ratePerHour: stationData.ratePerHour,
      };
      setStations((prev) => prev.map((s) => (s.id === stationData.id ? updated : s)));
      const wsSent = wsRef.current?.sendUpdateStationViaWS?.(updated) || false;
      if (!wsSent) {
        fetch('/api/stations/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ station: updated }),
        }).catch((e) => console.error('[update-station] REST fallback failed:', e));
      }
    } else {
      // Add new — local optimistic insert, then sync to server so other clients
      // (and post-restart DB state) see it. Server generates the canonical id on
      // first insert; we use a placeholder locally until WS broadcast confirms.
      const newStation: GamingStation = {
        id: `st-${Date.now().toString().slice(-6)}`,
        name: stationData.name,
        consoleType: stationData.consoleType,
        ratePerHour: stationData.ratePerHour,
        status: 'available',
        totalSessionsToday: 0,
        totalRevenueToday: 0,
      };
      setStations((prev) => [...prev, newStation]);
      const wsSent = wsRef.current?.sendAddStationViaWS?.(newStation) || false;
      if (!wsSent) {
        fetch('/api/stations/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ station: newStation }),
        }).catch((e) => console.error('[add-station] REST fallback failed:', e));
      }
    }
  };

  const handleDeleteStation = (stationId: string) => {
    setStations((prev) => prev.filter((s) => s.id !== stationId));

    // Sync station delete to server
    const wsSent = wsRef.current?.sendDeleteStationViaWS?.(stationId) || false;
    if (!wsSent) {
      fetch('/api/stations/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationId }),
      }).catch((e) => console.error('[delete-station] REST fallback failed:', e));
    }
  };

  const handleTogglePaymentStatus = (txId: string) => {
    setTransactions((prev) =>
      prev.map((tx) => {
        if (tx.id === txId) {
          const newStatus =
            tx.paymentStatus === 'Belum Lunas' || tx.paymentStatus === 'Pending'
              ? 'Lunas'
              : 'Belum Lunas';
          return { ...tx, paymentStatus: newStatus };
        }
        return tx;
      })
    );

    // Sync toggle payment to server
    const wsSent = wsRef.current?.sendTogglePaymentViaWS?.(txId) || false;
    if (!wsSent) {
      fetch('/api/transactions/toggle-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: txId }),
      }).catch((e) => console.error('[toggle-payment] REST fallback failed:', e));
    }
  };

  const handleDeleteTransaction = (txId: string) => {
    setTransactions((prev) => prev.filter((tx) => tx.id !== txId));

    // Sync delete transaction to server
    const wsSent = wsRef.current?.sendDeleteTransactionsViaWS?.([txId]) || false;
    if (!wsSent) {
      fetch('/api/transactions/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionIds: [txId] }),
      }).catch((e) => console.error('[delete-tx] REST fallback failed:', e));
    }
  };

  const handleDeleteMultipleTransactions = (txIds: string[]) => {
    setTransactions((prev) => prev.filter((tx) => !txIds.includes(tx.id)));

    // Sync multi-delete to server
    const wsSent = wsRef.current?.sendDeleteTransactionsViaWS?.(txIds) || false;
    if (!wsSent) {
      fetch('/api/transactions/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionIds: txIds }),
      }).catch((e) => console.error('[delete-tx-multi] REST fallback failed:', e));
    }
  };

  // ===== Auto-detect expired fixed sessions (anti-fraud watchdog) =====
  // Computes list of stations whose fixed-package timer has already hit 00:00,
  // and auto-opens SessionExpiredModal for the oldest one that hasn't been dismissed yet.
  const now = Date.now();
  const expiredStationsList: GamingStation[] = stations.filter((s) => {
    const sess = s.currentSession;
    if (!sess) return false;
    if (sess.isMainBebas || sess.durationMinutes === 0) return false;
    return sess.endTime <= now;
  });

  useEffect(() => {
    if (autoExpiredStation) return; // already showing
    if (stationToEnd) return; // user manually ended another station
    const visible = expiredStationsList.filter(
      (s) => !dismissedExpiredIds.includes(s.id)
    );
    if (visible.length > 0) {
      // Pick the one whose timer expired earliest (most overdue first)
      const sorted = [...visible].sort(
        (a, b) =>
          (a.currentSession?.endTime || 0) - (b.currentSession?.endTime || 0)
      );
      setAutoExpiredStation(sorted[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stations, dismissedExpiredIds, autoExpiredStation, stationToEnd]);

  // Clear dismissed IDs whenever the underlying expired session is resolved
  useEffect(() => {
    if (expiredStationsList.length === 0 && dismissedExpiredIds.length > 0) {
      setDismissedExpiredIds([]);
    }
  }, [expiredStationsList.length, dismissedExpiredIds.length]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col font-sans pb-24 md:pb-12">
      {/* Auth Gate: sembunyikan seluruh UI sampai user login. Modal Login
          akan ter-render di akhir dan tampil sebagai full-screen overlay
          (background gelap + backdrop blur). */}
      {!isAuthenticated && (
        <div className="fixed inset-0 z-50 bg-slate-900"></div>
      )}
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenNewSession={() => handleOpenStartSession()}
        occupiedCount={occupiedCount}
        totalCount={stations.length}
        currentUser={currentUser}
        onOpenLoginModal={() => setIsLoginModalOpen(true)}
        onOpenPermissionManager={() => setIsPermissionManagerOpen(true)}
        onOpenProfile={() => setIsProfileOpen(true)}
        onLogout={handleLogout}
        hasPermission={hasPermission}
      />

      {/* Floating Expired-Session Alert Bar (visible whenever ANY fixed session has hit 00:00) */}
      <ExpiredSessionAlertBar
        expiredStations={expiredStationsList}
        onSelectStation={(st) => {
          setAutoExpiredStation(null);
          setStationToEnd(st);
        }}
        onDismiss={() => setDismissedExpiredIds(expiredStationsList.map((s) => s.id))}
      />

      {/* Restricted Toast Alert */}
      {restrictedToast && (
        <div className="fixed top-20 right-4 z-50 bg-rose-600 text-white font-bold text-xs px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 animate-bounce">
          <span className="material-symbols-outlined text-lg">lock</span>
          <span>{restrictedToast}</span>
        </div>
      )}

      {/* Action Toast (Belum Lunas / info / success) */}
      {actionToast && (
        <div
          className={`fixed top-20 right-4 z-50 text-white font-bold text-xs px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 animate-fade-in max-w-sm ${
            actionToast.tone === 'warning'
              ? 'bg-amber-600'
              : actionToast.tone === 'success'
              ? 'bg-emerald-600'
              : 'bg-cyan-700'
          }`}
        >
          <span className="material-symbols-outlined text-lg">
            {actionToast.tone === 'warning'
              ? 'info'
              : actionToast.tone === 'success'
              ? 'check_circle'
              : 'receipt'}
          </span>
          <span>{actionToast.message}</span>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-grow p-4 md:p-6 max-w-container-max-width mx-auto w-full space-y-6">
        {activeTab === 'dashboard' && hasPermission('dashboard') && (
          <div className="space-y-6 animate-fade-in">
            {/* (Card absensi & performa karyawan dipindahkan ke tab Absensi — lihat AttendancePage) */}
            {/* Quick Station Units Live Overview */}
            <section className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-5 space-y-4 shadow-sm">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-cyan-700">gamepad</span>
                  <h2 className="font-bold text-lg text-slate-900">
                    Terminal Station Aktif
                  </h2>
                </div>
                <button
                  onClick={() => setActiveTab('units')}
                  className="font-label-ts text-xs text-cyan-700 hover:text-cyan-800 uppercase font-bold tracking-wider cursor-pointer"
                >
                  LIHAT SEMUA {stations.length} UNIT
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {stations.slice(0, 4).map((st) => (
                  <StationCard
                    key={st.id}
                    station={st}
                    onStartSession={handleOpenStartSession}
                    onEndSession={handleEndSession}
                    onExtendSession={handleExtendSession}
                  />
                ))}
              </div>
            </section>

            {/* Recent Transactions Widget */}
            <RecentTransactions
              transactions={transactions.slice(0, 5)}
              onViewAll={() => setActiveTab('history')}
              onSelectTransaction={(tx) => setSelectedTransactionForReceipt(tx)}
            />
          </div>
        )}

        {activeTab === 'units' && hasPermission('units') && (
          <UnitsTab
            stations={stations}
            ratesPreset={rates}
            onStartSession={handleOpenStartSession}
            onEndSession={handleEndSession}
            onExtendSession={handleExtendSession}
            onMoveSession={handleOpenMoveSession}
            onTvControl={setTvStationForControl}
            onSaveStation={handleSaveStation}
            onDeleteStation={handleDeleteStation}
            tvStatusMap={(() => {
              // Build per-station TV status map from global tvPresenceMap.
              const map: Record<string, { status: 'online' | 'idle' | 'offline' | 'unknown'; latencyMs: number | null; subscribers: number }> = {};
              for (const st of stations) {
                const status = checkTvOnline(st);
                map[st.id] = {
                  status: status.status,
                  latencyMs: status.latencyMs,
                  subscribers: status.subscribers,
                };
              }
              return map;
            })()}
            onReconnectTv={triggerTvReconnect}
          />
        )}

        {activeTab === 'history' && hasPermission('history') && (
          <div className="space-y-6 animate-fade-in pb-20">
            <RevenueCard
              dailyAmount={dailyAmount}
              weeklyAmount={weeklyAmount}
              monthlyAmount={monthlyAmount}
            />
            <OutstandingReceivableCard
              transactions={transactions}
              stations={stations}
              onSelectTransaction={(tx) => setSelectedTransactionForReceipt(tx)}
            />
            <HistoryTab
              transactions={transactions}
              currentUser={currentUser}
              onSelectTransaction={(tx) => setSelectedTransactionForReceipt(tx)}
              onOpenNewSession={() => handleOpenStartSession()}
              onDeleteTransaction={handleDeleteTransaction}
              onDeleteMultipleTransactions={handleDeleteMultipleTransactions}
              onTogglePaymentStatus={handleTogglePaymentStatus}
            />
          </div>
        )}

        {activeTab === 'absensi' && hasPermission('absensi') && (
          <AttendancePage
            currentUser={currentUser}
            attendanceMap={attendanceMap}
            staffStateMap={staffStateMap}
            employeeAccounts={employeeAccounts}
            onClockIn={handleClockIn}
            onClockOut={handleClockOut}
          />
        )}

        {activeTab === 'users' && hasPermission('users') && (
          <UsersTab
            currentUser={currentUser}
            staffList={staffList}
            vipList={vipList}
            employeeAccounts={employeeAccounts}
            attendanceMap={attendanceMap}
            onAddVip={handleAddVip}
            onUpdateVip={handleUpdateVip}
            onDeleteVip={handleDeleteVip}
            onAddEmployee={handleAddEmployeeAccount}
            onUpdateEmployee={handleUpdateEmployeeAccount}
            onDeleteEmployee={handleDeleteEmployeeAccount}
            onClockIn={handleClockIn}
            onClockOut={handleClockOut}
          />
        )}

        {activeTab === 'settings' && hasPermission('settings') && (
          <SettingsTab
            rates={rates}
            currentUser={currentUser}
            onOpenPermissionManager={() => setIsPermissionManagerOpen(true)}
            onUpdateRates={(newRates) => {
              setRates(newRates);
              // Update stations default rates
              setStations((prev) =>
                prev.map((s) => ({
                  ...s,
                  ratePerHour: newRates[s.consoleType] || s.ratePerHour,
                }))
              );
            }}
            brandingConfig={brandingConfig}
            onUpdateBranding={setBrandingConfig}
            onBroadcastBranding={handleBroadcastBrandingAll}
            tvAutoPower={tvAutoPower}
            onUpdateTvAutoPower={setTvAutoPower}
          />
        )}
      </main>

      {/* Bottom Navigation Bar */}
      <BottomNavBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        hasPermission={hasPermission}
        onRestrictedClick={triggerRestrictedToast}
      />

      {/* Modals */}
      <NewSessionModal
        isOpen={isNewSessionOpen}
        onClose={() => {
          setIsNewSessionOpen(false);
          // Clear stale selectedStationId so next open derives a fresh available station
          setSelectedStationIdForNewSession(undefined);
        }}
        stations={stations}
        selectedStationId={selectedStationIdForNewSession}
        vipList={vipList}
        onConfirmSession={handleConfirmNewSession}
      />

      <ReceiptModal
        transaction={selectedTransactionForReceipt}
        onClose={() => setSelectedTransactionForReceipt(null)}
      />

      <EndSessionModal
        station={stationToEnd}
        isOpen={!!stationToEnd}
        onClose={() => setStationToEnd(null)}
        onConfirm={handleConfirmEndSession}
      />

      <SessionExpiredModal
        station={autoExpiredStation}
        isOpen={!!autoExpiredStation}
        onClose={() => setAutoExpiredStation(null)}
        onConfirm={handleConfirmEndSession}
      />

      <MoveStationModal
        sourceStation={stationToMove}
        stations={stations}
        isOpen={!!stationToMove}
        onClose={() => setStationToMove(null)}
        onConfirm={handleConfirmMoveSession}
      />

      <TVControlPanel
        station={tvStationForControl}
        isOpen={!!tvStationForControl}
        onClose={() => setTvStationForControl(null)}
        onSendCommand={handleTvControl}
        pairings={tvPairings}
        tvClaims={tvClaims}
        onSavePairing={(pairing) => {
          const next = tvPairings.some((p) => p.stationId === pairing.stationId)
            ? tvPairings.map((p) => p.stationId === pairing.stationId ? pairing : p)
            : [...tvPairings, pairing];
          setTvPairings(next);
          fetch('/api/tv/pairings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pairings: next }),
          })
            .then(() => triggerActionToast(`✅ Pairing ${pairing.label} → ${pairing.tvChannel} tersimpan`, 'success'))
            .catch((e) => {
              console.warn('[tv-pairings] save failed:', e);
              triggerActionToast(`❌ Gagal simpan pairing: ${(e as Error).message}`, 'warning');
            });
        }}
      />

      <LoginModal
        isOpen={isLoginModalOpen || !isAuthenticated}
        isAuthGate={!isAuthenticated}
        onClose={() => setIsLoginModalOpen(false)}
        currentUser={isAuthenticated ? currentUser : null}
        employeeAccounts={employeeAccounts}
        ownerProfile={ownerProfile}
        onLogin={(user) => {
          setCurrentUser(user);
          setIsAuthenticated(true);
          setIsLoginModalOpen(false);
        }}
        onOpenPermissionManager={() => setIsPermissionManagerOpen(true)}
      />

      <PermissionManagerModal
        isOpen={isPermissionManagerOpen}
        onClose={() => setIsPermissionManagerOpen(false)}
        employeeAccounts={employeeAccounts}
        userPermissionsMap={userPermissionsMap}
        onSaveUserPermissions={handleSaveUserPermissions}
        onAddEmployeeAccount={handleAddEmployeeAccount}
      />

      <ProfileSettingsModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        currentUser={currentUser}
        onSaveProfile={handleUpdateOwnProfile}
      />
    </div>
  );
}
