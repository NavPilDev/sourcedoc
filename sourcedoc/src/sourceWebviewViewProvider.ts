import * as path from 'node:path';
import * as vscode from 'vscode';
import {
	formatTime,
	SourcePasteModel,
} from './sourcePasteModel';

export interface WebviewPasteRow {
	startLine: number;
	endLine: number;
	time: string;
	source: string;
	reason: string;
}

export interface WebviewUpdateMessage {
	type: 'update';
	fileLabel: string;
	pastes: WebviewPasteRow[];
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

function serializePastes(uri: vscode.Uri, model: SourcePasteModel): WebviewPasteRow[] {
	return model.getPastes(uri).map((p) => ({
		startLine: p.range.start.line + 1,
		endLine: p.range.end.line + 1,
		time: formatTime(p.recordedAt),
		source: p.source,
		reason: p.reason,
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
		body {
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			padding: 8px 10px;
			margin: 0;
		}
		.hint {
			opacity: 0.85;
			line-height: 1.4;
		}
		.file {
			font-weight: 600;
			margin-bottom: 10px;
			word-break: break-all;
		}
		ul {
			list-style: none;
			padding: 0;
			margin: 0;
		}
		li {
			border: 1px solid var(--vscode-widget-border, rgba(127,127,127,0.3));
			border-radius: 4px;
			padding: 8px 10px;
			margin-bottom: 8px;
			background: var(--vscode-editor-inactiveSelectionBackground, rgba(127,127,127,0.15));
		}
		.meta {
			font-size: 0.92em;
			opacity: 0.9;
			margin-top: 6px;
		}
		.lines {
			font-variant-numeric: tabular-nums;
		}
		.reason {
			margin-top: 6px;
			font-size: 0.88em;
			opacity: 0.85;
			display: -webkit-box;
			-webkit-line-clamp: 3;
			-webkit-box-orient: vertical;
			overflow: hidden;
		}
	</style>
</head>
<body>
	<div class="file" id="file"></div>
	<div class="hint" id="hint">Paste code in the editor to record line sourcing for this file.</div>
	<ul id="list"></ul>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const fileEl = document.getElementById('file');
		const hintEl = document.getElementById('hint');
		const listEl = document.getElementById('list');
		window.addEventListener('message', function (event) {
			const msg = event.data;
			if (!msg || msg.type !== 'update') { return; }
			fileEl.textContent = msg.fileLabel || '';
			listEl.innerHTML = '';
			if (!msg.pastes || msg.pastes.length === 0) {
				hintEl.style.display = 'block';
				return;
			}
			hintEl.style.display = 'none';
			for (const p of msg.pastes) {
				const li = document.createElement('li');
				const lines = document.createElement('div');
				lines.className = 'lines';
				lines.textContent = 'Lines ' + p.startLine + (p.endLine !== p.startLine ? '–' + p.endLine : '');
				const meta = document.createElement('div');
				meta.className = 'meta';
				meta.textContent = p.time + ' · Source: ' + p.source;
				const reason = document.createElement('div');
				reason.className = 'reason';
				reason.textContent = 'Reason: ' + (p.reason || '(none)');
				li.appendChild(lines);
				li.appendChild(meta);
				li.appendChild(reason);
				listEl.appendChild(li);
			}
		});
	</script>
</body>
</html>`;
}

export class SourceWebviewViewProvider implements vscode.WebviewViewProvider {
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
					fileLabel: 'No active editor',
					pastes: [],
				};
				webview.postMessage(msg);
				return;
			}
			const uri = editor.document.uri;
			const msg: WebviewUpdateMessage = {
				type: 'update',
				fileLabel: fileLabelForUri(uri),
				pastes: serializePastes(uri, this.model),
			};
			webview.postMessage(msg);
		};

		postUpdate();

		const subs: vscode.Disposable[] = [
			this.model.onDidChange(() => postUpdate()),
			vscode.window.onDidChangeActiveTextEditor(() => postUpdate()),
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
