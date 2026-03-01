import { randomUUID } from 'crypto';

/**
 * Tradução de chaves entre formato AGL (C++) e formato TypeScript do domínio.
 *
 * Apenas Package tem chaves divergentes (6 campos). Todas as demais entidades
 * (Building, Diagram, Line, Team, Place, etc.) usam chaves idênticas nos dois formatos.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

/** Mapa C++ → TS para campos de Package */
const CPP_TO_TS: Record<string, string> = {
  plannedStartDate: 'plannedStart',
  plannedEndDate: 'plannedEnd',
  realStartDate: 'executionStart',
  realEndDate: 'executionEnd',
  secondPlannedEndDate: 'estimatedEnd',
  isCritical: 'isCriticalPath',
};

/** Mapa inverso TS → C++ */
const TS_TO_CPP: Record<string, string> = Object.fromEntries(
  Object.entries(CPP_TO_TS).map(([cpp, ts]) => [ts, cpp])
);

function renameKeys(pkg: AnyObj, keyMap: Record<string, string>): AnyObj {
  const result: AnyObj = {};
  for (const [key, value] of Object.entries(pkg)) {
    if (key === 'children') {
      // Recursivamente processar children (array de packages)
      if (Array.isArray(value)) {
        result['children'] = value.map((child: AnyObj) =>
          renameKeys(child, keyMap)
        );
      }
    } else {
      const mappedKey = keyMap[key];
      if (mappedKey !== undefined) {
        result[mappedKey] = value;
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

function mapPackagesInLines(
  lines: AnyObj[],
  keyMap: Record<string, string>
): AnyObj[] {
  return lines.map((line) => ({
    ...line,
    teams: (line['teams'] as AnyObj[]).map((team: AnyObj) => ({
      ...team,
      packages: (team['packages'] as AnyObj[]).map((pkg: AnyObj) =>
        renameKeys(pkg, keyMap)
      ),
    })),
  }));
}

function makeExpedient(
  buildingId: string,
  weekday: number,
  isWorkDay: boolean
): AnyObj {
  return {
    id: randomUUID(),
    buildingId,
    start: '2000-01-01T11:00:00.000Z',
    end: '2000-01-01T20:00:00.000Z',
    startLunch: '2000-01-01T15:00:00.000Z',
    endLunch: '2000-01-01T16:00:00.000Z',
    isWorkDay: isWorkDay,
    weekday,
    breaks: [],
  };
}

export class AglNormalizer {
  /** C++ → TS: renomeia chaves de Package, recursivo em children */
  static normalizePackage(pkg: AnyObj): AnyObj {
    return renameKeys(pkg, CPP_TO_TS);
  }

  /** TS → C++: renomeia chaves de Package, recursivo em children */
  static denormalizePackage(pkg: AnyObj): AnyObj {
    return renameKeys(pkg, TS_TO_CPP);
  }

  /** Normaliza todos os packages em lines[].teams[].packages[] */
  static normalizeLines(lines: AnyObj[]): AnyObj[] {
    return mapPackagesInLines(lines, CPP_TO_TS);
  }

  /** Denormaliza todos os packages em lines[].teams[].packages[] */
  static denormalizeLines(lines: AnyObj[]): AnyObj[] {
    return mapPackagesInLines(lines, TS_TO_CPP);
  }

  /**
   * Extrai building, diagrams e lines de um AGL completo (formato C++).
   * Building vem de company.buildingCompanies[0].branchOffices[0].buildings[0].
   * Lines são normalizadas (C++ → TS).
   */
  static extractBuildingFromAgl(agl: AnyObj): {
    building: AnyObj;
    diagrams: AnyObj[];
    lines: AnyObj[];
  } {
    const company = agl['company'];
    if (!company) {
      throw new Error('AGL inválido: campo "company" ausente');
    }

    const buildingCompanies = company['buildingCompanies'] as
      | AnyObj[]
      | undefined;
    if (!buildingCompanies || buildingCompanies.length === 0) {
      throw new Error('AGL inválido: "buildingCompanies" vazio ou ausente');
    }

    const branchOffices = buildingCompanies[0]!['branchOffices'] as
      | AnyObj[]
      | undefined;
    if (!branchOffices || branchOffices.length === 0) {
      throw new Error('AGL inválido: "branchOffices" vazio ou ausente');
    }

    const buildings = branchOffices[0]!['buildings'] as AnyObj[] | undefined;
    if (!buildings || buildings.length === 0) {
      throw new Error('AGL inválido: "buildings" vazio ou ausente');
    }

    const building = buildings[0]!;
    const diagrams = (agl['diagrams'] as AnyObj[]) ?? [];
    const rawLines = (agl['lines'] as AnyObj[]) ?? [];

    return {
      building,
      diagrams,
      lines: AglNormalizer.normalizeLines(rawLines),
    };
  }

  /**
   * Empacota building, diagrams e lines no formato AGL (Company wrapper).
   * Adiciona 7 expedients hardcoded (Mon-Fri workday, Sat-Sun off).
   * Lines são denormalizadas (TS → C++).
   */
  static buildAglWrapper(
    buildingJson: AnyObj,
    diagrams: AnyObj[],
    lines: AnyObj[]
  ): AnyObj {
    const buildingId = (buildingJson['id'] as string) ?? '';
    const now = new Date().toISOString();

    // Gera 7 expedients: weekday 0 (Sun) a 6 (Sat)
    const expedients: AnyObj[] = [];
    for (let wd = 0; wd <= 6; wd++) {
      const isWorkDay = wd >= 1 && wd <= 5; // Mon-Fri
      expedients.push(makeExpedient(buildingId, wd, isWorkDay));
    }

    const buildingWithExpedients = {
      ...buildingJson,
      expedients,
    };

    return {
      company: {
        id: randomUUID(),
        name: '',
        code: '',
        buildingCompanies: [
          {
            id: randomUUID(),
            name: '',
            code: '',
            companyId: '',
            stages: [],
            branchOffices: [
              {
                id: randomUUID(),
                name: '',
                buildingCompanyId: '',
                buildings: [buildingWithExpedients],
              },
            ],
          },
        ],
      },
      diagrams,
      lines: AglNormalizer.denormalizeLines(lines),
      budgetItems: [],
      createdDate: now,
      updatedDate: now,
      fileScheduleId: randomUUID(),
    };
  }
}
