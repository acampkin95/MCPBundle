import * as vscode from "vscode";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import process from "node:process";

interface CliResult<T> {
  readonly status: "ok" | "error";
  readonly message?: string;
  readonly metadata?: T;
  readonly overview?: unknown;
  readonly audit?: unknown;
}

const TOOL_METADATA_COMMAND = ["tool-metadata"];
const PERMISSIONS_AUDIT_COMMAND = ["mac-permissions", "audit"];

export const activate = (context: vscode.ExtensionContext): void => {
  const output = vscode.window.createOutputChannel("IT MCP");

  context.subscriptions.push(
    vscode.commands.registerCommand("itMcp.showToolCatalog", async () => {
      try {
        const metadataList = await runCliCommand<{ id: string; description: string; requiredCapabilities: string[]; estimatedDuration?: string; recommendedPrivileges?: string; supportsStreaming?: boolean; }[]>(TOOL_METADATA_COMMAND);
        if (!metadataList || metadataList.length === 0) {
          void vscode.window.showInformationMessage("No tool metadata available.");
          return;
        }

        const selection = await vscode.window.showQuickPick(
          metadataList.map((entry) => ({
            label: entry.id,
            description: entry.description,
            detail: entry.requiredCapabilities.length
              ? `Capabilities: ${entry.requiredCapabilities.join(", ")}`
              : "Capabilities: none",
            entry,
          })),
          {
            title: "IT MCP Tool Catalog",
            placeHolder: "Select a tool to view details",
          },
        );

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
        ].filter((line): line is string => Boolean(line));

        output.appendLine(`Tool: ${entry.id}`);
        output.appendLine(detailLines.join("\n"));
        output.appendLine("\n---\n");
        output.show(true);
      } catch (error) {
        void vscode.window.showErrorMessage(`Failed to load tool metadata: ${extractMessage(error)}`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("itMcp.runMacPermissionsAudit", async () => {
      try {
        const audit = await runCliCommand<unknown>(PERMISSIONS_AUDIT_COMMAND);
        output.appendLine(`mac-permissions audit @ ${new Date().toISOString()}`);
        output.appendLine(JSON.stringify(audit, null, 2));
        output.appendLine("\n---\n");
        output.show(true);
        void vscode.window.showInformationMessage("macOS permissions audit complete. See IT MCP output.");
      } catch (error) {
        void vscode.window.showErrorMessage(`Permissions audit failed: ${extractMessage(error)}`);
      }
    }),
  );
};

export const deactivate = (): void => undefined;

const runCliCommand = async <T>(args: readonly string[]): Promise<T | undefined> => {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    throw new Error("Open the IT MCP repository workspace before running commands.");
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  const distCliPath = join(workspaceRoot, "dist", "cli", "itMcpCli.js");

  const command = existsSync(distCliPath)
    ? process.execPath
    : "npm";

  const commandArgs = existsSync(distCliPath)
    ? [distCliPath, ...args]
    : ["run", "--silent", "cli", "--", ...args];

  const stdout = await execFileAsync(command, commandArgs, { cwd: workspaceRoot, env: process.env });

  const parsed = JSON.parse(stdout) as CliResult<T>;
  if (parsed.status === "error") {
    throw new Error(parsed.message ?? "Unknown CLI error");
  }

  const payload = (parsed.metadata ?? parsed.audit ?? parsed.overview ?? parsed) as T;
  return payload;
};

const execFileAsync = (file: string, args: readonly string[], options: { cwd: string; env: NodeJS.ProcessEnv }): Promise<string> => {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
};

const extractMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};
