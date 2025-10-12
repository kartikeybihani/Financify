#!/usr/bin/env node

/**
 * Import Verification Script
 *
 * This script verifies that all import statements are now consistent
 * and reports any remaining inconsistencies.
 */

const fs = require("fs");
const path = require("path");

// Configuration
const CONFIG = {
  scanDirs: ["app", "src"],
  extensions: [".ts", ".tsx", ".js", ".jsx"],
  excludePatterns: [
    "node_modules",
    ".git",
    ".expo",
    "dist",
    "build",
    ".next",
    "coverage",
    ".DS_Store",
  ],
};

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function shouldExcludeFile(filePath) {
  return CONFIG.excludePatterns.some((pattern) => filePath.includes(pattern));
}

function hasValidExtension(filePath) {
  return CONFIG.extensions.some((ext) => filePath.endsWith(ext));
}

function getFilesToProcess(dir) {
  const files = [];

  function scanDirectory(currentDir) {
    if (shouldExcludeFile(currentDir)) return;

    const items = fs.readdirSync(currentDir);

    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        scanDirectory(fullPath);
      } else if (stat.isFile() && hasValidExtension(fullPath)) {
        files.push(fullPath);
      }
    }
  }

  scanDirectory(dir);
  return files;
}

function checkImportConsistency(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");
    const issues = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for old @/app/ imports that should be @/src/
      const oldImportMatch = line.match(
        /import.*from\s+['"`]@\/app\/_([^'"`]+)['"`]/
      );
      if (oldImportMatch) {
        issues.push({
          lineNumber: i + 1,
          line: line.trim(),
          issue: "Uses old @/app/_ pattern",
          suggestion: line.replace("@/app/_", "@/src/"),
        });
      }

      // Check for mixed patterns in the same file
      const hasAppImports = content.includes("@/app/");
      const hasSrcImports = content.includes("@/src/");

      if (
        hasAppImports &&
        hasSrcImports &&
        line.includes("import") &&
        line.includes("from")
      ) {
        issues.push({
          lineNumber: i + 1,
          line: line.trim(),
          issue: "Mixed import patterns detected",
          suggestion: "Consider standardizing to @/src/ pattern",
        });
      }
    }

    return issues;
  } catch (error) {
    return [
      {
        lineNumber: 0,
        line: "",
        issue: `Error reading file: ${error.message}`,
        suggestion: "Check file permissions",
      },
    ];
  }
}

function main() {
  log("🔍 Import Consistency Verification", "bright");
  log("==================================", "bright");
  log("");

  let totalFiles = 0;
  let filesWithIssues = 0;
  let totalIssues = 0;

  // Process each scan directory
  for (const scanDir of CONFIG.scanDirs) {
    if (!fs.existsSync(scanDir)) {
      log(`⚠️  Directory ${scanDir} does not exist, skipping...`, "yellow");
      continue;
    }

    log(`📁 Scanning directory: ${scanDir}`, "blue");

    const files = getFilesToProcess(scanDir);
    log(`   Found ${files.length} files to check`, "cyan");

    for (const file of files) {
      totalFiles++;
      const issues = checkImportConsistency(file);

      if (issues.length > 0) {
        filesWithIssues++;
        totalIssues += issues.length;

        log(`   ❌ ${path.relative(process.cwd(), file)}`, "red");
        issues.forEach((issue) => {
          log(`      Line ${issue.lineNumber}: ${issue.issue}`, "red");
          if (issue.suggestion) {
            log(`      💡 ${issue.suggestion}`, "yellow");
          }
        });
      }
    }

    log("");
  }

  // Summary
  log("📊 Verification Summary", "bright");
  log("======================", "bright");
  log(`Total files checked: ${totalFiles}`, "blue");
  log(
    `Files with issues: ${filesWithIssues}`,
    filesWithIssues > 0 ? "red" : "green"
  );
  log(`Total issues found: ${totalIssues}`, totalIssues > 0 ? "red" : "green");

  if (totalIssues === 0) {
    log("");
    log("🎉 All imports are consistent!", "green");
    log("✨ Your project is ready to go!", "green");
  } else {
    log("");
    log("⚠️  Please fix the issues above for consistency", "yellow");
    log("💡 Run: node fix-imports.cjs to fix automatically", "cyan");
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { checkImportConsistency, CONFIG };
