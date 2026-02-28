import { buildApp } from '../app';
import { getAuthToken, authHeaders } from './testHelpers';

// ─── Helper: creates building with 2 stages + precedence, 2 floors, 1 line ───
// Stages A→B (precedence with opening=1, latency=0) → different teams
async function createStructureWith2Stages(app: ReturnType<typeof buildApp>, token: string) {
  const H = authHeaders(token);

  const bRes = await app.inject({ method: 'POST', url: '/buildings',
    headers: H, payload: { name: 'Link Test', firstDate: '2024-01-01' } });
  const buildingId: string = bRes.json().id;

  const dRes = await app.inject({ method: 'POST',
    url: `/buildings/${buildingId}/diagrams`, headers: H,
    payload: { name: 'Diagrama' } });
  const diagramId: string = dRes.json().id;

  const nRes = await app.inject({ method: 'POST',
    url: `/buildings/${buildingId}/diagrams/${diagramId}/networks`,
    headers: H, payload: { name: 'Rede' } });
  const networkId: string = nRes.json().id;

  const sARes = await app.inject({ method: 'POST',
    url: `/buildings/${buildingId}/diagrams/${diagramId}/networks/${networkId}/stages`,
    headers: H, payload: { name: 'A', duration: 5, latency: 0 } });
  const stageAId: string = sARes.json().id;

  const sBRes = await app.inject({ method: 'POST',
    url: `/buildings/${buildingId}/diagrams/${diagramId}/networks/${networkId}/stages`,
    headers: H, payload: { name: 'B', duration: 5, latency: 0 } });
  const stageBId: string = sBRes.json().id;

  // Precedence A→B (opening=1, latency=0)
  await app.inject({ method: 'POST',
    url: `/buildings/${buildingId}/diagrams/${diagramId}/precedences`,
    headers: H, payload: {
      sourceStageId: stageAId, destinationStageId: stageBId,
      opening: 1, latency: 0,
    } });

  // Typology: 1 unit + 2 floors
  const uRes = await app.inject({ method: 'POST',
    url: `/buildings/${buildingId}/typologies`,
    headers: H, payload: { name: 'Bloco' } });
  const unitId: string = uRes.json().id;

  await app.inject({ method: 'POST', url: `/buildings/${buildingId}/typologies`,
    headers: H, payload: { name: 'P1', parentId: unitId } });
  await app.inject({ method: 'POST', url: `/buildings/${buildingId}/typologies`,
    headers: H, payload: { name: 'P2', parentId: unitId } });

  // Line
  const lRes = await app.inject({ method: 'POST',
    url: `/buildings/${buildingId}/lines`,
    headers: H, payload: { networkId, placeId: unitId } });
  const lineId: string = lRes.json().id;

  // Get packages grouped by stage
  const pkgsRes = await app.inject({ method: 'GET',
    url: `/buildings/${buildingId}/lines/${lineId}/packages`,
    headers: H });
  const allPkgs = pkgsRes.json() as Array<{
    id: string; stageId: string; startCol: number; endCol: number; teamId: string;
  }>;
  const stageAPkgs = allPkgs
    .filter(p => p.stageId === stageAId)
    .sort((a, b) => a.startCol - b.startCol);
  const stageBPkgs = allPkgs
    .filter(p => p.stageId === stageBId)
    .sort((a, b) => a.startCol - b.startCol);

  return { buildingId, lineId, stageAId, stageBId, stageAPkgs, stageBPkgs };
}

// ─── Helper: creates building with 2 INDEPENDENT stages (no precedence) ───
// Stages A and B have no precedence — link is the ONLY constraint
async function createIndependentStages(app: ReturnType<typeof buildApp>, token: string) {
  const H = authHeaders(token);

  const bRes = await app.inject({ method: 'POST', url: '/buildings',
    headers: H, payload: { name: 'Independent Link Test', firstDate: '2024-01-01' } });
  const buildingId: string = bRes.json().id;

  const dRes = await app.inject({ method: 'POST',
    url: `/buildings/${buildingId}/diagrams`, headers: H,
    payload: { name: 'Diagrama' } });
  const diagramId: string = dRes.json().id;

  const nRes = await app.inject({ method: 'POST',
    url: `/buildings/${buildingId}/diagrams/${diagramId}/networks`,
    headers: H, payload: { name: 'Rede' } });
  const networkId: string = nRes.json().id;

  const sARes = await app.inject({ method: 'POST',
    url: `/buildings/${buildingId}/diagrams/${diagramId}/networks/${networkId}/stages`,
    headers: H, payload: { name: 'A', duration: 5, latency: 0 } });
  const stageAId: string = sARes.json().id;

  const sBRes = await app.inject({ method: 'POST',
    url: `/buildings/${buildingId}/diagrams/${diagramId}/networks/${networkId}/stages`,
    headers: H, payload: { name: 'B', duration: 5, latency: 0 } });
  const stageBId: string = sBRes.json().id;

  // NO precedence between A and B — they are independent

  // Typology: 1 unit + 2 floors
  const uRes = await app.inject({ method: 'POST',
    url: `/buildings/${buildingId}/typologies`,
    headers: H, payload: { name: 'Bloco' } });
  const unitId: string = uRes.json().id;

  await app.inject({ method: 'POST', url: `/buildings/${buildingId}/typologies`,
    headers: H, payload: { name: 'P1', parentId: unitId } });
  await app.inject({ method: 'POST', url: `/buildings/${buildingId}/typologies`,
    headers: H, payload: { name: 'P2', parentId: unitId } });

  // Line
  const lRes = await app.inject({ method: 'POST',
    url: `/buildings/${buildingId}/lines`,
    headers: H, payload: { networkId, placeId: unitId } });
  const lineId: string = lRes.json().id;

  // Get packages grouped by stage
  const pkgsRes = await app.inject({ method: 'GET',
    url: `/buildings/${buildingId}/lines/${lineId}/packages`,
    headers: H });
  const allPkgs = pkgsRes.json() as Array<{
    id: string; stageId: string; startCol: number; endCol: number; teamId: string;
  }>;
  const stageAPkgs = allPkgs
    .filter(p => p.stageId === stageAId)
    .sort((a, b) => a.startCol - b.startCol);
  const stageBPkgs = allPkgs
    .filter(p => p.stageId === stageBId)
    .sort((a, b) => a.startCol - b.startCol);

  return { buildingId, lineId, stageAId, stageBId, stageAPkgs, stageBPkgs };
}

// ─── Group 1: Links CRUD endpoints ───
describe('Links CRUD endpoints', () => {

  it('POST /links creates a link between packages of different stages', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const { buildingId, stageAPkgs, stageBPkgs } = await createStructureWith2Stages(app, token);
    const H = authHeaders(token);

    const sourceId = stageAPkgs[0]!.id;
    const destinationId = stageBPkgs[0]!.id;

    const res = await app.inject({ method: 'POST',
      url: `/buildings/${buildingId}/links`, headers: H,
      payload: { sourceId, destinationId, latency: 0 } });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.sourceId).toBe(sourceId);
    expect(body.destinationId).toBe(destinationId);
    expect(body.locked).toBe(true);
  });

  it('POST /links rejects link between packages of the same team', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const { buildingId, stageAPkgs } = await createStructureWith2Stages(app, token);
    const H = authHeaders(token);

    // Both stageAPkgs belong to the same team
    const sourceId = stageAPkgs[0]!.id;
    const destinationId = stageAPkgs[1]!.id;

    const res = await app.inject({ method: 'POST',
      url: `/buildings/${buildingId}/links`, headers: H,
      payload: { sourceId, destinationId, latency: 0 } });

    expect(res.statusCode).toBe(400);
  });

  it('POST /links rejects cyclic link', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const { buildingId, stageAPkgs, stageBPkgs } = await createStructureWith2Stages(app, token);
    const H = authHeaders(token);

    // Create A[0]→B[0]
    const createRes = await app.inject({ method: 'POST',
      url: `/buildings/${buildingId}/links`, headers: H,
      payload: { sourceId: stageAPkgs[0]!.id, destinationId: stageBPkgs[0]!.id, latency: 0 } });
    expect(createRes.statusCode).toBe(201);

    // Try B[0]→A[0] — should be rejected as cycle
    const cycleRes = await app.inject({ method: 'POST',
      url: `/buildings/${buildingId}/links`, headers: H,
      payload: { sourceId: stageBPkgs[0]!.id, destinationId: stageAPkgs[0]!.id, latency: 0 } });

    expect(cycleRes.statusCode).toBe(400);
  });

  it('GET /links returns all links', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const { buildingId, stageAPkgs, stageBPkgs } = await createStructureWith2Stages(app, token);
    const H = authHeaders(token);

    // Create one link
    await app.inject({ method: 'POST',
      url: `/buildings/${buildingId}/links`, headers: H,
      payload: { sourceId: stageAPkgs[0]!.id, destinationId: stageBPkgs[0]!.id, latency: 0 } });

    const res = await app.inject({ method: 'GET',
      url: `/buildings/${buildingId}/links`, headers: H });

    expect(res.statusCode).toBe(200);
    const links = res.json();
    expect(links.length).toBe(1);
    expect(links[0].sourceId).toBe(stageAPkgs[0]!.id);
    expect(links[0].destinationId).toBe(stageBPkgs[0]!.id);
  });

  it('PATCH /links/:linkId updates latency', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const { buildingId, stageAPkgs, stageBPkgs } = await createStructureWith2Stages(app, token);
    const H = authHeaders(token);

    const createRes = await app.inject({ method: 'POST',
      url: `/buildings/${buildingId}/links`, headers: H,
      payload: { sourceId: stageAPkgs[0]!.id, destinationId: stageBPkgs[0]!.id, latency: 0 } });
    const linkId: string = createRes.json().id;

    const patchRes = await app.inject({ method: 'PATCH',
      url: `/buildings/${buildingId}/links/${linkId}`, headers: H,
      payload: { latency: 3 } });

    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().latency).toBe(3);
  });

  it('DELETE /links/:linkId removes a link', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const { buildingId, stageAPkgs, stageBPkgs } = await createStructureWith2Stages(app, token);
    const H = authHeaders(token);

    const createRes = await app.inject({ method: 'POST',
      url: `/buildings/${buildingId}/links`, headers: H,
      payload: { sourceId: stageAPkgs[0]!.id, destinationId: stageBPkgs[0]!.id, latency: 0 } });
    const linkId: string = createRes.json().id;

    const delRes = await app.inject({ method: 'DELETE',
      url: `/buildings/${buildingId}/links/${linkId}`, headers: H });
    expect(delRes.statusCode).toBe(204);

    // Verify removed
    const getRes = await app.inject({ method: 'GET',
      url: `/buildings/${buildingId}/links`, headers: H });
    expect(getRes.json().length).toBe(0);
  });

  it('POST /links/:linkId/toggle-lock toggles lock state', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const { buildingId, stageAPkgs, stageBPkgs } = await createStructureWith2Stages(app, token);
    const H = authHeaders(token);

    const createRes = await app.inject({ method: 'POST',
      url: `/buildings/${buildingId}/links`, headers: H,
      payload: { sourceId: stageAPkgs[0]!.id, destinationId: stageBPkgs[0]!.id, latency: 0 } });
    const linkId: string = createRes.json().id;
    expect(createRes.json().locked).toBe(true);

    // Toggle OFF
    const toggle1 = await app.inject({ method: 'POST',
      url: `/buildings/${buildingId}/links/${linkId}/toggle-lock`, headers: H });
    expect(toggle1.json().locked).toBe(false);

    // Toggle ON again
    const toggle2 = await app.inject({ method: 'POST',
      url: `/buildings/${buildingId}/links/${linkId}/toggle-lock`, headers: H });
    expect(toggle2.json().locked).toBe(true);
  });
});

// ─── Group 2: Link movement cascading via API ───
describe('Link movement cascading via API', () => {

  it('moving source package should push linked destination', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const { buildingId, lineId, stageAPkgs, stageBPkgs } = await createIndependentStages(app, token);
    const H = authHeaders(token);

    const srcPkg = stageAPkgs[0]!;
    const dstPkg = stageBPkgs[0]!;

    // Record initial positions
    const initialBStart = dstPkg.startCol;

    // Create locked link A[0]→B[0], latency=0
    const linkRes = await app.inject({ method: 'POST',
      url: `/buildings/${buildingId}/links`, headers: H,
      payload: { sourceId: srcPkg.id, destinationId: dstPkg.id, latency: 0 } });
    expect(linkRes.statusCode).toBe(201);

    // Move A[0] far right (column 200)
    const moveRes = await app.inject({ method: 'POST',
      url: `/buildings/${buildingId}/packages/${srcPkg.id}/move`, headers: H,
      payload: { column: 200 } });
    expect(moveRes.statusCode).toBe(200);

    // Re-fetch packages to verify B[0] moved
    const pkgsRes = await app.inject({ method: 'GET',
      url: `/buildings/${buildingId}/lines/${lineId}/packages`, headers: H });
    const allPkgs = pkgsRes.json() as Array<{ id: string; startCol: number; endCol: number }>;

    const movedSrc = allPkgs.find(p => p.id === srcPkg.id)!;
    const movedDst = allPkgs.find(p => p.id === dstPkg.id)!;

    // Source at column 200, duration 5 → [200, 204]
    expect(movedSrc.startCol).toBe(200);
    expect(movedSrc.endCol).toBe(204);
    // Destination pushed to 205 (right after source end, latency=0), duration 5 → [205, 209]
    expect(movedDst.startCol).toBe(205);
    expect(movedDst.endCol).toBe(209);
  });

  it('link with latency should maintain minimum gap after move', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const { buildingId, lineId, stageAPkgs, stageBPkgs } = await createIndependentStages(app, token);
    const H = authHeaders(token);

    const srcPkg = stageAPkgs[0]!;
    const dstPkg = stageBPkgs[0]!;

    // Create locked link A[0]→B[0], latency=5
    const linkRes = await app.inject({ method: 'POST',
      url: `/buildings/${buildingId}/links`, headers: H,
      payload: { sourceId: srcPkg.id, destinationId: dstPkg.id, latency: 5 } });
    expect(linkRes.statusCode).toBe(201);

    // Move A[0] far right
    await app.inject({ method: 'POST',
      url: `/buildings/${buildingId}/packages/${srcPkg.id}/move`, headers: H,
      payload: { column: 200 } });

    // Re-fetch
    const pkgsRes = await app.inject({ method: 'GET',
      url: `/buildings/${buildingId}/lines/${lineId}/packages`, headers: H });
    const allPkgs = pkgsRes.json() as Array<{ id: string; startCol: number; endCol: number }>;

    const movedSrc = allPkgs.find(p => p.id === srcPkg.id)!;
    const movedDst = allPkgs.find(p => p.id === dstPkg.id)!;

    // Source at [200, 204], dest at [210, 214] → gap = 210 - 204 - 1 = 5
    expect(movedSrc.startCol).toBe(200);
    expect(movedSrc.endCol).toBe(204);
    expect(movedDst.startCol).toBe(210);
    expect(movedDst.endCol).toBe(214);
  });

  it('unlocked link should NOT push destination on move', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const { buildingId, lineId, stageAPkgs, stageBPkgs } = await createIndependentStages(app, token);
    const H = authHeaders(token);

    const srcPkg = stageAPkgs[0]!;
    const dstPkg = stageBPkgs[0]!;

    // Create link (locked by default — may reposition B due to gap constraint)
    const linkRes = await app.inject({ method: 'POST',
      url: `/buildings/${buildingId}/links`, headers: H,
      payload: { sourceId: srcPkg.id, destinationId: dstPkg.id, latency: 0 } });
    const linkId: string = linkRes.json().id;

    // Toggle lock OFF
    await app.inject({ method: 'POST',
      url: `/buildings/${buildingId}/links/${linkId}/toggle-lock`, headers: H });

    // Record B's position AFTER link creation + unlock (link may have repositioned B)
    const pkgsBefore = await app.inject({ method: 'GET',
      url: `/buildings/${buildingId}/lines/${lineId}/packages`, headers: H });
    const beforePkgs = pkgsBefore.json() as Array<{ id: string; startCol: number; endCol: number }>;
    const bBeforeMove = beforePkgs.find(p => p.id === dstPkg.id)!.startCol;

    // Move A[0] far right
    await app.inject({ method: 'POST',
      url: `/buildings/${buildingId}/packages/${srcPkg.id}/move`, headers: H,
      payload: { column: 200 } });

    // Re-fetch — B should NOT have moved further (unlocked link doesn't push)
    const pkgsRes = await app.inject({ method: 'GET',
      url: `/buildings/${buildingId}/lines/${lineId}/packages`, headers: H });
    const allPkgs = pkgsRes.json() as Array<{ id: string; startCol: number; endCol: number }>;
    const freshDst = allPkgs.find(p => p.id === dstPkg.id)!;

    // B stays at 89 (repositioned during locked link creation, not pushed further after unlock)
    expect(freshDst.startCol).toBe(89);
    expect(freshDst.endCol).toBe(93);
  });

  it('creating link on packages that already violate constraint should reposition', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const { buildingId, lineId, stageAPkgs, stageBPkgs } = await createIndependentStages(app, token);
    const H = authHeaders(token);

    const srcPkg = stageAPkgs[0]!;
    const dstPkg = stageBPkgs[0]!;

    // Move A[0] far past B[0]
    await app.inject({ method: 'POST',
      url: `/buildings/${buildingId}/packages/${srcPkg.id}/move`, headers: H,
      payload: { column: 300 } });

    // Now create link A[0]→B[0] with latency=3 — B should reposition
    const linkRes = await app.inject({ method: 'POST',
      url: `/buildings/${buildingId}/links`, headers: H,
      payload: { sourceId: srcPkg.id, destinationId: dstPkg.id, latency: 3 } });
    expect(linkRes.statusCode).toBe(201);

    // Re-fetch
    const pkgsRes = await app.inject({ method: 'GET',
      url: `/buildings/${buildingId}/lines/${lineId}/packages`, headers: H });
    const allPkgs = pkgsRes.json() as Array<{ id: string; startCol: number; endCol: number }>;

    const freshSrc = allPkgs.find(p => p.id === srcPkg.id)!;
    const freshDst = allPkgs.find(p => p.id === dstPkg.id)!;

    // A at [300, 304], B repositioned to [308, 312] → gap = 308 - 304 - 1 = 3
    expect(freshSrc.startCol).toBe(300);
    expect(freshSrc.endCol).toBe(304);
    expect(freshDst.startCol).toBe(308);
    expect(freshDst.endCol).toBe(312);
  });

  it('link persists movement to DB', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const { buildingId, stageAPkgs, stageBPkgs } = await createIndependentStages(app, token);
    const H = authHeaders(token);

    const srcPkg = stageAPkgs[0]!;
    const dstPkg = stageBPkgs[0]!;

    // Create locked link
    const linkRes = await app.inject({ method: 'POST',
      url: `/buildings/${buildingId}/links`, headers: H,
      payload: { sourceId: srcPkg.id, destinationId: dstPkg.id, latency: 0 } });
    expect(linkRes.statusCode).toBe(201);
    const linkId: string = linkRes.json().id;

    // Move source far right
    await app.inject({ method: 'POST',
      url: `/buildings/${buildingId}/packages/${srcPkg.id}/move`, headers: H,
      payload: { column: 200 } });

    // Check DB for the link
    const linkRow = app.ctx.db
      .prepare('SELECT id, source_id, dest_id, latency, locked FROM links WHERE id = ?')
      .get(linkId) as { id: string; source_id: string; dest_id: string; latency: number; locked: number } | undefined;
    expect(linkRow).toBeDefined();
    expect(linkRow!.source_id).toBe(srcPkg.id);
    expect(linkRow!.dest_id).toBe(dstPkg.id);

    // Check DB for the moved destination package
    const dstRow = app.ctx.db
      .prepare('SELECT start_col, end_col FROM packages WHERE id = ?')
      .get(dstPkg.id) as { start_col: number; end_col: number } | undefined;
    expect(dstRow).toBeDefined();
    // Destination pushed to [205, 209] in DB (source at [200, 204], latency=0)
    expect(dstRow!.start_col).toBe(205);
    expect(dstRow!.end_col).toBe(209);
  });
});
