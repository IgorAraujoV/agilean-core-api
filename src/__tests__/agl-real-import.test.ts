import fs from 'fs';
import path from 'path';
import { buildApp } from '../app';
import { AglImportService } from '../services/AglImportService';

const AGL_PATH = path.resolve(__dirname, '..', '..', '..', 'bs-jade.agl');

const hasRealFile = fs.existsSync(AGL_PATH);

(hasRealFile ? describe : describe.skip)('Real AGL import (bs-jade.agl)', () => {
  it('should import without FK errors (direct service call)', () => {
    const agl = JSON.parse(fs.readFileSync(AGL_PATH, 'utf-8'));
    const app = buildApp();

    // Create user first
    const db = app.ctx.db;
    const userId = 'test-user-import';
    db.prepare('INSERT OR IGNORE INTO users (id, email, password_hash) VALUES (?, ?, ?)').run(userId, 'import-test@test.com', 'hash');

    const importService = new AglImportService(db, app.ctx.storage);

    // This should throw with full stack trace if there's a FK error
    const building = importService.import(agl, userId);

    expect(building.id).toBeTruthy();
    expect(building.name).toBeTruthy();
    expect(building.allPlaces().length).toBe(162);
    expect(building.allDiagrams().length).toBe(17);
  });
});
