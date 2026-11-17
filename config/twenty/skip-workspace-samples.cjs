const { readFileSync, writeFileSync } = require("node:fs");

const workspaceService = "/app/packages/twenty-server/dist/engine/core-modules/workspace/services/workspace.service.js";
const source = readFileSync(workspaceService, "utf8");

// The activation flow installs the standard schema before it inserts sample records.
const prefillCall = /^[ \t]*await this\.prefillCreatedWorkspaceRecords\(\{\s*workspaceId: workspace\.id,\s*schemaName: \(0, _getworkspaceschemanameutil\.getWorkspaceSchemaName\)\(workspace\.id\)\s*\}\);\r?\n/gm;

if ([...source.matchAll(prefillCall)].length !== 1) {
  throw new Error("Expected one Twenty workspace prefill call. Check the patch against the configured Twenty image.");
}

writeFileSync(workspaceService, source.replace(prefillCall, ""));
