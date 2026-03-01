import { AglNormalizer } from '../services/AglNormalizer';

describe('AglNormalizer', () => {
  // ─── normalizePackage ───────────────────────────────────────────────

  describe('normalizePackage', () => {
    it('should rename C++ keys to TS keys', () => {
      const cppPkg = {
        id: 'pkg-1',
        name: 'Fundacao',
        plannedStartDate: '2024-01-01',
        plannedEndDate: '2024-01-15',
        realStartDate: '2024-01-02',
        realEndDate: '2024-01-14',
        secondPlannedEndDate: '2024-01-16',
        isCritical: true,
        status: 1,
      };

      const result = AglNormalizer.normalizePackage(cppPkg);

      expect(result.plannedStart).toBe('2024-01-01');
      expect(result.plannedEnd).toBe('2024-01-15');
      expect(result.executionStart).toBe('2024-01-02');
      expect(result.executionEnd).toBe('2024-01-14');
      expect(result.estimatedEnd).toBe('2024-01-16');
      expect(result.isCriticalPath).toBe(true);
      // Original C++ keys must NOT be present
      expect(result).not.toHaveProperty('plannedStartDate');
      expect(result).not.toHaveProperty('plannedEndDate');
      expect(result).not.toHaveProperty('realStartDate');
      expect(result).not.toHaveProperty('realEndDate');
      expect(result).not.toHaveProperty('secondPlannedEndDate');
      expect(result).not.toHaveProperty('isCritical');
      // Non-mapped keys are preserved
      expect(result.id).toBe('pkg-1');
      expect(result.name).toBe('Fundacao');
      expect(result.status).toBe(1);
    });

    it('should handle missing optional C++ keys gracefully', () => {
      const cppPkg = {
        id: 'pkg-2',
        plannedStartDate: '2024-02-01',
      };

      const result = AglNormalizer.normalizePackage(cppPkg);

      expect(result.plannedStart).toBe('2024-02-01');
      expect(result.id).toBe('pkg-2');
      // Missing keys should not appear at all
      expect(result).not.toHaveProperty('plannedEnd');
      expect(result).not.toHaveProperty('executionStart');
      expect(result).not.toHaveProperty('executionEnd');
      expect(result).not.toHaveProperty('estimatedEnd');
      expect(result).not.toHaveProperty('isCriticalPath');
    });

    it('should recursively normalize children', () => {
      const cppPkg = {
        id: 'parent-1',
        plannedStartDate: '2024-03-01',
        plannedEndDate: '2024-03-31',
        children: [
          {
            id: 'child-1',
            plannedStartDate: '2024-03-01',
            plannedEndDate: '2024-03-15',
            realStartDate: '2024-03-02',
            children: [],
          },
          {
            id: 'child-2',
            plannedStartDate: '2024-03-16',
            isCritical: false,
          },
        ],
      };

      const result = AglNormalizer.normalizePackage(cppPkg);

      expect(result.plannedStart).toBe('2024-03-01');
      expect(result.plannedEnd).toBe('2024-03-31');
      expect(result.children).toHaveLength(2);

      const child0 = result.children[0];
      expect(child0.id).toBe('child-1');
      expect(child0.plannedStart).toBe('2024-03-01');
      expect(child0.plannedEnd).toBe('2024-03-15');
      expect(child0.executionStart).toBe('2024-03-02');
      expect(child0).not.toHaveProperty('plannedStartDate');
      expect(child0).not.toHaveProperty('realStartDate');
      expect(child0.children).toHaveLength(0);

      const child1 = result.children[1];
      expect(child1.id).toBe('child-2');
      expect(child1.plannedStart).toBe('2024-03-16');
      expect(child1.isCriticalPath).toBe(false);
      expect(child1).not.toHaveProperty('isCritical');
    });

    it('should handle package with no children property', () => {
      const cppPkg = {
        id: 'pkg-no-children',
        plannedStartDate: '2024-04-01',
      };

      const result = AglNormalizer.normalizePackage(cppPkg);

      expect(result.id).toBe('pkg-no-children');
      expect(result.plannedStart).toBe('2024-04-01');
      expect(result).not.toHaveProperty('children');
    });
  });

  // ─── denormalizePackage ─────────────────────────────────────────────

  describe('denormalizePackage', () => {
    it('should rename TS keys back to C++ keys', () => {
      const tsPkg = {
        id: 'pkg-1',
        name: 'Fundacao',
        plannedStart: '2024-01-01',
        plannedEnd: '2024-01-15',
        executionStart: '2024-01-02',
        executionEnd: '2024-01-14',
        estimatedEnd: '2024-01-16',
        isCriticalPath: true,
        status: 1,
      };

      const result = AglNormalizer.denormalizePackage(tsPkg);

      expect(result.plannedStartDate).toBe('2024-01-01');
      expect(result.plannedEndDate).toBe('2024-01-15');
      expect(result.realStartDate).toBe('2024-01-02');
      expect(result.realEndDate).toBe('2024-01-14');
      expect(result.secondPlannedEndDate).toBe('2024-01-16');
      expect(result.isCritical).toBe(true);
      // TS keys must NOT be present
      expect(result).not.toHaveProperty('plannedStart');
      expect(result).not.toHaveProperty('plannedEnd');
      expect(result).not.toHaveProperty('executionStart');
      expect(result).not.toHaveProperty('executionEnd');
      expect(result).not.toHaveProperty('estimatedEnd');
      expect(result).not.toHaveProperty('isCriticalPath');
      // Non-mapped keys preserved
      expect(result.id).toBe('pkg-1');
      expect(result.name).toBe('Fundacao');
      expect(result.status).toBe(1);
    });

    it('should handle missing optional TS keys gracefully', () => {
      const tsPkg = {
        id: 'pkg-2',
        plannedStart: '2024-02-01',
      };

      const result = AglNormalizer.denormalizePackage(tsPkg);

      expect(result.plannedStartDate).toBe('2024-02-01');
      expect(result.id).toBe('pkg-2');
      expect(result).not.toHaveProperty('plannedEndDate');
      expect(result).not.toHaveProperty('realStartDate');
    });

    it('should recursively denormalize children', () => {
      const tsPkg = {
        id: 'parent-1',
        plannedStart: '2024-03-01',
        children: [
          {
            id: 'child-1',
            plannedStart: '2024-03-01',
            executionStart: '2024-03-02',
            children: [],
          },
        ],
      };

      const result = AglNormalizer.denormalizePackage(tsPkg);

      expect(result.plannedStartDate).toBe('2024-03-01');
      expect(result.children).toHaveLength(1);

      const child0 = result.children[0];
      expect(child0.plannedStartDate).toBe('2024-03-01');
      expect(child0.realStartDate).toBe('2024-03-02');
      expect(child0).not.toHaveProperty('plannedStart');
      expect(child0).not.toHaveProperty('executionStart');
      expect(child0.children).toHaveLength(0);
    });

    it('should be the inverse of normalizePackage (round-trip)', () => {
      const original = {
        id: 'rt-1',
        plannedStartDate: '2024-05-01',
        plannedEndDate: '2024-05-31',
        realStartDate: '2024-05-02',
        realEndDate: '2024-05-30',
        secondPlannedEndDate: '2024-06-01',
        isCritical: false,
        extra: 'preserved',
        children: [
          {
            id: 'rt-child',
            plannedStartDate: '2024-05-10',
            isCritical: true,
          },
        ],
      };

      const normalized = AglNormalizer.normalizePackage(original);
      const roundTrip = AglNormalizer.denormalizePackage(normalized);

      expect(roundTrip).toEqual(original);
    });
  });

  // ─── normalizeLines ─────────────────────────────────────────────────

  describe('normalizeLines', () => {
    it('should normalize all packages nested in lines[].teams[].packages[]', () => {
      const lines = [
        {
          id: 'line-1',
          name: 'Line A',
          teams: [
            {
              id: 'team-1',
              packages: [
                {
                  id: 'pkg-1',
                  plannedStartDate: '2024-01-01',
                  plannedEndDate: '2024-01-10',
                  isCritical: true,
                },
                {
                  id: 'pkg-2',
                  plannedStartDate: '2024-01-11',
                  realStartDate: '2024-01-12',
                },
              ],
            },
          ],
        },
        {
          id: 'line-2',
          teams: [
            {
              id: 'team-2',
              packages: [
                {
                  id: 'pkg-3',
                  secondPlannedEndDate: '2024-02-28',
                },
              ],
            },
          ],
        },
      ];

      const result = AglNormalizer.normalizeLines(lines);

      // Line 1, Team 1, Package 1
      const p1 = result[0]!.teams[0]!.packages[0]!;
      expect(p1.plannedStart).toBe('2024-01-01');
      expect(p1.plannedEnd).toBe('2024-01-10');
      expect(p1.isCriticalPath).toBe(true);
      expect(p1).not.toHaveProperty('plannedStartDate');
      expect(p1).not.toHaveProperty('isCritical');

      // Line 1, Team 1, Package 2
      const p2 = result[0]!.teams[0]!.packages[1]!;
      expect(p2.plannedStart).toBe('2024-01-11');
      expect(p2.executionStart).toBe('2024-01-12');
      expect(p2).not.toHaveProperty('realStartDate');

      // Line 2, Team 2, Package 3
      const p3 = result[1]!.teams[0]!.packages[0]!;
      expect(p3.estimatedEnd).toBe('2024-02-28');
      expect(p3).not.toHaveProperty('secondPlannedEndDate');

      // Non-package fields are preserved
      expect(result[0]!.id).toBe('line-1');
      expect(result[0]!.name).toBe('Line A');
      expect(result[0]!.teams[0]!.id).toBe('team-1');
    });

    it('should handle empty lines array', () => {
      const result = AglNormalizer.normalizeLines([]);
      expect(result).toEqual([]);
    });

    it('should handle teams with no packages', () => {
      const lines = [
        {
          id: 'line-1',
          teams: [
            {
              id: 'team-1',
              packages: [],
            },
          ],
        },
      ];

      const result = AglNormalizer.normalizeLines(lines);
      expect(result[0]!.teams[0]!.packages).toEqual([]);
    });
  });

  // ─── denormalizeLines ───────────────────────────────────────────────

  describe('denormalizeLines', () => {
    it('should denormalize all packages nested in lines[].teams[].packages[]', () => {
      const lines = [
        {
          id: 'line-1',
          teams: [
            {
              id: 'team-1',
              packages: [
                {
                  id: 'pkg-1',
                  plannedStart: '2024-01-01',
                  plannedEnd: '2024-01-10',
                  isCriticalPath: true,
                },
              ],
            },
          ],
        },
      ];

      const result = AglNormalizer.denormalizeLines(lines);

      const p1 = result[0]!.teams[0]!.packages[0]!;
      expect(p1.plannedStartDate).toBe('2024-01-01');
      expect(p1.plannedEndDate).toBe('2024-01-10');
      expect(p1.isCritical).toBe(true);
      expect(p1).not.toHaveProperty('plannedStart');
      expect(p1).not.toHaveProperty('isCriticalPath');
    });

    it('should be the inverse of normalizeLines (round-trip)', () => {
      const original = [
        {
          id: 'line-1',
          teams: [
            {
              id: 'team-1',
              packages: [
                {
                  id: 'pkg-1',
                  plannedStartDate: '2024-01-01',
                  plannedEndDate: '2024-01-10',
                  realStartDate: '2024-01-02',
                  realEndDate: '2024-01-09',
                  secondPlannedEndDate: '2024-01-11',
                  isCritical: false,
                },
              ],
            },
          ],
        },
      ];

      const normalized = AglNormalizer.normalizeLines(original);
      const roundTrip = AglNormalizer.denormalizeLines(normalized);

      expect(roundTrip).toEqual(original);
    });
  });

  // ─── extractBuildingFromAgl ─────────────────────────────────────────

  describe('extractBuildingFromAgl', () => {
    const makeValidAgl = () => ({
      company: {
        id: 'company-1',
        name: 'Construtora ABC',
        code: 'ABC',
        buildingCompanies: [
          {
            id: 'bc-1',
            name: 'Filial SP',
            code: 'SP',
            companyId: 'company-1',
            stages: [],
            branchOffices: [
              {
                id: 'bo-1',
                name: 'Escritorio Central',
                buildingCompanyId: 'bc-1',
                buildings: [
                  {
                    id: 'building-1',
                    name: 'Torre A',
                    places: [{ id: 'p1', name: 'Bloco 1' }],
                    days: [],
                    expedients: [],
                  },
                ],
              },
            ],
          },
        ],
      },
      diagrams: [
        { id: 'diag-1', name: 'Diagrama Principal', networks: [] },
      ],
      lines: [
        {
          id: 'line-1',
          teams: [
            {
              id: 'team-1',
              packages: [
                {
                  id: 'pkg-1',
                  plannedStartDate: '2024-01-01',
                  plannedEndDate: '2024-01-15',
                  isCritical: true,
                },
              ],
            },
          ],
        },
      ],
      budgetItems: [],
      createdDate: '2024-01-01T00:00:00.000Z',
      updatedDate: '2024-01-01T00:00:00.000Z',
      fileScheduleId: 'fs-1',
    });

    it('should extract building from nested company structure', () => {
      const agl = makeValidAgl();
      const result = AglNormalizer.extractBuildingFromAgl(agl);

      expect(result.building.id).toBe('building-1');
      expect(result.building.name).toBe('Torre A');
      expect(result.building.places).toHaveLength(1);
    });

    it('should extract diagrams as-is', () => {
      const agl = makeValidAgl();
      const result = AglNormalizer.extractBuildingFromAgl(agl);

      expect(result.diagrams).toHaveLength(1);
      expect(result.diagrams[0]!.id).toBe('diag-1');
      expect(result.diagrams[0]!.name).toBe('Diagrama Principal');
    });

    it('should normalize lines (C++ -> TS keys)', () => {
      const agl = makeValidAgl();
      const result = AglNormalizer.extractBuildingFromAgl(agl);

      expect(result.lines).toHaveLength(1);
      const pkg = result.lines[0]!.teams[0]!.packages[0]!;
      expect(pkg.plannedStart).toBe('2024-01-01');
      expect(pkg.plannedEnd).toBe('2024-01-15');
      expect(pkg.isCriticalPath).toBe(true);
      expect(pkg).not.toHaveProperty('plannedStartDate');
      expect(pkg).not.toHaveProperty('isCritical');
    });

    it('should throw if company is missing', () => {
      const agl = { diagrams: [], lines: [] };
      expect(() => AglNormalizer.extractBuildingFromAgl(agl as any)).toThrow();
    });

    it('should throw if buildingCompanies is empty', () => {
      const agl = {
        company: { buildingCompanies: [] },
        diagrams: [],
        lines: [],
      };
      expect(() => AglNormalizer.extractBuildingFromAgl(agl as any)).toThrow();
    });

    it('should throw if branchOffices is empty', () => {
      const agl = {
        company: {
          buildingCompanies: [{ branchOffices: [] }],
        },
        diagrams: [],
        lines: [],
      };
      expect(() => AglNormalizer.extractBuildingFromAgl(agl as any)).toThrow();
    });

    it('should throw if buildings is empty', () => {
      const agl = {
        company: {
          buildingCompanies: [{ branchOffices: [{ buildings: [] }] }],
        },
        diagrams: [],
        lines: [],
      };
      expect(() => AglNormalizer.extractBuildingFromAgl(agl as any)).toThrow();
    });
  });

  // ─── buildAglWrapper ────────────────────────────────────────────────

  describe('buildAglWrapper', () => {
    it('should wrap building data in the AGL company structure', () => {
      const buildingJson = {
        id: 'building-1',
        name: 'Torre A',
        places: [],
        days: [],
      };
      const diagrams = [{ id: 'diag-1', name: 'Diagrama 1' }];
      const lines: any[] = [];

      const result = AglNormalizer.buildAglWrapper(buildingJson, diagrams, lines);

      expect(result.company).toBeDefined();
      expect(result.company.buildingCompanies).toHaveLength(1);
      expect(result.company.buildingCompanies[0]!.branchOffices).toHaveLength(1);
      expect(
        result.company.buildingCompanies[0]!.branchOffices[0]!.buildings
      ).toHaveLength(1);
      expect(
        result.company.buildingCompanies[0]!.branchOffices[0]!.buildings[0]!.id
      ).toBe('building-1');
    });

    it('should include diagrams and lines at top level', () => {
      const buildingJson = { id: 'b-1', name: 'B' };
      const diagrams = [{ id: 'd-1' }];
      const lines: any[] = [];

      const result = AglNormalizer.buildAglWrapper(buildingJson, diagrams, lines);

      expect(result.diagrams).toHaveLength(1);
      expect(result.diagrams[0]!.id).toBe('d-1');
      expect(result.lines).toEqual([]);
    });

    it('should generate exactly 7 expedients (one per weekday)', () => {
      const buildingJson = { id: 'b-1', name: 'B' };

      const result = AglNormalizer.buildAglWrapper(buildingJson, [], []);

      const building =
        result.company.buildingCompanies[0]!.branchOffices[0]!.buildings[0]!;
      expect(building.expedients).toHaveLength(7);

      // Check weekday coverage: 0 (Sun) through 6 (Sat)
      const weekdays = building.expedients.map(
        (e: any) => e.weekday
      ) as number[];
      expect(weekdays).toContain(0);
      expect(weekdays).toContain(1);
      expect(weekdays).toContain(2);
      expect(weekdays).toContain(3);
      expect(weekdays).toContain(4);
      expect(weekdays).toContain(5);
      expect(weekdays).toContain(6);
    });

    it('should set Mon-Fri as workdays and Sat-Sun as non-workdays', () => {
      const buildingJson = { id: 'b-1', name: 'B' };

      const result = AglNormalizer.buildAglWrapper(buildingJson, [], []);

      const building =
        result.company.buildingCompanies[0]!.branchOffices[0]!.buildings[0]!;
      const expedients = building.expedients as any[];

      // Sunday (0) = not a workday
      const sunday = expedients.find((e: any) => e.weekday === 0);
      expect(sunday.isWorkDay).toBe(false);

      // Monday (1) through Friday (5) = workdays
      for (let wd = 1; wd <= 5; wd++) {
        const exp = expedients.find((e: any) => e.weekday === wd);
        expect(exp.isWorkDay).toBe(true);
      }

      // Saturday (6) = not a workday
      const saturday = expedients.find((e: any) => e.weekday === 6);
      expect(saturday.isWorkDay).toBe(false);
    });

    it('should set correct work hours in expedients', () => {
      const buildingJson = { id: 'b-1', name: 'B' };

      const result = AglNormalizer.buildAglWrapper(buildingJson, [], []);

      const building =
        result.company.buildingCompanies[0]!.branchOffices[0]!.buildings[0]!;
      // Check a workday expedient (Monday = 1)
      const monday = (building.expedients as any[]).find(
        (e: any) => e.weekday === 1
      );
      expect(monday.start).toBe('2000-01-01T11:00:00.000Z');
      expect(monday.end).toBe('2000-01-01T20:00:00.000Z');
      expect(monday.startLunch).toBe('2000-01-01T15:00:00.000Z');
      expect(monday.endLunch).toBe('2000-01-01T16:00:00.000Z');
      expect(monday.breaks).toEqual([]);
    });

    it('should set buildingId on each expedient', () => {
      const buildingJson = { id: 'my-building-id', name: 'B' };

      const result = AglNormalizer.buildAglWrapper(buildingJson, [], []);

      const building =
        result.company.buildingCompanies[0]!.branchOffices[0]!.buildings[0]!;
      for (const exp of building.expedients as any[]) {
        expect(exp.buildingId).toBe('my-building-id');
      }
    });

    it('should denormalize lines (TS -> C++ keys)', () => {
      const buildingJson = { id: 'b-1', name: 'B' };
      const diagrams: any[] = [];
      const lines = [
        {
          id: 'line-1',
          teams: [
            {
              id: 'team-1',
              packages: [
                {
                  id: 'pkg-1',
                  plannedStart: '2024-01-01',
                  plannedEnd: '2024-01-15',
                  executionStart: '2024-01-02',
                  executionEnd: '2024-01-14',
                  estimatedEnd: '2024-01-16',
                  isCriticalPath: true,
                },
              ],
            },
          ],
        },
      ];

      const result = AglNormalizer.buildAglWrapper(buildingJson, diagrams, lines);

      const pkg = result.lines[0]!.teams[0]!.packages[0]!;
      expect(pkg.plannedStartDate).toBe('2024-01-01');
      expect(pkg.plannedEndDate).toBe('2024-01-15');
      expect(pkg.realStartDate).toBe('2024-01-02');
      expect(pkg.realEndDate).toBe('2024-01-14');
      expect(pkg.secondPlannedEndDate).toBe('2024-01-16');
      expect(pkg.isCritical).toBe(true);
      expect(pkg).not.toHaveProperty('plannedStart');
      expect(pkg).not.toHaveProperty('isCriticalPath');
    });

    it('should include budgetItems, createdDate, updatedDate, and fileScheduleId', () => {
      const buildingJson = { id: 'b-1', name: 'B' };

      const result = AglNormalizer.buildAglWrapper(buildingJson, [], []);

      expect(result.budgetItems).toEqual([]);
      expect(result.createdDate).toBeDefined();
      expect(result.updatedDate).toBeDefined();
      expect(result.fileScheduleId).toBe('b-1');
      // createdDate and updatedDate should be valid ISO strings
      expect(() => new Date(result.createdDate)).not.toThrow();
      expect(() => new Date(result.updatedDate)).not.toThrow();
    });

    it('should generate unique ids for expedients', () => {
      const buildingJson = { id: 'b-1', name: 'B' };

      const result = AglNormalizer.buildAglWrapper(buildingJson, [], []);

      const building =
        result.company.buildingCompanies[0]!.branchOffices[0]!.buildings[0]!;
      const ids = (building.expedients as any[]).map((e: any) => e.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(7);
      // Each id should be a non-empty string
      for (const id of ids) {
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
      }
    });
  });
});
