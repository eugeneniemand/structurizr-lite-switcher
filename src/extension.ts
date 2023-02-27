// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import { PowerShell, InvocationResult, InvocationError } from 'node-powershell';
import { resolve } from 'path';

const timeout = (ms: number, message: string): Promise<InvocationResult> => {
	return new Promise((resolve, reject) => {
		setTimeout(() => {
			let bf = Buffer.from(message)
			resolve({
				command: "Timeout",
				raw: "Timeout",
				hadErrors: true,
				startTime: 0,
				duration: undefined,
				stdout: undefined,
				stderr: bf
			} as InvocationResult);
		}, ms);
	});
};

export async function callInInteractiveTerminalOut(shell: PowerShell, command: string, commandTimeout?: number) {
	if (shell == undefined) throw new Error("Shell is undefined");

	try {
		let message: string = ""
		console.log(command)

		if (commandTimeout) {
			await Promise.race([
				timeout(commandTimeout, "Command Timeout"),
				shell.invoke(command)
			]).then((result: InvocationResult) => {
				message = getMessage(result, message);
			});
		} else {
			let result = await shell.invoke(command)
			message = getMessage(result, message);
		}
		return message
	} catch (error) {
		let message
		if (error instanceof Error) message = error.message
		else message = String(error)
		console.error(error)
		return message
	}

	function getMessage(result: InvocationResult, message: string) {
		if (!result.hadErrors) {
			message = result.stdout?.toString() ?? "No Output";
		} else {
			message = result.stderr?.toString() ?? "No Output - Errors Occured";
		}
		return message;
	}
}


function getPowershell() {
	return new PowerShell({
		debug: false,
		executableOptions: {
			'-ExecutionPolicy': 'Bypass',
			'-NoProfile': true,
		},
	});
}
let ps: PowerShell
// export async function callInInteractiveTerminal(
// 	command: string,
// 	shellPath?: string,
// 	name?: string,
// 	location?: vscode.TerminalLocation
// ): Promise<vscode.TerminalExitStatus> {
// 	const terminal = vscode.window.createTerminal({
// 		shellPath,
// 		name: "SLS",
// 		location: location ? location : vscode.TerminalLocation.Panel,
// 		isTransient: true,
// 		hideFromUser: true
// 	});
// 	//terminal.show();
// 	terminal.sendText(command, false);
// 	terminal.sendText("; exit");

// 	return new Promise((resolve, reject) => {
// 		const disposeToken = vscode.window.onDidCloseTerminal(
// 			async (closedTerminal) => {
// 				if (closedTerminal === terminal) {
// 					disposeToken.dispose();
// 					if (terminal.exitStatus !== undefined) {
// 						resolve(terminal.exitStatus);
// 					} else {
// 						reject("Terminal exited with undefined status");
// 					}
// 				}
// 			}
// 		);
// 	});
// }

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	let output = vscode.window.createOutputChannel("Structurizr Lite Switcher")
	let cmdletPath = context.asAbsolutePath(path.join('resources', 'Start-Strucrurizr.ps1'));
	output.appendLine("Shell Starting...")
	ps = getPowershell()
	await importCmdLets(output, cmdletPath);

	// await env.openExternal(
	// 	Uri.parse(
	// 		"https://github.com/GorvGoyl/Shortcut-Menu-Bar-VSCode-Extension#create-buttons-with-custom-commands"
	// 	)
	// );

	let pullContainer = vscode.commands.registerCommand('structurizr-lite-switcher.pullLatestImage', async (uri: vscode.Uri) => {
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			cancellable: true,
			title: 'Structurizr Lite Switcher'
		}, async (progress, disposeToken) => {
			progress.report({ message: "Pulling Image..." });
			output.appendLine("Pulling Image...")
			let result = await callInInteractiveTerminalOut(ps, `Pull-SLSLatestImage`)
			output.appendLine(result)
			output.appendLine("Pulling Image Completed")
			progress.report({ increment: 100 });
			console.log("Done")
		})
	});

	let disposable = vscode.commands.registerCommand('structurizr-lite-switcher.activate', async (uri: vscode.Uri) => {

		if (vscode.workspace.workspaceFolders !== undefined) {
			let f = uri.fsPath;
			output.appendLine(`Selected File (${f})`)
			vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				cancellable: true,
				title: 'Structurizr Lite Switcher'
			}, async (progress, disposeToken) => {

				progress.report({ message: "Stopping Container..." });
				if (!disposeToken.isCancellationRequested) {
					output.appendLine("Stopping Container...")
					let result = await callInInteractiveTerminalOut(ps, `Stop-SLSContainer`)
					output.appendLine(result)
					output.appendLine("Stopping Container Done")
				}

				progress.report({ message: "Starting Container..." });
				if (!disposeToken.isCancellationRequested) {
					output.appendLine(`Starting Container for location (${f})...`)
					let result = await callInInteractiveTerminalOut(ps, `(Get-Item ${f}).Directory.FullName | Start-SLSContainer`)
					output.appendLine(result)
					output.appendLine("Starting Container Done")

				}
				progress.report({ message: "Activation Complete", increment: 99 });
				await sleep(1000)
				progress.report({ increment: 100 });
				output.appendLine("Activation Complete")
			});
		}
	});

	context.subscriptions.push(disposable);
	context.subscriptions.push(pullContainer);
	context.subscriptions.push(ps);
}

async function importCmdLets(output: vscode.OutputChannel, cmdletPath: string) {
	output.appendLine("Extension Starting...");
	let result = await callInInteractiveTerminalOut(ps, `. ${cmdletPath}`,1000);
	let retryCount = 0
	while (result.indexOf("Timeout") > 0) {
		if (retryCount > 2) {
			let actions = [{ title: "Retry" }, { title: "Abort" }];
			let userInput = await vscode.window.showInformationMessage(`Structurizr Lite Switcher: Extension Startup Failed`, ...actions);

			if (userInput != null) {
				if (userInput == actions[0]) {
					result = await retry();
				}
				if (userInput == actions[1]) {
					throw new Error("Extention Crashed");
				}
			}
		} else {
			// output.appendLine("Extension not ready, retrying in 2 seconds...");
			// await sleep(2000)
			result = await retry()
			retryCount++
		}
	}
	output.appendLine("Extension Ready")

	async function retry() {
		output.appendLine("Retry Starting...");
		ps.dispose();
		ps = getPowershell();
		return await callInInteractiveTerminalOut(ps, `. ${cmdletPath}`, 10000);
	}
}

function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

// This method is called when your extension is deactivated
export function deactivate() { }
