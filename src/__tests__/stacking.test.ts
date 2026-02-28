import { buildApp } from '../app';
import { getAuthToken, authHeaders } from './testHelpers';

type DbPkg = { id: string; start_col: number; end_col: number; team_id: string };

async function createProjectWithFloors(app: ReturnType<typeof buildApp>, token: string, floorCount = 5) {
  const bRes = await app.inject({ method: 'POST', url: '/buildings',
    headers: authHeaders(token),
    payload: { name: 'Stack Test', firstDate: '2024-01-01' } });
  const buildingId: string = bRes.json().id;

  const dRes = await app.inject({ method: 'POST', url: `/buildings/${buildingId}/diagrams`,
    headers: authHeaders(token),
    payload: { name: 'Diagrama' } });
  const diagramId: string = dRes.json().id;

  const nRes = await app.inject({ method: 'POST',
    url: `/buildings/${buildingId}/diagrams/${diagramId}/networks`,
    headers: authHeaders(token),
    payload: { name: 'Rede' } });
  const networkId: string = nRes.json().id;

  const sRes = await app.inject({ method: 'POST',
    url: `/buildings/${buildingId}/diagrams/${diagramId}/networks/${networkId}/stages`,
    headers: authHeaders(token),
    payload: { name: 'Fase A', duration: 5, latency: 0 } });
  const stageId: string = sRes.json().id;

  const uRes = await app.inject({ method: 'POST', url: `/buildings/${buildingId}/typologies`,
    headers: authHeaders(token),
    payload: { name: 'Bloco A' } });
  const unitId: string = uRes.json().id;

  for (let i = 0; i < floorCount; i++) {
    await app.inject({ method: 'POST', url: `/buildings/${buildingId}/typologies`,
      headers: authHeaders(token),
      payload: { name: `Piso ${i + 1}`, parentId: unitId } });
  }

  const lRes = await app.inject({ method: 'POST', url: `/buildings/${buildingId}/lines`,
    headers: authHeaders(token),
    payload: { networkId, placeId: unitId } });
  const lineId: string = lRes.json().id;

  // Get first package (for stack entry point)
  const pkgsRes = await app.inject({ method: 'GET',
    url: `/buildings/${buildingId}/lines/${lineId}/packages`,
    headers: authHeaders(token) });
  const packages = pkgsRes.json() as Array<{ id: string; stageId: string; startCol: number }>;
  const stagePkgs = packages.filter(p => p.stageId === stageId);
  stagePkgs.sort((a, b) => a.startCol - b.startCol);
  const firstPkg = stagePkgs[0]!;

  return { buildingId, lineId, stageId, firstPkg };
}

/** Query all packages of a stage from DB, sorted by start_col */
function queryPkgs(app: ReturnType<typeof buildApp>, stageId: string): DbPkg[] {
  return app.ctx.db
    .prepare('SELECT id, start_col, end_col, team_id FROM packages WHERE stage_id = ? ORDER BY start_col')
    .all(stageId) as DbPkg[];
}

// Setup: 5 floors, 1 stage (duration=5, latency=0), firstDate='2024-01-01'
// Produces 5 packages starting at column 84, duration 5 columns each.
//
// Before stack: [84,88] [89,93] [94,98] [99,103] [104,108]
// After stack +1 (2 teams, round-robin):
//   pair1: [84,88] [84,88]
//   pair2: [89,93] [89,93]
//   solo:  [94,98]

describe('Stacking endpoints', () => {

  it('POST /stack: exact positions after stack +1 with 5 packages', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const { buildingId, stageId, firstPkg } = await createProjectWithFloors(app, token, 5);

    // --- Capture initial state ---
    const before = queryPkgs(app, stageId);
    expect(before.length).toBe(5);

    const initialTeamId = before[0]!.team_id;
    for (const p of before) expect(p.team_id).toBe(initialTeamId);

    // Verify initial sequential layout
    expect(before[0]!.start_col).toBe(84);
    expect(before[0]!.end_col).toBe(88);
    expect(before[1]!.start_col).toBe(89);
    expect(before[1]!.end_col).toBe(93);
    expect(before[2]!.start_col).toBe(94);
    expect(before[2]!.end_col).toBe(98);
    expect(before[3]!.start_col).toBe(99);
    expect(before[3]!.end_col).toBe(103);
    expect(before[4]!.start_col).toBe(104);
    expect(before[4]!.end_col).toBe(108);

    // --- Stack +1 ---
    const res = await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/packages/${firstPkg.id}/stack`,
      headers: authHeaders(token),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    // Response: 1 team created, 0 deleted
    expect(body.createdTeams.length).toBe(1);
    expect(body.createdTeams[0].index).toBe(1);
    expect(body.createdTeams[0].stageId).toBe(stageId);
    expect(body.deletedTeamIds.length).toBe(0);
    const newTeamId: string = body.createdTeams[0].id;

    // --- Verify exact positions in DB ---
    const after = queryPkgs(app, stageId);
    expect(after.length).toBe(5);

    // Parallel pair 1: 2 packages at column 84
    expect(after[0]!.start_col).toBe(84);
    expect(after[0]!.end_col).toBe(88);
    expect(after[1]!.start_col).toBe(84);
    expect(after[1]!.end_col).toBe(88);

    // Parallel pair 2: 2 packages at column 89
    expect(after[2]!.start_col).toBe(89);
    expect(after[2]!.end_col).toBe(93);
    expect(after[3]!.start_col).toBe(89);
    expect(after[3]!.end_col).toBe(93);

    // Solo package at column 94
    expect(after[4]!.start_col).toBe(94);
    expect(after[4]!.end_col).toBe(98);

    // Each parallel pair on different teams
    expect(after[0]!.team_id).not.toBe(after[1]!.team_id);
    expect(after[2]!.team_id).not.toBe(after[3]!.team_id);

    // 2 distinct teams total
    const teamIds = [...new Set(after.map(p => p.team_id))];
    expect(teamIds.length).toBe(2);

    // Team counts: 3 on original team, 2 on new team
    const onOriginal = after.filter(p => p.team_id === initialTeamId);
    const onNew = after.filter(p => p.team_id === newTeamId);
    expect(onOriginal.length).toBe(3);
    expect(onNew.length).toBe(2);

    // Total span reduced from 25 columns to 15 columns
    expect(before[4]!.end_col - before[0]!.start_col + 1).toBe(25);
    expect(after[4]!.end_col - after[0]!.start_col + 1).toBe(15);
  });

  it('POST /stack: persists team with correct position to DB', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const { buildingId, firstPkg, lineId } = await createProjectWithFloors(app, token, 5);

    const res = await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/packages/${firstPkg.id}/stack`,
      headers: authHeaders(token),
    });
    const body = res.json();
    const newTeamId = body.createdTeams[0].id;

    // 2 teams in DB with position 0 and 1
    const teams = app.ctx.db
      .prepare('SELECT id, position FROM teams WHERE line_id = ? ORDER BY position')
      .all(lineId) as Array<{ id: string; position: number }>;
    expect(teams.length).toBe(2);
    expect(teams[0]!.position).toBe(0);
    expect(teams[1]!.position).toBe(1);
    expect(teams[1]!.id).toBe(newTeamId);
  });

  it('POST /stack: response packages match exact DB state', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const { buildingId, firstPkg } = await createProjectWithFloors(app, token, 5);

    const res = await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/packages/${firstPkg.id}/stack`,
      headers: authHeaders(token),
    });
    const body = res.json();

    // Every package in response must match DB exactly
    for (const rp of body.packages as Array<{ id: string; startCol: number; endCol: number; teamId: string }>) {
      const row = app.ctx.db
        .prepare('SELECT start_col, end_col, team_id FROM packages WHERE id = ?')
        .get(rp.id) as { start_col: number; end_col: number; team_id: string };
      expect(row.start_col).toBe(rp.startCol);
      expect(row.end_col).toBe(rp.endCol);
      expect(row.team_id).toBe(rp.teamId);
    }
  });

  it('POST /unstack: exact return to original positions after stack+unstack', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const { buildingId, stageId, firstPkg, lineId } = await createProjectWithFloors(app, token, 5);

    // --- Stack +1 ---
    await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/packages/${firstPkg.id}/stack`,
      headers: authHeaders(token),
    });

    // --- Unstack -1 ---
    const res = await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/packages/${firstPkg.id}/unstack`,
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.deletedTeamIds.length).toBe(1);
    expect(body.createdTeams.length).toBe(0);

    // --- Verify exact positions restored to original sequential layout ---
    const after = queryPkgs(app, stageId);
    expect(after.length).toBe(5);
    expect(after[0]!.start_col).toBe(84);
    expect(after[0]!.end_col).toBe(88);
    expect(after[1]!.start_col).toBe(89);
    expect(after[1]!.end_col).toBe(93);
    expect(after[2]!.start_col).toBe(94);
    expect(after[2]!.end_col).toBe(98);
    expect(after[3]!.start_col).toBe(99);
    expect(after[3]!.end_col).toBe(103);
    expect(after[4]!.start_col).toBe(104);
    expect(after[4]!.end_col).toBe(108);

    // All back on same team
    const teamIds = [...new Set(after.map(p => p.team_id))];
    expect(teamIds.length).toBe(1);

    // Deleted team gone from DB
    const deletedRow = app.ctx.db
      .prepare('SELECT id FROM teams WHERE id = ?')
      .get(body.deletedTeamIds[0]);
    expect(deletedRow).toBeUndefined();

    // Only 1 team remains
    const teams = app.ctx.db
      .prepare('SELECT id FROM teams WHERE line_id = ?')
      .all(lineId);
    expect(teams.length).toBe(1);
  });

  it('POST /unstack: response packages have correct duration', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const { buildingId, firstPkg } = await createProjectWithFloors(app, token, 5);

    // Stack + Unstack
    await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/packages/${firstPkg.id}/stack`,
      headers: authHeaders(token),
    });
    const res = await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/packages/${firstPkg.id}/unstack`,
      headers: authHeaders(token),
    });

    const body = res.json();
    const responsePkgs = (body.packages as Array<{ startCol: number; endCol: number }>)
      .sort((a, b) => a.startCol - b.startCol);

    // Each package preserves duration of 5 columns
    for (const rp of responsePkgs) {
      expect(rp.endCol - rp.startCol + 1).toBe(5);
    }
  });

  it('should return 404 for unknown package', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const bRes = await app.inject({ method: 'POST', url: '/buildings',
      headers: authHeaders(token),
      payload: { name: 'T', firstDate: '2024-01-01' } });
    const buildingId: string = bRes.json().id;

    const res = await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/packages/nonexistent/stack`,
      headers: authHeaders(token),
    });
    expect(res.statusCode).toBe(404);
  });
});
