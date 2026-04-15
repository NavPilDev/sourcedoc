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
	existing?: SourceMetadata,
	existingRange?: vscode.Range
): Promise<(SourceMetadata & { startLine?: number; endLine?: number }) | undefined> {
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

		panel.webview.html = getModalHtml(existing, existingRange);

		panel.webview.onDidReceiveMessage((msg) => {
			if (msg.type === 'submit') {
				resolve({
					sourceType: 'ai',
					tool: msg.tool,
					model: msg.model,
					prompt: msg.prompt,
					notes: msg.notes,
					startLine: msg.startLine,
					endLine: msg.endLine,
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
function getModalHtml(
	existing?: SourceMetadata,
	existingRange?: vscode.Range
): string {
	const startLine = existingRange ? existingRange.start.line + 1 : '';
	const endLine = existingRange ? existingRange.end.line + 1 : '';
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

		.selection-box {
			padding: 8px;
			border-radius: 6px;
			border: 1px solid #444;
			background: #2d2d2d;
			color: white;
			margin-bottom: 12px;
			font-size: 13px;
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
		<button onclick="setTool('Gemini')">Gemini</button>
		<button onclick="setTool('Stack Overflow')">StackOverflow</button>
		<button onclick="setTool('GeeksforGeeks')">GFG</button>
		<button onclick="setTool('GitHub')">GitHub</button>
		<button onclick="setTool('Other')">Other</button>
	</div>

	

	<label>Quick Select Model</label>
	<div id="modelButtons" class="quick-tools"></div>

	<label>Selected Tool</label>
	<div id="selectedTool" class="selection-box">None</div>

	<label>Quick Select Model</label>
	<div id="modelButtons" class="quick-tools"></div>

	<label>Selected Model</label>
	<div id="selectedModel" class="selection-box">None</div>

	<label>Prompt</label>
	<textarea id="prompt" placeholder="Paste prompt (optional)...">${prompt}</textarea>

	<label>Notes</label>
	<textarea id="notes" placeholder="Any notes...">${notes}</textarea>

	<div class="row">
		<div>
			<label>Start Line</label>
			<input id="startLine" type="number" min="1" value="${startLine}" />
		</div>
		<div>
			<label>End Line</label>
			<input id="endLine" type="number" min="1" value="${endLine}" />
		</div>
	</div>

	<div class="actions">
		<button class="cancel" onclick="cancel()">Cancel</button>
		<button class="save" onclick="submit()">Save</button>
	</div>

	<script>
	const vscode = acquireVsCodeApi();

	// =========================
	// MODEL MAP
	// =========================
	const MODEL_MAP = {
		"ChatGPT": ["GPT-4o", "GPT-4.1", "GPT-5", "o3", "o4-mini", "Other"],
		"Claude": ["Claude 3 Haiku", "Claude 3 Sonnet", "Claude 3.5 Sonnet", "Claude 3.7 Sonnet", "Other"],
		"Gemini": ["Gemini 1.0 Pro", "Gemini 1.5 Pro", "Gemini 1.5 Flash", "Gemini Ultra", "Other"],
		"Copilot": ["Copilot GPT-4", "Copilot GPT-4o", "Copilot Workspace", "Copilot Chat", "Other"],
		"Stack Overflow": ["Human Answer", "Community Answer", "Accepted Answer", "AI-generated Answer", "Other"],
		"GeeksforGeeks": [],
		"GitHub": [],
		"Other": []
	};

	// =========================
	// RENDER MODEL BUTTONS
	// =========================
	function renderModelButtons(tool) {
		const container = document.getElementById("modelButtons");
		if (!container) return;

		container.innerHTML = "";

		const models = MODEL_MAP[tool] || [];

		models.forEach(m => {
			const btn = document.createElement("button");
			btn.type = "button"; 
			btn.textContent = m;

			btn.onclick = () => setModel(m);

			container.appendChild(btn);
		});
	}

	// =========================
	// SET TOOL
	// =========================
	function setTool(t) {
		const toolBox = document.getElementById('selectedTool');
		if (toolBox) toolBox.textContent = t;

		renderModelButtons(t);

		// reset model when tool changes
		const modelBox = document.getElementById('selectedModel');
		if (modelBox) modelBox.textContent = "None";
	}

	// =========================
	// SET MODEL
	// =========================
	function setModel(m) {
	const modelBox = document.getElementById('selectedModel');
		if (modelBox) modelBox.textContent = m;
	}

	// =========================
	// INIT ON LOAD
	// =========================
	window.addEventListener('DOMContentLoaded', () => {
		const initialTool = "${tool}" || "ChatGPT";

		const toolBox = document.getElementById('selectedTool');
		if (toolBox) toolBox.textContent = initialTool;

		renderModelButtons(initialTool);
	});

	// =========================
	// SUBMIT
	// =========================
	function submit() {
		const startLineEl = document.getElementById('startLine');
		const endLineEl = document.getElementById('endLine');

		const startLine = startLineEl ? Number(startLineEl.value) : undefined;
		const endLine = endLineEl ? Number(endLineEl.value) : undefined;

		vscode.postMessage({
			type: 'submit',
			tool: document.getElementById('selectedTool').textContent,
			model: document.getElementById('selectedModel').textContent,
			prompt: document.getElementById('prompt').value,
			notes: document.getElementById('notes').value,
			startLine,
			endLine
		});
	}

	// =========================
	// CANCEL
	// =========================
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

			markers.refreshEditor(editor);
			
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
	vscode.commands.registerCommand('sourcedoc.annotateExisting', async (annotationId?: string) => {
		if (!annotationId) return;

		const annotation = model.getAnnotationById(annotationId);
		if (!annotation) return;

		const result = await openAnnotationModal(annotation.source, annotation.range);
		if (!result) return;

		// 1. Update metadata (tool, model, etc.)
		model.updateAnnotation(annotationId, result);

		// 2. If user provided manual range → apply it
		if (result.startLine !== undefined && result.endLine !== undefined) {
			model.updateAnnotationRange(
				annotationId,
				result.startLine - 1, // convert to 0-based
				result.endLine - 1
			);
		}
	});

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