import type { Database } from 'better-sqlite3';
import type { Building, Line, Team, Package } from 'agilean';
import { PackageRepository } from '../database/PackageRepository';
import { StructuralRepository } from '../database/StructuralRepository';

export interface PackagePatch {
  id: string;
  startCol: number;
  endCol: number;
}

interface PackageSnapshot {
  startCol: number;
  endCol: number;
}

interface TeamSnapshot {
  lineId: string;
  stageId: string;
  direction: number;
}

/**
 * Wraps Building.applyDiagramChanges() com garantias de persistência no SQLite.
 *
 * Padrão: snapshot → mutação (externa) → applyDiagramChanges → diff → persistir
 *
 * Uso:
 *   const svc = new DiagramPropagationService(db);
 *   const ctx = svc.snapshot(building, networkId);   // 1. snapshot antes
 *   diagram.removeStageDirect(stageId);               // 2. mutação externa
 *   const patch = svc.applyAndPersist(building, ctx); // 3. apply + diff + persistir
 */
export class DiagramPropagationService {
  private packageRepo: PackageRepository;
  private structuralRepo: StructuralRepository;

  constructor(private db: Database) {
    this.packageRepo = new PackageRepository(db);
    this.structuralRepo = new StructuralRepository(db);
  }

  /**
   * Captura snapshot de TODOS os packages nas Lines da network dada.
   * DEVE ser chamado ANTES de qualquer mutação no domínio.
   */
  snapshot(building: Building, networkId: string): {
    packageSnapshot: Map<string, PackageSnapshot>;
    teamSnapshot: Map<string, TeamSnapshot>;
    networkId: string;
  } {
    const packageSnapshot = new Map<string, PackageSnapshot>();
    const teamSnapshot = new Map<string, TeamSnapshot>();

    // Building.getLinesByNetworkId() é stub (retorna []).
    // Usamos lineStore.getByNetwork() + building.getLine() para obter os objetos Line reais.
    const lineDataList = building.lineStore.getByNetwork(networkId);

    for (const lineData of lineDataList) {
      const line = building.getLine(lineData.id);
      if (!line) continue;

      for (const team of line.teams()) {
        // Pula teams órfãos (estado corrompido por operação anterior que falhou no meio)
        if (!building.teamStore.has(team.getId())) continue;

        teamSnapshot.set(team.getId(), {
          lineId: line.getId(),
          stageId: team.getStageId(),
          direction: team.getDirection() as number, // Direction is a numeric enum
        });

        for (const pkg of team.packages()) {
          packageSnapshot.set(pkg.getId(), {
            startCol: pkg.start(),
            endCol: pkg.end(),
          });
        }
      }
    }

    return { packageSnapshot, teamSnapshot, networkId };
  }

  /**
   * Chama building.applyDiagramChanges(), compara com o snapshot e persiste no SQLite.
   */
  applyAndPersist(
    building: Building,
    snapshotCtx: ReturnType<DiagramPropagationService['snapshot']>,
  ): PackagePatch[] {
    const { packageSnapshot, teamSnapshot, networkId } = snapshotCtx;

    // Aplica BFS em memória
    building.applyDiagramChanges();

    const movedPackages: PackagePatch[] = [];
    const movedPackageObjects: Package[] = [];
    const newTeams: Array<{ team: Team; lineId: string }> = [];
    const newPackagesInExistingTeams = new Map<string, Package[]>();

    const updatedLineDataList = building.lineStore.getByNetwork(networkId);

    for (const lineData of updatedLineDataList) {
      const line = building.getLine(lineData.id);
      if (!line) continue;

      for (const team of line.teams()) {
        // Pula teams que foram removidos do domínio (unregisterTeam remove do teamStore,
        // mas Line._teamsByInternalId ainda os retorna)
        if (!building.teamStore.has(team.getId())) continue;

        const isNewTeam = !teamSnapshot.has(team.getId());
        if (isNewTeam) {
          newTeams.push({ team, lineId: line.getId() });
          continue;
        }

        for (const pkg of team.packages()) {
          const pkgId = pkg.getId();
          const before = packageSnapshot.get(pkgId);

          if (!before) {
            // Pacote novo em team existente — será INSERTado, não atualizado
            if (!newPackagesInExistingTeams.has(team.getId())) {
              newPackagesInExistingTeams.set(team.getId(), []);
            }
            newPackagesInExistingTeams.get(team.getId())!.push(pkg);
            movedPackages.push({ id: pkgId, startCol: pkg.start(), endCol: pkg.end() });
            continue;
          }

          if (before.startCol !== pkg.start() || before.endCol !== pkg.end()) {
            movedPackages.push({ id: pkgId, startCol: pkg.start(), endCol: pkg.end() });
            movedPackageObjects.push(pkg);
          }
        }
      }
    }

    // Detecta packages e teams removidos via stores do domínio
    // (unregisterTeam/unregisterPackage removem dos stores, mas Line._teamsByInternalId mantém referência)
    const deletedPackageIds: string[] = [];
    for (const pkgId of packageSnapshot.keys()) {
      if (!building.packageStore.has(pkgId)) deletedPackageIds.push(pkgId);
    }

    const deletedTeamIds: string[] = [];
    for (const teamId of teamSnapshot.keys()) {
      if (!building.teamStore.has(teamId)) deletedTeamIds.push(teamId);
    }

    // Persiste numa única transação SQLite
    this.db.transaction(() => {
      // --- Deleções (links → packages → teams) ---
      if (deletedPackageIds.length > 0) {
        const ph = deletedPackageIds.map(() => '?').join(', ');
        // Links: dest_id não tem ON DELETE CASCADE, precisa deletar explicitamente
        this.db.prepare(`DELETE FROM links WHERE source_id IN (${ph}) OR dest_id IN (${ph})`)
          .run(...deletedPackageIds, ...deletedPackageIds);
        this.db.prepare(`DELETE FROM packages WHERE id IN (${ph})`)
          .run(...deletedPackageIds);
      }

      if (deletedTeamIds.length > 0) {
        const ph = deletedTeamIds.map(() => '?').join(', ');
        this.db.prepare(`DELETE FROM teams WHERE id IN (${ph})`)
          .run(...deletedTeamIds);
      }

      // --- Inserções ---
      // Insere novos teams e seus packages
      for (const { team, lineId } of newTeams) {
        this.structuralRepo.insertTeam({
          id: team.getId(),
          lineId,
          stageId: team.getStageId(),
          networkId,
          direction: team.getDirection() as number, // Direction is a numeric enum
          position: 0,
        });

        const newPackages = team.packages();
        if (newPackages.length > 0) {
          this.structuralRepo.insertPackagesBulk(
            newPackages.map((p) => ({
              id: p.getId(),
              teamId: team.getId(),
              placeId: p.getPlaceId(),
              stageId: team.getStageId(),
              startCol: p.start(),
              endCol: p.end(),
            }))
          );
        }
      }

      // Insere packages novos em teams existentes
      for (const [teamId, packages] of newPackagesInExistingTeams) {
        if (packages.length > 0) {
          // Recupera info do team para obter stageId
          const team = building.teamStore.get(teamId);
          if (team) {
            this.structuralRepo.insertPackagesBulk(
              packages.map((p) => ({
                id: p.getId(),
                teamId,
                placeId: p.getPlaceId(),
                stageId: team.stageId,
                startCol: p.start(),
                endCol: p.end(),
              }))
            );
          }
        }
      }

      // Atualiza packages que se moveram
      if (movedPackageObjects.length > 0) {
        this.packageRepo.bulkUpdate(movedPackageObjects);
      }
    })();

    return movedPackages;
  }
}
