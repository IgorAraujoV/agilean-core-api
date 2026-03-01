import { buildApp } from '../app';
import { getAuthToken, authHeaders } from './testHelpers';

/**
 * Fixture AGL minima reutilizada do import test:
 * 1 building, 1 unit com 2 locals, 1 diagram com 2 stages + 1 precedence,
 * 1 line com 2 teams (um por stage), cada team com 2 packages.
 * Package keys usam formato C++ (plannedStartDate etc.).
 */
const UNIT_ID = 'unit-001';
const LOCAL_A_ID = 'local-a';
const LOCAL_B_ID = 'local-b';
const DIAGRAM_ID = 'diag-001';
const NETWORK_ID = 'net-001';
const STAGE_A_ID = 'stage-a';
const STAGE_B_ID = 'stage-b';
const PREC_ID = 'prec-001';
const LINE_ID = 'line-001';
const TEAM_A_ID = 'team-a';
const TEAM_B_ID = 'team-b';

function makeAglFixture() {
  return {
    company: {
      id: 'company-001',
      name: 'Test Company',
      code: '',
      buildingCompanies: [
        {
          id: 'bc-001',
          name: '',
          code: '',
          companyId: '',
          stages: [],
          branchOffices: [
            {
              id: 'bo-001',
              name: '',
              buildingCompanyId: '',
              buildings: [
                {
                  id: 'bld-001',
                  name: 'Edificio AGL',
                  firstDate: '2024-01-01T11:00:00.000Z',
                  today: '2024-01-01T11:00:00.000Z',
                  todayEnabled: false,
                  places: [
                    {
                      id: UNIT_ID,
                      name: 'Torre 1',
                      level: 0,
                      index: 0,
                      sequence: 1,
                      buffer: 0,
                      parentId: null,
                      startDate: '2024-01-01T11:00:00.000Z',
                      endDate: '2024-12-31T20:00:00.000Z',
                      path: 'Torre 1',
                      responsibleId: -1,
                    },
                    {
                      id: LOCAL_A_ID,
                      name: '1 Pav',
                      level: 1,
                      index: 0,
                      sequence: 1,
                      parentId: UNIT_ID,
                      startDate: null,
                      endDate: null,
                      path: 'Torre 1 >> 1 Pav',
                      responsibleId: -1,
                    },
                    {
                      id: LOCAL_B_ID,
                      name: '2 Pav',
                      level: 1,
                      index: 1,
                      sequence: 2,
                      parentId: UNIT_ID,
                      startDate: null,
                      endDate: null,
                      path: 'Torre 1 >> 2 Pav',
                      responsibleId: -1,
                    },
                  ],
                  expedients: [],
                },
              ],
            },
          ],
        },
      ],
    },
    diagrams: [
      {
        id: DIAGRAM_ID,
        name: 'Rede Principal',
        index: 0,
        sequence: 1,
        buildingId: 'bld-001',
        networks: [
          {
            id: NETWORK_ID,
            name: 'Network 1',
            color: '#FF0000',
            textColor: '#FFFFFF',
            diagramId: DIAGRAM_ID,
            index: 0,
            stageNetworks: [
              {
                id: STAGE_A_ID,
                name: 'Fundacao',
                duration: 5,
                latency: 0,
                direction: 0,
                index: 0,
                sequence: 1,
                color: '#FF0000',
                textColor: '#FFFFFF',
                x: 0,
                y: 0,
                precedences: [],
              },
              {
                id: STAGE_B_ID,
                name: 'Estrutura',
                duration: 10,
                latency: 0,
                direction: 0,
                index: 1,
                sequence: 2,
                color: '#00FF00',
                textColor: '#000000',
                x: 100,
                y: 0,
                precedences: [
                  {
                    id: PREC_ID,
                    sourceId: STAGE_A_ID,
                    destinationId: STAGE_B_ID,
                    openning: 0,
                    latency: 0,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    lines: [
      {
        id: LINE_ID,
        name: 'Torre 1 Network 1',
        code: '',
        type: 0,
        index: 0,
        networkId: NETWORK_ID,
        placeId: UNIT_ID,
        dateCreated: '2024-01-01T11:00:00.000Z',
        floors: [0, 1],
        teams: [
          {
            id: TEAM_A_ID,
            stageNetworkId: STAGE_A_ID,
            index: 0,
            direction: 0,
            resources: '',
            isStandaloneTeam: false,
            packages: [
              {
                id: 'pkg-a1',
                placeId: LOCAL_A_ID,
                stageId: STAGE_A_ID,
                code: '',
                name: '',
                plannedStartDate: '2024-01-01T11:00:00.000Z',
                plannedEndDate: '2024-01-02T15:00:00.000Z',
                realStartDate: null,
                realEndDate: null,
                secondPlannedEndDate: null,
                isCritical: false,
                duration: 5,
                status: 1,
                progress: 0,
                cost: 0,
                costLabor: 0,
                quantity: 1,
                sequence: 0,
              },
              {
                id: 'pkg-a2',
                placeId: LOCAL_B_ID,
                stageId: STAGE_A_ID,
                code: '',
                name: '',
                plannedStartDate: '2024-01-02T18:00:00.000Z',
                plannedEndDate: '2024-01-04T15:00:00.000Z',
                realStartDate: null,
                realEndDate: null,
                secondPlannedEndDate: null,
                isCritical: false,
                duration: 5,
                status: 1,
                progress: 0,
                cost: 0,
                costLabor: 0,
                quantity: 1,
                sequence: 1,
              },
            ],
          },
          {
            id: TEAM_B_ID,
            stageNetworkId: STAGE_B_ID,
            index: 0,
            direction: 0,
            resources: '',
            isStandaloneTeam: false,
            packages: [
              {
                id: 'pkg-b1',
                placeId: LOCAL_A_ID,
                stageId: STAGE_B_ID,
                code: '',
                name: '',
                plannedStartDate: '2024-01-03T11:00:00.000Z',
                plannedEndDate: '2024-01-05T20:00:00.000Z',
                realStartDate: null,
                realEndDate: null,
                secondPlannedEndDate: null,
                isCritical: false,
                duration: 10,
                status: 1,
                progress: 0,
                cost: 0,
                costLabor: 0,
                quantity: 1,
                sequence: 0,
              },
              {
                id: 'pkg-b2',
                placeId: LOCAL_B_ID,
                stageId: STAGE_B_ID,
                code: '',
                name: '',
                plannedStartDate: '2024-01-08T11:00:00.000Z',
                plannedEndDate: '2024-01-10T15:00:00.000Z',
                realStartDate: null,
                realEndDate: null,
                secondPlannedEndDate: null,
                isCritical: false,
                duration: 10,
                status: 1,
                progress: 0,
                cost: 0,
                costLabor: 0,
                quantity: 1,
                sequence: 1,
              },
            ],
          },
        ],
      },
    ],
    budgetItems: [],
    createdDate: '2024-01-01T00:00:00.000Z',
    updatedDate: '2024-01-01T00:00:00.000Z',
    fileScheduleId: 'bld-001',
  };
}

/** Importa o fixture e retorna o buildingId criado */
async function importFixture(app: ReturnType<typeof import('../app').buildApp>, token: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/buildings/import',
    headers: authHeaders(token),
    payload: makeAglFixture(),
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as { id: string }).id;
}

describe('AGL Export', () => {
  it('GET /buildings/:buildingId/export should return AGL JSON with company wrapper', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const buildingId = await importFixture(app, token);

    // Evict from memory to force load from SQLite (round-trip test)
    app.ctx.storage.delete(buildingId);

    const res = await app.inject({
      method: 'GET',
      url: `/buildings/${buildingId}/export`,
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(200);
    const agl = res.json();

    // Company wrapper structure
    expect(agl.company).toBeDefined();
    expect(agl.company.buildingCompanies).toHaveLength(1);
    expect(agl.company.buildingCompanies[0].branchOffices).toHaveLength(1);
    expect(agl.company.buildingCompanies[0].branchOffices[0].buildings).toHaveLength(1);

    // Building inside wrapper
    const building = agl.company.buildingCompanies[0].branchOffices[0].buildings[0];
    expect(building.name).toBe('Edificio AGL');
    expect(building.id).toBe(buildingId);
  });

  it('exported AGL should have 7 expedients (Mon-Fri workday, Sat-Sun off)', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const buildingId = await importFixture(app, token);

    app.ctx.storage.delete(buildingId);

    const res = await app.inject({
      method: 'GET',
      url: `/buildings/${buildingId}/export`,
      headers: authHeaders(token),
    });

    const agl = res.json();
    const building = agl.company.buildingCompanies[0].branchOffices[0].buildings[0];
    const expedients = building.expedients;

    expect(expedients).toHaveLength(7);

    // Sunday (weekday 0) is not a workday
    expect(expedients[0].weekday).toBe(0);
    expect(expedients[0].isWorkDay).toBe(false);

    // Monday through Friday (weekdays 1-5) are workdays
    for (let i = 1; i <= 5; i++) {
      expect(expedients[i].weekday).toBe(i);
      expect(expedients[i].isWorkDay).toBe(true);
    }

    // Saturday (weekday 6) is not a workday
    expect(expedients[6].weekday).toBe(6);
    expect(expedients[6].isWorkDay).toBe(false);
  });

  it('exported AGL should have correct diagrams', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const buildingId = await importFixture(app, token);

    app.ctx.storage.delete(buildingId);

    const res = await app.inject({
      method: 'GET',
      url: `/buildings/${buildingId}/export`,
      headers: authHeaders(token),
    });

    const agl = res.json();
    expect(agl.diagrams).toHaveLength(1);

    const diagram = agl.diagrams[0];
    expect(diagram.name).toBe('Rede Principal');
    expect(diagram.id).toBe(DIAGRAM_ID);
    expect(diagram.networks).toHaveLength(1);

    const network = diagram.networks[0];
    expect(network.id).toBe(NETWORK_ID);
    expect(network.stageNetworks).toHaveLength(2);
    expect(network.stageNetworks[0].name).toBe('Fundacao');
    expect(network.stageNetworks[1].name).toBe('Estrutura');
  });

  it('exported AGL should have correct lines with teams and packages', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const buildingId = await importFixture(app, token);

    app.ctx.storage.delete(buildingId);

    const res = await app.inject({
      method: 'GET',
      url: `/buildings/${buildingId}/export`,
      headers: authHeaders(token),
    });

    const agl = res.json();
    expect(agl.lines).toHaveLength(1);

    const line = agl.lines[0];
    expect(line.networkId).toBe(NETWORK_ID);
    expect(line.placeId).toBe(UNIT_ID);
    expect(line.teams).toHaveLength(2);

    // Team A should have 2 packages
    const teamA = line.teams.find((t: Record<string, unknown>) => t.stageNetworkId === STAGE_A_ID);
    expect(teamA).toBeDefined();
    expect(teamA.packages).toHaveLength(2);

    // Team B should have 2 packages
    const teamB = line.teams.find((t: Record<string, unknown>) => t.stageNetworkId === STAGE_B_ID);
    expect(teamB).toBeDefined();
    expect(teamB.packages).toHaveLength(2);
  });

  it('exported packages should use C++ key names (plannedStartDate, not plannedStart)', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const buildingId = await importFixture(app, token);

    app.ctx.storage.delete(buildingId);

    const res = await app.inject({
      method: 'GET',
      url: `/buildings/${buildingId}/export`,
      headers: authHeaders(token),
    });

    const agl = res.json();
    const pkg = agl.lines[0].teams[0].packages[0];

    // C++ keys should be present
    expect(pkg.plannedStartDate).toBeDefined();
    expect(pkg.plannedEndDate).toBeDefined();
    expect(pkg).toHaveProperty('isCritical');

    // TS keys should NOT be present
    expect(pkg.plannedStart).toBeUndefined();
    expect(pkg.plannedEnd).toBeUndefined();
    expect(pkg.isCriticalPath).toBeUndefined();
    expect(pkg.executionStart).toBeUndefined();
    expect(pkg.executionEnd).toBeUndefined();
    expect(pkg.estimatedEnd).toBeUndefined();
  });

  it('exported AGL should have places inside building wrapper', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const buildingId = await importFixture(app, token);

    app.ctx.storage.delete(buildingId);

    const res = await app.inject({
      method: 'GET',
      url: `/buildings/${buildingId}/export`,
      headers: authHeaders(token),
    });

    const agl = res.json();
    const building = agl.company.buildingCompanies[0].branchOffices[0].buildings[0];

    // Places should be a flat list inside the building
    expect(building.places).toBeDefined();
    expect(building.places).toHaveLength(3);

    // Verify unit
    const unit = building.places.find((p: Record<string, unknown>) => p.id === UNIT_ID);
    expect(unit).toBeDefined();
    expect(unit.name).toBe('Torre 1');
    expect(unit.level).toBe(0);

    // Verify locals
    const localA = building.places.find((p: Record<string, unknown>) => p.id === LOCAL_A_ID);
    expect(localA).toBeDefined();
    expect(localA.name).toBe('1 Pav');
    expect(localA.level).toBe(1);

    const localB = building.places.find((p: Record<string, unknown>) => p.id === LOCAL_B_ID);
    expect(localB).toBeDefined();
    expect(localB.name).toBe('2 Pav');
    expect(localB.level).toBe(1);
  });

  it('exported AGL should include Content-Disposition header for download', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const buildingId = await importFixture(app, token);

    app.ctx.storage.delete(buildingId);

    const res = await app.inject({
      method: 'GET',
      url: `/buildings/${buildingId}/export`,
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(200);
    const contentDisposition = res.headers['content-disposition'];
    expect(contentDisposition).toBeDefined();
    expect(contentDisposition).toContain('attachment');
    expect(contentDisposition).toContain('.agl');
  });

  it('should return 404 for unknown buildingId', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);

    const res = await app.inject({
      method: 'GET',
      url: '/buildings/nonexistent-id/export',
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBeDefined();
  });

  it('should return 401 without auth token', async () => {
    const app = buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/buildings/some-id/export',
    });

    expect(res.statusCode).toBe(401);
  });

  it('exported AGL should have top-level fields (budgetItems, createdDate, updatedDate, fileScheduleId)', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const buildingId = await importFixture(app, token);

    app.ctx.storage.delete(buildingId);

    const res = await app.inject({
      method: 'GET',
      url: `/buildings/${buildingId}/export`,
      headers: authHeaders(token),
    });

    const agl = res.json();

    expect(agl.budgetItems).toEqual([]);
    expect(agl.createdDate).toBeDefined();
    expect(agl.updatedDate).toBeDefined();
    expect(agl.fileScheduleId).toBe(buildingId);
  });

  it('import then export round-trip: structure should be preserved', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const buildingId = await importFixture(app, token);

    // Evict to force SQLite round-trip
    app.ctx.storage.delete(buildingId);

    const res = await app.inject({
      method: 'GET',
      url: `/buildings/${buildingId}/export`,
      headers: authHeaders(token),
    });

    const agl = res.json();

    // Re-extract using the same extraction logic
    const building = agl.company.buildingCompanies[0].branchOffices[0].buildings[0];
    const diagrams = agl.diagrams;
    const lines = agl.lines;

    // Building metadata
    expect(building.name).toBe('Edificio AGL');

    // 1 diagram, 1 network, 2 stages
    expect(diagrams).toHaveLength(1);
    expect(diagrams[0].networks[0].stageNetworks).toHaveLength(2);

    // 3 places
    expect(building.places).toHaveLength(3);

    // 1 line, 2 teams, 4 packages total
    expect(lines).toHaveLength(1);
    expect(lines[0].teams).toHaveLength(2);
    const totalPackages = lines[0].teams.reduce(
      (sum: number, t: Record<string, unknown>) => sum + (t.packages as unknown[]).length,
      0,
    );
    expect(totalPackages).toBe(4);
  });
});
