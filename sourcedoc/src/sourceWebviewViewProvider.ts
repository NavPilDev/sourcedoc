import * as path from 'node:path';
import * as vscode from 'vscode';
import {
	formatTime,
	SourcePasteModel,
	SourcedPaste,
} from './sourcePasteModel';

export interface WebviewPasteRow {
	id: string;
	startLine: number;
	endLine: number;
	startCharacter: number;
	endCharacter: number;
	time: string;
	source: string;
	reason: string;
	hasAi: boolean;
	aiTool?: string;
	aiModel?: string;
	hasPrompt: boolean;
	hasNotes: boolean;
}

type ViewMode = 'pastes' | 'stats' | 'export';

export interface TrackerStats {
	totalBlocks: number;
	annotatedLines: number;
	aiBlocks: number;
	aiAnnotatedLines: number;
	sourcesBreakdown: Array<{ label: string; value: number }>;
	toolsBreakdown: Array<{ label: string; value: number }>;
}

export interface ExportRow {
	id: string;
	file: string;
	startLine: number;
	endLine: number;
	recordedAt: string;
	source: string;
	reason: string;
	tool?: string;
	model?: string;
	prompt?: string;
	notes?: string;
}

export interface WebviewUpdateMessage {
	type: 'update';
	view: ViewMode;
	fileLabel: string;
	pastes: WebviewPasteRow[];
	stats?: TrackerStats;
	exportData?: ExportRow[];
}

type WebviewActionMessage =
	| { type: 'goToBlock'; id: string }
	| { type: 'setReason'; id: string }
	| { type: 'deleteBlock'; id: string }
	| { type: 'clearAll' }
	| { type: 'setView'; view: ViewMode }
	| { type: 'editAiMetadata'; id: string }
	| { type: 'clearAiMetadata'; id: string };

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

function serializePastes(uri: vscode.Uri, model: SourcePasteModel): WebviewPasteRow[] {
	return model.getPastes(uri).map((p) => ({
		id: p.id,
		startLine: p.range.start.line + 1,
		endLine: p.range.end.line + 1,
		startCharacter: p.range.start.character + 1,
		endCharacter: p.range.end.character + 1,
		time: formatTime(p.recordedAt),
		source: p.source,
		reason: p.reason,
		hasAi: Boolean(p.ai),
		aiTool: p.ai?.tool,
		aiModel: p.ai?.model,
		hasPrompt: Boolean(p.ai?.prompt && p.ai.prompt.trim().length > 0),
		hasNotes: Boolean(p.ai?.notes && p.ai.notes.trim().length > 0),
	}));
}

function countLinesInRange(range: vscode.Range): number {
	return Math.max(1, range.end.line - range.start.line + 1);
}

function buildStats(items: readonly SourcedPaste[]): TrackerStats {
	const totalBlocks = items.length;
	const annotatedLines = items.reduce((sum, p) => sum + countLinesInRange(p.range), 0);

	const aiItems = items.filter((p) => Boolean(p.ai));
	const aiBlocks = aiItems.length;
	const aiAnnotatedLines = aiItems.reduce((sum, p) => sum + countLinesInRange(p.range), 0);

	const sourceCounts = new Map<string, number>();
	for (const p of items) {
		sourceCounts.set(p.source || 'Unknown', (sourceCounts.get(p.source || 'Unknown') ?? 0) + 1);
	}
	const sourcesBreakdown = [...sourceCounts.entries()]
		.map(([label, value]) => ({ label, value }))
		.sort((a, b) => b.value - a.value);

	const toolCounts = new Map<string, number>();
	for (const p of aiItems) {
		const label = p.ai?.tool?.trim() || 'Unspecified tool';
		toolCounts.set(label, (toolCounts.get(label) ?? 0) + 1);
	}
	const toolsBreakdown = [...toolCounts.entries()]
		.map(([label, value]) => ({ label, value }))
		.sort((a, b) => b.value - a.value);

	return {
		totalBlocks,
		annotatedLines,
		aiBlocks,
		aiAnnotatedLines,
		sourcesBreakdown,
		toolsBreakdown,
	};
}

function buildExportData(fileUri: vscode.Uri, items: readonly SourcedPaste[]): ExportRow[] {
	const file = fileUri.toString();
	return items.map((p) => ({
		id: p.id,
		file,
		startLine: p.range.start.line + 1,
		endLine: p.range.end.line + 1,
		recordedAt: p.recordedAt.toISOString(),
		source: p.source,
		reason: p.reason,
		tool: p.ai?.tool,
		model: p.ai?.model,
		prompt: p.ai?.prompt,
		notes: p.ai?.notes,
	}));
}

function buildHtml(nonce: string, cspSource: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>SourceDoc</title>
	<style>
		:root { color-scheme: light dark; }
		body {
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			padding: 10px;
			margin: 0;
		}
		.header { margin-bottom: 10px; }
		.title { font-weight: 700; font-size: 1.05em; margin-bottom: 4px; }
		.file { opacity: 0.85; word-break: break-all; }
		.toolbar { display: flex; justify-content: flex-end; margin: 10px 0 12px; }
		.tabs {
			display: grid;
			grid-template-columns: repeat(3, 1fr);
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
		.tab.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
		.empty { opacity: 0.8; line-height: 1.5; padding: 8px 2px; }
		ul { list-style: none; padding: 0; margin: 0; }
		li.record {
			position: relative;
			border: 1px solid var(--vscode-widget-border, rgba(127,127,127,0.25));
			border-radius: 10px;
			padding: 10px;
			margin-bottom: 8px;
			background: var(--vscode-editorWidget-background, rgba(127,127,127,0.08));
		}
		.lines { font-weight: 600; margin-bottom: 4px; }
		.meta { font-size: 0.9em; opacity: 0.88; margin-bottom: 6px; }
		.reason { font-size: 0.88em; opacity: 0.82; line-height: 1.4; }
		.flags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
		.flag { font-size: 0.8em; padding: 2px 6px; border-radius: 999px; background: rgba(160, 110, 255, 0.18); }
		.actions { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
		.small-btn {
			border: 1px solid var(--vscode-button-border, rgba(127,127,127,0.3));
			background: transparent;
			color: var(--vscode-foreground);
			border-radius: 6px;
			padding: 4px 8px;
			cursor: pointer;
			font-size: 0.86em;
		}
		.stats { display: grid; gap: 8px; }
		.stat-card {
			border: 1px solid var(--vscode-widget-border, rgba(127,127,127,0.25));
			border-radius: 10px;
			padding: 10px;
			background: var(--vscode-editorWidget-background, rgba(127,127,127,0.08));
		}
		.stat-title { font-weight: 700; margin-bottom: 8px; }
		.stat-row { display: flex; justify-content: space-between; gap: 10px; padding: 4px 0; }
	</style>
</head>
<body>
	<div class="header">
		<div class="title">SourceDoc</div>
		<div class="file" id="file">No active editor</div>
	</div>

	<div class="tabs">
		<button class="tab" id="tab-pastes" data-view="pastes">Pastes</button>
		<button class="tab" id="tab-stats" data-view="stats">Stats</button>
		<button class="tab" id="tab-export" data-view="export">Export</button>
	</div>

	<div class="toolbar">
		<button class="small-btn" id="clearAllButton">Clear All</button>
	</div>

	<div id="content"></div>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		let currentView = 'pastes';
		const fileEl = document.getElementById('file');
		const contentEl = document.getElementById('content');
		const clearAllButton = document.getElementById('clearAllButton');
		clearAllButton.addEventListener('click', function () {
			vscode.postMessage({ type: 'clearAll' });
		});

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

		for (const btn of document.querySelectorAll('.tab')) {
			btn.addEventListener('click', () => requestView(btn.dataset.view));
		}

		function createEmptyState(text) {
			const div = document.createElement('div');
			div.className = 'empty';
			div.textContent = text;
			return div;
		}

		function createRecordItem(p) {
			const li = document.createElement('li');
			li.className = 'record';

			const lines = document.createElement('div');
			lines.className = 'lines';
			lines.textContent = 'Lines ' + p.startLine + (p.endLine !== p.startLine ? '–' + p.endLine : '') +
				' · Cols ' + p.startCharacter + '–' + p.endCharacter;

			const meta = document.createElement('div');
			meta.className = 'meta';
			meta.textContent = p.time + ' · Source: ' + p.source + (p.hasAi ? (' · AI: ' + (p.aiTool || 'Unspecified tool')) : '');

			const reason = document.createElement('div');
			reason.className = 'reason';
			reason.textContent = 'Reason: ' + (p.reason || '(none)');

			li.appendChild(lines);
			li.appendChild(meta);
			li.appendChild(reason);

			const flags = document.createElement('div');
			flags.className = 'flags';
			if (p.hasAi) {
				const flag = document.createElement('span');
				flag.className = 'flag';
				flag.textContent = 'AI metadata';
				flags.appendChild(flag);
			}
			if (p.hasPrompt) {
				const flag = document.createElement('span');
				flag.className = 'flag';
				flag.textContent = 'Prompt saved';
				flags.appendChild(flag);
			}
			if (p.hasNotes) {
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

			const goToButton = document.createElement('button');
			goToButton.className = 'small-btn';
			goToButton.textContent = 'Go to block';
			goToButton.addEventListener('click', function (e) {
				e.stopPropagation();
				vscode.postMessage({ type: 'goToBlock', id: p.id });
			});
			actions.appendChild(goToButton);

			const setReasonButton = document.createElement('button');
			setReasonButton.className = 'small-btn';
			setReasonButton.textContent = 'Set reason';
			setReasonButton.addEventListener('click', function (e) {
				e.stopPropagation();
				vscode.postMessage({ type: 'setReason', id: p.id });
			});
			actions.appendChild(setReasonButton);

			const aiButton = document.createElement('button');
			aiButton.className = 'small-btn';
			aiButton.textContent = p.hasAi ? 'Edit AI' : 'Add AI';
			aiButton.addEventListener('click', function (e) {
				e.stopPropagation();
				vscode.postMessage({ type: 'editAiMetadata', id: p.id });
			});
			actions.appendChild(aiButton);

			const clearAiButton = document.createElement('button');
			clearAiButton.className = 'small-btn';
			clearAiButton.textContent = 'Clear AI';
			clearAiButton.disabled = !p.hasAi;
			clearAiButton.addEventListener('click', function (e) {
				e.stopPropagation();
				vscode.postMessage({ type: 'clearAiMetadata', id: p.id });
			});
			actions.appendChild(clearAiButton);

			const deleteButton = document.createElement('button');
			deleteButton.className = 'small-btn';
			deleteButton.title = 'Delete this SourceDoc code block';
			deleteButton.textContent = 'Delete block';
			deleteButton.addEventListener('click', function (e) {
				e.stopPropagation();
				vscode.postMessage({ type: 'deleteBlock', id: p.id });
			});
			actions.appendChild(deleteButton);

			li.appendChild(actions);
			return li;
		}

		function renderPastes(pastes) {
			if (!pastes || pastes.length === 0) {
				contentEl.replaceChildren(createEmptyState('Paste code in the editor to record line sourcing for this file.'));
				return;
			}
			const ul = document.createElement('ul');
			for (const p of pastes) {
				ul.appendChild(createRecordItem(p));
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
			totalRow.innerHTML = '<span>Total blocks</span><strong>' + stats.totalBlocks + '</strong>';

			const linesRow = document.createElement('div');
			linesRow.className = 'stat-row';
			linesRow.innerHTML = '<span>Tracked lines</span><strong>' + stats.annotatedLines + '</strong>';

			const aiBlocksRow = document.createElement('div');
			aiBlocksRow.className = 'stat-row';
			aiBlocksRow.innerHTML = '<span>AI blocks</span><strong>' + stats.aiBlocks + '</strong>';

			const aiLinesRow = document.createElement('div');
			aiLinesRow.className = 'stat-row';
			aiLinesRow.innerHTML = '<span>AI tracked lines</span><strong>' + stats.aiAnnotatedLines + '</strong>';

			summaryCard.appendChild(summaryTitle);
			summaryCard.appendChild(totalRow);
			summaryCard.appendChild(linesRow);
			summaryCard.appendChild(aiBlocksRow);
			summaryCard.appendChild(aiLinesRow);
			wrapper.appendChild(summaryCard);

			const sourcesCard = document.createElement('div');
			sourcesCard.className = 'stat-card';
			const sourcesTitle = document.createElement('div');
			sourcesTitle.className = 'stat-title';
			sourcesTitle.textContent = 'Sources';
			sourcesCard.appendChild(sourcesTitle);
			if (stats.sourcesBreakdown && stats.sourcesBreakdown.length > 0) {
				for (const item of stats.sourcesBreakdown) {
					const row = document.createElement('div');
					row.className = 'stat-row';
					row.innerHTML = '<span>' + item.label + '</span><strong>' + item.value + '</strong>';
					sourcesCard.appendChild(row);
				}
			} else {
				sourcesCard.appendChild(createEmptyState('No data yet.'));
			}
			wrapper.appendChild(sourcesCard);

			const toolsCard = document.createElement('div');
			toolsCard.className = 'stat-card';
			const toolsTitle = document.createElement('div');
			toolsTitle.className = 'stat-title';
			toolsTitle.textContent = 'AI tools';
			toolsCard.appendChild(toolsTitle);
			if (stats.toolsBreakdown && stats.toolsBreakdown.length > 0) {
				for (const item of stats.toolsBreakdown) {
					const row = document.createElement('div');
					row.className = 'stat-row';
					row.innerHTML = '<span>' + item.label + '</span><strong>' + item.value + '</strong>';
					toolsCard.appendChild(row);
				}
			} else {
				toolsCard.appendChild(createEmptyState('No AI tool data yet.'));
			}
			wrapper.appendChild(toolsCard);

			contentEl.replaceChildren(wrapper);
		}

		function renderExport(data) {
			if (!data || data.length === 0) {
				contentEl.replaceChildren(createEmptyState('No data to export.'));
				return;
			}
			const wrapper = document.createElement('div');
			const btn = document.createElement('button');
			btn.className = 'small-btn';
			btn.textContent = 'Download JSON';
			btn.style.padding = '8px';
			btn.style.marginBottom = '10px';
			btn.onclick = () => {
				const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = 'sourcedoc-export.json';
				a.click();
			};
			wrapper.appendChild(btn);

			const preview = document.createElement('pre');
			preview.style.fontSize = '11px';
			preview.textContent = JSON.stringify(data.slice(0, 5), null, 2);
			wrapper.appendChild(preview);

			contentEl.replaceChildren(wrapper);
		}

		window.addEventListener('message', function (event) {
			const msg = event.data;
			if (!msg || msg.type !== 'update') { return; }
			fileEl.textContent = msg.fileLabel || '';
			setActiveTab(msg.view || 'pastes');
			if (msg.view === 'stats') {
				renderStats(msg.stats);
			} else if (msg.view === 'export') {
				renderExport(msg.exportData);
			} else {
				renderPastes(msg.pastes || []);
			}
		});

		setActiveTab('pastes');
	</script>
</body>
</html>`;
}

export class SourceWebviewViewProvider implements vscode.WebviewViewProvider {
	private currentView: ViewMode = 'pastes';

	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly model: SourcePasteModel
	) {}

	resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	): void {
		const { webview } = webviewView;
		webview.options = {
			enableScripts: true,
			localResourceRoots: [this.extensionUri],
		};

		const nonce = String(Date.now()) + String(Math.random()).slice(2);
		webview.html = buildHtml(nonce, webview.cspSource);

		const postUpdate = (): void => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				const msg: WebviewUpdateMessage = {
					type: 'update',
					view: this.currentView,
					fileLabel: 'No active editor',
					pastes: [],
				};
				webview.postMessage(msg);
				return;
			}
			const uri = editor.document.uri;
			const pastes = this.model.getPastes(uri);
			const msg: WebviewUpdateMessage = {
				type: 'update',
				view: this.currentView,
				fileLabel: fileLabelForUri(uri),
				pastes: serializePastes(uri, this.model),
				stats: buildStats(pastes),
				exportData: buildExportData(uri, pastes),
			};
			webview.postMessage(msg);
		};

		const handleWebviewAction = async (raw: unknown): Promise<void> => {
			const msg = raw as WebviewActionMessage;
			if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
				return;
			}
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				return;
			}
			const uri = editor.document.uri;

			if (msg.type === 'setView') {
				if (msg.view === 'pastes' || msg.view === 'stats' || msg.view === 'export') {
					this.currentView = msg.view;
					postUpdate();
				}
				return;
			}

			if (msg.type === 'clearAll') {
				const confirm = 'Clear all';
				const choice = await vscode.window.showWarningMessage(
					'Clear all SourceDoc code block metadata for this file?',
					{ modal: true },
					confirm
				);
				if (choice === confirm) {
					this.model.clearPastesForUri(uri);
				}
				return;
			}
			if (typeof msg.id !== 'string' || msg.id.length === 0) {
				return;
			}
			if (msg.type === 'goToBlock') {
				const paste = this.model.getPasteById(uri, msg.id);
				if (!paste) {
					return;
				}
				const targetEditor = await vscode.window.showTextDocument(uri, { preview: false });
				targetEditor.selection = new vscode.Selection(paste.range.start, paste.range.end);
				targetEditor.revealRange(paste.range, vscode.TextEditorRevealType.InCenter);
				return;
			}

			if (msg.type === 'setReason') {
				const paste = this.model.getPasteById(uri, msg.id);
				if (!paste) {
					return;
				}
				const input = await vscode.window.showInputBox({
					title: `SourceDoc - reason for lines ${paste.range.start.line + 1}-${paste.range.end.line + 1}`,
					prompt: 'Enter a reason for this code block.',
					value: paste.reason,
					ignoreFocusOut: true,
				});
				if (input === undefined) {
					return;
				}
				this.model.updateReasonById(uri, msg.id, input.trim());
				return;
			}

			if (msg.type === 'editAiMetadata') {
				await vscode.commands.executeCommand('sourcedoc.annotateExisting', msg.id);
				return;
			}

			if (msg.type === 'clearAiMetadata') {
				await vscode.commands.executeCommand('sourcedoc.deleteAnnotation', msg.id);
				return;
			}

			if (msg.type === 'deleteBlock') {
				this.model.deletePasteById(uri, msg.id);
			}
		};

		postUpdate();

		const subs: vscode.Disposable[] = [
			this.model.onDidChange(() => postUpdate()),
			vscode.window.onDidChangeActiveTextEditor(() => postUpdate()),
			webview.onDidReceiveMessage((msg) => {
				void handleWebviewAction(msg);
			}),
			webviewView.onDidChangeVisibility(() => {
				if (webviewView.visible) {
					postUpdate();
				}
			}),
		];

		webviewView.onDidDispose(() => {
			for (const d of subs) {
				d.dispose();
			}
		});
	}
}
