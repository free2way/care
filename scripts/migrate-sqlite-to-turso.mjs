import { existsSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createClient } from "@libsql/client";

const localDbPath = process.env.SQLITE_PATH || join(process.cwd(), "data", "techguard.db");
const tursoUrl = process.env.TURSO_DATABASE_URL || process.env.care_TURSO_DATABASE_URL || "";
const tursoAuthToken = process.env.TURSO_AUTH_TOKEN || process.env.care_TURSO_AUTH_TOKEN || "";

if (!existsSync(localDbPath)) {
  throw new Error(`Local SQLite database not found: ${localDbPath}`);
}
if (!tursoUrl || !tursoAuthToken) {
  throw new Error("Missing TURSO_DATABASE_URL/TURSO_AUTH_TOKEN or care_TURSO_DATABASE_URL/care_TURSO_AUTH_TOKEN");
}

const tables = [
  "users",
  "family_links",
  "medication_schedules",
  "medication_logs",
  "care_tasks",
  "weather_settings",
  "alerts",
  "push_subscriptions",
  "notification_channels",
  "blood_pressure_logs",
  "checkup_reports",
  "notifications",
  "notification_preferences",
];

const schemaSql = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS family_links (
  id TEXT PRIMARY KEY,
  caregiver_id TEXT NOT NULL,
  elder_id TEXT NOT NULL,
  relation TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS medication_schedules (
  id TEXT PRIMARY KEY,
  elder_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  medicine_name TEXT NOT NULL,
  dose_note TEXT,
  meal_timing TEXT,
  time_of_day TEXT NOT NULL,
  repeat_rule TEXT NOT NULL,
  remind_elder INTEGER NOT NULL,
  remind_caregiver INTEGER NOT NULL,
  enabled INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS medication_logs (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL,
  elder_id TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL,
  completed_at TEXT,
  note TEXT,
  UNIQUE(schedule_id, due_date)
);
CREATE TABLE IF NOT EXISTS care_tasks (
  id TEXT PRIMARY KEY,
  elder_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date TEXT NOT NULL,
  due_time TEXT NOT NULL,
  repeat_rule TEXT NOT NULL,
  status TEXT NOT NULL,
  completed_at TEXT,
  completion_note TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS weather_settings (
  elder_id TEXT PRIMARY KEY,
  city TEXT NOT NULL,
  district TEXT,
  care_time TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  elder_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL,
  ref_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT,
  auth TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notification_channels (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  channel_type TEXT NOT NULL,
  config_json TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_id, channel_type)
);
CREATE TABLE IF NOT EXISTS blood_pressure_logs (
  id TEXT PRIMARY KEY,
  elder_id TEXT NOT NULL,
  measured_by TEXT NOT NULL,
  systolic INTEGER NOT NULL,
  diastolic INTEGER NOT NULL,
  pulse INTEGER,
  note TEXT,
  measured_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS checkup_reports (
  id TEXT PRIMARY KEY,
  elder_id TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  file_name TEXT,
  image_data TEXT NOT NULL,
  summary TEXT NOT NULL,
  advice_json TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT PRIMARY KEY,
  task_assigned INTEGER NOT NULL DEFAULT 1,
  task_completed INTEGER NOT NULL DEFAULT 1,
  medication_completed INTEGER NOT NULL DEFAULT 1,
  blood_pressure_recorded INTEGER NOT NULL DEFAULT 1,
  blood_pressure_abnormal INTEGER NOT NULL DEFAULT 1,
  help_requested INTEGER NOT NULL DEFAULT 1,
  feishu_enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
`;

const local = new DatabaseSync(localDbPath);
const turso = createClient({ url: tursoUrl, authToken: tursoAuthToken });

await runSchema();

for (const table of tables) {
  const columns = local.prepare(`PRAGMA table_info(${table})`).all().map((item) => item.name);
  if (!columns.length) {
    console.log(`${table}: skipped, missing locally`);
    continue;
  }
  const rows = local.prepare(`SELECT ${columns.map(quoteIdent).join(", ")} FROM ${quoteIdent(table)}`).all();
  if (!rows.length) {
    console.log(`${table}: 0 rows`);
    continue;
  }
  const placeholders = columns.map(() => "?").join(", ");
  const sql = `INSERT OR REPLACE INTO ${quoteIdent(table)} (${columns.map(quoteIdent).join(", ")}) VALUES (${placeholders})`;
  for (const row of rows) {
    await turso.execute({
      sql,
      args: columns.map((column) => normalizeValue(row[column])),
    });
  }
  console.log(`${table}: ${rows.length} rows migrated`);
}

local.close();
console.log("Turso migration completed.");

async function runSchema() {
  const statements = schemaSql
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await turso.execute(statement);
  }
}

function quoteIdent(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function normalizeValue(value) {
  if (typeof value === "bigint") return Number(value);
  return value;
}
