import { Building, Diagram, Network, Stage, ChangeType, ChangeElement } from 'agilean';
import type { Database } from 'better-sqlite3';
import { StructuralRepository } from '../database/StructuralRepository';
import { DiagramRepository, DiagramRow, DiagramSummaryRow } from '../database/DiagramRepository';
import { DiagramPropagationService } from './DiagramPropagationService';

interface StageResponse {
  id: string;
  name: string;
  duration: number;
  latency: number;
}

interface PrecedenceResponse {
  id: string;
  sourceStageId: string;
  destinationStageId: string;
  opening: number;
  latency: number;
}

interface NetworkResponse {
  id: string;
  name: string;
  stages: StageResponse[];
}

interface DiagramResponse {
  id: string;
  name: string;
  networks: NetworkResponse[];
  precedences: PrecedenceResponse[];
}

interface StageImpact {
  packageCount: number;
  teamCount: number;
}

export class DiagramService {
  private repo: StructuralRepository;
  private diagramRepo: DiagramRepository;
  private db: Database;

  constructor(db: Database) {
    this.db = db;
    this.repo = new StructuralRepository(db);
    this.diagramRepo = new DiagramRepository(db);
  }

  create(building: Building, name: string): Diagram {
    const diagram = building.addDiagram(name);
    this.repo.insertDiagram(diagram, building.id);
    return diagram;
  }

  getAll(building: Building): DiagramResponse[] {
    return building.allDiagrams().map(d => this.toResponse(d));
  }

  getById(building: Building, diagramId: string): DiagramResponse | null {
    const diagram = building.getDiagram(diagramId);
    if (!diagram) return null;
    return this.toResponse(diagram);
  }

  getAllFromDb(buildingId: string): DiagramSummaryRow[] {
    return this.diagramRepo.findAllByBuilding(buildingId);
  }

  getByIdFromDb(diagramId: string, buildingId: string): DiagramRow | null {
    return this.diagramRepo.findById(diagramId, buildingId);
  }

  addNetwork(building: Building, diagramId: string, name: string): Network | null {
    const diagram = building.getDiagram(diagramId);
    if (!diagram) return null;

    const network = new Network();
    network.name = name;
    diagram.appendNetwork(network);
    this.repo.insertNetwork(network, diagramId);

    // Drain ChangeSet — appendNetwork inserts Insertion Network change.
    // Without draining, this stale change corrupts state when applyDiagramChanges
    // runs later (e.g. when a stage is added with lines present).
    building.applyDiagramChanges();

    return network;
  }

  getNetworks(building: Building, diagramId: string): NetworkResponse[] | null {
    const diagram = building.getDiagram(diagramId);
    if (!diagram) return null;

    return diagram.networks.map(n => this.networkToResponse(n));
  }

  addStageToNetwork(
    building: Building,
    diagramId: string,
    networkId: string,
    name: string,
    duration: number,
    latency: number,
  ): Stage | null {
    const diagram = building.getDiagram(diagramId);
    if (!diagram) return null;

    const network = diagram.getNetwork(networkId);
    if (!network) return null;

    // SNAPSHOT before mutation (if Lines exist for this network)
    const lines = building.lineStore.getByNetwork(networkId);
    const propagation = lines.length > 0 ? new DiagramPropagationService(this.db) : null;
    const snapshotCtx = propagation ? propagation.snapshot(building, networkId) : null;

    // Create and add stage to domain (appendStage inserts Insertion into ChangeSet)
    const stage = new Stage(name, duration, latency);
    network.appendStage(stage);
    this.repo.insertStage(stage, networkId);

    // Apply BFS + persist new teams and packages for existing Lines
    if (propagation && snapshotCtx) {
      propagation.applyAndPersist(building, snapshotCtx);
    } else {
      // No lines to propagate, but still drain the ChangeSet to keep it clean.
      // Without this, stale changes (e.g. Insertion Network) accumulate and
      // corrupt state when applyDiagramChanges runs later with lines present.
      building.applyDiagramChanges();
    }

    return stage;
  }

  addPrecedence(building: Building, diagramId: string, sourceId: string, destinationId: string, opening: number, latency: number): { precedence: PrecedenceResponse } | { error: string } {
    const diagram = building.getDiagram(diagramId);
    if (!diagram) return { error: 'Diagram not found' };

    // Determine networkId for propagation snapshot from the source stage
    const sourceStage = diagram.findStageById(sourceId);
    const networkId = sourceStage ? diagram.networkOfStage(sourceId)?.id ?? null : null;
    const lines = networkId ? building.lineStore.getByNetwork(networkId) : [];

    const propagation = lines.length > 0 ? new DiagramPropagationService(this.db) : null;
    const snapshotCtx = propagation && networkId ? propagation.snapshot(building, networkId) : null;

    const precedence = diagram.addPrecedenceByIds(sourceId, destinationId, opening, latency);
    if (!precedence) return { error: 'Invalid precedence: stages must exist in the diagram, source must differ from destination, and no cycles are allowed' };

    this.repo.insertPrecedence(precedence, diagramId);

    if (propagation && snapshotCtx) {
      propagation.applyAndPersist(building, snapshotCtx);
    } else {
      // No lines to propagate, but still drain the ChangeSet to keep it clean.
      building.applyDiagramChanges();
    }

    return {
      precedence: {
        id: precedence.id,
        sourceStageId: precedence.source,
        destinationStageId: precedence.destination,
        opening: precedence.opening,
        latency: precedence.latency,
      },
    };
  }

  updateStage(
    building: Building,
    diagramId: string,
    networkId: string,
    stageId: string,
    fields: { name?: string; duration?: number; latency?: number },
  ): { id: string; name: string; duration: number; latency: number } | null {
    const diagram = building.getDiagram(diagramId);
    if (!diagram) return null;
    const network = diagram.getNetwork(networkId);
    if (!network) return null;
    const stage = network.findStageById(stageId);
    if (!stage) return null;

    const positionAffected = fields.duration !== undefined || fields.latency !== undefined;
    const lines = building.lineStore.getByNetwork(networkId);

    // Snapshot only if position changes and there are affected lines
    const propagation = positionAffected && lines.length > 0
      ? new DiagramPropagationService(this.db)
      : null;
    const snapshotCtx = propagation ? propagation.snapshot(building, networkId) : null;

    // Apply field changes to domain
    if (fields.name !== undefined) stage.name = fields.name;
    if (fields.duration !== undefined) stage.duration = fields.duration;
    if (fields.latency !== undefined) stage.latency = fields.latency;

    // For duration/latency change: manually update Planning package end columns and force
    // a Reposition change in the ChangeSet so applyDiagramChanges triggers BFS.
    // stage.duration setter does NOT insert a ChangeSet entry (unlike Precedence setters),
    // so we must inject the Reposition change explicitly.
    if (positionAffected && lines.length > 0) {
      if (fields.duration !== undefined) {
        const teamsData = building.teamStore.getByStage(stageId);
        for (const teamData of teamsData) {
          const line = building.getLine(teamData.lineId);
          if (!line) continue;
          const team = line.getTeamById(teamData.id);
          if (!team) continue;
          for (const pkg of team.packages()) {
            if (pkg.isPlanning()) {
              // Update end column: start + newDuration - 1
              (pkg as any)._end = pkg.start() + stage.duration - 1;
            }
          }
        }
      }

      // Inject Reposition into the ChangeSet so applyDiagramChanges → BFS repositions
      // downstream stages. ChangeType.Reposition (2) + ChangeElement.Stage (3).
      diagram.changeSet.insert(ChangeType.Reposition, ChangeElement.Stage, stageId);
    }

    // Persist text/structural changes to SQLite
    this.repo.updateStage(stageId, fields);

    // Apply BFS + persist moved packages
    if (propagation && snapshotCtx) {
      propagation.applyAndPersist(building, snapshotCtx);
    }

    return {
      id: stage.id,
      name: stage.name,
      duration: stage.duration,
      latency: stage.latency,
    };
  }

  updatePrecedence(
    building: Building,
    diagramId: string,
    precedenceId: string,
    fields: { opening?: number; latency?: number },
  ): { id: string; sourceStageId: string; destinationStageId: string; opening: number; latency: number } | null {
    const diagram = building.getDiagram(diagramId);
    if (!diagram) return null;

    // diagram.findPrecedenceById returns Precedence | null
    const precedence = diagram.findPrecedenceById(precedenceId);
    if (!precedence) return null;

    // Resolve networkId via the source stage so we can snapshot the right lines
    const networkId = diagram.networkOfStage(precedence.source)?.id ?? null;
    const lines = networkId ? building.lineStore.getByNetwork(networkId) : [];

    const propagation = lines.length > 0 ? new DiagramPropagationService(this.db) : null;
    const snapshotCtx = propagation && networkId ? propagation.snapshot(building, networkId) : null;

    // Precedence setters auto-insert ChangeType.Reposition into the ChangeSet,
    // so applyDiagramChanges → BFS runs automatically after applyAndPersist.
    if (fields.opening !== undefined) precedence.opening = fields.opening;
    if (fields.latency !== undefined) precedence.latency = fields.latency;

    this.repo.updatePrecedence(precedenceId, fields);

    if (propagation && snapshotCtx) {
      propagation.applyAndPersist(building, snapshotCtx);
    } else if (fields.opening !== undefined || fields.latency !== undefined) {
      // No lines to propagate, but still drain the ChangeSet to keep it clean
      building.applyDiagramChanges();
    }

    return {
      id: precedence.id,
      sourceStageId: precedence.source,
      destinationStageId: precedence.destination,
      opening: precedence.opening,
      latency: precedence.latency,
    };
  }

  stageImpact(building: Building, diagramId: string, networkId: string, stageId: string): StageImpact | null {
    const diagram = building.getDiagram(diagramId);
    if (!diagram) return null;
    const network = diagram.getNetwork(networkId);
    if (!network) return null;
    const stage = network.findStageById(stageId);
    if (!stage) return null;

    const teamsData = building.teamStore.getByStage(stageId);
    const packageCount = teamsData.reduce((sum, teamData) => {
      const line = building.getLine(teamData.lineId);
      if (!line) return sum;
      const team = line.getTeamById(teamData.id);
      return sum + (team ? team.packages().length : 0);
    }, 0);

    return { teamCount: teamsData.length, packageCount };
  }

  deleteStage(
    building: Building, diagramId: string, networkId: string, stageId: string,
  ): { deleted: true } | { notFound: true } | { blocked: true } {
    const diagram = building.getDiagram(diagramId);
    if (!diagram) return { notFound: true };

    // Bloqueia se houver pacotes em execução ou concluídos (status >= 3)
    if (this.repo.hasActivePackagesForStage(stageId)) return { blocked: true };

    const propagation = new DiagramPropagationService(this.db);
    const snapshotCtx = propagation.snapshot(building, networkId);

    const removed = diagram.removeStageDirect(stageId);
    if (!removed) return { notFound: true };

    propagation.applyAndPersist(building, snapshotCtx);

    this.repo.deleteStage(stageId);

    return { deleted: true };
  }

  deletePrecedence(building: Building, diagramId: string, precedenceId: string): boolean {
    const diagram = building.getDiagram(diagramId);
    if (!diagram) return false;

    const removed = diagram.removePrecedence(precedenceId);
    if (!removed) return false;

    building.applyDiagramChanges();

    this.repo.deletePrecedence(precedenceId);
    return true;
  }

  deleteDiagram(building: Building, diagramId: string): boolean {
    const diagram = building.getDiagram(diagramId);
    if (!diagram) return false;

    const removed = building.removeDiagram(diagramId);
    if (!removed) return false;

    this.repo.deleteDiagram(diagramId);
    return true;
  }

  private networkToResponse(network: Network): NetworkResponse {
    return {
      id: network.id,
      name: network.name,
      stages: network.getStages().map(s => ({
        id: s.id,
        name: s.name,
        duration: s.duration,
        latency: s.latency,
      })),
    };
  }

  private toResponse(diagram: Diagram): DiagramResponse {
    const networks = diagram.networks.map(n => this.networkToResponse(n));

    const precedences = diagram.precedences.map(p => ({
      id: p.id,
      sourceStageId: p.source,
      destinationStageId: p.destination,
      opening: p.opening,
      latency: p.latency,
    }));

    return {
      id: diagram.id,
      name: diagram.name,
      networks,
      precedences,
    };
  }
}
