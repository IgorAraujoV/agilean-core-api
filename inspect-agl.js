const fs = require('fs');
const agl = JSON.parse(fs.readFileSync('../bs-jade.agl', 'utf-8'));

// Check what stageIds packages use vs what stageNetworks exist in diagrams
const stageNetworkIds = new Set();
for (const d of agl.diagrams || []) {
  for (const n of d.networks || []) {
    for (const sn of n.stageNetworks || []) {
      stageNetworkIds.add(sn.id);
    }
  }
}

const pkgStageIds = new Set();
const teamStageIds = new Set();
const pkgPlaceIds = new Set();
let pkgsWithParent = 0;
let totalPkgs = 0;

for (const line of agl.lines || []) {
  for (const team of line.teams || []) {
    teamStageIds.add(team.stageNetworkId);
    for (const pkg of team.packages || []) {
      totalPkgs++;
      if (pkg.parentId) pkgsWithParent++;
      pkgStageIds.add(pkg.stageId);
      pkgPlaceIds.add(pkg.placeId);
    }
  }
}

// Check places
const placeIds = new Set();
const building = agl.company?.buildingCompanies?.[0]?.branchOffices?.[0]?.buildings?.[0];
for (const p of building?.places || []) {
  placeIds.add(p.id);
}

console.log('stageNetworkIds in diagrams:', stageNetworkIds.size);
console.log('teamStageIds in lines:', teamStageIds.size);
console.log('pkgStageIds in packages:', pkgStageIds.size);
console.log('placeIds in building:', placeIds.size);
console.log('pkgPlaceIds in packages:', pkgPlaceIds.size);
console.log('totalPkgs:', totalPkgs);
console.log('pkgsWithParent:', pkgsWithParent);

// Find mismatches
const missingTeamStages = [...teamStageIds].filter(id => !stageNetworkIds.has(id));
const missingPkgStages = [...pkgStageIds].filter(id => !stageNetworkIds.has(id));
const missingPkgPlaces = [...pkgPlaceIds].filter(id => !placeIds.has(id));

console.log('\nmissingTeamStages (not in stageNetworks):', missingTeamStages.length, missingTeamStages.slice(0,5));
console.log('missingPkgStages (not in stageNetworks):', missingPkgStages.length, missingPkgStages.slice(0,5));
console.log('missingPkgPlaces (not in places):', missingPkgPlaces.length, missingPkgPlaces.slice(0,5));

// Check if packages have children nested
let pkgsWithChildren = 0;
for (const line of agl.lines || []) {
  for (const team of line.teams || []) {
    for (const pkg of team.packages || []) {
      if (pkg.children && pkg.children.length > 0) pkgsWithChildren++;
    }
  }
}
console.log('\npkgsWithChildren:', pkgsWithChildren);

// Check line networkIds vs diagram networkIds
const diagramNetworkIds = new Set();
for (const d of agl.diagrams || []) {
  for (const n of d.networks || []) {
    diagramNetworkIds.add(n.id);
  }
}
const lineNetworkIds = (agl.lines || []).map(l => l.networkId);
const missingLineNetworks = lineNetworkIds.filter(id => !diagramNetworkIds.has(id));
console.log('\ndiagramNetworkIds:', diagramNetworkIds.size);
console.log('missingLineNetworks:', missingLineNetworks.length, missingLineNetworks.slice(0,5));

// Check line placeIds vs building placeIds
const linePlaceIds = (agl.lines || []).map(l => l.placeId);
const missingLinePlaces = linePlaceIds.filter(id => !placeIds.has(id));
console.log('missingLinePlaces:', missingLinePlaces.length, missingLinePlaces.slice(0,5));

// Check for package stageId === '' (empty string)
let emptyStageIds = 0;
for (const line of agl.lines || []) {
  for (const team of line.teams || []) {
    for (const pkg of team.packages || []) {
      if (!pkg.stageId || pkg.stageId === '') emptyStageIds++;
    }
  }
}
console.log('\nemptyStageIds:', emptyStageIds);
