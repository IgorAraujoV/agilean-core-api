const fs = require('fs');
const agl = JSON.parse(fs.readFileSync('../bs-jade.agl', 'utf-8'));

let sample = null;
for (const line of agl.lines || []) {
  for (const team of line.teams || []) {
    for (const pkg of team.packages || []) {
      if (pkg.children && pkg.children.length > 0 && sample === null) {
        sample = {
          parent: { id: pkg.id, placeId: pkg.placeId, code: pkg.code, stageId: pkg.stageId, parentId: pkg.parentId },
          firstChild: pkg.children[0],
          childCount: pkg.children.length
        };
      }
    }
  }
}
console.log('Sample parent+child:', JSON.stringify(sample, null, 2));
