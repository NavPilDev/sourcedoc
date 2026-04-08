import * as vscode from 'vscode';
import { SourcePasteModel } from './sourcePasteModel';
import { SourceMarkers } from './sourceMarkers';
import { SourceWebviewViewProvider } from './sourceWebviewViewProvider';
import { openAiAnnotationModal } from './ui/aiAnnotationModal';

function overlaps(a: vscode.Range, b: vscode.Range): boolean {
	return a.intersection(b) !== undefined;
}

function describePaste(p: { range: vscode.Range; source: string }): string {
	const start = p.range.start.line + 1;
	const end = p.range.end.line + 1;
	const lines = start === end ? `Line ${start}` : `Lines ${start}–${end}`;
	return `${lines} • ${p.source}`;
}

export function activate(context: vscode.ExtensionContext): void {
	const model = new SourcePasteModel();
	context.subscriptions.push(model);
	void model.loadPersistedData();

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

	context.subscriptions.push(
		vscode.commands.registerCommand('sourcedoc.annotateSelection', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				return;
			}
			const selection = editor.selection;
			if (selection.isEmpty) {
				vscode.window.showWarningMessage('Select code first.');
				return;
			}
			const uri = editor.document.uri;
			const candidates = model.getPastes(uri).filter((p) => overlaps(p.range, selection));
			if (candidates.length === 0) {
				vscode.window.showWarningMessage('No tracked paste block overlaps your selection.');
				return;
			}
			let target = candidates[0];
			if (candidates.length > 1) {
				const picked = await vscode.window.showQuickPick(
					candidates.map((p) => ({ label: describePaste(p), id: p.id })),
					{ title: 'Choose a paste block to annotate', ignoreFocusOut: true }
				);
				if (!picked) {
					return;
				}
				const found = candidates.find((p) => p.id === picked.id);
				if (!found) {
					return;
				}
				target = found;
			}

			const ai = await openAiAnnotationModal(target.ai);
			if (!ai) {
				return;
			}
			model.updateAiMetadataById(uri, target.id, ai);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('sourcedoc.annotateExisting', async (pasteId?: string) => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || !pasteId) {
				return;
			}
			const uri = editor.document.uri;
			const paste = model.getPasteById(uri, pasteId);
			if (!paste) {
				return;
			}
			const ai = await openAiAnnotationModal(paste.ai);
			if (!ai) {
				return;
			}
			model.updateAiMetadataById(uri, pasteId, ai);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('sourcedoc.deleteAnnotation', async (pasteId?: string) => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || !pasteId) {
				return;
			}
			model.clearAiMetadataById(editor.document.uri, pasteId);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('sourcedoc.clearAnnotationsInFile', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				return;
			}
			model.clearAiMetadataForUri(editor.document.uri);
		})
	);
}

export function deactivate(): void {}
