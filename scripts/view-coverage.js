#!/usr/bin/env node

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const coverageDir = "./coverage";
const coverageHtmlFile = path.join(coverageDir, "index.html");

function runCommand(command) {
  try {
    console.log(`Running: ${command}`);
    execSync(command, { stdio: "inherit" });
  } catch (error) {
    console.error(`Error running command: ${command}`);
    process.exit(1);
  }
}

function openCoverageReport() {
  if (!fs.existsSync(coverageHtmlFile)) {
    console.log("Coverage report not found. Generating coverage first...");
    runCommand("npm run test:coverage");
  }

  if (fs.existsSync(coverageHtmlFile)) {
    console.log("Opening coverage report in browser...");
    const platform = process.platform;

    if (platform === "darwin") {
      runCommand(`open "${coverageHtmlFile}"`);
    } else if (platform === "win32") {
      runCommand(`start "${coverageHtmlFile}"`);
    } else {
      runCommand(`xdg-open "${coverageHtmlFile}"`);
    }
  } else {
    console.error("Coverage HTML file not found after generation.");
    process.exit(1);
  }
}

function showCoverageSummary() {
  console.log("\n📊 Test Coverage Summary");
  console.log("========================\n");

  const commands = [
    { name: "Fast Tests Coverage", cmd: "npm run test:coverage" },
    { name: "All Tests Coverage", cmd: "npm run test:coverage:all" },
    { name: "Coverage Report (Verbose)", cmd: "npm run coverage:report" },
    {
      name: "Coverage Report All (Verbose)",
      cmd: "npm run coverage:report:all",
    },
  ];

  commands.forEach(({ name, cmd }) => {
    console.log(`${name}:`);
    console.log(`  ${cmd}\n`);
  });

  console.log("📖 Available Coverage Commands:");
  console.log("  npm run test:coverage        - Run fast tests with coverage");
  console.log("  npm run test:coverage:all    - Run all tests with coverage");
  console.log("  npm run test:coverage:watch  - Run coverage in watch mode");
  console.log(
    "  npm run coverage:view        - Open coverage report in browser"
  );
  console.log("  npm run coverage:report      - Verbose coverage report");
  console.log(
    "  npm run coverage:report:all  - Verbose coverage report for all tests"
  );
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "open":
    case "view":
      openCoverageReport();
      break;
    case "generate":
      console.log("Generating coverage report...");
      runCommand("npm run test:coverage");
      break;
    case "generate:all":
      console.log("Generating coverage report for all tests...");
      runCommand("npm run test:coverage:all");
      break;
    case "report":
      console.log("Generating verbose coverage report...");
      runCommand("npm run coverage:report");
      break;
    case "report:all":
      console.log("Generating verbose coverage report for all tests...");
      runCommand("npm run coverage:report:all");
      break;
    case "help":
    default:
      showCoverageSummary();
      break;
  }
}

if (require.main === module) {
  main();
}
