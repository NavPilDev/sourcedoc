import * as vscode from 'vscode';

export interface SourcedPaste {
	id: string;
	range: vscode.Range;
	recordedAt: Date;
	source: string;
	reason: string;
}

const MIN_PASTE_CHARS = 25;
const MIN_MULTILINE_CHARS = 3;
const PROMPT_COOLDOWN_MS = 1200;
const DEBUG_PASTE_DETECTION = false;

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

interface PersistedSourcedPaste {
	id: string;
	recordedAt: string;
	source: string;
	reason: string;
	start: { line: number; character: number };
	end: { line: number; character: number };
}

interface PersistedWorkspaceData {
	version: 1;
	files: Record<string, PersistedSourcedPaste[]>;
}

const SOURCE_OPTIONS = [
	'Stack Overflow',
	'Github',
	'ChatGPT',
	'Claude Code',
	'IDE Agent(Cursor, Github Copilot)',
	'Other(Please Specify)',
] as const;

export class SourcePasteModel implements vscode.Disposable {
	private readonly pastesByUri = new Map<string, SourcedPaste[]>();
	private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
	private readonly pendingPastes: PendingPaste[] = [];
	private readonly saveTimersByFolder = new Map<string, ReturnType<typeof setTimeout>>();
	private readonly debugChannel = vscode.window.createOutputChannel('SourceDoc Paste Detection');
	private isPrompting = false;
	private lastPromptAtMs = 0;
	readonly onDidChange = this._onDidChange.event;

	dispose(): void {
		for (const timer of this.saveTimersByFolder.values()) {
			clearTimeout(timer);
		}
		this.saveTimersByFolder.clear();
		this.debugChannel.dispose();
		this._onDidChange.dispose();
	}

	getPastes(uri: vscode.Uri): readonly SourcedPaste[] {
		return this.pastesByUri.get(uri.toString()) ?? [];
	}

	getPasteById(uri: vscode.Uri, id: string): SourcedPaste | undefined {
		const list = this.pastesByUri.get(uri.toString());
		if (!list) {
			return undefined;
		}
		return list.find((item) => item.id === id);
	}

	updateReasonById(uri: vscode.Uri, id: string, reason: string): boolean {
		const list = this.pastesByUri.get(uri.toString());
		if (!list) {
			return false;
		}
		const idx = list.findIndex((item) => item.id === id);
		if (idx < 0) {
			return false;
		}
		const existing = list[idx];
		list[idx] = { ...existing, reason };
		this._onDidChange.fire(uri);
		this.schedulePersistForUri(uri);
		return true;
	}

	deletePasteById(uri: vscode.Uri, id: string): boolean {
		const key = uri.toString();
		const list = this.pastesByUri.get(key);
		if (!list) {
			return false;
		}
		const next = deletePasteByIdFromList(list, id);
		if (next.length === list.length) {
			return false;
		}
		if (next.length === 0) {
			this.pastesByUri.delete(key);
		} else {
			this.pastesByUri.set(key, next);
		}
		this._onDidChange.fire(uri);
		this.schedulePersistForUri(uri);
		return true;
	}

	clearPastesForUri(uri: vscode.Uri): boolean {
		const key = uri.toString();
		const list = this.pastesByUri.get(key);
		if (!list) {
			return false;
		}
		const next = clearPastesFromList(list);
		if (next.length === 0) {
			this.pastesByUri.delete(key);
		} else {
			this.pastesByUri.set(key, next);
		}
		this._onDidChange.fire(uri);
		this.schedulePersistForUri(uri);
		return true;
	}

	async loadPersistedData(): Promise<void> {
		const folders = vscode.workspace.workspaceFolders ?? [];
		for (const folder of folders) {
			const storageUri = vscode.Uri.joinPath(folder.uri, '.sourcedoc', 'sourcedoc.json');
			let data: Uint8Array;
			try {
				data = await vscode.workspace.fs.readFile(storageUri);
			} catch {
				continue;
			}
			let parsed: PersistedWorkspaceData;
			try {
				parsed = JSON.parse(new TextDecoder().decode(data)) as PersistedWorkspaceData;
			} catch {
				continue;
			}
			const files = parsed.files ?? {};
			for (const [relativePath, entries] of Object.entries(files)) {
				const fileUri = vscode.Uri.joinPath(folder.uri, relativePath);
				const hydrated = entries.map((entry) => ({
					id: entry.id,
					range: new vscode.Range(
						new vscode.Position(entry.start.line, entry.start.character),
						new vscode.Position(entry.end.line, entry.end.character)
					),
					recordedAt: new Date(entry.recordedAt),
					source: entry.source,
					reason: entry.reason,
				}));
				if (hydrated.length > 0) {
					this.pastesByUri.set(fileUri.toString(), hydrated);
					this._onDidChange.fire(fileUri);
				}
			}
		}
	}

	handleDocumentChange(event: vscode.TextDocumentChangeEvent): void {
		const { document } = event;
		if (!shouldTrackDocument(document)) {
			return;
		}
		const key = document.uri.toString();
		const existingBefore = this.pastesByUri.get(key) ?? [];
		if (existingBefore.length > 0) {
			const updated = this.applyChangesToPastes(existingBefore, event.contentChanges);
			if (updated.length === 0) {
				this.pastesByUri.delete(key);
			} else {
				this.pastesByUri.set(key, updated);
			}
			this._onDidChange.fire(document.uri);
			this.schedulePersistForUri(document.uri);
		}

		const recordedAt = new Date();
		let enqueued = false;
		for (const change of event.contentChanges) {
			const pasteCandidate = this.shouldTreatChangeAsPaste(change, existingBefore);
			this.logDetectionDecision(change, pasteCandidate, existingBefore);
			if (!pasteCandidate) {
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
			this.lastPromptAtMs = Date.now();
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

				const source = await this.promptForSource(nextPaste.fileLabel || 'Untitled');
				if (source === undefined) {
					continue;
				}

				const key = nextPaste.uri.toString();
				let list = this.pastesByUri.get(key);
				if (!list) {
					list = [];
					this.pastesByUri.set(key, list);
				}
				list.push({
					id: createPasteId(),
					range: nextPaste.lineRange,
					recordedAt: nextPaste.recordedAt,
					source,
					reason: '',
				});
				this._onDidChange.fire(nextPaste.uri);
				this.schedulePersistForUri(nextPaste.uri);
			}
		} finally {
			this.isPrompting = false;
		}
	}

	private async promptForSource(fileLabel: string): Promise<string | undefined> {
		for (;;) {
			const selected = await vscode.window.showQuickPick([...SOURCE_OPTIONS], {
				title: `SourceDoc - where are you pasting this from? (${fileLabel})`,
				ignoreFocusOut: true,
			});
			if (selected === undefined) {
				return undefined;
			}

			if (selected !== 'Other(Please Specify)') {
				return selected;
			}

			const custom = await vscode.window.showInputBox({
				title: `SourceDoc - specify source (${fileLabel})`,
				prompt: 'Enter the source for this pasted code.',
				ignoreFocusOut: true,
			});
			if (custom && custom.trim().length > 0) {
				return custom.trim();
			}
		}
	}

	private shouldTreatChangeAsPaste(
		change: vscode.TextDocumentContentChangeEvent,
		existingBefore: readonly SourcedPaste[]
	): boolean {
		if (!looksLikePaste(change.text)) {
			return false;
		}
		const now = Date.now();
		if (now - this.lastPromptAtMs < PROMPT_COOLDOWN_MS) {
			return false;
		}
		if (this.isPrompting) {
			return false;
		}
		if (isLikelyTypingLikeEdit(change)) {
			return false;
		}
		if (existingBefore.some((entry) => rangesOverlap(change.range, entry.range))) {
			// Editing in/around existing sourced blocks should maintain bounds only,
			// not create a brand new attribution prompt.
			return false;
		}
		return true;
	}

	private logDetectionDecision(
		change: vscode.TextDocumentContentChangeEvent,
		accepted: boolean,
		existingBefore: readonly SourcedPaste[]
	): void {
		if (!DEBUG_PASTE_DETECTION) {
			return;
		}
		const msg = [
			`accepted=${accepted}`,
			`len=${change.text.length}`,
			`newlines=${change.text.includes('\n')}`,
			`rangeLength=${change.rangeLength}`,
			`isPrompting=${this.isPrompting}`,
			`cooldownMs=${Date.now() - this.lastPromptAtMs}`,
			`trackedBlocks=${existingBefore.length}`,
		].join(' ');
		this.debugChannel.appendLine(msg);
	}

	private applyChangesToPastes(
		entries: readonly SourcedPaste[],
		changes: readonly vscode.TextDocumentContentChangeEvent[]
	): SourcedPaste[] {
		let next = [...entries];
		for (const change of changes) {
			next = next
				.map((entry) => {
					const transformed = transformRange(entry.range, change);
					if (!transformed) {
						return undefined;
					}
					return { ...entry, range: transformed };
				})
				.filter((entry): entry is SourcedPaste => Boolean(entry));
		}
		return next;
	}

	private schedulePersistForUri(uri: vscode.Uri): void {
		const folder = vscode.workspace.getWorkspaceFolder(uri);
		if (!folder || uri.scheme !== 'file') {
			return;
		}
		const folderKey = folder.uri.toString();
		const existingTimer = this.saveTimersByFolder.get(folderKey);
		if (existingTimer) {
			clearTimeout(existingTimer);
		}
		const timer = setTimeout(() => {
			void this.persistFolder(folder);
		}, 300);
		this.saveTimersByFolder.set(folderKey, timer);
	}

	private async persistFolder(folder: vscode.WorkspaceFolder): Promise<void> {
		const folderKey = folder.uri.toString();
		this.saveTimersByFolder.delete(folderKey);

		const files: Record<string, PersistedSourcedPaste[]> = {};
		for (const [uriKey, entries] of this.pastesByUri.entries()) {
			const uri = vscode.Uri.parse(uriKey);
			if (uri.scheme !== 'file') {
				continue;
			}
			const ownerFolder = vscode.workspace.getWorkspaceFolder(uri);
			if (!ownerFolder || ownerFolder.uri.toString() !== folderKey) {
				continue;
			}
			const relative = vscode.workspace.asRelativePath(uri, false);
			files[relative] = entries.map((entry) => ({
				id: entry.id,
				recordedAt: entry.recordedAt.toISOString(),
				source: entry.source,
				reason: entry.reason,
				start: { line: entry.range.start.line, character: entry.range.start.character },
				end: { line: entry.range.end.line, character: entry.range.end.character },
			}));
		}

		const payload: PersistedWorkspaceData = {
			version: 1,
			files,
		};
		const targetDir = vscode.Uri.joinPath(folder.uri, '.sourcedoc');
		const targetFile = vscode.Uri.joinPath(targetDir, 'sourcedoc.json');
		const tmpFile = vscode.Uri.joinPath(targetDir, 'sourcedoc.json.tmp');
		await vscode.workspace.fs.createDirectory(targetDir);
		await vscode.workspace.fs.writeFile(tmpFile, new TextEncoder().encode(JSON.stringify(payload, null, 2)));
		await vscode.workspace.fs.rename(tmpFile, targetFile, { overwrite: true });
	}
}

function createPasteId(): string {
	return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function transformRange(
	range: vscode.Range,
	change: vscode.TextDocumentContentChangeEvent
): vscode.Range | undefined {
	const start = mapPosition(range.start, change, true);
	const end = mapPosition(range.end, change, false);
	if (end.isBeforeOrEqual(start)) {
		return undefined;
	}
	return new vscode.Range(start, end);
}

function rangesOverlap(a: vscode.Range, b: vscode.Range): boolean {
	return a.intersection(b) !== undefined;
}

function isLikelyTypingLikeEdit(change: vscode.TextDocumentContentChangeEvent): boolean {
	return change.rangeLength === 0 && !change.text.includes('\n') && change.text.length <= 2;
}

function mapPosition(
	pos: vscode.Position,
	change: vscode.TextDocumentContentChangeEvent,
	clampInsideToStart: boolean
): vscode.Position {
	const changeStart = change.range.start;
	const changeEnd = change.range.end;

	if (pos.isBeforeOrEqual(changeStart)) {
		return pos;
	}
	if (pos.isAfterOrEqual(changeEnd)) {
		return shiftPositionAfterChange(pos, changeStart, changeEnd, change.text);
	}
	return clampInsideToStart ? changeStart : insertedEndPosition(changeStart, change.text);
}

function insertedEndPosition(start: vscode.Position, text: string): vscode.Position {
	const parts = text.split('\n');
	if (parts.length === 1) {
		return new vscode.Position(start.line, start.character + parts[0].length);
	}
	return new vscode.Position(start.line + parts.length - 1, parts[parts.length - 1].length);
}

function shiftPositionAfterChange(
	pos: vscode.Position,
	changeStart: vscode.Position,
	changeEnd: vscode.Position,
	insertedText: string
): vscode.Position {
	const insertedEnd = insertedEndPosition(changeStart, insertedText);
	const lineDelta = insertedEnd.line - changeEnd.line;
	if (lineDelta === 0) {
		if (pos.line === changeEnd.line) {
			return new vscode.Position(pos.line, pos.character + (insertedEnd.character - changeEnd.character));
		}
		return pos;
	}
	if (pos.line === changeEnd.line) {
		return new vscode.Position(pos.line + lineDelta, insertedEnd.character + (pos.character - changeEnd.character));
	}
	return new vscode.Position(pos.line + lineDelta, pos.character);
}

export const __test = {
	transformRange,
	rangesOverlap,
	isLikelyTypingLikeEdit,
	createPasteId,
	deletePasteByIdFromList,
	clearPastesFromList,
};

function deletePasteByIdFromList(list: readonly SourcedPaste[], id: string): SourcedPaste[] {
	return list.filter((item) => item.id !== id);
}

function clearPastesFromList(_list?: readonly SourcedPaste[]): SourcedPaste[] {
	return [];
}
