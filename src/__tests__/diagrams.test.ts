import { buildApp } from '../app';
import { getAuthToken, authHeaders } from './testHelpers';

describe('Diagrams, Networks & Precedences API', () => {
  function app() {
    return buildApp();
  }

  async function createBuilding(a: ReturnType<typeof app>, token: string) {
    const res = await a.inject({
      method: 'POST',
      url: '/buildings',
      headers: authHeaders(token),
      payload: { name: 'Test', firstDate: '2024-01-01' },
    });
    return res.json().id as string;
  }

  async function createDiagram(a: ReturnType<typeof app>, token: string, buildingId: string, name: string) {
    const res = await a.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/diagrams`,
      headers: authHeaders(token),
      payload: { name },
    });
    return res.json() as { id: string; name: string; networks: any[]; precedences: any[] };
  }

  async function createNetwork(a: ReturnType<typeof app>, token: string, buildingId: string, diagramId: string, name: string) {
    const res = await a.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/diagrams/${diagramId}/networks`,
      headers: authHeaders(token),
      payload: { name },
    });
    return res.json() as { id: string; name: string; stages: any[] };
  }

  async function addStage(a: ReturnType<typeof app>, token: string, buildingId: string, diagramId: string, networkId: string, name: string, duration: number, latency = 0) {
    const res = await a.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/diagrams/${diagramId}/networks/${networkId}/stages`,
      headers: authHeaders(token),
      payload: { name, duration, latency },
    });
    return res.json() as { id: string; name: string; duration: number; latency: number };
  }

  async function addPrecedence(a: ReturnType<typeof app>, token: string, buildingId: string, diagramId: string, sourceStageId: string, destinationStageId: string, opening = 0, latency = 0) {
    return a.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/diagrams/${diagramId}/precedences`,
      headers: authHeaders(token),
      payload: { sourceStageId, destinationStageId, opening, latency },
    });
  }

  // === Diagrams ===

  describe('Diagrams', () => {
    it('GET /diagrams should return empty array', async () => {
      const a = app();
      const token = await getAuthToken(a);
      const bid = await createBuilding(a, token);
      const res = await a.inject({ method: 'GET', url: `/buildings/${bid}/diagrams`, headers: authHeaders(token) });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });

    it('POST /diagrams should create a diagram without networks', async () => {
      const a = app();
      const token = await getAuthToken(a);
      const bid = await createBuilding(a, token);
      const res = await a.inject({
        method: 'POST',
        url: `/buildings/${bid}/diagrams`,
        headers: authHeaders(token),
        payload: { name: 'Processo' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().name).toBe('Processo');
      expect(res.json().networks).toEqual([]);
      expect(res.json().precedences).toEqual([]);
    });

    it('GET /diagrams should list diagrams', async () => {
      const a = app();
      const token = await getAuthToken(a);
      const bid = await createBuilding(a, token);
      await createDiagram(a, token, bid, 'D1');
      await createDiagram(a, token, bid, 'D2');
      const res = await a.inject({ method: 'GET', url: `/buildings/${bid}/diagrams`, headers: authHeaders(token) });
      expect(res.json()).toHaveLength(2);
    });
  });

  // === Networks ===

  describe('Networks', () => {
    it('POST /networks should create a network in a diagram', async () => {
      const a = app();
      const token = await getAuthToken(a);
      const bid = await createBuilding(a, token);
      const diagram = await createDiagram(a, token, bid, 'Processo');

      const res = await a.inject({
        method: 'POST',
        url: `/buildings/${bid}/diagrams/${diagram.id}/networks`,
        headers: authHeaders(token),
        payload: { name: 'Rede Principal' },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().name).toBe('Rede Principal');
      expect(res.json().stages).toEqual([]);
    });

    it('GET /networks should list networks of a diagram', async () => {
      const a = app();
      const token = await getAuthToken(a);
      const bid = await createBuilding(a, token);
      const diagram = await createDiagram(a, token, bid, 'Processo');
      await createNetwork(a, token, bid, diagram.id, 'Rede 1');
      await createNetwork(a, token, bid, diagram.id, 'Rede 2');

      const res = await a.inject({
        method: 'GET',
        url: `/buildings/${bid}/diagrams/${diagram.id}/networks`,
        headers: authHeaders(token),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveLength(2);
    });

    it('GET /diagrams/:id should include networks in response', async () => {
      const a = app();
      const token = await getAuthToken(a);
      const bid = await createBuilding(a, token);
      const diagram = await createDiagram(a, token, bid, 'Processo');
      await createNetwork(a, token, bid, diagram.id, 'Rede A');

      const res = await a.inject({
        method: 'GET',
        url: `/buildings/${bid}/diagrams/${diagram.id}`,
        headers: authHeaders(token),
      });

      expect(res.json().networks).toHaveLength(1);
      expect(res.json().networks[0].name).toBe('Rede A');
    });

    it('POST /stages should add a stage to a specific network', async () => {
      const a = app();
      const token = await getAuthToken(a);
      const bid = await createBuilding(a, token);
      const diagram = await createDiagram(a, token, bid, 'Processo');
      const network = await createNetwork(a, token, bid, diagram.id, 'Rede');

      const res = await a.inject({
        method: 'POST',
        url: `/buildings/${bid}/diagrams/${diagram.id}/networks/${network.id}/stages`,
        headers: authHeaders(token),
        payload: { name: 'Estrutura', duration: 12, latency: 0 },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().name).toBe('Estrutura');
      expect(res.json().duration).toBe(12);
    });

    it('GET /diagrams/:id should show stages inside their network', async () => {
      const a = app();
      const token = await getAuthToken(a);
      const bid = await createBuilding(a, token);
      const diagram = await createDiagram(a, token, bid, 'Processo');
      const network = await createNetwork(a, token, bid, diagram.id, 'Rede');
      await addStage(a, token, bid, diagram.id, network.id, 'Fundação', 8);
      await addStage(a, token, bid, diagram.id, network.id, 'Estrutura', 12);

      const res = await a.inject({
        method: 'GET',
        url: `/buildings/${bid}/diagrams/${diagram.id}`,
        headers: authHeaders(token),
      });

      expect(res.json().networks[0].stages).toHaveLength(2);
      expect(res.json().networks[0].stages[0].name).toBe('Fundação');
      expect(res.json().networks[0].stages[1].name).toBe('Estrutura');
    });

    it('POST /stages should return 404 for invalid network', async () => {
      const a = app();
      const token = await getAuthToken(a);
      const bid = await createBuilding(a, token);
      const diagram = await createDiagram(a, token, bid, 'Processo');

      const res = await a.inject({
        method: 'POST',
        url: `/buildings/${bid}/diagrams/${diagram.id}/networks/nonexistent/stages`,
        headers: authHeaders(token),
        payload: { name: 'X', duration: 5 },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // === Precedences ===

  describe('Precedences', () => {
    it('POST /precedences should create a valid precedence', async () => {
      const a = app();
      const token = await getAuthToken(a);
      const bid = await createBuilding(a, token);
      const diagram = await createDiagram(a, token, bid, 'Processo');
      const network = await createNetwork(a, token, bid, diagram.id, 'Rede');
      const stageA = await addStage(a, token, bid, diagram.id, network.id, 'A', 10);
      const stageB = await addStage(a, token, bid, diagram.id, network.id, 'B', 8);

      const res = await addPrecedence(a, token, bid, diagram.id, stageA.id, stageB.id, 0, 4);

      expect(res.statusCode).toBe(201);
      expect(res.json().sourceStageId).toBe(stageA.id);
      expect(res.json().destinationStageId).toBe(stageB.id);
      expect(res.json().latency).toBe(4);
    });

    it('GET /diagrams/:id should include precedences', async () => {
      const a = app();
      const token = await getAuthToken(a);
      const bid = await createBuilding(a, token);
      const diagram = await createDiagram(a, token, bid, 'Processo');
      const network = await createNetwork(a, token, bid, diagram.id, 'Rede');
      const stageA = await addStage(a, token, bid, diagram.id, network.id, 'A', 10);
      const stageB = await addStage(a, token, bid, diagram.id, network.id, 'B', 8);
      await addPrecedence(a, token, bid, diagram.id, stageA.id, stageB.id);

      const res = await a.inject({
        method: 'GET',
        url: `/buildings/${bid}/diagrams/${diagram.id}`,
        headers: authHeaders(token),
      });

      expect(res.json().precedences).toHaveLength(1);
      expect(res.json().precedences[0].sourceStageId).toBe(stageA.id);
      expect(res.json().precedences[0].destinationStageId).toBe(stageB.id);
    });

    it('POST /precedences should return 400 for nonexistent stage', async () => {
      const a = app();
      const token = await getAuthToken(a);
      const bid = await createBuilding(a, token);
      const diagram = await createDiagram(a, token, bid, 'Processo');
      const network = await createNetwork(a, token, bid, diagram.id, 'Rede');
      const stageA = await addStage(a, token, bid, diagram.id, network.id, 'A', 10);

      const res = await addPrecedence(a, token, bid, diagram.id, stageA.id, 'nonexistent');

      expect(res.statusCode).toBe(400);
    });

    it('POST /precedences should return 400 for self-reference', async () => {
      const a = app();
      const token = await getAuthToken(a);
      const bid = await createBuilding(a, token);
      const diagram = await createDiagram(a, token, bid, 'Processo');
      const network = await createNetwork(a, token, bid, diagram.id, 'Rede');
      const stageA = await addStage(a, token, bid, diagram.id, network.id, 'A', 10);

      const res = await addPrecedence(a, token, bid, diagram.id, stageA.id, stageA.id);

      expect(res.statusCode).toBe(400);
    });

    it('POST /precedences should return 400 for cycle (A→B→C→A)', async () => {
      const a = app();
      const token = await getAuthToken(a);
      const bid = await createBuilding(a, token);
      const diagram = await createDiagram(a, token, bid, 'Processo');
      const network = await createNetwork(a, token, bid, diagram.id, 'Rede');
      const stageA = await addStage(a, token, bid, diagram.id, network.id, 'A', 10);
      const stageB = await addStage(a, token, bid, diagram.id, network.id, 'B', 8);
      const stageC = await addStage(a, token, bid, diagram.id, network.id, 'C', 6);

      await addPrecedence(a, token, bid, diagram.id, stageA.id, stageB.id);
      await addPrecedence(a, token, bid, diagram.id, stageB.id, stageC.id);
      const res = await addPrecedence(a, token, bid, diagram.id, stageC.id, stageA.id); // cycle!

      expect(res.statusCode).toBe(400);
    });
  });

  async function createFullDiagram(a: ReturnType<typeof app>, token: string, buildingId: string) {
    const diagram = await createDiagram(a, token, buildingId, 'Full Diagram');
    const network = await createNetwork(a, token, buildingId, diagram.id, 'Main Network');
    const stage = await addStage(a, token, buildingId, diagram.id, network.id, 'Stage A', 10);
    return { diagram, network, stage };
  }

  // === New endpoints ===

  describe('Stage impact', () => {
    it('should return stage impact', async () => {
      const a = app();
      const token = await getAuthToken(a);
      const bid = await createBuilding(a, token);
      const { diagram, network, stage } = await createFullDiagram(a, token, bid);

      const res = await a.inject({
        method: 'GET',
        url: `/buildings/${bid}/diagrams/${diagram.id}/networks/${network.id}/stages/${stage.id}/impact`,
        headers: authHeaders(token),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(typeof body.packageCount).toBe('number');
      expect(typeof body.teamCount).toBe('number');
    });
  });

  describe('Delete stage', () => {
    async function createTypology(a: ReturnType<typeof app>, token: string, buildingId: string, name: string, parentId?: string) {
      const res = await a.inject({
        method: 'POST',
        url: `/buildings/${buildingId}/typologies`,
        headers: authHeaders(token),
        payload: parentId ? { name, parentId } : { name },
      });
      return res.json() as { id: string; name: string };
    }

    it('should delete a stage', async () => {
      const a = app();
      const token = await getAuthToken(a);
      const bid = await createBuilding(a, token);
      const { diagram, network, stage } = await createFullDiagram(a, token, bid);

      const deleteRes = await a.inject({
        method: 'DELETE',
        url: `/buildings/${bid}/diagrams/${diagram.id}/networks/${network.id}/stages/${stage.id}`,
        headers: authHeaders(token),
      });
      expect(deleteRes.statusCode).toBe(204);

      const getRes = await a.inject({
        method: 'GET',
        url: `/buildings/${bid}/diagrams/${diagram.id}`,
        headers: authHeaders(token),
      });
      const stageIds = getRes.json().networks[0].stages.map((s: any) => s.id);
      expect(stageIds).not.toContain(stage.id);
    });

    it('should delete a stage when diagram has lines (teams and packages exist)', async () => {
      const a = app();
      const token = await getAuthToken(a);
      const bid = await createBuilding(a, token);

      // 1. Create diagram + network + 2 stages
      const diagram = await createDiagram(a, token, bid, 'Estrutural');
      const network = await createNetwork(a, token, bid, diagram.id, 'Rede');
      const stageA = await addStage(a, token, bid, diagram.id, network.id, 'Fundação', 10);
      const stageB = await addStage(a, token, bid, diagram.id, network.id, 'Estrutura', 8);

      // 2. Create typology: Unit > Floor1, Floor2
      const unit = await createTypology(a, token, bid, 'Bloco A');
      await createTypology(a, token, bid, 'Piso 1', unit.id);
      await createTypology(a, token, bid, 'Piso 2', unit.id);

      // 3. Create a line (2 stages × 2 floors = 4 packages)
      const lineRes = await a.inject({
        method: 'POST',
        url: `/buildings/${bid}/lines`,
        headers: authHeaders(token),
        payload: { networkId: network.id, placeId: unit.id },
      });
      expect(lineRes.statusCode).toBe(201);
      const lineId: string = lineRes.json().id;
      expect(lineRes.json().packageCount).toBe(4);

      // 4. Delete stageB (the one we'll remove)
      const deleteRes = await a.inject({
        method: 'DELETE',
        url: `/buildings/${bid}/diagrams/${diagram.id}/networks/${network.id}/stages/${stageB.id}`,
        headers: authHeaders(token),
      });
      expect(deleteRes.statusCode).toBe(204);

      // 5. Verify stage was removed from diagram
      const getRes = await a.inject({
        method: 'GET',
        url: `/buildings/${bid}/diagrams/${diagram.id}`,
        headers: authHeaders(token),
      });
      const stageIds = getRes.json().networks[0].stages.map((s: any) => s.id);
      expect(stageIds).not.toContain(stageB.id);
      expect(stageIds).toContain(stageA.id);

      // 6. Verify packages reduced to 2 (1 stage × 2 floors)
      const pkgsRes = await a.inject({
        method: 'GET',
        url: `/buildings/${bid}/lines/${lineId}/packages`,
        headers: authHeaders(token),
      });
      expect(pkgsRes.json()).toHaveLength(2);

      // 7. Verify DB is clean — no orphaned teams/packages referencing deleted stage
      const teamsInDb = a.ctx.db
        .prepare('SELECT COUNT(*) as n FROM teams WHERE stage_id = @stageId')
        .get({ stageId: stageB.id }) as { n: number };
      expect(teamsInDb.n).toBe(0);

      const pkgsInDb = a.ctx.db
        .prepare('SELECT COUNT(*) as n FROM packages WHERE stage_id = @stageId')
        .get({ stageId: stageB.id }) as { n: number };
      expect(pkgsInDb.n).toBe(0);
    });

    it('should delete a stage that has precedences and packages in lines', async () => {
      const a = app();
      const token = await getAuthToken(a);
      const bid = await createBuilding(a, token);

      // 1. Create diagram + network + 3 stages with precedences (A→B→C)
      const diagram = await createDiagram(a, token, bid, 'Estrutural');
      const network = await createNetwork(a, token, bid, diagram.id, 'Rede');
      const stageA = await addStage(a, token, bid, diagram.id, network.id, 'Fundação', 10);
      const stageB = await addStage(a, token, bid, diagram.id, network.id, 'Estrutura', 8);
      const stageC = await addStage(a, token, bid, diagram.id, network.id, 'Alvenaria', 6);

      const precAB = await addPrecedence(a, token, bid, diagram.id, stageA.id, stageB.id);
      expect(precAB.statusCode).toBe(201);
      const precBC = await addPrecedence(a, token, bid, diagram.id, stageB.id, stageC.id);
      expect(precBC.statusCode).toBe(201);

      // 2. Create typology + line
      const unit = await createTypology(a, token, bid, 'Bloco A');
      await createTypology(a, token, bid, 'Piso 1', unit.id);
      await createTypology(a, token, bid, 'Piso 2', unit.id);

      const lineRes = await a.inject({
        method: 'POST',
        url: `/buildings/${bid}/lines`,
        headers: authHeaders(token),
        payload: { networkId: network.id, placeId: unit.id },
      });
      expect(lineRes.statusCode).toBe(201);
      const lineId: string = lineRes.json().id;
      expect(lineRes.json().packageCount).toBe(6); // 3 stages × 2 floors

      // 3. Delete stageB (middle stage — has 2 precedences: A→B and B→C)
      const deleteRes = await a.inject({
        method: 'DELETE',
        url: `/buildings/${bid}/diagrams/${diagram.id}/networks/${network.id}/stages/${stageB.id}`,
        headers: authHeaders(token),
      });
      expect(deleteRes.statusCode).toBe(204);

      // 4. Verify stage removed, others remain
      const getRes = await a.inject({
        method: 'GET',
        url: `/buildings/${bid}/diagrams/${diagram.id}`,
        headers: authHeaders(token),
      });
      const stageIds = getRes.json().networks[0].stages.map((s: any) => s.id);
      expect(stageIds).not.toContain(stageB.id);
      expect(stageIds).toContain(stageA.id);
      expect(stageIds).toContain(stageC.id);

      // 5. Precedences referencing stageB should be gone
      const precIds = getRes.json().precedences.map((p: any) => p.id);
      expect(precIds).not.toContain(precAB.json().id);
      expect(precIds).not.toContain(precBC.json().id);

      // 6. Packages reduced to 4 (2 stages × 2 floors)
      const pkgsRes = await a.inject({
        method: 'GET',
        url: `/buildings/${bid}/lines/${lineId}/packages`,
        headers: authHeaders(token),
      });
      expect(pkgsRes.json()).toHaveLength(4);

      // 7. DB clean
      const teamsInDb = a.ctx.db
        .prepare('SELECT COUNT(*) as n FROM teams WHERE stage_id = @stageId')
        .get({ stageId: stageB.id }) as { n: number };
      expect(teamsInDb.n).toBe(0);

      const pkgsInDb = a.ctx.db
        .prepare('SELECT COUNT(*) as n FROM packages WHERE stage_id = @stageId')
        .get({ stageId: stageB.id }) as { n: number };
      expect(pkgsInDb.n).toBe(0);

      const precsInDb = a.ctx.db
        .prepare('SELECT COUNT(*) as n FROM precedences WHERE source_stage_id = @stageId OR dest_stage_id = @stageId')
        .get({ stageId: stageB.id }) as { n: number };
      expect(precsInDb.n).toBe(0);
    });

    it('should return 409 when stage has active packages (status >= 3)', async () => {
      const a = app();
      const token = await getAuthToken(a);
      const bid = await createBuilding(a, token);

      // 1. Create diagram + network + stage
      const diagram = await createDiagram(a, token, bid, 'Estrutural');
      const network = await createNetwork(a, token, bid, diagram.id, 'Rede');
      const stage = await addStage(a, token, bid, diagram.id, network.id, 'Fundação', 10);

      // 2. Create typology + line
      const unit = await createTypology(a, token, bid, 'Bloco A');
      await createTypology(a, token, bid, 'Piso 1', unit.id);

      const lineRes = await a.inject({
        method: 'POST',
        url: `/buildings/${bid}/lines`,
        headers: authHeaders(token),
        payload: { networkId: network.id, placeId: unit.id },
      });
      expect(lineRes.statusCode).toBe(201);

      // 3. Simulate active package by setting status >= 3 directly in DB
      a.ctx.db
        .prepare('UPDATE packages SET status = 3 WHERE stage_id = @stageId')
        .run({ stageId: stage.id });

      // 4. Attempt to delete — should be blocked
      const deleteRes = await a.inject({
        method: 'DELETE',
        url: `/buildings/${bid}/diagrams/${diagram.id}/networks/${network.id}/stages/${stage.id}`,
        headers: authHeaders(token),
      });
      expect(deleteRes.statusCode).toBe(409);
      expect(deleteRes.json().error).toContain('active packages');

      // 5. Stage should still exist
      const getRes = await a.inject({
        method: 'GET',
        url: `/buildings/${bid}/diagrams/${diagram.id}`,
        headers: authHeaders(token),
      });
      const stageIds = getRes.json().networks[0].stages.map((s: any) => s.id);
      expect(stageIds).toContain(stage.id);
    });
  });

  describe('Patch stage', () => {
    it('should patch a stage name and duration', async () => {
      const a = app();
      const token = await getAuthToken(a);
      const bid = await createBuilding(a, token);
      const { diagram, network, stage } = await createFullDiagram(a, token, bid);

      const patchRes = await a.inject({
        method: 'PATCH',
        url: `/buildings/${bid}/diagrams/${diagram.id}/networks/${network.id}/stages/${stage.id}`,
        headers: authHeaders(token),
        payload: { name: 'New Name', duration: 8 },
      });

      expect(patchRes.statusCode).toBe(200);
      expect(patchRes.json().name).toBe('New Name');
      expect(patchRes.json().duration).toBe(8);
    });
  });

  describe('Delete precedence', () => {
    it('should delete a precedence', async () => {
      const a = app();
      const token = await getAuthToken(a);
      const bid = await createBuilding(a, token);
      const diagram = await createDiagram(a, token, bid, 'Prec Diagram');
      const network = await createNetwork(a, token, bid, diagram.id, 'Rede');
      const stageA = await addStage(a, token, bid, diagram.id, network.id, 'A', 10);
      const stageB = await addStage(a, token, bid, diagram.id, network.id, 'B', 8);
      const precRes = await addPrecedence(a, token, bid, diagram.id, stageA.id, stageB.id);
      expect(precRes.statusCode).toBe(201);
      const precedenceId = precRes.json().id as string;

      const deleteRes = await a.inject({
        method: 'DELETE',
        url: `/buildings/${bid}/diagrams/${diagram.id}/precedences/${precedenceId}`,
        headers: authHeaders(token),
      });
      expect(deleteRes.statusCode).toBe(204);

      const getRes = await a.inject({
        method: 'GET',
        url: `/buildings/${bid}/diagrams/${diagram.id}`,
        headers: authHeaders(token),
      });
      const precIds = getRes.json().precedences.map((p: any) => p.id);
      expect(precIds).not.toContain(precedenceId);
    });
  });

  describe('Patch precedence', () => {
    it('should patch a precedence latency', async () => {
      const a = app();
      const token = await getAuthToken(a);
      const bid = await createBuilding(a, token);
      const diagram = await createDiagram(a, token, bid, 'Prec Diagram');
      const network = await createNetwork(a, token, bid, diagram.id, 'Rede');
      const stageA = await addStage(a, token, bid, diagram.id, network.id, 'A', 10);
      const stageB = await addStage(a, token, bid, diagram.id, network.id, 'B', 8);
      const precRes = await addPrecedence(a, token, bid, diagram.id, stageA.id, stageB.id, 0, 0);
      expect(precRes.statusCode).toBe(201);
      const precedenceId = precRes.json().id as string;

      const patchRes = await a.inject({
        method: 'PATCH',
        url: `/buildings/${bid}/diagrams/${diagram.id}/precedences/${precedenceId}`,
        headers: authHeaders(token),
        payload: { latency: 5 },
      });

      expect(patchRes.statusCode).toBe(200);
      expect(patchRes.json().latency).toBe(5);
    });
  });

  describe('Delete diagram', () => {
    it('should delete a diagram', async () => {
      const a = app();
      const token = await getAuthToken(a);
      const bid = await createBuilding(a, token);
      const { diagram } = await createFullDiagram(a, token, bid);

      const deleteRes = await a.inject({
        method: 'DELETE',
        url: `/buildings/${bid}/diagrams/${diagram.id}`,
        headers: authHeaders(token),
      });
      expect(deleteRes.statusCode).toBe(204);

      const listRes = await a.inject({
        method: 'GET',
        url: `/buildings/${bid}/diagrams`,
        headers: authHeaders(token),
      });
      expect(listRes.json()).toEqual([]);
    });
  });

  // === Stage insertion should propagate to existing Lines ===

  describe('Stage propagation to existing Lines', () => {
    async function createTypology(a: ReturnType<typeof app>, token: string, buildingId: string, name: string, parentId?: string) {
      const res = await a.inject({
        method: 'POST',
        url: `/buildings/${buildingId}/typologies`,
        headers: authHeaders(token),
        payload: parentId ? { name, parentId } : { name },
      });
      return res.json() as { id: string; name: string };
    }

    it('should create packages when adding a stage to a diagram that already has lines', async () => {
      const a = app();
      const token = await getAuthToken(a);
      const bid = await createBuilding(a, token);

      // 1. Create diagram + network + 1 stage
      const diagram = await createDiagram(a, token, bid, 'Estrutural');
      const network = await createNetwork(a, token, bid, diagram.id, 'Rede');
      const stageA = await addStage(a, token, bid, diagram.id, network.id, 'Fundação', 10);

      // 2. Create typology: Unit > Floor1, Floor2
      const unit = await createTypology(a, token, bid, 'Bloco A');
      await createTypology(a, token, bid, 'Piso 1', unit.id);
      await createTypology(a, token, bid, 'Piso 2', unit.id);

      // 3. Create a line (should create 2 packages: 1 stage × 2 floors)
      const lineRes = await a.inject({
        method: 'POST',
        url: `/buildings/${bid}/lines`,
        headers: authHeaders(token),
        payload: { networkId: network.id, placeId: unit.id },
      });
      expect(lineRes.statusCode).toBe(201);
      const lineId: string = lineRes.json().id;
      const initialPkgCount: number = lineRes.json().packageCount;
      expect(initialPkgCount).toBe(2); // 1 stage × 2 floors

      // 4. Verify packages via API
      const pkgsBeforeRes = await a.inject({
        method: 'GET',
        url: `/buildings/${bid}/lines/${lineId}/packages`,
        headers: authHeaders(token),
      });
      expect(pkgsBeforeRes.json()).toHaveLength(2);

      // 5. NOW add a second stage to the same network
      const stageB = await addStage(a, token, bid, diagram.id, network.id, 'Estrutura', 8);

      // 6. Verify packages via API — should now be 4 (2 stages × 2 floors)
      const pkgsAfterRes = await a.inject({
        method: 'GET',
        url: `/buildings/${bid}/lines/${lineId}/packages`,
        headers: authHeaders(token),
      });
      const pkgsAfter = pkgsAfterRes.json();
      expect(pkgsAfter).toHaveLength(4);

      // 7. Verify the new packages are in the DB too
      const dbCount = a.ctx.db
        .prepare('SELECT COUNT(*) as n FROM packages')
        .get() as { n: number };
      expect(dbCount.n).toBe(4);

      // 8. Verify no duplicate lines were created
      const linesRes = await a.inject({
        method: 'GET',
        url: `/buildings/${bid}/lines`,
        headers: authHeaders(token),
      });
      expect(linesRes.json()).toHaveLength(1);
    });
  });

  // === Cenário Completo: 2 Diagrams, cada um com network + stages + precedences ===

  describe('Integration: 2 diagrams with networks, stages and precedences', () => {
    it('should create 2 diagrams each with 1 network, 3 stages and 2 precedences', async () => {
      const a = app();
      const token = await getAuthToken(a);
      const bid = await createBuilding(a, token);

      // --- Diagram 1: Fundações ---
      const d1 = await createDiagram(a, token, bid, 'Fundações');
      const n1 = await createNetwork(a, token, bid, d1.id, 'Rede Fundações');
      const s1a = await addStage(a, token, bid, d1.id, n1.id, 'Escavação', 10);
      const s1b = await addStage(a, token, bid, d1.id, n1.id, 'Forma', 8, 2);
      const s1c = await addStage(a, token, bid, d1.id, n1.id, 'Concretagem', 6);

      const p1ab = await addPrecedence(a, token, bid, d1.id, s1a.id, s1b.id, 0, 4);
      expect(p1ab.statusCode).toBe(201);
      const p1bc = await addPrecedence(a, token, bid, d1.id, s1b.id, s1c.id, 1, 0);
      expect(p1bc.statusCode).toBe(201);

      // --- Diagram 2: Acabamentos ---
      const d2 = await createDiagram(a, token, bid, 'Acabamentos');
      const n2 = await createNetwork(a, token, bid, d2.id, 'Rede Acabamentos');
      const s2a = await addStage(a, token, bid, d2.id, n2.id, 'Reboco', 12);
      const s2b = await addStage(a, token, bid, d2.id, n2.id, 'Pintura', 8);
      const s2c = await addStage(a, token, bid, d2.id, n2.id, 'Piso', 10);

      const p2ab = await addPrecedence(a, token, bid, d2.id, s2a.id, s2b.id);
      expect(p2ab.statusCode).toBe(201);
      const p2ac = await addPrecedence(a, token, bid, d2.id, s2a.id, s2c.id);
      expect(p2ac.statusCode).toBe(201);

      // --- Verificar Diagram 1 completo ---
      const res1 = await a.inject({
        method: 'GET',
        url: `/buildings/${bid}/diagrams/${d1.id}`,
        headers: authHeaders(token),
      });
      const diagram1 = res1.json();
      expect(diagram1.networks).toHaveLength(1);
      expect(diagram1.networks[0].stages).toHaveLength(3);
      expect(diagram1.precedences).toHaveLength(2);
      expect(diagram1.networks[0].stages.map((s: any) => s.name)).toEqual(['Escavação', 'Forma', 'Concretagem']);

      // --- Verificar Diagram 2 completo ---
      const res2 = await a.inject({
        method: 'GET',
        url: `/buildings/${bid}/diagrams/${d2.id}`,
        headers: authHeaders(token),
      });
      const diagram2 = res2.json();
      expect(diagram2.networks).toHaveLength(1);
      expect(diagram2.networks[0].stages).toHaveLength(3);
      expect(diagram2.precedences).toHaveLength(2);

      // --- Listar todos os diagrams ---
      const allRes = await a.inject({
        method: 'GET',
        url: `/buildings/${bid}/diagrams`,
        headers: authHeaders(token),
      });
      expect(allRes.json()).toHaveLength(2);
    });
  });
});
