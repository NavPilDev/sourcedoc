import * as vscode from 'vscode';
import { SourcePasteModel, SourceMetadata } from './sourcePasteModel';
import { SourceMarkers } from './sourceMarkers';
import { SourceWebviewViewProvider } from './sourceWebviewViewProvider';

// =========================
// PASTE DETECTION
// =========================
function detectPaste(change: vscode.TextDocumentContentChangeEvent): boolean {
	const text = change.text;
	const trimmed = text.trim();

	if (!trimmed) return false;

	if (trimmed.includes('\n')) return true;
	if (trimmed.length >= 5 && change.rangeLength === 0) return true;

	return false;
}

// =========================
// MODAL POPUP UI
// =========================
async function openAnnotationModal(
	existing?: SourceMetadata
): Promise<SourceMetadata | undefined> {
	return new Promise((resolve) => {
		const panel = vscode.window.createWebviewPanel(
			'aiAnnotation',
			'AI Annotation',
			vscode.ViewColumn.Active,
			{
				enableScripts: true,
				retainContextWhenHidden: true
			}
		);

		panel.webview.html = getModalHtml(existing);

		panel.webview.onDidReceiveMessage((msg) => {
			if (msg.type === 'submit') {
				resolve({
					sourceType: 'ai',
					tool: msg.tool,
					model: msg.model,
					prompt: msg.prompt,
					notes: msg.notes,
				});
				panel.dispose();
			}

			if (msg.type === 'cancel') {
				resolve(undefined);
				panel.dispose();
			}
		});
	});
}

// =========================
// MODAL HTML
// =========================
function getModalHtml(existing?: SourceMetadata): string {
	const tool = existing?.tool || 'ChatGPT';
	const model = existing?.model || '';
	const prompt = existing?.prompt || '';
	const notes = existing?.notes || '';

	return `
	<!DOCTYPE html>
	<html>
	<head>
	<style>
		body {
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
			padding: 16px;
			background: #1e1e1e;
			color: #ddd;
		}

		h2 {
			margin-bottom: 12px;
			font-size: 18px;
		}

		label {
			font-size: 12px;
			color: #aaa;
		}

		input, textarea, select {
			width: 100%;
			margin-top: 4px;
			margin-bottom: 12px;
			padding: 6px;
			border-radius: 6px;
			border: 1px solid #444;
			background: #2d2d2d;
			color: white;
		}

		.row {
			display: flex;
			gap: 8px;
		}

		.row > div {
			flex: 1;
		}

		.actions {
			display: flex;
			justify-content: flex-end;
			gap: 8px;
		}

		button {
			padding: 6px 12px;
			border-radius: 6px;
			border: none;
			cursor: pointer;
		}

		.save {
			background: #007acc;
			color: white;
		}

		.cancel {
			background: #444;
			color: white;
		}

		.quick-tools button {
			margin-right: 6px;
			margin-bottom: 6px;
			background: #333;
			color: white;
			border-radius: 6px;
			padding: 4px 8px;
		}
	</style>
	</head>

	<body>
	<h2>AI Annotation</h2>

	<label>Quick Select Tool</label>
	<div class="quick-tools">
		<button onclick="setTool('ChatGPT')">ChatGPT</button>
		<button onclick="setTool('Copilot')">Copilot</button>
		<button onclick="setTool('Claude')">Claude</button>
		<button onclick="setTool('Stack Overflow')">StackOverflow</button>
	</div>

	<label>Tool</label>
	<select id="tool">
		<option>ChatGPT</option>
		<option>Copilot</option>
		<option>Claude</option>
		<option>Stack Overflow</option>
		<option>GitHub</option>
		<option>Other</option>
	</select>

	<div class="row">
		<div>
			<label>Model</label>
			<input id="model" value="${model}" />
		</div>
	</div>

	<label>Prompt</label>
	<textarea id="prompt" placeholder="Paste prompt (optional)...">${prompt}</textarea>

	<label>Notes</label>
	<textarea id="notes" placeholder="Any notes...">${notes}</textarea>

	<div class="actions">
		<button class="cancel" onclick="cancel()">Cancel</button>
		<button class="save" onclick="submit()">Save</button>
	</div>

	<script>
		const vscode = acquireVsCodeApi();

		document.getElementById('tool').value = "${tool}";

		function setTool(t) {
			document.getElementById('tool').value = t;
		}

		function submit() {
			vscode.postMessage({
				type: 'submit',
				tool: document.getElementById('tool').value,
				model: document.getElementById('model').value,
				prompt: document.getElementById('prompt').value,
				notes: document.getElementById('notes').value
			});
		}

		function cancel() {
			vscode.postMessage({ type: 'cancel' });
		}
	</script>

	</body>
	</html>
	`;
}

// =========================
// SELECTION CHECK
// =========================
function getNonEmptySelection(editor: vscode.TextEditor): vscode.Selection | undefined {
	const selection = editor.selection;
	if (selection.isEmpty) return undefined;
	return selection;
}

// =========================
// ACTIVATE
// =========================
export function activate(context: vscode.ExtensionContext): void {
	const model = new SourcePasteModel(context);
	context.subscriptions.push(model);

	const markers = new SourceMarkers(model);
	context.subscriptions.push(markers);

	const webviewProvider = new SourceWebviewViewProvider(context.extensionUri, model);
	context.subscriptions.push(webviewProvider);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			'sourcedoc.sourcePanel',
			webviewProvider,
			{ webviewOptions: { retainContextWhenHidden: true } }
		)
	);

	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument((event) => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || event.document !== editor.document) return;

			for (const change of event.contentChanges) {
				model.updateAnnotationsForEdit(event.document, change);
			}
		})
	);

	markers.refreshAllVisibleEditors();

	// =========================
	// AUTO POPUP ON PASTE
	// =========================
	let lastPasteTime = 0;

	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument(async (event) => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || event.document !== editor.document) return;

			for (const change of event.contentChanges) {
				if (!detectPaste(change)) continue;

				const now = Date.now();
				if (now - lastPasteTime < 1000) return;
				lastPasteTime = now;

				const start = change.range.start;
				const lines = change.text.split('\n');
				const end = new vscode.Position(
					change.range.start.line + lines.length - 1,
					lines.length === 1
						? change.range.start.character + lines[0].length
						: lines[lines.length - 1].length
				);

				const range = new vscode.Range(start, end);
				const text = change.text;

				const metadata = await openAnnotationModal();
				if (!metadata) return;

				model.addAnnotation(editor.document.uri, range, text, metadata);
			}
		})
	);

	// =========================
	// MANUAL ANNOTATE
	// =========================
	context.subscriptions.push(
		vscode.commands.registerCommand('sourcedoc.annotateSelection', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) return;

			const selection = getNonEmptySelection(editor);
			if (!selection) {
				vscode.window.showWarningMessage('Select code first.');
				return;
			}

			const text = editor.document.getText(selection);
			const metadata = await openAnnotationModal();
			if (!metadata) return;

			model.addAnnotation(editor.document.uri, selection, text, metadata);
		})
	);

	// =========================
	// EDIT ANNOTATION
	// =========================
	context.subscriptions.push(
		vscode.commands.registerCommand('sourcedoc.annotateExisting', async (annotationId?: string) => {
			if (!annotationId) return;

			const annotation = model.getAnnotationById(annotationId);
			if (!annotation) return;

			const metadata = await openAnnotationModal(annotation.source);
			if (!metadata) return;

			model.updateAnnotation(annotationId, metadata);
		})
	);

	// =========================
	// DELETE
	// =========================
	context.subscriptions.push(
		vscode.commands.registerCommand('sourcedoc.deleteAnnotation', async (annotationId?: string) => {
			if (!annotationId) return;

			model.deleteAnnotation(annotationId);
		})
	);


	


}

export function deactivate(): void {}