import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import bcryptjs from 'bcryptjs';
import { randomUUID } from 'crypto';

export function openDatabase(dbPath: string): Database.Database {
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  // Migrations: add columns to existing DBs (idempotent)
  const placesColumns = db.prepare("SELECT name FROM pragma_table_info('places')").all() as { name: string }[];
  const placesCols = new Set(placesColumns.map(c => c.name));
  if (!placesCols.has('start_date')) db.exec('ALTER TABLE places ADD COLUMN start_date TEXT');
  if (!placesCols.has('end_date')) db.exec('ALTER TABLE places ADD COLUMN end_date TEXT');

  // Seed: garantir que o usuário master existe
  const masterEmail = 'master@master.com';
  let master = db
    .prepare('SELECT id FROM users WHERE email = ?')
    .get(masterEmail) as { id: string } | undefined;

  if (!master) {
    const masterId = randomUUID();
    const hash = bcryptjs.hashSync('12345', 10);
    db.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)').run(
      masterId,
      masterEmail,
      hash,
    );
    master = { id: masterId };
  }

  // Associar buildings sem dono ao master (DBs existentes que não tinham auth)
  const orphans = db
    .prepare(`
      SELECT b.id FROM buildings b
      WHERE NOT EXISTS (SELECT 1 FROM building_users bu WHERE bu.building_id = b.id)
    `)
    .all() as Array<{ id: string }>;

  const insertBuildingUser = db.prepare(
    'INSERT OR IGNORE INTO building_users (building_id, user_id) VALUES (?, ?)',
  );
  const associateOrphans = db.transaction(() => {
    for (const row of orphans) {
      insertBuildingUser.run(row.id, master!.id);
    }
  });
  associateOrphans();

  return db;
}

export type { Database };
