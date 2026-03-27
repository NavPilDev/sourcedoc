import * as path from 'node:path';
import * as vscode from 'vscode';
import {
	formatTime,
	SourcePasteModel,
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
}

export interface WebviewUpdateMessage {
	type: 'update';
	fileLabel: string;
	pastes: WebviewPasteRow[];
}

type WebviewActionMessage =
	| { type: 'goToBlock'; id: string }
	| { type: 'setReason'; id: string };

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
		.actions {
			margin-top: 8px;
			display: flex;
			gap: 8px;
		}
		button {
			background: var(--vscode-button-secondaryBackground, transparent);
			color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
			border: 1px solid var(--vscode-widget-border, rgba(127,127,127,0.3));
			border-radius: 4px;
			padding: 3px 8px;
			cursor: pointer;
		}
		button:hover {
			background: var(--vscode-button-secondaryHoverBackground, rgba(127,127,127,0.2));
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
				lines.textContent = 'Lines ' + p.startLine + (p.endLine !== p.startLine ? '–' + p.endLine : '') +
					' · Cols ' + p.startCharacter + '–' + p.endCharacter;
				const meta = document.createElement('div');
				meta.className = 'meta';
				meta.textContent = p.time + ' · Source: ' + p.source;
				const reason = document.createElement('div');
				reason.className = 'reason';
				reason.textContent = 'Reason: ' + (p.reason || '(none)');
				const actions = document.createElement('div');
				actions.className = 'actions';
				const goToButton = document.createElement('button');
				goToButton.textContent = 'Go to block';
				goToButton.addEventListener('click', function () {
					vscode.postMessage({ type: 'goToBlock', id: p.id });
				});
				const setReasonButton = document.createElement('button');
				setReasonButton.textContent = 'Set reason';
				setReasonButton.addEventListener('click', function () {
					vscode.postMessage({ type: 'setReason', id: p.id });
				});
				actions.appendChild(goToButton);
				actions.appendChild(setReasonButton);
				li.appendChild(lines);
				li.appendChild(meta);
				li.appendChild(reason);
				li.appendChild(actions);
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
			if (typeof msg.id !== 'string' || msg.id.length === 0) {
				return;
			}
			const paste = this.model.getPasteById(uri, msg.id);
			if (!paste) {
				return;
			}

			if (msg.type === 'goToBlock') {
				const targetEditor = await vscode.window.showTextDocument(uri, { preview: false });
				targetEditor.selection = new vscode.Selection(paste.range.start, paste.range.end);
				targetEditor.revealRange(paste.range, vscode.TextEditorRevealType.InCenter);
				return;
			}

			if (msg.type === 'setReason') {
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
