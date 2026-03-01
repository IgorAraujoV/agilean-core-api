import type { Database } from 'better-sqlite3';
import { Building, Diagram, Place, Line, Team, Package } from 'agilean';
import { BuildingStorage } from '../storage/BuildingStorage';
import { StructuralRepository } from '../database/StructuralRepository';
import { LineRepository } from '../database/LineRepository';
import { LinkRepository } from '../database/LinkRepository';
import { AglNormalizer } from './AglNormalizer';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

export interface ImportWarning {
  type: 'inverted_columns';
  packageId: string;
  stageId: string;
  placeId: string;
  stageName: string;
  original: { startCol: number; endCol: number };
  corrected: { startCol: number; endCol: number };
}

export interface ImportResult {
  building: Building;
  warnings: ImportWarning[];
}

/**
 * Serviço de importação de AGL.
 *
 * Recebe JSON no formato AGL (wrapper company), reconstrói o Building completo
 * no domínio in-memory e persiste todas as entidades no SQLite em uma única transação.
 *
 * Usa o padrão do BuildingLoader para criar Lines/Teams/Packages manualmente
 * (em vez de Line.fromJson), evitando duplicação de packages pelo constructor do Team.
 */
export class AglImportService {
  private repo: StructuralRepository;
  private lineRepo: LineRepository;
  private linkRepo: LinkRepository;

  constructor(
    private db: Database,
    private storage: BuildingStorage,
  ) {
    this.repo = new StructuralRepository(db);
    this.lineRepo = new LineRepository(db);
    this.linkRepo = new LinkRepository(db);
  }

  /**
   * Importa AGL completo: cria Building, Diagrams, Places, Lines, Teams, Packages e Links.
   * Valida e corrige inconsistências do AGL antigo (ex: colunas invertidas).
   * @returns ImportResult com building criado e warnings de correções aplicadas
   */
  import(aglJson: AnyObj, userId: string): ImportResult {
    const warnings: ImportWarning[] = [];

    // 1. Extrair dados do wrapper AGL (normaliza chaves de packages C++ → TS)
    const { building: buildingJson, diagrams: diagramsJson, lines: linesJson } =
      AglNormalizer.extractBuildingFromAgl(aglJson);

    // 2. Determinar firstDate: usar campo do AGL, ou derivar da menor data entre packages e places.
    // O ACal precisa iniciar ANTES de todas as datas de packages para column() funcionar.
    const placesJson = (buildingJson['places'] as AnyObj[] | undefined) ?? [];
    let firstDate = buildingJson['firstDate'] ? new Date(buildingJson['firstDate'] as string) : null;
    if (!firstDate || isNaN(firstDate.getTime())) {
      firstDate = AglImportService.deriveFirstDate(linesJson, placesJson) ?? new Date();
    }

    // 3. Criar Building no domínio
    const building = new Building({
      id: buildingJson['id'] as string | undefined,
      name: (buildingJson['name'] as string) || 'Imported Building',
      firstDate,
      today: buildingJson['today'] ? new Date(buildingJson['today'] as string) : new Date(),
      todayEnabled: buildingJson['todayEnabled'] === true,
    });

    // 3. Criar Diagrams (antes de Places, para que stages estejam registrados quando Teams são criados)
    const networkToDiagram = new Map<string, string>(); // networkId → diagramId
    for (const dJson of diagramsJson) {
      const diagram = Diagram.fromJson(dJson);
      building.addDiagram(diagram);

      // Mapear networkId → diagramId para uso nas Lines
      for (const network of diagram.networks) {
        networkToDiagram.set(network.id, diagram.id);
      }
    }

    // Limpar changeset após adicionar diagrams
    building.applyDiagramChanges();

    // 4. Criar Places (sorted by level — pais antes de filhos)
    const sortedPlaces = [...placesJson].sort(
      (a, b) => ((a['level'] as number) ?? 0) - ((b['level'] as number) ?? 0),
    );

    const placeMap = new Map<string, Place>();
    for (const pJson of sortedPlaces) {
      const place = Place.fromJson(pJson, building);
      const parentId = pJson['parentId'] as string | null | undefined;

      if (!parentId || place.level === 0) {
        building.addUnit(place);
      } else {
        const parent = placeMap.get(parentId);
        if (parent) {
          parent.insertPlace(parent.count(), place);
        } else {
          building.addPlace(place);
        }
      }

      placeMap.set(place.id, place);
    }

    // 5. Criar Lines manualmente (padrão BuildingLoader: Line.create + Team com placeIds=[] + Package.createPackage)
    // NÃO usar Line.fromJson — o constructor do Team cria packages duplicados.
    const allLinks: Array<{ id: string; sourceId: string; destinationId: string; latency: number; locked: boolean }> = [];

    for (const lineJson of linesJson) {
      const networkId = lineJson['networkId'] as string;
      const placeId = lineJson['placeId'] as string;
      const diagramId = networkToDiagram.get(networkId);

      if (!diagramId) continue;

      const place = placeMap.get(placeId);
      if (!place) continue;

      // Criar Line via Line.create com floors=[] (como BuildingLoader)
      const line = Line.create(place, networkId, diagramId, [], building, lineJson['id'] as string | undefined);
      building.addLine(line);

      // Criar Teams e Packages manualmente
      const teamsJson = (lineJson['teams'] as AnyObj[]) ?? [];
      for (const teamJson of teamsJson) {
        const stageId = (teamJson['stageNetworkId'] as string) || '';
        const teamId = (teamJson['id'] as string) || '';

        // Use index=-1 to auto-compute unique index.
        // Real AGL files often have multiple teams with same stage + index=0
        // (representing the same stage applied to different sub-units).
        // The Team constructor auto-increments index when -1 is passed.
        const team = new Team(stageId, teamId, -1, line, []);
        line.addTeam(team);

        // Criar packages manualmente
        const packagesJson = (teamJson['packages'] as AnyObj[]) ?? [];
        for (const pkgJson of packagesJson) {
          // Pular children (apenas root packages)
          if (pkgJson['parentId']) continue;

          const pkgPlaceId = (pkgJson['placeId'] as string) || '';
          const pkgId = (pkgJson['id'] as string) || '';
          const pkgCode = (pkgJson['code'] as string) || '';
          // AGL pkg.stageId = company-level macro stage (NOT a network stage).
          // DB FK packages.stage_id → stages(id) requires network stage.
          // Use team's stageNetworkId (already in `stageId` variable).
          const pkgStageId = stageId;

          // Converter datas planejadas para colunas via building calendar
          // As chaves já foram normalizadas pelo AglNormalizer (C++ → TS):
          // plannedStartDate → plannedStart, plannedEndDate → plannedEnd
          const plannedStart = pkgJson['plannedStart'] as string | null;
          const plannedEnd = pkgJson['plannedEnd'] as string | null;

          let startCol = 0;
          let endCol = 0;
          if (plannedStart && plannedEnd) {
            startCol = building.column(new Date(plannedStart));
            endCol = building.column(new Date(plannedEnd));
          } else {
            // Fallback: usar duration para calcular endCol
            const duration = (pkgJson['duration'] as number) || 0;
            endCol = startCol + duration - 1;
          }

          // Validação: AGL antigo pode ter endDate < startDate (colunas invertidas).
          // Corrigir usando a duration do stage no diagrama.
          if (startCol > endCol && startCol > 0) {
            const originalStartCol = startCol;
            const originalEndCol = endCol;
            const stageData = building.stageStore.get(pkgStageId);
            const stageDuration = stageData?.duration ?? 1;
            endCol = startCol + stageDuration - 1;

            warnings.push({
              type: 'inverted_columns',
              packageId: pkgId,
              stageId: pkgStageId,
              placeId: pkgPlaceId,
              stageName: stageData?.name ?? '',
              original: { startCol: originalStartCol, endCol: originalEndCol },
              corrected: { startCol, endCol },
            });
          }

          const pkg = Package.createPackage(pkgPlaceId, team, pkgCode, endCol - startCol + 1, pkgId);
          pkg.setStageId(pkgStageId);
          // Setar posições exatas das colunas (como BuildingLoader)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (pkg as any)._start = startCol;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (pkg as any)._end = endCol;
          team.addPackage(pkg);

          // Coletar links embutidos no package (se existirem)
          const linksJson = (pkgJson['links'] as AnyObj[] | undefined) ?? [];
          for (const linkJson of linksJson) {
            allLinks.push({
              id: (linkJson['id'] as string) || '',
              sourceId: (linkJson['sourceId'] as string) || '',
              destinationId: (linkJson['destinationId'] as string) || '',
              latency: (linkJson['latency'] as number) || 0,
              locked: linkJson['isLocked'] !== false,
            });
          }
        }
      }
    }

    // 6. Registrar links no domínio
    for (const linkData of allLinks) {
      building.addLink(linkData.sourceId, linkData.destinationId, linkData.latency, linkData.id);
    }

    // 7. Persistir tudo no SQLite em uma única transação
    this.persistAll(building, userId, allLinks);

    // 8. Salvar no storage in-memory
    this.storage.save(building, userId);

    return { building, warnings };
  }

  /**
   * Varre packages e places do AGL e retorna a menor data encontrada.
   * Packages usam plannedStart/plannedStartDate; places usam startDate.
   * Usado para derivar firstDate quando o building AGL não tem o campo.
   */
  static deriveFirstDate(linesJson: AnyObj[], placesJson?: AnyObj[]): Date | null {
    let earliest: Date | null = null;

    const consider = (raw: string | null | undefined) => {
      if (!raw) return;
      const d = new Date(raw);
      if (isNaN(d.getTime())) return;
      if (!earliest || d.getTime() < earliest.getTime()) {
        earliest = d;
      }
    };

    // Datas das places (unidades podem ter startDate anterior aos packages)
    if (placesJson) {
      for (const pJson of placesJson) {
        consider(pJson['startDate'] as string | null);
      }
    }

    // Datas dos packages
    for (const lineJson of linesJson) {
      const teamsJson = (lineJson['teams'] as AnyObj[]) ?? [];
      for (const teamJson of teamsJson) {
        const packagesJson = (teamJson['packages'] as AnyObj[]) ?? [];
        for (const pkgJson of packagesJson) {
          // Chaves já normalizadas C++ → TS pelo AglNormalizer
          consider((pkgJson['plannedStart'] as string | null) ?? (pkgJson['plannedStartDate'] as string | null));
        }
      }
    }

    return earliest;
  }

  /**
   * Persiste Building completo no SQLite em uma única transação.
   */
  private persistAll(
    building: Building,
    userId: string,
    links: Array<{ id: string; sourceId: string; destinationId: string; latency: number; locked: boolean }>,
  ): void {
    const transaction = this.db.transaction(() => {
      // Building
      this.repo.insertBuilding(building);

      // building_users junction
      this.db
        .prepare('INSERT INTO building_users (building_id, user_id) VALUES (?, ?)')
        .run(building.id, userId);

      // Places
      for (const place of building.allPlaces()) {
        const parentId = place.parentPlace?.id ?? null;
        this.repo.insertPlace(place, building.id, parentId);
      }

      // Diagrams, Networks, Stages, Precedences
      for (const diagram of building.allDiagrams()) {
        this.repo.insertDiagram(diagram, building.id);
        for (const network of diagram.networks) {
          this.repo.insertNetwork(network, diagram.id);
          for (const stage of network.stages) {
            this.repo.insertStage(stage, network.id);
          }
        }
        for (const precedence of diagram.precedences) {
          this.repo.insertPrecedence(precedence, diagram.id);
        }
      }

      // Lines, Teams, Packages
      for (const lineData of building.lineStore.all()) {
        const line = building.getLine(lineData.id);
        if (line) {
          this.lineRepo.insertAll(line, building.id);
        }
      }

      // Links
      for (const link of links) {
        this.linkRepo.insert(link.id, link.sourceId, link.destinationId, link.latency, link.locked);
      }
    });

    transaction();
  }
}
