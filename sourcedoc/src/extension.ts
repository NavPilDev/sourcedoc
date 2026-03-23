import * as vscode from 'vscode';
import { SourcePasteModel } from './sourcePasteModel';
import { SourceMarkers } from './sourceMarkers';
import { SourceWebviewViewProvider } from './sourceWebviewViewProvider';

export function activate(context: vscode.ExtensionContext): void {
	const model = new SourcePasteModel();
	context.subscriptions.push(model);

	const markers = new SourceMarkers(model);
	context.subscriptions.push(markers);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			'sourcedoc.sourcePanel',
			new SourceWebviewViewProvider(context.extensionUri, model),
			{ webviewOptions: { retainContextWhenHidden: true } }
		)
	);

	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument((e) => {
			model.handleDocumentChange(e);
		})
	);

	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			if (editor) {
				markers.refreshEditor(editor);
			}
		})
	);

	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument((doc) => {
			const editor = vscode.window.visibleTextEditors.find((ed) => ed.document.uri.toString() === doc.uri.toString());
			if (editor) {
				markers.refreshEditor(editor);
			}
		})
	);

	markers.refreshAllVisibleEditors();

	context.subscriptions.push(
		vscode.commands.registerCommand('sourcedoc.source', () => {
			vscode.window.showInformationMessage('SourceDoc: paste tracking is active; paste code to record line sourcing.');
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('sourcedoc.generate', () => {
			vscode.window.showInformationMessage('SourceDoc: documentation generation is not implemented in Version 1.');
		})
	);
}

export function deactivate(): void {}
