const fs = require('fs');
const agl = JSON.parse(fs.readFileSync('../bs-jade.agl', 'utf-8'));

// Collect all root package IDs (no parentId)
const rootPkgIds = new Set();
// Collect all child package IDs
const childPkgIds = new Set();
// Collect all links from packages
const allLinks = [];

for (const line of agl.lines || []) {
  for (const team of line.teams || []) {
    for (const pkg of team.packages || []) {
      rootPkgIds.add(pkg.id);
      // Collect links from root packages
      for (const link of pkg.links || []) {
        allLinks.push(link);
      }
      // Collect children
      for (const child of pkg.children || []) {
        childPkgIds.add(child.id);
        // Collect links from child packages
        for (const link of child.links || []) {
          allLinks.push(link);
        }
      }
    }
  }
}

console.log('rootPkgIds:', rootPkgIds.size);
console.log('childPkgIds:', childPkgIds.size);
console.log('totalLinks:', allLinks.length);

// Check which link endpoints reference root vs child packages
let linkToRoot = 0;
let linkToChild = 0;
let linkToUnknown = 0;
const unknownSourceIds = new Set();
const unknownDestIds = new Set();

for (const link of allLinks) {
  const srcInRoot = rootPkgIds.has(link.sourceId);
  const srcInChild = childPkgIds.has(link.sourceId);
  const dstInRoot = rootPkgIds.has(link.destinationId);
  const dstInChild = childPkgIds.has(link.destinationId);

  if (srcInRoot && dstInRoot) linkToRoot++;
  else if (srcInChild || dstInChild) linkToChild++;
  else linkToUnknown++;

  if (!srcInRoot && !srcInChild) unknownSourceIds.add(link.sourceId);
  if (!dstInRoot && !dstInChild) unknownDestIds.add(link.destinationId);
}

console.log('\nLinks where both source+dest are root pkgs:', linkToRoot);
console.log('Links where at least one is a child pkg:', linkToChild);
console.log('Links where endpoint is unknown:', linkToUnknown);
console.log('Unknown source IDs:', unknownSourceIds.size);
console.log('Unknown dest IDs:', unknownDestIds.size);

// Check the specific failing link
const failingSource = 'b9ecee6d-232d-4193-96bf-393750cfe151';
const failingDest = '14a149f4-6fff-49f5-8b63-18370d12b829';
console.log('\nFailing link source in root?', rootPkgIds.has(failingSource));
console.log('Failing link source in child?', childPkgIds.has(failingSource));
console.log('Failing link dest in root?', rootPkgIds.has(failingDest));
console.log('Failing link dest in child?', childPkgIds.has(failingDest));
