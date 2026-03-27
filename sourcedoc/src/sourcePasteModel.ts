import * as vscode from 'vscode';

export interface SourcedPaste {
	range: vscode.Range;
	recordedAt: Date;
	source: string;
	reason: string;
}

const MIN_PASTE_CHARS = 25;
const MIN_MULTILINE_CHARS = 3;

function looksLikePaste(text: string): boolean {
	if (!text) {
		return false;
	}
	if (text.length >= MIN_PASTE_CHARS) {
		return true;
	}
	return text.includes('\n') && text.length >= MIN_MULTILINE_CHARS;
}

export function formatTime(d: Date): string {
	const h = d.getHours().toString().padStart(2, '0');
	const m = d.getMinutes().toString().padStart(2, '0');
	return `${h}:${m}`;
}

function insertedRangeForChange(document: vscode.TextDocument, change: vscode.TextDocumentContentChangeEvent): vscode.Range {
	const start = document.positionAt(change.rangeOffset);
	const end = document.positionAt(change.rangeOffset + change.text.length);
	return new vscode.Range(start, end);
}

function toWholeLineRange(document: vscode.TextDocument, range: vscode.Range): vscode.Range {
	const startLine = range.start.line;
	const endLine = range.end.line;
	return new vscode.Range(
		new vscode.Position(startLine, 0),
		document.lineAt(endLine).range.end
	);
}

function shouldTrackDocument(document: vscode.TextDocument): boolean {
	return document.uri.scheme === 'file' || document.uri.scheme === 'untitled';
}

interface PendingPaste {
	uri: vscode.Uri;
	lineRange: vscode.Range;
	recordedAt: Date;
	fileLabel: string;
}

export class SourcePasteModel implements vscode.Disposable {
	private readonly pastesByUri = new Map<string, SourcedPaste[]>();
	private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
	private readonly pendingPastes: PendingPaste[] = [];
	private isPrompting = false;
	readonly onDidChange = this._onDidChange.event;

	dispose(): void {
		this._onDidChange.dispose();
	}

	getPastes(uri: vscode.Uri): readonly SourcedPaste[] {
		return this.pastesByUri.get(uri.toString()) ?? [];
	}

	handleDocumentChange(event: vscode.TextDocumentChangeEvent): void {
		const { document } = event;
		if (!shouldTrackDocument(document)) {
			return;
		}
		const recordedAt = new Date();
		let enqueued = false;
		for (const change of event.contentChanges) {
			if (!looksLikePaste(change.text)) {
				continue;
			}
			const inserted = insertedRangeForChange(document, change);
			const lineRange = toWholeLineRange(document, inserted);
			this.pendingPastes.push({
				uri: document.uri,
				lineRange,
				recordedAt,
				fileLabel: vscode.workspace.asRelativePath(document.uri, false),
			});
			enqueued = true;
		}

		if (enqueued) {
			void this.processPendingPastes();
		}
	}

	private async processPendingPastes(): Promise<void> {
		if (this.isPrompting) {
			return;
		}
		this.isPrompting = true;
		try {
			while (this.pendingPastes.length > 0) {
				const nextPaste = this.pendingPastes.shift();
				if (!nextPaste) {
					continue;
				}

				const source = await vscode.window.showInputBox({
					title: `SourceDoc - paste attribution (${nextPaste.fileLabel || 'Untitled'})`,
					prompt: 'Enter the source for this pasted code (URL or description).',
					ignoreFocusOut: true,
				});
				if (source === undefined) {
					continue;
				}

				const reasonInput = await vscode.window.showInputBox({
					title: `SourceDoc - paste reason (${nextPaste.fileLabel || 'Untitled'})`,
					prompt: 'Why was this code pasted?',
					ignoreFocusOut: true,
				});
				const reason = reasonInput ?? '';

				const key = nextPaste.uri.toString();
				let list = this.pastesByUri.get(key);
				if (!list) {
					list = [];
					this.pastesByUri.set(key, list);
				}
				list.push({
					range: nextPaste.lineRange,
					recordedAt: nextPaste.recordedAt,
					source,
					reason,
				});
				this._onDidChange.fire(nextPaste.uri);
			}
		} finally {
			this.isPrompting = false;
		}
	}
}
