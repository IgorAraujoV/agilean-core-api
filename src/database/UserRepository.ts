import type { Database } from 'better-sqlite3';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
}

export class UserRepository {
  constructor(private db: Database) {}

  findByEmail(email: string): UserRow | undefined {
    return this.db
      .prepare('SELECT id, email, password_hash FROM users WHERE email = ?')
      .get(email) as UserRow | undefined;
  }
}
