import type { Database } from 'better-sqlite3';
import type { Package } from 'agilean';

export class PackageRepository {
  constructor(private db: Database) {}

  bulkUpdate(packages: Package[]): void {
    const update = this.db.prepare(`
      UPDATE packages SET start_col = @startCol, end_col = @endCol WHERE id = @id
    `);
    const updateAll = this.db.transaction(() => {
      for (const pkg of packages) {
        update.run({ id: pkg.getId(), startCol: pkg.start(), endCol: pkg.end() });
      }
    });
    updateAll();
  }
}
