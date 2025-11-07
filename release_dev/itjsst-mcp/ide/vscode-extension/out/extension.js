"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = __importStar(require("vscode"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_child_process_1 = require("node:child_process");
const node_process_1 = __importDefault(require("node:process"));
const TOOL_METADATA_COMMAND = ["tool-metadata"];
const PERMISSIONS_AUDIT_COMMAND = ["mac-permissions", "audit"];
const activate = (context) => {
    const output = vscode.window.createOutputChannel("IT MCP");
    context.subscriptions.push(vscode.commands.registerCommand("itMcp.showToolCatalog", async () => {
        try {
            const metadataList = await runCliCommand(TOOL_METADATA_COMMAND);
            if (!metadataList || metadataList.length === 0) {
                void vscode.window.showInformationMessage("No tool metadata available.");
                return;
            }
            const selection = await vscode.window.showQuickPick(metadataList.map((entry) => ({
                label: entry.id,
                description: entry.description,
                detail: entry.requiredCapabilities.length
                    ? `Capabilities: ${entry.requiredCapabilities.join(", ")}`
                    : "Capabilities: none",
                entry,
            })), {
                title: "IT MCP Tool Catalog",
                placeHolder: "Select a tool to view details",
            });
            if (!selection) {
                return;
            }
            const { entry } = selection;
            const detailLines = [
                `ID: ${entry.id}`,
                `Description: ${entry.description}`,
                `Required capabilities: ${entry.requiredCapabilities.length ? entry.requiredCapabilities.join(", ") : "none"}`,
                entry.estimatedDuration ? `Estimated duration: ${entry.estimatedDuration}` : undefined,
                entry.recommendedPrivileges ? `Recommended privileges: ${entry.recommendedPrivileges}` : undefined,
                entry.supportsStreaming ? "Supports streaming: yes" : undefined,
            ].filter((line) => Boolean(line));
            output.appendLine(`Tool: ${entry.id}`);
            output.appendLine(detailLines.join("\n"));
            output.appendLine("\n---\n");
            output.show(true);
        }
        catch (error) {
            void vscode.window.showErrorMessage(`Failed to load tool metadata: ${extractMessage(error)}`);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand("itMcp.runMacPermissionsAudit", async () => {
        try {
            const audit = await runCliCommand(PERMISSIONS_AUDIT_COMMAND);
            output.appendLine(`mac-permissions audit @ ${new Date().toISOString()}`);
            output.appendLine(JSON.stringify(audit, null, 2));
            output.appendLine("\n---\n");
            output.show(true);
            void vscode.window.showInformationMessage("macOS permissions audit complete. See IT MCP output.");
        }
        catch (error) {
            void vscode.window.showErrorMessage(`Permissions audit failed: ${extractMessage(error)}`);
        }
    }));
};
exports.activate = activate;
const deactivate = () => undefined;
exports.deactivate = deactivate;
const runCliCommand = async (args) => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        throw new Error("Open the IT MCP repository workspace before running commands.");
    }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const distCliPath = (0, node_path_1.join)(workspaceRoot, "dist", "cli", "itMcpCli.js");
    const command = (0, node_fs_1.existsSync)(distCliPath)
        ? node_process_1.default.execPath
        : "npm";
    const commandArgs = (0, node_fs_1.existsSync)(distCliPath)
        ? [distCliPath, ...args]
        : ["run", "--silent", "cli", "--", ...args];
    const stdout = await execFileAsync(command, commandArgs, { cwd: workspaceRoot, env: node_process_1.default.env });
    const parsed = JSON.parse(stdout);
    if (parsed.status === "error") {
        throw new Error(parsed.message ?? "Unknown CLI error");
    }
    const payload = (parsed.metadata ?? parsed.audit ?? parsed.overview ?? parsed);
    return payload;
};
const execFileAsync = (file, args, options) => {
    return new Promise((resolve, reject) => {
        (0, node_child_process_1.execFile)(file, args, options, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || error.message));
                return;
            }
            resolve(stdout.trim());
        });
    });
};
const extractMessage = (error) => {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
};
//# sourceMappingURL=extension.js.map