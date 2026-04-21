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

type ViewMode = 'annotations' | 'stats' | 'export' | 'settings';

interface WebviewSettingsState {
	autoHideMarkers: boolean;
	autoAnnotationDetection: boolean;
	lightMode: boolean;
}

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
	settings?: WebviewSettingsState;
	exportChartPrefs?: { tools: 'bar' | 'pie' | 'donut'; models: 'bar' | 'pie' | 'donut' };
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

			/* SourceDoc theme tokens (default: dark) */
			--sd-bg: var(--vscode-sideBar-background, var(--vscode-editor-background));
			--sd-fg: var(--vscode-foreground);
			--sd-muted: color-mix(in srgb, var(--sd-fg) 75%, transparent);
			--sd-border: var(--vscode-widget-border, rgba(127,127,127,0.25));
			--sd-surface: var(--vscode-editorWidget-background, rgba(127,127,127,0.08));
			--sd-surfaceHover: var(--vscode-list-hoverBackground, rgba(127,127,127,0.14));
			--sd-accent: var(--vscode-button-background);
			--sd-accentFg: var(--vscode-button-foreground);
			--sd-codeBg: rgba(127,127,127,0.12);
			--sd-codeFg: var(--sd-fg);
		}

		:root[data-sd-theme='light'] {
			color-scheme: light;
			--sd-bg: #ffffff;
			--sd-fg: #1f2328;
			--sd-muted: rgba(31, 35, 40, 0.7);
			--sd-border: rgba(31, 35, 40, 0.18);
			--sd-surface: rgba(31, 35, 40, 0.05);
			--sd-surfaceHover: rgba(31, 35, 40, 0.08);
			--sd-accent: #0969da;
			--sd-accentFg: #ffffff;
			--sd-codeBg: rgba(31, 35, 40, 0.06);
			--sd-codeFg: #1f2328;
		}

		:root[data-sd-theme='dark'] {
			color-scheme: dark;
		}

		body {
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--sd-fg);
			background: var(--sd-bg);
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
		@media (min-width: 320px) {
			.tabs {
				grid-template-columns: repeat(4, 1fr);
			}
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
			border: 1px solid var(--sd-border);
			border-radius: 10px;
			padding: 10px;
			margin-bottom: 8px;
			cursor: pointer;
			background: var(--sd-surface);
		}
		li.record:hover {
			background: var(--sd-surfaceHover);
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
			border: 1px solid var(--sd-border);
			background: var(--sd-codeBg);
			overflow: auto;
			max-height: 180px;
		}
		.codeblock code {
			display: block;
			white-space: pre;
			font-family: var(--vscode-editor-font-family, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace);
			font-size: 0.86em;
			line-height: 1.45;
			color: var(--sd-codeFg);
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
		.settings {
			display: grid;
			gap: 10px;
		}
		.setting {
			border: 1px solid var(--sd-border);
			border-radius: 10px;
			padding: 10px;
			background: var(--sd-surface);
		}
		.setting-top {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 10px;
		}
		.setting-title {
			font-weight: 700;
		}
		.setting-desc {
			opacity: 0.85;
			margin-top: 6px;
			line-height: 1.4;
			font-size: 0.9em;
		}
		.switch-col {
			display: flex;
			flex-direction: column;
			align-items: flex-end;
			gap: 4px;
			flex: 0 0 auto;
		}
		.setting-state {
			font-size: 0.78em;
			line-height: 1;
			color: var(--sd-muted);
			user-select: none;
		}
		.switch {
			position: relative;
			width: 42px;
			height: 24px;
			display: inline-block;
			flex: 0 0 auto;
		}
		.switch input {
			opacity: 0;
			width: 0;
			height: 0;
		}
		.slider {
			position: absolute;
			cursor: pointer;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			background: rgba(127,127,127,0.35);
			transition: 0.15s;
			border-radius: 999px;
			border: 1px solid rgba(127,127,127,0.25);
		}
		.slider:before {
			position: absolute;
			content: '';
			height: 18px;
			width: 18px;
			left: 2px;
			top: 2px;
			background: var(--vscode-foreground);
			transition: 0.15s;
			border-radius: 999px;
			opacity: 0.85;
		}
		input:checked + .slider {
			background: var(--vscode-button-background);
		}
		input:checked + .slider:before {
			transform: translateX(18px);
			background: var(--vscode-button-foreground);
			opacity: 1;
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
			border: 1px solid var(--sd-border);
			border-radius: 10px;
			padding: 10px;
			background: var(--sd-surface);
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
		<button class="tab" id="tab-settings" data-view="settings">Settings</button>
	</div>

	<div id="content"></div>

	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		let currentView = 'annotations';
		document.documentElement.dataset.sdTheme = 'dark';

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

			function getChartPrefs() {
				return (window.__exportChartPrefs || { tools: 'donut', models: 'donut' });
			}

			function setChartPref(target, value) {
				window.__exportChartPrefs = window.__exportChartPrefs || { tools: 'donut', models: 'donut' };
				window.__exportChartPrefs[target] = value;
				vscode.postMessage({ type: 'setExportChart', target, value });
			}

			function palette(i) {
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
				return colors[i % colors.length];
			}

			function renderBarChart(data) {
				const max = Math.max(...data.map((d) => d.value), 1);
				const rows = data.slice(0, 8).map((d, idx) => {
					const w = Math.round((d.value / max) * 180);
					return (
						'<div style="display:flex;align-items:center;gap:8px;margin:4px 0;">' +
						'<div style="flex:0 0 92px;opacity:0.85;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
						String(d.label).replace(/</g, '&lt;') +
						'</div>' +
						'<div style="flex:0 0 180px;height:10px;border-radius:999px;background:rgba(127,127,127,0.25);overflow:hidden;">' +
						'<div style="height:10px;width:' + w + 'px;background:' + palette(idx) + ';"></div>' +
						'</div>' +
						'<strong style="flex:0 0 auto;opacity:0.9;">' +
						d.value +
						'</strong>' +
						'</div>'
					);
				});
				return '<div style="margin-top:8px;">' + rows.join('') + '</div>';
			}

			function arcPath(cx, cy, rOuter, rInner, a0, a1) {
				const large = a1 - a0 > Math.PI ? 1 : 0;
				const x0 = cx + Math.cos(a0) * rOuter;
				const y0 = cy + Math.sin(a0) * rOuter;
				const x1 = cx + Math.cos(a1) * rOuter;
				const y1 = cy + Math.sin(a1) * rOuter;
				const x2 = cx + Math.cos(a1) * rInner;
				const y2 = cy + Math.sin(a1) * rInner;
				const x3 = cx + Math.cos(a0) * rInner;
				const y3 = cy + Math.sin(a0) * rInner;
				return (
					'M ' +
					x0 +
					' ' +
					y0 +
					' A ' +
					rOuter +
					' ' +
					rOuter +
					' 0 ' +
					large +
					' 1 ' +
					x1 +
					' ' +
					y1 +
					' L ' +
					x2 +
					' ' +
					y2 +
					' A ' +
					rInner +
					' ' +
					rInner +
					' 0 ' +
					large +
					' 0 ' +
					x3 +
					' ' +
					y3 +
					' Z'
				);
			}

			function renderPieLike(data, donut) {
				const total = data.reduce((s, d) => s + d.value, 0) || 1;
				let angle = -Math.PI / 2;
				const cx = 70;
				const cy = 70;
				const rOuter = 60;
				const rInner = donut ? 34 : 0.001;
				const paths = [];
				data.slice(0, 8).forEach((d, idx) => {
					const slice = (d.value / total) * Math.PI * 2;
					const a0 = angle;
					const a1 = angle + slice;
					angle = a1;
					paths.push(
						'<path d="' +
							arcPath(cx, cy, rOuter, rInner, a0, a1) +
							'" fill="' +
							palette(idx) +
							'" opacity="0.95" />'
					);
				});

				const legend = data.slice(0, 8).map((d, idx) => {
					return (
						'<div style="display:flex;align-items:center;gap:6px;margin:3px 0;">' +
						'<span style="width:10px;height:10px;border-radius:2px;background:' +
						palette(idx) +
						';display:inline-block;"></span>' +
						'<span style="opacity:0.85;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px;">' +
						String(d.label).replace(/</g, '&lt;') +
						'</span>' +
						'<strong style="opacity:0.9;margin-left:auto;">' +
						d.value +
						'</strong>' +
						'</div>'
					);
				});

				return (
					'<div style="display:flex;gap:10px;align-items:flex-start;margin-top:8px;">' +
					'<svg width="140" height="140" viewBox="0 0 140 140">' +
					paths.join('') +
					(donut ? '<circle cx="70" cy="70" r="28" fill="rgba(45,42,46,1)"></circle>' : '') +
					'</svg>' +
					'<div style="flex:1;min-width:0;">' +
					legend.join('') +
					'</div>' +
					'</div>'
				);
			}

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

			function buildBreakdownCard(titleText, items, prefTarget) {
				const card = document.createElement('div');
				card.className = 'stat-card';

				const title = document.createElement('div');
				title.className = 'stat-title';
				title.textContent = titleText;

				const top = document.createElement('div');
				top.style.display = 'flex';
				top.style.alignItems = 'center';
				top.style.justifyContent = 'space-between';
				top.style.gap = '8px';

				const select = document.createElement('select');
				select.style.maxWidth = '140px';
				select.innerHTML =
					'<option value="bar">Bar</option>' +
					'<option value="pie">Pie</option>' +
					'<option value="donut">Donut</option>';

				const prefs = getChartPrefs();
				select.value = prefs[prefTarget] || 'donut';
				select.addEventListener('change', () => {
					setChartPref(prefTarget, select.value);
				});

				top.appendChild(title);
				top.appendChild(select);

				card.appendChild(top);

				const chartContainer = document.createElement('div');
				chartContainer.style.marginTop = '6px';

				const rowsContainer = document.createElement('div');
				rowsContainer.style.marginTop = '8px';

				function refresh() {
					const mode = (getChartPrefs()[prefTarget] || 'donut');
					if (!items || items.length === 0) {
						chartContainer.innerHTML = '<div class="empty">No data yet.</div>';
						rowsContainer.innerHTML = '';
						return;
					}
					if (mode === 'bar') {
						chartContainer.innerHTML = renderBarChart(items);
					} else if (mode === 'pie') {
						chartContainer.innerHTML = renderPieLike(items, false);
					} else {
						chartContainer.innerHTML = renderPieLike(items, true);
					}

					rowsContainer.innerHTML = '';
					for (const item of items) {
						const row = document.createElement('div');
						row.className = 'stat-row';
						row.innerHTML = '<span>' + item.label + '</span><strong>' + item.value + '</strong>';
						rowsContainer.appendChild(row);
					}
				}

				refresh();
				card.appendChild(chartContainer);
				card.appendChild(rowsContainer);

				// keep in sync with updates
				select.addEventListener('change', refresh);
				return card;
			}

			wrapper.appendChild(buildBreakdownCard('Tools', stats.toolsBreakdown || [], 'tools'));
			wrapper.appendChild(buildBreakdownCard('Models', stats.modelsBreakdown || [], 'models'));

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

			// forced light/dark palette
			document.documentElement.dataset.sdTheme = msg?.settings?.lightMode ? 'light' : 'dark';

			// cache export chart prefs so Stats dropdowns render consistently
			if (msg.exportChartPrefs) {
				window.__exportChartPrefs = msg.exportChartPrefs;
			}

			fileEl.textContent = '';
			setActiveTab(msg.view || 'annotations');

			if (msg.view === 'stats') {
				renderStats(msg.stats);
			} else if (msg.view === 'export') {
				renderExport(msg.exportData);
			} else if (msg.view === 'settings') {
				renderSettings(msg.settings || {});
			} else {
				renderRecords(msg.records || []);
			}
		});

		setActiveTab('annotations');


		function renderExport(data) {
			const wrapper = document.createElement('div');

			const btn = document.createElement('button');
			btn.textContent = 'Export PDF';
			btn.style.padding = '8px';
			btn.style.marginBottom = '10px';

			btn.onclick = () => {
				vscode.postMessage({ type: 'exportPdf' });
			};

			wrapper.appendChild(btn);

			const hint = document.createElement('div');
			hint.className = 'empty';
			hint.textContent =
				'Exports a PDF for the active file, including the last-selected Tools/Models chart types from Stats.';
			wrapper.appendChild(hint);

			contentEl.replaceChildren(wrapper);
		}

		function renderSettings(settings) {
			const wrapper = document.createElement('div');
			wrapper.className = 'settings';

			const lightModeSetting = document.createElement('div');
			lightModeSetting.className = 'setting';
			lightModeSetting.innerHTML =
				'<div class="setting-top">' +
				'<div class="setting-title">Light Mode</div>' +
				'<div class="switch-col">' +
				'<label class="switch">' +
				'<input type="checkbox" id="lightMode">' +
				'<span class="slider"></span>' +
				'</label>' +
				'<div class="setting-state" id="lightModeState"></div>' +
				'</div>' +
				'</div>' +
				'<div class="setting-desc">Forces a light palette for the SourceDoc webview and the AI annotation modal (default is dark).</div>';

			const autoHide = document.createElement('div');
			autoHide.className = 'setting';
			autoHide.innerHTML =
				'<div class="setting-top">' +
				'<div class="setting-title">Auto Hide Markers</div>' +
				'<div class="switch-col">' +
				'<label class="switch">' +
				'<input type="checkbox" id="autoHideMarkers">' +
				'<span class="slider"></span>' +
				'</label>' +
				'<div class="setting-state" id="autoHideMarkersState"></div>' +
				'</div>' +
				'</div>' +
				'<div class="setting-desc">Hide editor markers by default. Markers will briefly reveal only for the selected code block when you click “Go to code”.</div>';

			const autoDetect = document.createElement('div');
			autoDetect.className = 'setting';
			autoDetect.innerHTML =
				'<div class="setting-top">' +
				'<div class="setting-title">Automatic Annotation Detection</div>' +
				'<div class="switch-col">' +
				'<label class="switch">' +
				'<input type="checkbox" id="autoAnnotationDetection">' +
				'<span class="slider"></span>' +
				'</label>' +
				'<div class="setting-state" id="autoAnnotationDetectionState"></div>' +
				'</div>' +
				'</div>' +
				'<div class="setting-desc">When off, SourceDoc won’t pop up the annotation modal automatically on paste. Use “Annotate Selected Code” to annotate manually.</div>';

			wrapper.appendChild(lightModeSetting);
			wrapper.appendChild(autoHide);
			wrapper.appendChild(autoDetect);
			contentEl.replaceChildren(wrapper);

			function setStateText(stateEl, checked, onText, offText) {
				if (!stateEl) return;
				stateEl.textContent = checked ? onText : offText;
			}

			const lightEl = document.getElementById('lightMode');
			const lightStateEl = document.getElementById('lightModeState');
			const hideEl = document.getElementById('autoHideMarkers');
			const hideStateEl = document.getElementById('autoHideMarkersState');
			const detectEl = document.getElementById('autoAnnotationDetection');
			const detectStateEl = document.getElementById('autoAnnotationDetectionState');

			if (lightEl) {
				lightEl.checked = !!settings?.lightMode;
				setStateText(lightStateEl, !!lightEl.checked, 'Light', 'Dark');
				lightEl.addEventListener('change', () => {
					setStateText(lightStateEl, !!lightEl.checked, 'Light', 'Dark');
					vscode.postMessage({ type: 'setSetting', key: 'lightMode', value: !!lightEl.checked });
				});
			}
			if (hideEl) {
				hideEl.checked = !!settings?.autoHideMarkers;
				setStateText(hideStateEl, !!hideEl.checked, 'On', 'Off');
				hideEl.addEventListener('change', () => {
					setStateText(hideStateEl, !!hideEl.checked, 'On', 'Off');
					vscode.postMessage({ type: 'setSetting', key: 'autoHideMarkers', value: !!hideEl.checked });
				});
			}
			if (detectEl) {
				detectEl.checked = settings?.autoAnnotationDetection !== false;
				setStateText(detectStateEl, !!detectEl.checked, 'On', 'Off');
				detectEl.addEventListener('change', () => {
					setStateText(detectStateEl, !!detectEl.checked, 'On', 'Off');
					vscode.postMessage({ type: 'setSetting', key: 'autoAnnotationDetection', value: !!detectEl.checked });
				});
			}
		}


	</script>
</body>
</html>`;
}

export class SourceWebviewViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
	private webviewView?: vscode.WebviewView;
	private currentView: ViewMode = 'annotations';
	private readonly disposables: vscode.Disposable[] = [];
	private settings: WebviewSettingsState = { autoHideMarkers: false, autoAnnotationDetection: true, lightMode: false };
	private exportChartPrefs: { tools: 'bar' | 'pie' | 'donut'; models: 'bar' | 'pie' | 'donut' } = {
		tools: 'donut',
		models: 'donut',
	};

	private static readonly SETTINGS_AUTO_HIDE = 'sourcedoc.settings.autoHideMarkers';
	private static readonly SETTINGS_AUTO_DETECT = 'sourcedoc.settings.autoAnnotationDetection';
	private static readonly SETTINGS_LIGHT_MODE = 'sourcedoc.settings.lightMode';
	private static readonly EXPORT_CHART_TOOLS = 'sourcedoc.export.chart.tools';
	private static readonly EXPORT_CHART_MODELS = 'sourcedoc.export.chart.models';

	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly model: SourcePasteModel,
		private readonly context: vscode.ExtensionContext,
		private readonly markers: import('./sourceMarkers').SourceMarkers
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
				exportData,
				settings: this.settings,
				exportChartPrefs: this.exportChartPrefs,
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
					if (msg.view === 'annotations' || msg.view === 'stats' || msg.view === 'export' || msg.view === 'settings') {
						this.currentView = msg.view;
						postUpdate();
					}
					return;
				}

				if (msg.type === 'setSetting' && typeof msg.key === 'string') {
					const value = !!msg.value;
					if (msg.key === 'autoHideMarkers') {
						this.settings.autoHideMarkers = value;
						await this.context.workspaceState.update(SourceWebviewViewProvider.SETTINGS_AUTO_HIDE, value);
						this.markers.setAutoHide(value);
						postUpdate();
					} else if (msg.key === 'autoAnnotationDetection') {
						this.settings.autoAnnotationDetection = value;
						await this.context.workspaceState.update(SourceWebviewViewProvider.SETTINGS_AUTO_DETECT, value);
						postUpdate();
					} else if (msg.key === 'lightMode') {
						this.settings.lightMode = value;
						await this.context.workspaceState.update(SourceWebviewViewProvider.SETTINGS_LIGHT_MODE, value);
						postUpdate();
					}
					return;
				}

				if (msg.type === 'setExportChart' && typeof msg.target === 'string' && typeof msg.value === 'string') {
					const v = msg.value === 'bar' || msg.value === 'pie' || msg.value === 'donut' ? msg.value : undefined;
					if (!v) return;
					if (msg.target === 'tools') {
						this.exportChartPrefs.tools = v;
						await this.context.workspaceState.update(SourceWebviewViewProvider.EXPORT_CHART_TOOLS, v);
						postUpdate();
					} else if (msg.target === 'models') {
						this.exportChartPrefs.models = v;
						await this.context.workspaceState.update(SourceWebviewViewProvider.EXPORT_CHART_MODELS, v);
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

					if (this.settings.autoHideMarkers) {
						this.markers.revealOnce(editor.document.uri, range);
					}
					return;
				}

				if (msg.type === 'exportPdf') {
					await vscode.commands.executeCommand('sourcedoc.exportPdf');
					return;
				}
			})
		);

		webviewView.onDidDispose(() => {
			this.webviewView = undefined;
		});

		// initialize settings from workspace state before first render
		this.settings = {
			autoHideMarkers: this.context.workspaceState.get<boolean>(SourceWebviewViewProvider.SETTINGS_AUTO_HIDE, false),
			autoAnnotationDetection: this.context.workspaceState.get<boolean>(SourceWebviewViewProvider.SETTINGS_AUTO_DETECT, true),
			lightMode: this.context.workspaceState.get<boolean>(SourceWebviewViewProvider.SETTINGS_LIGHT_MODE, false),
		};
		this.exportChartPrefs = {
			tools: this.context.workspaceState.get<'bar' | 'pie' | 'donut'>(SourceWebviewViewProvider.EXPORT_CHART_TOOLS, 'donut'),
			models: this.context.workspaceState.get<'bar' | 'pie' | 'donut'>(SourceWebviewViewProvider.EXPORT_CHART_MODELS, 'donut'),
		};
		this.markers.setAutoHide(this.settings.autoHideMarkers);

		postUpdate();
	}
}