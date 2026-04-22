import * as vscode from 'vscode';
import { SourcePasteModel, SourceMetadata } from './sourcePasteModel';
import { SourceMarkers } from './sourceMarkers';
import { SourceWebviewViewProvider } from './sourceWebviewViewProvider';
import PDFDocument from 'pdfkit';
import * as fs from 'node:fs';

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
	context: vscode.ExtensionContext,
	existing?: SourceMetadata,
	existingRange?: vscode.Range
): Promise<(SourceMetadata & { startLine?: number; endLine?: number }) | undefined> {
	return new Promise((resolve) => {
		const lightMode = context.workspaceState.get<boolean>('sourcedoc.settings.lightMode', false);

		const panel = vscode.window.createWebviewPanel(
			'aiAnnotation',
			'AI Annotation',
			vscode.ViewColumn.Active,
			{
				enableScripts: true,
				retainContextWhenHidden: true
			}
		);

		panel.webview.html = getModalHtml(existing, existingRange, lightMode);

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
	existingRange?: vscode.Range,
	lightMode?: boolean
): string {
	const startLine = existingRange ? existingRange.start.line + 1 : '';
	const endLine = existingRange ? existingRange.end.line + 1 : '';
	const tool = existing?.tool || 'ChatGPT';
	const model = existing?.model || '';
	const prompt = existing?.prompt || '';
	const notes = existing?.notes || '';

	return `
	<!DOCTYPE html>
	<html data-sd-theme="${lightMode ? 'light' : 'dark'}">
	<head>
	<style>
		:root {
			color-scheme: light dark;
			--sd-bg: #1e1e1e;
			--sd-fg: #ddd;
			--sd-muted: rgba(221, 221, 221, 0.72);
			--sd-border: #444;
			--sd-surface: #2d2d2d;
			--sd-accent: #007acc;
			--sd-accentFg: #ffffff;
		}
		html[data-sd-theme="light"] {
			color-scheme: light;
			--sd-bg: #ffffff;
			--sd-fg: #1f2328;
			--sd-muted: rgba(31, 35, 40, 0.7);
			--sd-border: rgba(31, 35, 40, 0.22);
			--sd-surface: rgba(31, 35, 40, 0.06);
			--sd-accent: #0969da;
			--sd-accentFg: #ffffff;
		}

		body {
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
			padding: 16px;
			background: var(--sd-bg);
			color: var(--sd-fg);
		}

		.header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 8px;
			margin-bottom: 12px;
		}

		h2 {
			margin: 0;
			font-size: 18px;
		}

		.icon-btn {
			border: 1px solid var(--sd-border);
			background: transparent;
			color: var(--sd-fg);
			border-radius: 8px;
			width: 32px;
			height: 32px;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			cursor: pointer;
			font-size: 18px;
			line-height: 1;
		}

		label {
			font-size: 12px;
			color: var(--sd-muted);
		}

		input, textarea, select {
			width: 100%;
			margin-top: 4px;
			margin-bottom: 12px;
			padding: 6px;
			border-radius: 6px;
			border: 1px solid var(--sd-border);
			background: var(--sd-surface);
			color: var(--sd-fg);
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
			background: var(--sd-accent);
			color: var(--sd-accentFg);
		}

		.cancel {
			background: transparent;
			color: var(--sd-fg);
			border: 1px solid var(--sd-border);
		}

		.quick-tools button {
			margin-right: 6px;
			margin-bottom: 6px;
			background: transparent;
			color: var(--sd-fg);
			border: 1px solid var(--sd-border);
			border-radius: 6px;
			padding: 4px 8px;
		}

		.quick-btn {
			border: 1px solid var(--sd-border);
		}

		.quick-btn.selected {
			background: var(--sd-accent);
			color: var(--sd-accentFg);
			border-color: var(--sd-accent);
		}

		.selection-box {
			padding: 8px;
			border-radius: 6px;
			border: 1px solid var(--sd-border);
			background: var(--sd-surface);
			color: var(--sd-fg);
			margin-bottom: 12px;
			font-size: 13px;
		}

		.selection-input[readonly] {
			opacity: 0.95;
		}

	</style>
	</head>

	<body>
	<div class="header">
		<h2>AI Annotation</h2>
		<button class="icon-btn" type="button" aria-label="Close" onclick="cancel()">×</button>
	</div>

	<label>Quick Select Tool</label>
	<div class="quick-tools">
		<button class="quick-btn tool-btn" type="button" data-tool="ChatGPT" onclick="setTool('ChatGPT')">ChatGPT</button>
		<button class="quick-btn tool-btn" type="button" data-tool="Cursor" onclick="setTool('Cursor')">Cursor</button>
		<button class="quick-btn tool-btn" type="button" data-tool="Copilot" onclick="setTool('Copilot')">Copilot</button>
		<button class="quick-btn tool-btn" type="button" data-tool="Claude" onclick="setTool('Claude')">Claude</button>
		<button class="quick-btn tool-btn" type="button" data-tool="Gemini" onclick="setTool('Gemini')">Gemini</button>
		<button class="quick-btn tool-btn" type="button" data-tool="Stack Overflow" onclick="setTool('Stack Overflow')">StackOverflow</button>
		<button class="quick-btn tool-btn" type="button" data-tool="GeeksforGeeks" onclick="setTool('GeeksforGeeks')">GFG</button>
		<button class="quick-btn tool-btn" type="button" data-tool="GitHub" onclick="setTool('GitHub')">GitHub</button>
		<button class="quick-btn tool-btn" type="button" data-tool="Other" onclick="setTool('Other')">Other</button>
	</div>

	

	<label>Quick Select Model</label>
	<div id="modelButtons" class="quick-tools"></div>

	<label>Selected Tool</label>
	<input id="selectedTool" class="selection-box selection-input" type="text" value="None" readonly />

	<label>Selected Model</label>
	<input id="selectedModel" class="selection-box selection-input" type="text" value="None" readonly />

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
		"Cursor": ["Auto", "Claude 3.5 Sonnet", "GPT-4.1/o3-mini", "Gemini 2.5 Pro", "Other"],
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
			btn.className = "quick-btn model-btn";
			btn.dataset.model = m;
			btn.textContent = m;

			btn.onclick = () => setModel(m);

			container.appendChild(btn);
		});

		// If a model is already selected (e.g. editing), reflect it in the buttons.
		const modelBox = document.getElementById('selectedModel');
		const currentModel = modelBox ? modelBox.value : '';
		if (currentModel && currentModel !== 'None') {
			for (const btn of document.querySelectorAll('.model-btn')) {
				btn.classList.toggle('selected', btn.dataset.model === currentModel);
			}
		}
	}

	// =========================
	// SET TOOL
	// =========================
	function setTool(t) {
		const toolBox = document.getElementById('selectedTool');
		if (toolBox) {
			if (t === 'Other') {
				toolBox.value = '';
				toolBox.placeholder = 'Other';
				toolBox.readOnly = false;
				toolBox.focus();
			} else {
				toolBox.value = t;
				toolBox.placeholder = '';
				toolBox.readOnly = true;
			}
		}

		for (const btn of document.querySelectorAll('.tool-btn')) {
			btn.classList.toggle('selected', btn.dataset.tool === t);
		}

		renderModelButtons(t);

		// reset model when tool changes
		const modelBox = document.getElementById('selectedModel');
		if (modelBox) {
			modelBox.value = "None";
			modelBox.placeholder = "";
			modelBox.readOnly = true;
		}

		for (const btn of document.querySelectorAll('.model-btn')) {
			btn.classList.remove('selected');
		}
	}

	// =========================
	// SET MODEL
	// =========================
	function setModel(m) {
	const modelBox = document.getElementById('selectedModel');
		if (modelBox) {
			if (m === 'Other') {
				modelBox.value = '';
				modelBox.placeholder = 'Other';
				modelBox.readOnly = false;
				modelBox.focus();
			} else {
				modelBox.value = m;
				modelBox.placeholder = '';
				modelBox.readOnly = true;
			}
		}

		for (const btn of document.querySelectorAll('.model-btn')) {
			btn.classList.toggle('selected', btn.dataset.model === m);
		}
	}

	// =========================
	// INIT ON LOAD
	// =========================
	window.addEventListener('DOMContentLoaded', () => {
		const initialTool = "${tool}" || "ChatGPT";
		const knownTools = new Set(Array.from(document.querySelectorAll('.tool-btn')).map((b) => b.dataset.tool));
		const toolIsKnown = knownTools.has(initialTool);

		if (toolIsKnown) {
			setTool(initialTool);
		} else {
			// Treat persisted custom values as "Other" so the field stays editable.
			setTool('Other');
			const toolBox = document.getElementById('selectedTool');
			if (toolBox) {
				toolBox.value = initialTool;
				toolBox.placeholder = 'Other';
				toolBox.readOnly = false;
			}
		}

		// Preselect model if editing existing annotation.
		const initialModel = "${model}" || "";
		if (initialModel) {
			// Only treat the model as "known" if it exists in the currently rendered model list.
			const knownModels = new Set(Array.from(document.querySelectorAll('.model-btn')).map((b) => b.dataset.model));
			if (knownModels.has(initialModel)) {
				setModel(initialModel);
			} else {
				setModel('Other');
				const modelBox = document.getElementById('selectedModel');
				if (modelBox) {
					modelBox.value = initialModel;
					modelBox.placeholder = 'Other';
					modelBox.readOnly = false;
				}
			}
		}
	});

	window.addEventListener('keydown', (e) => {
		if (e && e.key === 'Escape') {
			cancel();
		}
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
			tool: document.getElementById('selectedTool').value || document.getElementById('selectedTool').placeholder,
			model: document.getElementById('selectedModel').value || document.getElementById('selectedModel').placeholder,
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

	const webviewProvider = new SourceWebviewViewProvider(context.extensionUri, model, context, markers);
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

			const autoDetectEnabled = context.workspaceState.get<boolean>(
				'sourcedoc.settings.autoAnnotationDetection',
				true
			);
			if (!autoDetectEnabled) {
				return;
			}

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

				const metadata = await openAnnotationModal(context);
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
			const metadata = await openAnnotationModal(context);
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

		const result = await openAnnotationModal(context, annotation.source, annotation.range);
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

	// =========================
	// EXPORT PDF
	// =========================
	context.subscriptions.push(
		vscode.commands.registerCommand('sourcedoc.exportPdf', async (args?: unknown) => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showWarningMessage('No active editor to export.');
				return;
			}

			const exportArgs = args as
				| {
						filename?: string;
						charts?: { tools?: string; models?: string };
				  }
				| undefined;

			const uri = editor.document.uri;
			const annotations = model.getAnnotations(uri);
			const stats = model.getStats(uri);

			type ChartMode = 'bar' | 'pie' | 'donut' | 'none';
			const normalizeChartMode = (v: unknown): ChartMode | undefined => {
				return v === 'bar' || v === 'pie' || v === 'donut' || v === 'none' ? v : undefined;
			};

			const toolsChart =
				normalizeChartMode(exportArgs?.charts?.tools) ??
				context.workspaceState.get<ChartMode>('sourcedoc.export.chart.tools', 'donut');
			const modelsChart =
				normalizeChartMode(exportArgs?.charts?.models) ??
				context.workspaceState.get<ChartMode>('sourcedoc.export.chart.models', 'donut');

			const fileLabel = vscode.workspace.asRelativePath(uri);
			const computedDefaultName = (fileLabel.split(/[\\/]/).pop() || 'sourcedoc') + '.pdf';
			const requestedName =
				typeof exportArgs?.filename === 'string' && exportArgs.filename.trim()
					? exportArgs.filename.trim()
					: undefined;
			const defaultName = requestedName || computedDefaultName;

			const saveUri = await vscode.window.showSaveDialog({
				defaultUri: vscode.Uri.file(defaultName),
				filters: { PDF: ['pdf'] },
				saveLabel: 'Export PDF',
			});
			if (!saveUri) return;

			try {
				await vscode.window.withProgress(
					{ location: vscode.ProgressLocation.Notification, title: 'SourceDoc: exporting PDF…' },
					async () => {
						const doc = new PDFDocument({ size: 'LETTER', margin: 48 });
						const out = fs.createWriteStream(saveUri.fsPath);

						const completed = new Promise<void>((resolve, reject) => {
							let settled = false;
							const done = (err?: unknown) => {
								if (settled) return;
								settled = true;
								err ? reject(err) : resolve();
							};

							out.on('close', () => done());
							out.on('finish', () => done()); // fallback
							out.on('error', (e) => done(e));
							doc.on('error', (e) => done(e));
						});

						doc.pipe(out);

						doc.fontSize(18).text('SourceDoc Export');
						doc.moveDown(0.4);
						doc.fontSize(12).fillColor('#444444').text('File: ' + fileLabel);
						doc.fillColor('#000000');
						doc.moveDown(1);

						// File Stats
						doc.fontSize(14).text('File Stats');
						doc.moveDown(0.3);
						doc.fillColor('#000000');

						doc.fontSize(11).text(`Total annotations: ${stats.totalAnnotations}`);
						doc.fontSize(11).text(`Annotated lines: ${stats.annotatedLines}`);
						doc.fontSize(11).text(`Avg edit ratio: ${((stats.avgEditRatio ?? 0) * 100).toFixed(1)}%`);
						doc.moveDown(0.6);

						function palette(i: number): string {
							const colors = [
								'#78dcaa',
								'#96c8ff',
								'#bea0ff',
								'#ffb478',
								'#ffdc78',
								'#ff9678',
								'#d2d2dc',
								'#96ebaa',
								'#a0a0aa',
							];
							return colors[i % colors.length]!;
						}

						function ensureSpace(height: number): void {
							const bottom = doc.page.height - doc.page.margins.bottom;
							if (doc.y + height > bottom) {
								doc.addPage();
							}
						}

						function drawBarChart(items: Array<{ label: string; value: number }>, width = 300): number {
							const left = doc.page.margins.left;
							const rowH = 14;
							const barH = 8;
							const labelW = 110;
							const valueW = 34;
							const barW = Math.max(80, width - labelW - valueW - 16);
							const max = Math.max(...items.map((d) => d.value), 1);
							const rows = items.slice(0, 8);

							const startY = doc.y;
							for (let i = 0; i < rows.length; i++) {
								const y = startY + i * rowH;
								const item = rows[i]!;
								doc.fontSize(9).fillColor('#444444').text(String(item.label), left, y, { width: labelW, lineBreak: false });

								const bx = left + labelW + 8;
								const by = y + 2;
								doc.save();
								doc
									.rect(bx, by, barW, barH)
									.fillOpacity(0.25)
									.fill('#777777');
								doc.restore();

								const w = Math.round((item.value / max) * barW);
								doc.rect(bx, by, w, barH).fill(palette(i));

								doc.fontSize(9).fillColor('#111111').text(String(item.value), bx + barW + 8, y, { width: valueW });
							}

							doc.fillColor('#000000');
							doc.y = startY + rows.length * rowH + 6;
							doc.x = left;
							return doc.y - startY;
						}

						function arcPath(cx: number, cy: number, rOuter: number, rInner: number, a0: number, a1: number): string {
							const large = a1 - a0 > Math.PI ? 1 : 0;
							const x0 = cx + Math.cos(a0) * rOuter;
							const y0 = cy + Math.sin(a0) * rOuter;
							const x1 = cx + Math.cos(a1) * rOuter;
							const y1 = cy + Math.sin(a1) * rOuter;
							const x2 = cx + Math.cos(a1) * rInner;
							const y2 = cy + Math.sin(a1) * rInner;
							const x3 = cx + Math.cos(a0) * rInner;
							const y3 = cy + Math.sin(a0) * rInner;
							return `M ${x0} ${y0} A ${rOuter} ${rOuter} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${rInner} ${rInner} 0 ${large} 0 ${x3} ${y3} Z`;
						}

						function drawPieLike(items: Array<{ label: string; value: number }>, donut: boolean): number {
							const left = doc.page.margins.left;
							const size = 140;
							const cx = left + 70;
							const cy = doc.y + 70;
							const rOuter = 60;
							const rInner = donut ? 34 : 0.001;

							const data = items.slice(0, 8);
							const total = data.reduce((s, d) => s + d.value, 0) || 1;
							let angle = -Math.PI / 2;

							for (let idx = 0; idx < data.length; idx++) {
								const d = data[idx]!;
								const slice = (d.value / total) * Math.PI * 2;
								const a0 = angle;
								const a1 = angle + slice;
								angle = a1;

								const path = arcPath(cx, cy, rOuter, rInner, a0, a1);
								doc.path(path).fill(palette(idx));
							}

							if (donut) {
								// PDF background is white; fill center to avoid weird overlaps
								doc.circle(cx, cy, 28).fill('#ffffff');
							}

							doc.y = doc.y + size + 6;
							doc.x = left;
							return size + 6;
						}

						function renderStatsSection(
							title: string,
							mode: ChartMode,
							items: Array<{ label: string; value: number }>
						): void {
							const left = doc.page.margins.left;
							doc.x = left;
							doc.fontSize(12).fillColor('#000000').text(title);
							doc.moveDown(0.2);

							if (mode !== 'none' && items.length > 0) {
								ensureSpace(mode === 'bar' ? 130 : 160);
								if (mode === 'bar') {
									drawBarChart(items);
								} else if (mode === 'pie') {
									drawPieLike(items, false);
								} else {
									drawPieLike(items, true);
								}
							}

							doc.x = left;
							for (const row of items) {
								doc.fontSize(10).fillColor('#000000').text(`- ${row.label}: ${row.value}`);
							}
							doc.moveDown(0.4);
						}

						function renderStatsColumn(
							x: number,
							y: number,
							width: number,
							title: string,
							mode: ChartMode,
							items: Array<{ label: string; value: number }>
						): number {
							const left = doc.page.margins.left;
							const startY = y;
							const total = items.reduce((s, d) => s + (d?.value || 0), 0) || 1;

							doc.x = x;
							doc.y = startY;
							doc.fontSize(12).fillColor('#000000').text(title, x, doc.y, { width });
							doc.moveDown(0.2);

							if (mode !== 'none' && items.length > 0) {
								if (mode === 'bar') {
									const priorLeft = doc.page.margins.left;
									doc.page.margins.left = x;
									drawBarChart(items, width);
									doc.page.margins.left = priorLeft;
								} else if (mode === 'pie') {
									const priorLeft = doc.page.margins.left;
									doc.page.margins.left = x;
									drawPieLike(items, false);
									doc.page.margins.left = priorLeft;
								} else {
									const priorLeft = doc.page.margins.left;
									doc.page.margins.left = x;
									drawPieLike(items, true);
									doc.page.margins.left = priorLeft;
								}
							}

							doc.x = x;
							for (const row of items) {
								const pct = (row.value / total) * 100;
								doc.fontSize(10)
									.fillColor('#000000')
									.text(`- ${row.label}: ${row.value} (${pct.toFixed(1)}%)`, x, doc.y, { width });
							}

							doc.fillColor('#000000');
							doc.x = left;
							return doc.y;
						}

						// Tools + Models side-by-side
						ensureSpace(260);
						{
							const left = doc.page.margins.left;
							const right = doc.page.width - doc.page.margins.right;
							const gap = 18;
							const colW = (right - left - gap) / 2;
							const rowTop = doc.y;

							const toolsEndY = renderStatsColumn(left, rowTop, colW, 'Tools', toolsChart, stats.toolsBreakdown || []);
							const modelsEndY = renderStatsColumn(left + colW + gap, rowTop, colW, 'Models', modelsChart, stats.modelsBreakdown || []);

							doc.x = left;
							doc.y = Math.max(toolsEndY, modelsEndY);
							doc.moveDown(0.2);
						}

						doc.moveDown(0.6);

						// Separator between File Stats and Tracked Code Blocks
						{
							const left = doc.page.margins.left;
							const right = doc.page.width - doc.page.margins.right;
							const yLine = doc.y;
							doc.save();
							doc
								.moveTo(left, yLine)
								.lineTo(right, yLine)
								.strokeColor('rgba(0,0,0,0.15)')
								.lineWidth(1)
								.stroke();
							doc.restore();
							doc.moveDown(0.8);
						}

						// Tracked blocks
						doc.fontSize(14).text('Tracked Code Blocks');
						doc.moveDown(0.5);

						for (const [annotationIdx, a] of annotations.entries()) {
							const left = doc.page.margins.left;
							const right = doc.page.width - doc.page.margins.right;
							doc.x = left;

							// Colored tag for quick visual scanning
							const tagColor = palette(annotationIdx);
							const tagY = doc.y;
							doc.save();
							doc.rect(left, tagY, 4, 22).fill(tagColor);
							doc.restore();

							// Nudge text slightly right so it doesn't collide with tag
							doc.x = left + 8;

							const header = `${a.source.tool || 'Unspecified tool'} • ${a.source.model || 'No model'}`;
							doc.fontSize(11).fillColor('#000000').text(header);
							doc.fontSize(10).fillColor('#444444').text(
								`Lines ${a.range.start.line + 1}–${a.range.end.line + 1} • ${a.recordedAt.toISOString()}`
							);
							doc.fillColor('#000000');
							doc.moveDown(0.2);

							// Preview code block (Monokai-ish)
							const previewText = a.textPreview || '(No preview available)';
							const boxLeft = left;
							const boxWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
							const boxTop = doc.y + 4;
							const boxHeight = 58;
							doc.save();
							doc.rect(boxLeft, boxTop, boxWidth, boxHeight).fill('#2d2a2e');
							doc.restore();
							doc.fillColor('#fcfcfa').font('Courier').fontSize(9);
							doc.text(previewText, boxLeft, boxTop, { width: boxWidth, height: boxHeight });
							doc.fillColor('#000000').font('Helvetica').fontSize(11);
							doc.y = boxTop + boxHeight + 6;
							doc.x = left + 8;

							if (a.source.prompt) {
								doc.fontSize(10).fillColor('#444444').text('Prompt:');
								doc.fillColor('#000000').fontSize(10).text(a.source.prompt);
								doc.moveDown(0.2);
							}
							if (a.source.notes) {
								doc.fontSize(10).fillColor('#444444').text('Notes:');
								doc.fillColor('#000000').fontSize(10).text(a.source.notes);
								doc.moveDown(0.2);
							}

							doc.moveDown(0.8);

							// Separator between annotations
							if (annotationIdx < annotations.length - 1) {
								const yLine = doc.y;
								doc.save();
								doc
									.moveTo(left, yLine)
									.lineTo(right, yLine)
									.strokeColor('rgba(0,0,0,0.15)')
									.lineWidth(1)
									.stroke();
								doc.restore();
								doc.moveDown(0.6);
							}

							if (doc.y > doc.page.height - 120) {
								doc.addPage();
							}
						}

						doc.end();
						await completed;
					}
				);
			} catch (e) {
				const message = e instanceof Error ? e.message : String(e);
				vscode.window.showErrorMessage('SourceDoc: PDF export failed: ' + message);
				return;
			}

			vscode.window.showInformationMessage('SourceDoc: PDF exported.');
		})
	);


	


}

export function deactivate(): void {}