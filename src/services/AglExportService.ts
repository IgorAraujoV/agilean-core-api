import type { Database } from 'better-sqlite3';
import type { Building, Diagram } from 'agilean';
import { BuildingLoader } from '../loader/BuildingLoader';
import { AglNormalizer } from './AglNormalizer';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

/**
 * Serializa Diagram manualmente, acessando stages via network.stages
 * em vez de diagram.toJson() (que usa findStageById → stageStore,
 * retornando StageData em vez de Stage instances).
 */
function serializeDiagram(diagram: Diagram): AnyObj {
  const networks = diagram.networks;
  const networksJson: AnyObj[] = [];

  for (const network of networks) {
    const stagesJson: AnyObj[] = [];
    for (const stage of network.stages) {
      stagesJson.push(stage.toJson());
    }
    networksJson.push({
      stageNetworks: stagesJson,
      name: network.name,
      id: network.id,
      diagramId: diagram.id,
      color: network.color ?? '',
      textColor: network.textColor ?? '',
      index: 0,
    });
  }

  return {
    networks: networksJson,
    name: diagram.name,
    id: diagram.id,
    index: diagram.index,
    buildingId: diagram.buildingId,
    sequence: diagram.sequence,
  };
}

/**
 * Servico de exportacao de AGL.
 *
 * Carrega Building completo do SQLite via BuildingLoader, serializa todas as
 * entidades e empacota no formato AGL (Company wrapper) usando AglNormalizer.
 */
export class AglExportService {
  private loader: BuildingLoader;

  constructor(
    private db: Database,
  ) {
    this.loader = new BuildingLoader(db);
  }

  /**
   * Exporta um building como AGL JSON.
   * @returns AGL JSON completo ou null se building nao existe
   */
  export(buildingId: string): AnyObj | null {
    // 1. Carregar building completo do SQLite (com packages, teams, links)
    const building = this.loader.loadWithPackages(buildingId);
    if (!building) return null;

    // 2. Serializar building metadata (toJson() retorna apenas id, name, firstDate, today, todayEnabled)
    const buildingJson = building.toJson();

    // 3. Serializar places (flat list — Place.toJson() NAO inclui children)
    const placesJson = building.allPlaces().map(place => place.toJson());
    buildingJson.places = placesJson;

    // 4. Serializar diagrams (manualmente, para contornar bug em Diagram.findStageById
    //    que retorna StageData do store em vez de Stage instance)
    const diagramsJson = building.allDiagrams().map(diagram => serializeDiagram(diagram));

    // 5. Serializar lines (Line.toJson() inclui teams com packages)
    const linesJson: AnyObj[] = [];
    for (const lineData of building.lineStore.all()) {
      const line = building.getLine(lineData.id);
      if (line) {
        linesJson.push(line.toJson());
      }
    }

    // 6. Empacotar no formato AGL via AglNormalizer (adiciona company wrapper,
    //    expedients, e denormaliza chaves de packages TS -> C++)
    return AglNormalizer.buildAglWrapper(buildingJson, diagramsJson, linesJson);
  }
}
