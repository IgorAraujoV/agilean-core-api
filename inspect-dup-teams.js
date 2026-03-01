const fs = require('fs');
const agl = JSON.parse(fs.readFileSync('../bs-jade.agl', 'utf-8'));

let totalTeams = 0;
let totalPkgs = 0;
let dupTeams = 0;
let dupPkgs = 0;

for (const line of agl.lines || []) {
  const placeId = line.placeId;
  const seen = new Map(); // internalId -> first team

  for (const team of line.teams || []) {
    totalTeams++;
    const stageId = team.stageNetworkId;
    const index = team.index || 0;
    const internalId = placeId + stageId + index;
    const pkgCount = (team.packages || []).filter(p => !p.parentId).length;
    totalPkgs += pkgCount;

    if (seen.has(internalId)) {
      dupTeams++;
      dupPkgs += pkgCount;
      if (dupTeams <= 5) {
        const first = seen.get(internalId);
        console.log(`Duplicate team internalId in line ${line.id}:`);
        console.log(`  First team: ${first.teamId} (stageNetworkId=${first.stageId}, index=${first.index}, pkgs=${first.pkgCount})`);
        console.log(`  Dup team:   ${team.id} (stageNetworkId=${stageId}, index=${index}, pkgs=${pkgCount})`);
      }
    } else {
      seen.set(internalId, { teamId: team.id, stageId, index, pkgCount });
    }
  }
}

console.log('\ntotalTeams:', totalTeams);
console.log('totalPkgs (root):', totalPkgs);
console.log('dupTeams:', dupTeams);
console.log('dupPkgs:', dupPkgs);
console.log('Expected pkgs after dedup:', totalPkgs - dupPkgs);
