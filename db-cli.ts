/**
 * Database CLI — artisan-style commands for the Command Center.
 *
 * Usage:
 *   npx tsx db-cli.ts export <file.json>     # backup semua data
 *   npx tsx db-cli.ts import <file.json>     # restore (UPSERT, schema tetap)
 *   npx tsx db-cli.ts fresh <file.json>      # drop + recreate + import (seperti migrate:fresh --seed)
 *   npx tsx db-cli.ts info                   # tampilkan info & jumlah row
 *   npx tsx db-cli.ts reset                  # drop semua tabel (hati-hati!)
 *
 * Setelah pakai ini di device baru, restart `npm run dev` agar in-memory
 * state di server.ts ikut ter-refresh.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  loadAll,
  saveStations,
  saveTransactions,
  saveVips,
  saveEmployees,
  savePermissions,
  saveSettings,
  resetDatabase,
  DATA_DIR_PATH,
  DBState,
} from './server-db';

function parseArgs(): { cmd: string; file?: string } {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const file = args[1];
  return { cmd, file };
}

function logEmoji(emoji: string, msg: string) {
  console.log(`${emoji}  ${msg}`);
}

async function cmdExport(file?: string) {
  const target = file ?? path.join(DATA_DIR_PATH, `backup-${Date.now()}.json`);
  const state = await loadAll();
  const payload = {
    meta: {
      app: 'command-center',
      version: 1,
      exportedAt: new Date().toISOString(),
      counts: {
        stations: state.stations.length,
        transactions: state.transactions.length,
        vips: state.vips.length,
        employees: state.employees.length,
        permissions: state.permissions.length,
      },
    },
    data: state,
  };
  fs.writeFileSync(target, JSON.stringify(payload, null, 2), 'utf-8');
  logEmoji('✅', `Backup written to: ${target}`);
  console.log('   Counts:', JSON.stringify(payload.meta.counts, null, 2));
}

async function cmdImport(file: string, reset: boolean) {
  if (!file || !fs.existsSync(file)) {
    console.error(`❌ File not found: ${file}`);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const state: DBState = (raw && raw.data) ? raw.data : raw;

  if (reset) {
    logEmoji('🔥', 'Reset mode — dropping all tables first');
    await resetDatabase();
    logEmoji('✅', 'Database wiped. Re-importing...');
  }

  await saveEmployees(state.employees);
  await savePermissions(state.permissions);
  await saveVips(state.vips);
  await saveStations(state.stations);
  await saveTransactions(state.transactions);
  await saveSettings(state.settings);

  logEmoji('✅', `Imported ${state.stations.length} stations, ${state.transactions.length} transactions, ${state.vips.length} VIPs, ${state.employees.length} employees, ${state.permissions.length} permission rows`);
  logEmoji('⚠️ ', 'Restart `npm run dev` agar in-memory state ikut ter-refresh.');
}

async function cmdInfo() {
  const state = await loadAll();
  console.log('📊  Command Center — Database Info');
  console.log('   Data dir:', DATA_DIR_PATH);
  console.log('   Stations:        ', state.stations.length);
  console.log('   Transactions:    ', state.transactions.length);
  console.log('   VIPs:            ', state.vips.length);
  console.log('   Employees:       ', state.employees.length);
  console.log('   Permission rows: ', state.permissions.length);
  console.log('   Settings:        ', JSON.stringify(state.settings).slice(0, 80) + '...');
}

async function cmdReset() {
  logEmoji('🔥', 'Dropping all tables...');
  await resetDatabase();
  logEmoji('✅', 'All tables dropped. Schema will be re-created on next server start.');
}

async function main() {
  const { cmd, file } = parseArgs();
  try {
    switch (cmd) {
      case 'export': await cmdExport(file); break;
      case 'import': await cmdImport(file!, false); break;
      case 'fresh':  await cmdImport(file!, true); break;
      case 'info':   await cmdInfo(); break;
      case 'reset':  await cmdReset(); break;
      default:
        console.log(`Command Center DB CLI

Usage:
  npx tsx db-cli.ts export [file.json]   # backup
  npx tsx db-cli.ts import <file.json>   # restore (UPSERT)
  npx tsx db-cli.ts fresh  <file.json>   # wipe + import (analog: migrate:fresh --seed)
  npx tsx db-cli.ts info                  # show counts
  npx tsx db-cli.ts reset                # drop all tables (caution!)
`);
    }
  } catch (e) {
    console.error('❌ Error:', (e as Error).message);
    process.exit(1);
  }
  // Force exit — PGlite keeps the event loop alive
  process.exit(0);
}

main();
