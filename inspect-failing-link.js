const fs = require('fs');
const agl = JSON.parse(fs.readFileSync('../bs-jade.agl', 'utf-8'));

const failingSource = 'b9ecee6d-232d-4193-96bf-393750cfe151';
const failingDest = '14a149f4-6fff-49f5-8b63-18370d12b829';

// Find which line/team these packages belong to
for (const line of agl.lines || []) {
  for (const team of line.teams || []) {
    for (const pkg of team.packages || []) {
      if (pkg.id === failingSource || pkg.id === failingDest) {
        console.log(`Package ${pkg.id} found in:`);
        console.log(`  line: ${line.id}, networkId: ${line.networkId}, placeId: ${line.placeId}`);
        console.log(`  team: ${team.id}, stageNetworkId: ${team.stageNetworkId}`);
        console.log(`  pkg placeId: ${pkg.placeId}`);
      }
    }
  }
}

// Check which link contains these package IDs
for (const line of agl.lines || []) {
  for (const team of line.teams || []) {
    for (const pkg of team.packages || []) {
      for (const link of pkg.links || []) {
        if (link.sourceId === failingSource || link.destinationId === failingDest) {
          console.log(`\nLink ${link.id} found in pkg ${pkg.id}:`);
          console.log(`  source: ${link.sourceId}`);
          console.log(`  dest: ${link.destinationId}`);
          console.log(`  line: ${line.id}, networkId: ${line.networkId}`);
        }
      }
    }
  }
}

// Now check: are the links only collected from root packages, or also from child packages?
// The import code only collects links from root packages (line 160-169)
// But the link's source/dest may reference packages in different lines
// Check if the SOURCE package's line was imported (has valid networkId→diagramId mapping)
const networkToDiagram = new Map();
for (const d of agl.diagrams || []) {
  for (const n of d.networks || []) {
    networkToDiagram.set(n.id, d.id);
  }
}

const placeIds = new Set();
const building = agl.company?.buildingCompanies?.[0]?.branchOffices?.[0]?.buildings?.[0];
for (const p of building?.places || []) {
  placeIds.add(p.id);
}

// Check all lines to see which would be skipped
let skippedLines = 0;
let skippedLineIds = [];
for (const line of agl.lines || []) {
  const nid = line.networkId;
  const pid = line.placeId;
  const diagId = networkToDiagram.get(nid);
  if (!diagId) {
    skippedLines++;
    skippedLineIds.push({ lineId: line.id, networkId: nid, reason: 'no diagramId' });
  } else if (!placeIds.has(pid)) {
    skippedLines++;
    skippedLineIds.push({ lineId: line.id, placeId: pid, reason: 'no place' });
  }
}
console.log('\nSkipped lines:', skippedLines, skippedLineIds);
