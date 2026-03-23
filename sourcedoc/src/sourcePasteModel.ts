import * as vscode from 'vscode';

export interface SourcedPaste {
	range: vscode.Range;
	recordedAt: Date;
}

export const SOURCE_LABEL = 'Human Copy-Paste (Stack Overflow)';

export const DUMMY_PROMPT_HISTORY =
	'Prior session prompts would appear here for attribution and research workflows.';

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

export class SourcePasteModel implements vscode.Disposable {
	private readonly pastesByUri = new Map<string, SourcedPaste[]>();
	private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
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
		const key = document.uri.toString();
		let list = this.pastesByUri.get(key);
		if (!list) {
			list = [];
			this.pastesByUri.set(key, list);
		}

		const recordedAt = new Date();
		let added = false;
		for (const change of event.contentChanges) {
			if (!looksLikePaste(change.text)) {
				continue;
			}
			const inserted = insertedRangeForChange(document, change);
			const lineRange = toWholeLineRange(document, inserted);
			list.push({ range: lineRange, recordedAt });
			added = true;
		}

		if (added) {
			this._onDidChange.fire(document.uri);
		}
	}
}
