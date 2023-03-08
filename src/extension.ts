// DEVELOPING THIS IN RANCHER-DESKTOP WSL
// Install bash: apk add --no-cache bash
// Install npm: apk add --update nodejs npm

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import fetch from 'node-fetch'
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

const output = vscode.window.createOutputChannel("Structurizr Lite Switcher")

export async function ExecTerminal(
	command: string,
	shellPath?: string,
	name?: string,
	location?: vscode.TerminalLocation
): Promise<vscode.TerminalExitStatus> {
	const terminal = vscode.window.createTerminal({
		shellPath,
		name,
		location: location ? location : vscode.TerminalLocation.Panel,
		hideFromUser: true
	});
	//terminal.show();
	output.appendLine(`Running command: ${command}`)
	terminal.sendText(command, false);
	terminal.sendText("; exit");
	return new Promise((resolve, reject) => {
		const disposeToken = vscode.window.onDidCloseTerminal(
			async (closedTerminal) => {
				if (closedTerminal === terminal) {
					output.appendLine(`Command completed`)
					disposeToken.dispose();
					if (terminal.exitStatus && terminal.exitStatus.code) {
						resolve(terminal.exitStatus);
					} else {
						reject("Terminal exited with undefined status");
					}
				}
			}
		);
	});
}

export async function activate(context: vscode.ExtensionContext) {

	const config = vscode.workspace.getConfiguration('structurizr-lite-switcher')
	const portNumber = config.get<number>("port")
	const workspaceUri = `http://localhost:${portNumber}/workspace/diagrams`

	const openBrowser = vscode.commands.registerCommand('structurizr-lite-switcher.openBrowser', async (uri: vscode.Uri) => {
		output.appendLine(`Opening browser: ${workspaceUri}`)
		await vscode.env.openExternal(vscode.Uri.parse(workspaceUri));
	})

	const activateFolder = vscode.commands.registerCommand('structurizr-lite-switcher.activate', async (uri: vscode.Uri) => {
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			cancellable: false,
			title: 'Structurizr Lite Switcher'
		}, async (progress, disposeToken) => {
			const folderPath = path.dirname(uri.fsPath)

			progress.report({ message: "Stopping container...", increment: 10 })
			await ExecTerminal(`docker stop structurizr`)
				.then(result => { output.appendLine(`Exit code: ${result.code}`) })
				.catch(reason => output.appendLine(reason));

			progress.report({ message: "Starting container...", increment: 50 })
			await ExecTerminal(`docker run --name structurizr --rm -d -p ${portNumber}:8080 -v ${folderPath}:/usr/local/structurizr structurizr/lite`)
				.then(result => { output.appendLine(`Exit code: ${result.code}`) })
				.catch(reason => output.appendLine(reason));

			let notUp = true
			let notUpCounter = 0

			while (notUp && notUpCounter < 10) {
				const response = await fetch(workspaceUri, {
					method: 'GET'
				})
					.then((response) => {
						notUp = false
						output.appendLine(`Server running at: ${workspaceUri}`)
					})
					.catch(async reason => {
						notUpCounter += 1
						output.appendLine(`Waiting for server to start...`)
						await sleep(2500)
					});
			}
			if (notUpCounter >= 10)
				output.appendLine(`Server failed to start!`)

			progress.report({ increment: 100 })
		})
	});

	const pullContainer = vscode.commands.registerCommand('structurizr-lite-switcher.pullLatestImage', async (uri: vscode.Uri) => {
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			cancellable: true,
			title: 'Structurizr Lite Switcher'
		}, async (progress, disposeToken) => {
			progress.report({ message: "Pulling Image..." })
			await ExecTerminal("docker pull structurizr/lite")
				.then(result => { output.appendLine(`Exit code: ${result.code}`) })
				.catch(reason => output.appendLine(reason));
			progress.report({ increment: 100 })
		})
	});

	context.subscriptions.push(pullContainer);
	context.subscriptions.push(activateFolder);
	context.subscriptions.push(openBrowser);
}

function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

// This method is called when your extension is deactivated
export function deactivate() {
	output.dispose()
 }
