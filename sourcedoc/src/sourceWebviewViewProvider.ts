import * as path from 'node:path';
import * as vscode from 'vscode';
import {
	formatTime,
	SourcePasteModel,
	AIAnnotation,
	TrackerStats,
	buildExportData,        
	ExportAnnotation
} from './sourcePasteModel';

type ViewMode = 'annotations' | 'stats' | 'export';

interface WebviewRecordRow {
	id: string;
	startLine: number;
	endLine: number;
	time: string;
	tool: string;
	model: string;
	preview: string;
	hasPrompt: boolean;
	hasNotes: boolean;
	prompt?: string;
	notes?: string;
}

interface WebviewUpdateMessage {
	type: 'update';
	view: ViewMode;
	fileLabel: string;
	records: WebviewRecordRow[];
	stats?: TrackerStats;

	// 🔥 NEW
	exportData?: ExportAnnotation[];
}

function fileLabelForUri(uri: vscode.Uri): string {
	const folder = vscode.workspace.getWorkspaceFolder(uri);
	if (folder) {
		return vscode.workspace.asRelativePath(uri);
	}
	if (uri.scheme === 'untitled') {
		return 'Untitled';
	}
	return path.basename(uri.fsPath);
}

function sortAnnotations(items: readonly AIAnnotation[]): AIAnnotation[] {
	return [...items].sort((a, b) => {
		if (a.range.start.line !== b.range.start.line) {
			return a.range.start.line - b.range.start.line;
		}

		if (a.range.end.line !== b.range.end.line) {
			return a.range.end.line - b.range.end.line;
		}

		return a.recordedAt.getTime() - b.recordedAt.getTime();
	});
}

function serializeRecords(items: readonly AIAnnotation[]): WebviewRecordRow[] {
	return items.map((item) => ({
		id: item.id,

		startLine: item.range.start.line + 1,
		endLine: item.range.end.line + 1,

		startChar: item.range.start.character,
		endChar: item.range.end.character,

		time: formatTime(item.recordedAt),
		tool: item.source.tool || 'Unspecified tool',
		model: item.source.model || 'No model',
		preview: item.textPreview,
		hasPrompt: !!item.source.prompt,
		hasNotes: !!item.source.notes,
		prompt: item.source.prompt || '',
		notes: item.source.notes || '',
	}));
}

function buildHtml(nonce: string, cspSource: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>Vibe Coding Tracker</title>
	<style>
		:root {
			color-scheme: light dark;
		}
		body {
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			padding: 10px;
			margin: 0;
		}
		.header {
			margin-bottom: 10px;
		}
		.title {
			font-weight: 700;
			font-size: 1.05em;
			margin-bottom: 4px;
		}
		.file {
			opacity: 0.85;
			word-break: break-all;
		}
		.tabs {
			display: grid;
			grid-template-columns: repeat(2, 1fr);
			gap: 6px;
			margin: 10px 0 12px;
		}
		.tab {
			border: 1px solid var(--vscode-button-border, rgba(127,127,127,0.3));
			background: var(--vscode-button-secondaryBackground, rgba(127,127,127,0.12));
			color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
			padding: 6px 8px;
			border-radius: 8px;
			cursor: pointer;
			font-size: 0.95em;
		}
		.tab.active {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
		}
		.primary-btn {
			width: 100%;
			border: 1px solid var(--vscode-button-border, transparent);
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			padding: 8px 10px;
			border-radius: 8px;
			cursor: pointer;
			font-weight: 600;
			margin-bottom: 12px;
		}
		.empty {
			opacity: 0.8;
			line-height: 1.5;
			padding: 8px 2px;
		}
		ul {
			list-style: none;
			padding: 0;
			margin: 0;
		}
		li.record {
			border: 1px solid var(--vscode-widget-border, rgba(127,127,127,0.25));
			border-radius: 10px;
			padding: 10px;
			margin-bottom: 8px;
			cursor: pointer;
			background: var(--vscode-editorWidget-background, rgba(127,127,127,0.08));
		}
		li.record:hover {
			background: var(--vscode-list-hoverBackground, rgba(127,127,127,0.14));
		}
		.lines {
			font-weight: 600;
			margin-bottom: 4px;
		}
		.meta {
			font-size: 0.9em;
			opacity: 0.88;
			margin-bottom: 6px;
		}
		.tool-token,
		.model-token {
			font-weight: 600;
		}
		.token-unknown {
			color: rgba(150, 200, 255, 0.95);
		}
		/* Tool palette */
		.tool-chatgpt { color: rgba(120, 220, 170, 0.98); }
		.tool-cursor { color: rgba(150, 200, 255, 0.98); }
		.tool-copilot { color: rgba(190, 160, 255, 0.98); }
		.tool-claude { color: rgba(255, 180, 120, 0.98); }
		.tool-gemini { color: rgba(255, 220, 120, 0.98); }
		.tool-stack-overflow { color: rgba(255, 150, 120, 0.98); }
		.tool-github { color: rgba(210, 210, 220, 0.98); }
		.tool-geeksforgeeks { color: rgba(150, 235, 170, 0.98); }
		.tool-other { color: rgba(160, 160, 170, 0.98); }

		/* Model colors: same family as tool, slightly different shade */
		.model-tool-chatgpt { color: rgba(120, 220, 170, 0.78); }
		.model-tool-cursor { color: rgba(150, 200, 255, 0.78); }
		.model-tool-copilot { color: rgba(190, 160, 255, 0.78); }
		.model-tool-claude { color: rgba(255, 180, 120, 0.78); }
		.model-tool-gemini { color: rgba(255, 220, 120, 0.78); }
		.model-tool-stack-overflow { color: rgba(255, 150, 120, 0.78); }
		.model-tool-github { color: rgba(210, 210, 220, 0.78); }
		.model-tool-geeksforgeeks { color: rgba(150, 235, 170, 0.78); }
		.model-tool-other { color: rgba(160, 160, 170, 0.78); }
		.codeblock {
			margin: 6px 0 8px;
			padding: 10px 10px;
			border-radius: 10px;
			border: 1px solid rgba(127,127,127,0.25);
			background: #2d2a2e; /* Monokai Pro classic-ish */
			overflow: auto;
			max-height: 180px;
		}
		.codeblock code {
			display: block;
			white-space: pre;
			font-family: var(--vscode-editor-font-family, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace);
			font-size: 0.86em;
			line-height: 1.45;
			color: #fcfcfa; /* warm off-white */
		}
		.section {
			margin-top: 8px;
		}
		.section-label {
			font-size: 0.78em;
			letter-spacing: 0.04em;
			text-transform: uppercase;
			opacity: 0.8;
			margin-bottom: 4px;
		}
		.section-body {
			font-size: 0.86em;
			line-height: 1.45;
			opacity: 0.92;
			white-space: pre-wrap;
			word-break: break-word;
			border-left: 2px solid rgba(127,127,127,0.35);
			padding-left: 8px;
		}
		.flags {
			display: flex;
			gap: 6px;
			flex-wrap: wrap;
			margin-top: 8px;
		}
		.flag {
			font-size: 0.8em;
			padding: 2px 6px;
			border-radius: 999px;
			background: rgba(160, 110, 255, 0.18);
		}
		.actions {
			display: flex;
			gap: 6px;
			margin-top: 8px;
			flex-wrap: wrap;
		}
		.small-btn {
			border: 1px solid var(--vscode-button-border, rgba(127,127,127,0.3));
			background: transparent;
			color: var(--vscode-foreground);
			border-radius: 6px;
			padding: 4px 8px;
			cursor: pointer;
			font-size: 0.86em;
		}
		.stats {
			display: grid;
			gap: 8px;
		}
		.stat-card {
			border: 1px solid var(--vscode-widget-border, rgba(127,127,127,0.25));
			border-radius: 10px;
			padding: 10px;
			background: var(--vscode-editorWidget-background, rgba(127,127,127,0.08));
		}
		.stat-title {
			font-weight: 700;
			margin-bottom: 8px;
		}
		.stat-row {
			display: flex;
			justify-content: space-between;
			gap: 10px;
			padding: 4px 0;
		}
	</style>
</head>
<body>
	<div class="header">
		<div class="title">Vibe Coding Tracker</div>
		<div class="file" id="file">No active editor</div>
	</div>

	<button class="primary-btn" id="annotateBtn">Annotate Selected Code</button>

	<div class="tabs">
		<button class="tab" id="tab-annotations" data-view="annotations">Annotations</button>
		<button class="tab" id="tab-stats" data-view="stats">Stats</button>
		<button class="tab" id="tab-export" data-view="export">Export</button>
	</div>

	<div id="content"></div>

	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		let currentView = 'annotations';

		const fileEl = document.getElementById('file');
		const contentEl = document.getElementById('content');
		const annotateBtn = document.getElementById('annotateBtn');

		function setActiveTab(view) {
			currentView = view;
			for (const btn of document.querySelectorAll('.tab')) {
				btn.classList.toggle('active', btn.dataset.view === view);
			}
		}

		function requestView(view) {
			setActiveTab(view);
			vscode.postMessage({ type: 'setView', view });
		}

		function createEmptyState(text) {
			const div = document.createElement('div');
			div.className = 'empty';
			div.textContent = text;
			return div;
		}

		function slugifyToken(text) {
			return String(text || '')
				.trim()
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/(^-|-$)/g, '');
		}

		const KNOWN_TOOL_SLUGS = new Set([
			'chatgpt',
			'cursor',
			'copilot',
			'claude',
			'gemini',
			'stack-overflow',
			'geeksforgeeks',
			'github',
			'other',
		]);

		function createRecordItem(record) {
			const li = document.createElement('li');
			li.className = 'record';

			const lines = document.createElement('div');
			lines.className = 'lines';
			lines.textContent = 'Lines ' + record.startLine + (record.endLine !== record.startLine ? '–' + record.endLine : '');

			const meta = document.createElement('div');
			meta.className = 'meta';
			const timeSpan = document.createElement('span');
			timeSpan.textContent = record.time;

			const toolSpan = document.createElement('span');
			const toolSlug = slugifyToken(record.tool);
			toolSpan.className = 'tool-token';
			toolSpan.textContent = record.tool;
			if (KNOWN_TOOL_SLUGS.has(toolSlug)) {
				toolSpan.classList.add('tool-' + toolSlug);
			} else {
				toolSpan.classList.add('token-unknown');
			}

			const modelSpan = document.createElement('span');
			modelSpan.className = 'model-token';
			modelSpan.textContent = record.model;
			if (KNOWN_TOOL_SLUGS.has(toolSlug)) {
				modelSpan.classList.add('model-tool-' + toolSlug);
			} else {
				modelSpan.classList.add('token-unknown');
			}

			meta.appendChild(timeSpan);
			meta.appendChild(document.createTextNode(' • '));
			meta.appendChild(toolSpan);
			meta.appendChild(document.createTextNode(' • '));
			meta.appendChild(modelSpan);

			const codePre = document.createElement('pre');
			codePre.className = 'codeblock';
			const codeEl = document.createElement('code');
			codeEl.textContent = record.preview || '(No preview available)';
			codePre.appendChild(codeEl);

			li.appendChild(lines);
			li.appendChild(meta);
			li.appendChild(codePre);

			if (record.hasPrompt && record.prompt) {
				const section = document.createElement('div');
				section.className = 'section';
				const label = document.createElement('div');
				label.className = 'section-label';
				label.textContent = 'Prompt';
				const body = document.createElement('div');
				body.className = 'section-body';
				body.textContent = record.prompt;
				section.appendChild(label);
				section.appendChild(body);
				li.appendChild(section);
			}

			if (record.hasNotes && record.notes) {
				const section = document.createElement('div');
				section.className = 'section';
				const label = document.createElement('div');
				label.className = 'section-label';
				label.textContent = 'Notes';
				const body = document.createElement('div');
				body.className = 'section-body';
				body.textContent = record.notes;
				section.appendChild(label);
				section.appendChild(body);
				li.appendChild(section);
			}

			const flags = document.createElement('div');
			flags.className = 'flags';

			if (record.hasPrompt) {
				const flag = document.createElement('span');
				flag.className = 'flag';
				flag.textContent = 'Prompt saved';
				flags.appendChild(flag);
			}

			if (record.hasNotes) {
				const flag = document.createElement('span');
				flag.className = 'flag';
				flag.textContent = 'Notes saved';
				flags.appendChild(flag);
			}

			if (flags.children.length > 0) {
				li.appendChild(flags);
			}

			const actions = document.createElement('div');
			actions.className = 'actions';

			const jumpBtn = document.createElement('button');
			jumpBtn.className = 'small-btn';
			jumpBtn.textContent = 'Go to code';
			jumpBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				vscode.postMessage({
					type: 'revealRange',
					startLine: record.startLine,
					endLine: record.endLine,
					startChar: record.startChar,
					endChar: record.endChar
				});
			});
			actions.appendChild(jumpBtn);

			const editBtn = document.createElement('button');
			editBtn.className = 'small-btn';
			editBtn.textContent = 'Edit';
			editBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				vscode.postMessage({
					type: 'editAnnotation',
					annotationId: record.id
				});
			});
			actions.appendChild(editBtn);

			const deleteBtn = document.createElement('button');
			deleteBtn.className = 'small-btn';
			deleteBtn.textContent = 'Delete';
			deleteBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				vscode.postMessage({
					type: 'deleteAnnotation',
					annotationId: record.id
				});
			});
			actions.appendChild(deleteBtn);

			li.appendChild(actions);

			li.addEventListener('click', () => {
				vscode.postMessage({
					type: 'revealRange',
					startLine: record.startLine,
					endLine: record.endLine,
					startChar: record.startChar,
					endChar: record.endChar
				});
			});

			return li;
		}

		function renderRecords(records) {
			if (!records || records.length === 0) {
				contentEl.replaceChildren(createEmptyState('No AI annotations yet.'));
				return;
			}

			const ul = document.createElement('ul');
			for (const record of records) {
				ul.appendChild(createRecordItem(record));
			}
			contentEl.replaceChildren(ul);
		}

		function renderStats(stats) {
			if (!stats) {
				contentEl.replaceChildren(createEmptyState('No statistics available.'));
				return;
			}

			const wrapper = document.createElement('div');
			wrapper.className = 'stats';

			const summaryCard = document.createElement('div');
			summaryCard.className = 'stat-card';

			const summaryTitle = document.createElement('div');
			summaryTitle.className = 'stat-title';
			summaryTitle.textContent = 'Summary';

			const totalRow = document.createElement('div');
			totalRow.className = 'stat-row';
			totalRow.innerHTML = '<span>Total annotations</span><strong>' + stats.totalAnnotations + '</strong>';

			const linesRow = document.createElement('div');
			linesRow.className = 'stat-row';
			linesRow.innerHTML = '<span>Annotated lines</span><strong>' + stats.annotatedLines + '</strong>';

			const editRow = document.createElement('div');
			editRow.className = 'stat-row';
			editRow.innerHTML =
				'<span>Avg Edit Ratio</span><strong>' +
				((stats.avgEditRatio ?? 0) * 100).toFixed(1) +
				'%</strong>';

			summaryCard.appendChild(summaryTitle);
			summaryCard.appendChild(totalRow);
			summaryCard.appendChild(linesRow);
			summaryCard.appendChild(editRow);

			wrapper.appendChild(summaryCard);

			const toolsCard = document.createElement('div');
			toolsCard.className = 'stat-card';

			const toolsTitle = document.createElement('div');
			toolsTitle.className = 'stat-title';
			toolsTitle.textContent = 'Tools';

			if (stats.toolsBreakdown && stats.toolsBreakdown.length > 0) {
				for (const item of stats.toolsBreakdown) {
					const row = document.createElement('div');
					row.className = 'stat-row';
					row.innerHTML = '<span>' + item.label + '</span><strong>' + item.value + '</strong>';
					toolsCard.appendChild(row);
				}
			} else {
				const empty = document.createElement('div');
				empty.className = 'empty';
				empty.textContent = 'No tool data yet.';
				toolsCard.appendChild(empty);
			}

			toolsCard.prepend(toolsTitle);
			wrapper.appendChild(toolsCard);

			contentEl.replaceChildren(wrapper);
		}

		annotateBtn.addEventListener('click', () => {
			vscode.postMessage({ type: 'annotateSelection' });
		});

		for (const btn of document.querySelectorAll('.tab')) {
			btn.addEventListener('click', () => requestView(btn.dataset.view));
		}

		window.addEventListener('message', (event) => {
			const msg = event.data;
			if (!msg || msg.type !== 'update') {
				return;
			}

			fileEl.textContent = '';
			setActiveTab(msg.view || 'annotations');

			if (msg.view === 'stats') {
				renderStats(msg.stats);
			} else if (msg.view === 'export') {
				renderExport(msg.exportData);
			} else {
				renderRecords(msg.records || []);
			}
		});

		setActiveTab('annotations');


		function renderExport(data) {
			if (!data || data.length === 0) {
				contentEl.textContent = 'No data to export.';
				return;
			}

			const wrapper = document.createElement('div');

			const btn = document.createElement('button');
			btn.textContent = 'Download JSON';
			btn.style.padding = '8px';
			btn.style.marginBottom = '10px';

			btn.onclick = () => {
				const blob = new Blob(
					[JSON.stringify(data, null, 2)],
					{ type: 'application/json' }
				);

				const url = URL.createObjectURL(blob);

				const a = document.createElement('a');
				a.href = url;
				a.download = 'vibe-tracker-export.json';
				a.click();
			};

			wrapper.appendChild(btn);

			const preview = document.createElement('pre');
			preview.style.fontSize = '11px';
			preview.textContent = JSON.stringify(data.slice(0, 5), null, 2);

			wrapper.appendChild(preview);

			contentEl.replaceChildren(wrapper);
		}


	</script>
</body>
</html>`;
}

export class SourceWebviewViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
	private webviewView?: vscode.WebviewView;
	private currentView: ViewMode = 'annotations';
	private readonly disposables: vscode.Disposable[] = [];

	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly model: SourcePasteModel
	) {}

	dispose(): void {
		while (this.disposables.length > 0) {
			this.disposables.pop()?.dispose();
		}
	}

	resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	): void {
		this.webviewView = webviewView;

		const { webview } = webviewView;
		webview.options = {
			enableScripts: true,
			localResourceRoots: [this.extensionUri],
		};

		const nonce = String(Date.now()) + String(Math.random()).slice(2);
		webview.html = buildHtml(nonce, webview.cspSource);

		const postUpdate = (): void => {
			if (!this.webviewView) {
				return;
			}

			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				const emptyMessage: WebviewUpdateMessage = {
					type: 'update',
					view: this.currentView,
					fileLabel: 'No active editor',
					records: [],
				};
				void webview.postMessage(emptyMessage);
				return;
			}

			const uri = editor.document.uri;
			const allAnnotations = sortAnnotations(this.model.getAnnotations(uri));

			const exportData = buildExportData(allAnnotations);

			const message: WebviewUpdateMessage = {
				type: 'update',
				view: this.currentView,
				fileLabel: fileLabelForUri(uri),
				records: serializeRecords(allAnnotations),
				stats: this.model.getStats(uri),

				// 🔥 ADD THIS
				exportData
			};

			void webview.postMessage(message);
		};

		this.disposables.push(
			this.model.onDidChange(() => postUpdate()),
			vscode.window.onDidChangeActiveTextEditor(() => postUpdate()),
			webviewView.onDidChangeVisibility(() => {
				if (webviewView.visible) {
					postUpdate();
				}
			}),
			webview.onDidReceiveMessage(async (msg) => {
				if (!msg || typeof msg.type !== 'string') {
					return;
				}

				if (msg.type === 'setView') {
					if (msg.view === 'annotations' || msg.view === 'stats' || msg.view === 'export') {
						this.currentView = msg.view;
						postUpdate();
					}
					return;
				}

				if (msg.type === 'annotateSelection') {
					await vscode.commands.executeCommand('sourcedoc.annotateSelection');
					postUpdate();
					return;
				}

				if (msg.type === 'editAnnotation' && typeof msg.annotationId === 'string') {
					await vscode.commands.executeCommand('sourcedoc.annotateExisting', msg.annotationId);
					postUpdate();
					return;
				}

				if (msg.type === 'deleteAnnotation' && typeof msg.annotationId === 'string') {
					await vscode.commands.executeCommand('sourcedoc.deleteAnnotation', msg.annotationId);
					postUpdate();
					return;
				}

				if (msg.type === 'revealRange') {
					const editor = vscode.window.activeTextEditor;
					if (!editor) return;

					const start = new vscode.Position(
						msg.startLine - 1,
						msg.startChar || 0
					);

					const end = new vscode.Position(
						msg.endLine - 1,
						msg.endChar || 0
					);

					const range = new vscode.Range(start, end);

					editor.selection = new vscode.Selection(start, end);
					editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
				}
			})
		);

		webviewView.onDidDispose(() => {
			this.webviewView = undefined;
		});

		postUpdate();
	}
}