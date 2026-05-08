import * as fs from 'fs';

const data = JSON.parse(fs.readFileSync('./scratch/analysis_margenes.json', 'utf8'));

// find projects and their dimensions, and the tube used
let currentProject = "";
let currentDimensions = [];
const projects = [];

for (const row of data) {
  if (row["ANALISIS DE PRODUCCION"] && row["ANALISIS DE PRODUCCION"] !== "CODIGOS" && row["__EMPTY"] && typeof row["__EMPTY"] === "string" && row["__EMPTY"].includes(" X ")) {
    currentDimensions.push(row["__EMPTY"]);
  } else if (row["__EMPTY"] && typeof row["__EMPTY"] === "string" && row["__EMPTY"].includes(" X ")) {
    currentDimensions.push(row["__EMPTY"]);
  }
  
  if (row["__EMPTY"] && typeof row["__EMPTY"] === "string" && row["__EMPTY"].includes("Tube")) {
    projects.push({
      dims: [...currentDimensions],
      tube: row["__EMPTY"]
    });
    currentDimensions = []; // reset for next
  }
}

fs.writeFileSync('./scratch/tube_rules.json', JSON.stringify(projects, null, 2));
