const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const modelsDir = path.join(projectRoot, "models");
const outputPath = path.join(modelsDir, "model-list.json");

function main() {
  if (!fs.existsSync(modelsDir)) {
    throw new Error(`models directory not found: ${modelsDir}`);
  }

  const files = fs
    .readdirSync(modelsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.toLowerCase().endsWith(".glb"))
    .sort((a, b) => a.localeCompare(b));

  const payload = {
    files,
  };

  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(`Generated ${outputPath}`);
  console.log(`Found ${files.length} model(s).`);
}

main();