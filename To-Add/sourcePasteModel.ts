import * as vscode from 'vscode';

export type SourceType = 'ai';

// predefined tools (for button UI)
export const PREDEFINED_TOOLS = [
	'ChatGPT',
	'Copilot',
	'Claude',
	'Stack Overflow',
	'GeeksforGeeks',
	'GitHub',
	'Other',
] as const;

export type PredefinedTool = (typeof PREDEFINED_TOOLS)[number];

export interface SourceMetadata {
	sourceType: SourceType;
	tool?: string;
	model?: string;
	prompt?: string;
	notes?: string;
}

export interface AIAnnotation {
	id: string;
	uri: string;
	range: vscode.Range;
	recordedAt: Date;
	textPreview: string;
	fullText: string; 
	originalText: string; 
	source: SourceMetadata;
}

export interface TrackerStats {
	totalAnnotations: number;
	annotatedLines: number;
	toolsBreakdown: Array<{ label: string; value: number }>;
}

export function formatTime(d: Date): string {
	const h = d.getHours().toString().padStart(2, '0');
	const m = d.getMinutes().toString().padStart(2, '0');
	return `${h}:${m}`;
}

// safer document check
function shouldTrackDocument(document: vscode.TextDocument): boolean {
	return document.uri.scheme === 'file' || document.uri.scheme === 'untitled';
}

function createTextPreview(text: string): string {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (!normalized) {
		return '';
	}
	return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

function countLinesInRange(range: vscode.Range): number {
	return Math.max(1, range.end.line - range.start.line + 1);
}

// normalize tool name (avoid messy stats)
function normalizeTool(tool?: string): string | undefined {
	if (!tool) return undefined;

	const trimmed = tool.trim();

	const map: Record<string, PredefinedTool> = {
		chatgpt: 'ChatGPT',
		copilot: 'Copilot',
		claude: 'Claude',
		stackoverflow: 'Stack Overflow',
		'stack overflow': 'Stack Overflow',
		geeksforgeeks: 'GeeksforGeeks',
		github: 'GitHub',
		other: 'Other',
	};

	const key = trimmed.toLowerCase();
	return map[key] || trimmed;
}

export class SourcePasteModel implements vscode.Disposable {
	private static STORAGE_KEY = 'vibe.annotations'; 

	private readonly annotationsByUri = new Map<string, AIAnnotation[]>();
	private readonly annotationIndex = new Map<string, AIAnnotation>();
	private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
	readonly onDidChange = this._onDidChange.event;

	private nextId = 1;

	// UPDATED constructor
	constructor(private context: vscode.ExtensionContext) {
		this.loadFromStorage(); // 
	}

	dispose(): void {
		this._onDidChange.dispose();
	}

	// =========================
	// SAVE
	// =========================
	private saveToStorage() {
		const data = Array.from(this.annotationsByUri.entries()).map(([uri, list]) => [
			uri,
			list.map(a => ({
				...a,
				fullText: a.fullText || '',
				recordedAt: a.recordedAt.toISOString(),
				range: {
					start: { line: a.range.start.line, character: a.range.start.character },
					end: { line: a.range.end.line, character: a.range.end.character }
				}
			}))
		]);

		this.context.workspaceState.update(SourcePasteModel.STORAGE_KEY, data);
	}

	// =========================
	// LOAD
	// =========================
	private loadFromStorage() {
		const data = this.context.workspaceState.get<any[]>(
			SourcePasteModel.STORAGE_KEY,
			[]
		);

		const restored = new Map<string, AIAnnotation[]>();

		for (const [uri, list] of data) {
			const restoredList = list.map((a: any) => ({
				...a,
				fullText: a.fullText || '',
				originalText: a.originalText || a.fullText || '',
				recordedAt: new Date(a.recordedAt),
				range: new vscode.Range(
					new vscode.Position(a.range.start.line, a.range.start.character),
					new vscode.Position(a.range.end.line, a.range.end.character)
				)
			}));

			restored.set(uri, restoredList);

			for (const item of restoredList) {
				this.annotationIndex.set(item.id, item);
			}
		}

		this.annotationsByUri.clear();
		for (const [k, v] of restored.entries()) {
			this.annotationsByUri.set(k, v);
		}
	}

	getAnnotations(uri: vscode.Uri): readonly AIAnnotation[] {
		return this.annotationsByUri.get(uri.toString()) ?? [];
	}

	getAnnotationById(annotationId: string): AIAnnotation | undefined {
		return this.annotationIndex.get(annotationId);
	}

	// =========================
	addAnnotation(
		uri: vscode.Uri,
		range: vscode.Range,
		text: string,
		metadata: SourceMetadata
	): void {
		const key = uri.toString();

		const document = vscode.workspace.textDocuments.find(
			(doc) => doc.uri.toString() === key
		);

		if (!document || !shouldTrackDocument(document)) {
			return;
		}

		let list = this.annotationsByUri.get(key);
		if (!list) {
			list = [];
			this.annotationsByUri.set(key, list);
		}

		const annotation: AIAnnotation = {
			id: `annotation-${this.nextId++}`,
			uri: key,
			range: new vscode.Range(range.start, range.end),
			recordedAt: new Date(),
			textPreview: createTextPreview(text),
			originalText: text,
			fullText: text, // STORE FULL TEXT
			source: {
				sourceType: 'ai',
				tool: normalizeTool(metadata.tool),
				model: metadata.model?.trim() || undefined,
				prompt: metadata.prompt?.trim() || undefined,
				notes: metadata.notes?.trim() || undefined,
			},
		};

		list.push(annotation);
		this.annotationIndex.set(annotation.id, annotation);

		this.saveToStorage();
		this._onDidChange.fire(uri);
	}

	updateAnnotation(annotationId: string, metadata: SourceMetadata): void {
		const annotation = this.annotationIndex.get(annotationId);
		if (!annotation) {
			return;
		}

		annotation.source = {
			sourceType: 'ai',
			tool: normalizeTool(metadata.tool),
			model: metadata.model?.trim() || undefined,
			prompt: metadata.prompt?.trim() || undefined,
			notes: metadata.notes?.trim() || undefined,
		};

		this.saveToStorage(); 
		this._onDidChange.fire(vscode.Uri.parse(annotation.uri));
	}

	deleteAnnotation(annotationId: string): void {
		const annotation = this.annotationIndex.get(annotationId);
		if (!annotation) {
			return;
		}

		const key = annotation.uri;
		const list = this.annotationsByUri.get(key);
		if (!list) {
			return;
		}

		const nextList = list.filter((item) => item.id !== annotationId);
		this.annotationsByUri.set(key, nextList);
		this.annotationIndex.delete(annotationId);

		this.saveToStorage(); // ✅ NEW
		this._onDidChange.fire(vscode.Uri.parse(key));
	}

	clearAnnotationsForUri(uri: vscode.Uri): void {
		const key = uri.toString();
		const list = this.annotationsByUri.get(key) ?? [];

		for (const item of list) {
			this.annotationIndex.delete(item.id);
		}

		this.annotationsByUri.set(key, []);

		this.saveToStorage(); 
		this._onDidChange.fire(uri);
	}

	getStats(uri: vscode.Uri): TrackerStats {
		const annotations = this.getAnnotations(uri);

		const totalAnnotations = annotations.length;
		const annotatedLines = annotations.reduce(
			(sum, item) => sum + countLinesInRange(item.range),
			0
		);

		const toolCounts = new Map<string, number>();
		for (const item of annotations) {
			const label = item.source.tool?.trim() || 'Unspecified tool';
			toolCounts.set(label, (toolCounts.get(label) ?? 0) + 1);
		}

		const toolsBreakdown = [...toolCounts.entries()]
			.map(([label, value]) => ({ label, value }))
			.sort((a, b) => b.value - a.value);

		return {
			totalAnnotations,
			annotatedLines,
			toolsBreakdown,
		};
	}

	
	updateAnnotationsForEdit(
		document: vscode.TextDocument,
		change: vscode.TextDocumentContentChangeEvent
	) {
		const key = document.uri.toString();
		const annotations = this.annotationsByUri.get(key);
		if (!annotations) return;

		const changeStart = change.range.start;
		const changeEnd = change.range.end;

		const isInsertion = change.rangeLength === 0 && change.text.length > 0;

		const newLineCount = change.text.split(/\r?\n/).length - 1;
		const oldLineCount = changeEnd.line - changeStart.line;
		const lineDelta = newLineCount - oldLineCount;

		const updated: AIAnnotation[] = [];

		for (const a of annotations) {
			let newStart = a.range.start;
			let newEnd = a.range.end;

			const overlaps =
				a.range.end.isAfterOrEqual(changeStart) &&
				a.range.start.isBeforeOrEqual(changeEnd);

			// =========================
			// CASE 1: annotation AFTER change → shift
			// =========================
			if (
				(isInsertion && a.range.start.line >= changeStart.line) ||
				(!isInsertion && a.range.start.line > changeEnd.line)
			) {
				newStart = new vscode.Position(
					a.range.start.line + lineDelta,
					a.range.start.character
				);

				newEnd = new vscode.Position(
					a.range.end.line + lineDelta,
					a.range.end.character
				);
			}

			// =========================
			// CASE 2: insertion INSIDE annotation → expand
			// =========================
			else if (
				isInsertion &&
				a.range.start.line <= changeStart.line &&
				a.range.end.line >= changeStart.line
			) {
				newEnd = new vscode.Position(
					a.range.end.line + lineDelta,
					a.range.end.character
				);
			}

			// =========================
			// CASE 3: overlap → recompute text safely
			// =========================
			else if (overlaps) {
				try {
					const startOffset = document.offsetAt(a.range.start);

					const safeEndOffset = Math.min(
						document.getText().length,
						startOffset + a.fullText.length
					);

					const currentText = document.getText(
						new vscode.Range(
							document.positionAt(startOffset),
							document.positionAt(safeEndOffset)
						)
					);

					// fully deleted → remove annotation
					if (!currentText.trim()) {
						this.annotationIndex.delete(a.id);
						continue;
					}

					a.fullText = currentText;
					a.textPreview = createTextPreview(currentText);

					const newEndOffset = startOffset + currentText.length;

					newStart = document.positionAt(startOffset);
					newEnd = document.positionAt(newEndOffset);
				} catch {
					continue;
				}
			}

			a.range = new vscode.Range(newStart, newEnd);
			updated.push(a);
		}

		this.annotationsByUri.set(key, updated);

		this.saveToStorage();
		this._onDidChange.fire(document.uri);
	}




}

export interface ExportAnnotation {
	id: string;
	file: string;
	startLine: number;
	endLine: number;
	recordedAt: string;
	tool?: string;
	model?: string;
	prompt?: string;
	notes?: string;
	textPreview: string;
	originalText: string; 
	fullText: string;
}

export function buildExportData(annotations: readonly AIAnnotation[]): ExportAnnotation[] {
	return annotations.map(a => ({
		id: a.id,
		file: a.uri,
		startLine: a.range.start.line + 1,
		endLine: a.range.end.line + 1,
		recordedAt: a.recordedAt.toISOString(),
		tool: a.source.tool,
		model: a.source.model,
		prompt: a.source.prompt,
		notes: a.source.notes,
		textPreview: a.textPreview,
		originalText: a.originalText,
		fullText: a.fullText
	}));
}