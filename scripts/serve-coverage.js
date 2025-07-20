#!/usr/bin/env node

const http = require("http");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const PORT = 8080;
const COVERAGE_DIR = "./coverage";

function ensureCoverageExists() {
  if (!fs.existsSync(COVERAGE_DIR)) {
    console.log("Coverage directory not found. Generating coverage...");
    try {
      execSync("npm run test:coverage", { stdio: "inherit" });
    } catch (error) {
      console.error(
        'Failed to generate coverage. Please run "npm run test:coverage" manually.'
      );
      process.exit(1);
    }
  }
}

function createServer() {
  const server = http.createServer((req, res) => {
    let filePath = path.join(
      COVERAGE_DIR,
      req.url === "/" ? "index.html" : req.url
    );

    // Security: prevent directory traversal
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(COVERAGE_DIR))) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        if (err.code === "ENOENT") {
          res.writeHead(404);
          res.end("File not found");
        } else {
          res.writeHead(500);
          res.end("Server error");
        }
        return;
      }

      const ext = path.extname(filePath);
      const contentType =
        {
          ".html": "text/html",
          ".css": "text/css",
          ".js": "application/javascript",
          ".json": "application/json",
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".gif": "image/gif",
          ".svg": "image/svg+xml",
        }[ext] || "text/plain";

      res.writeHead(200, { "Content-Type": contentType });
      res.end(data);
    });
  });

  server.listen(PORT, () => {
    console.log(`\n📊 Coverage Report Server`);
    console.log(`========================`);
    console.log(`Server running at: http://localhost:${PORT}`);
    console.log(`Coverage directory: ${path.resolve(COVERAGE_DIR)}`);
    console.log(`\nPress Ctrl+C to stop the server\n`);
  });

  return server;
}

function main() {
  ensureCoverageExists();
  const server = createServer();

  process.on("SIGINT", () => {
    console.log("\nShutting down coverage server...");
    server.close(() => {
      console.log("Server stopped.");
      process.exit(0);
    });
  });
}

if (require.main === module) {
  main();
}
