import { buildApp } from '../../../app';
import { getAuthToken, authHeaders } from '../../testHelpers';

/**
 * Use-case: Unstack stage A when A→B are both stacked and touching (colados).
 *
 * Cenário real: 2 estágios (A→B) com precedência, 3 pavimentos, ambos empilhados.
 * Bug original: desempilhar A expandia os pacotes de A, empurrando B pra direita
 * no domínio (memória), mas a response só continha pacotes de A — os pacotes de B
 * não eram persistidos no DB nem retornados ao frontend.
 *
 * Setup: firstDate='2024-01-01', 3 floors, 2 stages (A dur=5 lat=0, B dur=5 lat=0), A→B
 *
 * Initial:     A: [84,88] [89,93] [94,98]
 *              B: [89,93] [94,98] [99,103]
 *
 * After +1 A:  A: [84,88] [84,88] [89,93]
 * After +1 B:  B: [89,93] [89,93] [94,98]
 *
 * After -1 A:  A: [84,88] [89,93] [94,98]
 *              B: [89,93] [94,98] [99,103]
 */

type Pkg = { id: string; stageId: string; startCol: number; endCol: number; teamId: string };
type DbPkg = { id: string; start_col: number; end_col: number; stage_id: string; team_id: string };

describe('Use-case: unstack with stacked+touching precedence', () => {
  async function setupProject(app: ReturnType<typeof buildApp>, token: string) {
    const bRes = await app.inject({
      method: 'POST', url: '/buildings', headers: authHeaders(token),
      payload: { name: 'Stacking Precedence', firstDate: '2024-01-01' },
    });
    const buildingId: string = bRes.json().id;

    const dRes = await app.inject({
      method: 'POST', url: `/buildings/${buildingId}/diagrams`,
      headers: authHeaders(token), payload: { name: 'D' },
    });
    const diagramId: string = dRes.json().id;

    const nRes = await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/diagrams/${diagramId}/networks`,
      headers: authHeaders(token), payload: { name: 'N' },
    });
    const networkId: string = nRes.json().id;

    const sARes = await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/diagrams/${diagramId}/networks/${networkId}/stages`,
      headers: authHeaders(token),
      payload: { name: 'A', duration: 5, latency: 0 },
    });
    const stageAId: string = sARes.json().id;

    const sBRes = await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/diagrams/${diagramId}/networks/${networkId}/stages`,
      headers: authHeaders(token),
      payload: { name: 'B', duration: 5, latency: 0 },
    });
    const stageBId: string = sBRes.json().id;

    await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/diagrams/${diagramId}/precedences`,
      headers: authHeaders(token),
      payload: { sourceStageId: stageAId, destinationStageId: stageBId },
    });

    const uRes = await app.inject({
      method: 'POST', url: `/buildings/${buildingId}/typologies`,
      headers: authHeaders(token), payload: { name: 'Bloco' },
    });
    const unitId: string = uRes.json().id;

    for (let i = 0; i < 3; i++) {
      await app.inject({
        method: 'POST', url: `/buildings/${buildingId}/typologies`,
        headers: authHeaders(token), payload: { name: `P${i}`, parentId: unitId },
      });
    }

    const lRes = await app.inject({
      method: 'POST', url: `/buildings/${buildingId}/lines`,
      headers: authHeaders(token),
      payload: { networkId, placeId: unitId },
    });
    const lineId: string = lRes.json().id;

    const pkgsRes = await app.inject({
      method: 'GET',
      url: `/buildings/${buildingId}/lines/${lineId}/packages`,
      headers: authHeaders(token),
    });
    const allPkgs = pkgsRes.json() as Pkg[];
    const aPkgs = allPkgs.filter(p => p.stageId === stageAId).sort((a, b) => a.startCol - b.startCol);
    const bPkgs = allPkgs.filter(p => p.stageId === stageBId).sort((a, b) => a.startCol - b.startCol);

    return { buildingId, diagramId, lineId, stageAId, stageBId, aPkgs, bPkgs };
  }

  it('unstack A response includes pushed B packages (fix for missing dependent stages)', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const { buildingId, stageAId, stageBId, aPkgs, bPkgs } = await setupProject(app, token);

    // Verify initial layout: A sequential, B sequential (touching)
    expect(aPkgs[0]!.startCol).toBe(84);
    expect(aPkgs[1]!.startCol).toBe(89);
    expect(aPkgs[2]!.startCol).toBe(94);
    expect(bPkgs[0]!.startCol).toBe(89);
    expect(bPkgs[1]!.startCol).toBe(94);
    expect(bPkgs[2]!.startCol).toBe(99);

    // Stack A (+1): compresses 3 packages into 2 time slots
    await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/packages/${aPkgs[0]!.id}/stack`,
      headers: authHeaders(token),
    });

    // Stack B (+1): compresses 3 packages into 2 time slots
    await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/packages/${bPkgs[0]!.id}/stack`,
      headers: authHeaders(token),
    });

    // Verify DB state after both stacked
    const dbAStacked = app.ctx.db
      .prepare('SELECT start_col, end_col FROM packages WHERE stage_id = ? ORDER BY start_col')
      .all(stageAId) as Array<{ start_col: number; end_col: number }>;
    expect(dbAStacked[0]!.start_col).toBe(84);
    expect(dbAStacked[1]!.start_col).toBe(84);
    expect(dbAStacked[2]!.start_col).toBe(89);

    const dbBStacked = app.ctx.db
      .prepare('SELECT start_col, end_col FROM packages WHERE stage_id = ? ORDER BY start_col')
      .all(stageBId) as Array<{ start_col: number; end_col: number }>;
    expect(dbBStacked[0]!.start_col).toBe(89);
    expect(dbBStacked[1]!.start_col).toBe(89);
    expect(dbBStacked[2]!.start_col).toBe(94);

    // --- THE BUG: unstack A should push B and include B in response ---
    const unstackRes = await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/packages/${aPkgs[0]!.id}/unstack`,
      headers: authHeaders(token),
    });
    expect(unstackRes.statusCode).toBe(200);
    const body = unstackRes.json();

    // Response must contain packages from BOTH stages (not just A)
    const responseIds = new Set((body.packages as Pkg[]).map(p => p.id));
    const aIdsInResponse = aPkgs.filter(p => responseIds.has(p.id));
    const bIdsInResponse = bPkgs.filter(p => responseIds.has(p.id));
    expect(aIdsInResponse.length).toBeGreaterThan(0);
    expect(bIdsInResponse.length).toBeGreaterThan(0);

    // DB state must match memory for stage A
    const dbAAfter = app.ctx.db
      .prepare('SELECT start_col, end_col FROM packages WHERE stage_id = ? ORDER BY start_col')
      .all(stageAId) as Array<{ start_col: number; end_col: number }>;
    expect(dbAAfter[0]!.start_col).toBe(84);
    expect(dbAAfter[0]!.end_col).toBe(88);
    expect(dbAAfter[1]!.start_col).toBe(89);
    expect(dbAAfter[1]!.end_col).toBe(93);
    expect(dbAAfter[2]!.start_col).toBe(94);
    expect(dbAAfter[2]!.end_col).toBe(98);

    // DB state must match memory for stage B (pushed right by A expanding)
    const dbBAfter = app.ctx.db
      .prepare('SELECT start_col, end_col FROM packages WHERE stage_id = ? ORDER BY start_col')
      .all(stageBId) as Array<{ start_col: number; end_col: number }>;
    expect(dbBAfter[0]!.start_col).toBe(89);
    expect(dbBAfter[0]!.end_col).toBe(93);
    expect(dbBAfter[1]!.start_col).toBe(94);
    expect(dbBAfter[1]!.end_col).toBe(98);
    expect(dbBAfter[2]!.start_col).toBe(99);
    expect(dbBAfter[2]!.end_col).toBe(103);

    // Memory must equal DB (the core of the bug)
    const memA: number[] = [];
    const memB: number[] = [];
    for (const t of app.ctx.storage.get(buildingId)!.getTeamsByStage(stageAId)) {
      for (const p of t.packages()) memA.push(p.start());
    }
    for (const t of app.ctx.storage.get(buildingId)!.getTeamsByStage(stageBId)) {
      for (const p of t.packages()) memB.push(p.start());
    }
    expect(dbAAfter.map(p => p.start_col)).toEqual(memA.sort((a, b) => a - b));
    expect(dbBAfter.map(p => p.start_col)).toEqual(memB.sort((a, b) => a - b));
  });

  it('stack A response includes pushed B packages when touching', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const { buildingId, stageAId, stageBId, aPkgs, bPkgs } = await setupProject(app, token);

    // Stack A — compresses A, which pushes B left (or keeps it)
    const stackRes = await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/packages/${aPkgs[0]!.id}/stack`,
      headers: authHeaders(token),
    });
    expect(stackRes.statusCode).toBe(200);
    const body = stackRes.json();

    // Verify DB state for A after stacking
    const dbAAfter = app.ctx.db
      .prepare('SELECT start_col FROM packages WHERE stage_id = ? ORDER BY start_col')
      .all(stageAId) as Array<{ start_col: number }>;
    expect(dbAAfter[0]!.start_col).toBe(84);
    expect(dbAAfter[1]!.start_col).toBe(84);
    expect(dbAAfter[2]!.start_col).toBe(89);

    // Verify DB state for B — should NOT have changed (A compressed = B same or earlier)
    const dbBAfter = app.ctx.db
      .prepare('SELECT start_col FROM packages WHERE stage_id = ? ORDER BY start_col')
      .all(stageBId) as Array<{ start_col: number }>;
    expect(dbBAfter[0]!.start_col).toBe(89);
    expect(dbBAfter[1]!.start_col).toBe(94);
    expect(dbBAfter[2]!.start_col).toBe(99);

    // Memory must equal DB
    const memB: number[] = [];
    for (const t of app.ctx.storage.get(buildingId)!.getTeamsByStage(stageBId)) {
      for (const p of t.packages()) memB.push(p.start());
    }
    expect(dbBAfter.map(p => p.start_col)).toEqual(memB.sort((a, b) => a - b));
  });
});
