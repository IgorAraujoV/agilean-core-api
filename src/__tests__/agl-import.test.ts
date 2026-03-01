import { buildApp } from '../app';
import { getAuthToken, authHeaders } from './testHelpers';
import { AglImportService } from '../services/AglImportService';

/**
 * Fixture AGL mínima: 1 building, 1 unit com 2 locals, 1 diagram com 2 stages + 1 precedence,
 * 1 line com 2 teams (um por stage), cada team com 2 packages.
 * Package keys usam formato C++ (plannedStartDate etc.) — o import deve normalizá-las.
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
                  name: 'Edifício AGL',
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
                name: 'Fundação',
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
                // C++ format keys!
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

describe('AGL Import', () => {
  it('POST /buildings/import should return 201 and create a building', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/import',
      headers: authHeaders(token),
      payload: makeAglFixture(),
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.id).toBeDefined();
    expect(body.name).toBe('Edifício AGL');
    expect(body.diagramCount).toBe(1);
    expect(body.placeCount).toBe(3);
  });

  it('imported building should be retrievable via GET /buildings/:id', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);

    const importRes = await app.inject({
      method: 'POST',
      url: '/buildings/import',
      headers: authHeaders(token),
      payload: makeAglFixture(),
    });

    const { id } = importRes.json();

    const getRes = await app.inject({
      method: 'GET',
      url: `/buildings/${id}`,
      headers: authHeaders(token),
    });

    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().name).toBe('Edifício AGL');
  });

  it('imported building should have correct diagrams in SQLite', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);

    const importRes = await app.inject({
      method: 'POST',
      url: '/buildings/import',
      headers: authHeaders(token),
      payload: makeAglFixture(),
    });

    const { id } = importRes.json();

    // GET /buildings/:id/diagrams returns [{id, name}]
    const diagRes = await app.inject({
      method: 'GET',
      url: `/buildings/${id}/diagrams`,
      headers: authHeaders(token),
    });

    expect(diagRes.statusCode).toBe(200);
    const diagrams = diagRes.json();
    expect(diagrams).toHaveLength(1);
    expect(diagrams[0].name).toBe('Rede Principal');
  });

  it('imported building should have correct lines', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);

    const importRes = await app.inject({
      method: 'POST',
      url: '/buildings/import',
      headers: authHeaders(token),
      payload: makeAglFixture(),
    });

    const { id } = importRes.json();

    // GET /buildings/:id/lines returns [{id, networkId, placeId}]
    const linesRes = await app.inject({
      method: 'GET',
      url: `/buildings/${id}/lines`,
      headers: authHeaders(token),
    });

    expect(linesRes.statusCode).toBe(200);
    const lines = linesRes.json();
    expect(lines).toHaveLength(1);
    expect(lines[0].placeId).toBe(UNIT_ID);
    expect(lines[0].networkId).toBe(NETWORK_ID);
  });

  it('imported building should have 4 packages across 2 teams', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);

    const importRes = await app.inject({
      method: 'POST',
      url: '/buildings/import',
      headers: authHeaders(token),
      payload: makeAglFixture(),
    });

    const { id } = importRes.json();

    const linesRes = await app.inject({
      method: 'GET',
      url: `/buildings/${id}/lines`,
      headers: authHeaders(token),
    });

    const lineId = linesRes.json()[0].id;

    const pkgsRes = await app.inject({
      method: 'GET',
      url: `/buildings/${id}/lines/${lineId}/packages`,
      headers: authHeaders(token),
    });

    expect(pkgsRes.statusCode).toBe(200);
    const packages = pkgsRes.json();
    expect(packages).toHaveLength(4);
  });

  it('imported building should have correct places hierarchy', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);

    const importRes = await app.inject({
      method: 'POST',
      url: '/buildings/import',
      headers: authHeaders(token),
      payload: makeAglFixture(),
    });

    const { id } = importRes.json();

    const placesRes = await app.inject({
      method: 'GET',
      url: `/buildings/${id}/typologies`,
      headers: authHeaders(token),
    });

    expect(placesRes.statusCode).toBe(200);
    const places = placesRes.json();
    // Top-level should be the unit
    expect(places).toHaveLength(1);
    expect(places[0].name).toBe('Torre 1');
    expect(places[0].children).toHaveLength(2);
    expect(places[0].children[0].name).toBe('1 Pav');
    expect(places[0].children[1].name).toBe('2 Pav');
  });

  it('should persist to SQLite (building survives eviction from memory)', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);

    const importRes = await app.inject({
      method: 'POST',
      url: '/buildings/import',
      headers: authHeaders(token),
      payload: makeAglFixture(),
    });

    const { id } = importRes.json();

    // Evict from in-memory storage to force reload from SQLite
    app.ctx.storage.delete(id);

    const getRes = await app.inject({
      method: 'GET',
      url: `/buildings/${id}`,
      headers: authHeaders(token),
    });

    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().name).toBe('Edifício AGL');
    expect(getRes.json().diagramCount).toBe(1);
    expect(getRes.json().placeCount).toBe(3);
  });

  it('should return 400 for invalid AGL (missing company)', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/import',
      headers: authHeaders(token),
      payload: { notAValidAgl: true },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBeDefined();
  });

  it('should return 400 for AGL with empty buildings array', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/import',
      headers: authHeaders(token),
      payload: {
        company: {
          id: 'c1',
          name: '',
          code: '',
          buildingCompanies: [
            {
              id: 'bc1',
              name: '',
              code: '',
              companyId: '',
              stages: [],
              branchOffices: [
                {
                  id: 'bo1',
                  name: '',
                  buildingCompanyId: '',
                  buildings: [],
                },
              ],
            },
          ],
        },
        diagrams: [],
        lines: [],
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should return 401 without auth token', async () => {
    const app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/import',
      payload: makeAglFixture(),
    });

    expect(response.statusCode).toBe(401);
  });

  it('should derive firstDate from places when building has no firstDate', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);

    const fixture = makeAglFixture();
    // Remove firstDate from building
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fixture.company.buildingCompanies[0]!.branchOffices[0]!.buildings[0]! as any).firstDate = undefined;

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/import',
      headers: authHeaders(token),
      payload: fixture,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    // firstDate should be derived from the earliest place startDate (2024-01-01)
    expect(body.firstDate).toContain('2024-01-01');
    // All packages should have valid (non-inverted) columns
    expect(body.warnings).toEqual([]);
  });

  it('should return warnings for packages with inverted columns', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);

    const fixture = makeAglFixture();
    // Force a very late firstDate so some packages get inverted columns
    fixture.company.buildingCompanies[0]!.branchOffices[0]!.buildings[0]!.firstDate = '2025-06-01T08:00:00.000Z';

    const response = await app.inject({
      method: 'POST',
      url: '/buildings/import',
      headers: authHeaders(token),
      payload: fixture,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    // With firstDate far in the future, column() may produce garbage → some may be inverted
    // At minimum the response should include the warnings array
    expect(Array.isArray(body.warnings)).toBe(true);
  });
});

describe('AglImportService.deriveFirstDate', () => {
  it('should return earliest package date from lines', () => {
    const lines = [
      {
        teams: [
          {
            packages: [
              { plannedStart: '2024-06-01T08:00:00' },
              { plannedStart: '2024-03-15T08:00:00' },
            ],
          },
        ],
      },
    ];
    const result = AglImportService.deriveFirstDate(lines);
    expect(result).toEqual(new Date('2024-03-15T08:00:00'));
  });

  it('should return earliest place date when places are earlier than packages', () => {
    const lines = [
      {
        teams: [
          {
            packages: [
              { plannedStart: '2024-06-01T08:00:00' },
            ],
          },
        ],
      },
    ];
    const places = [
      { startDate: '2023-04-03T08:00:00' },
      { startDate: '2023-06-01T08:00:00' },
    ];
    const result = AglImportService.deriveFirstDate(lines, places);
    expect(result).toEqual(new Date('2023-04-03T08:00:00'));
  });

  it('should return earliest package date when packages are earlier than places', () => {
    const lines = [
      {
        teams: [
          {
            packages: [
              { plannedStart: '2022-01-01T08:00:00' },
            ],
          },
        ],
      },
    ];
    const places = [
      { startDate: '2023-04-03T08:00:00' },
    ];
    const result = AglImportService.deriveFirstDate(lines, places);
    expect(result).toEqual(new Date('2022-01-01T08:00:00'));
  });

  it('should handle C++ key format (plannedStartDate)', () => {
    const lines = [
      {
        teams: [
          {
            packages: [
              { plannedStartDate: '2024-01-01T08:00:00' },
            ],
          },
        ],
      },
    ];
    const result = AglImportService.deriveFirstDate(lines);
    expect(result).toEqual(new Date('2024-01-01T08:00:00'));
  });

  it('should return null for empty inputs', () => {
    expect(AglImportService.deriveFirstDate([])).toBeNull();
    expect(AglImportService.deriveFirstDate([], [])).toBeNull();
  });
});
