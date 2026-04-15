import * as vscode from 'vscode';
import {
	formatTime,
	SourcePasteModel,
	AIAnnotation,
} from './sourcePasteModel';

function escapeMarkdown(text: string): string {
	return text.replace(/[`*_{}[\]()#+\-.!]/g, '\\$&');
}

function truncate(text: string, max = 200): string {
	if (!text) return '';
	return text.length > max ? text.slice(0, max) + '...' : text;
}

function buildHoverMessage(annotation: AIAnnotation): vscode.MarkdownString {
	const lines: string[] = [];

	lines.push(`**AI Annotation**`);
	lines.push(`**Time:** ${formatTime(annotation.recordedAt)}`);

	if (annotation.source.tool) {
		lines.push(`**Tool:** ${escapeMarkdown(annotation.source.tool)}`);
	}
	if (annotation.source.model) {
		lines.push(`**Model:** ${escapeMarkdown(annotation.source.model)}`);
	}

	if (annotation.source.prompt) {
		const safePrompt = escapeMarkdown(truncate(annotation.source.prompt));
		lines.push(`**Prompt:**`);
		lines.push('```');
		lines.push(safePrompt);
		lines.push('```');
	}

	if (annotation.source.notes) {
		lines.push(`**Notes:** ${escapeMarkdown(annotation.source.notes)}`);
	}

	if (annotation.textPreview) {
		lines.push(`---`);
		lines.push(`**Preview:**`);
		lines.push(`\`${escapeMarkdown(annotation.textPreview)}\``);
	}

	lines.push(`---`);
	lines.push(`[Edit Annotation](command:sourcedoc.annotateExisting?${encodeURIComponent(JSON.stringify(annotation.id))})`);
	lines.push(`[Delete Annotation](command:sourcedoc.deleteAnnotation?${encodeURIComponent(JSON.stringify(annotation.id))})`);

	const ms = new vscode.MarkdownString(lines.join('\n\n'));
	ms.isTrusted = true;
	return ms;
}

export class SourceMarkers implements vscode.Disposable {
	private readonly aiDecoration: vscode.TextEditorDecorationType;
	private readonly model: SourcePasteModel;
	private readonly modelListener: vscode.Disposable;
	private autoHide = false;
	private revealByUri = new Map<string, { range: vscode.Range; timeout: NodeJS.Timeout }>();

	constructor(model: SourcePasteModel) {
		this.model = model;

		this.aiDecoration = vscode.window.createTextEditorDecorationType({
			backgroundColor: 'rgba(160, 110, 255, 0.14)',
			overviewRulerColor: 'rgba(160, 110, 255, 0.75)',
			overviewRulerLane: vscode.OverviewRulerLane.Left,
			borderRadius: '3px',
		});

		this.modelListener = model.onDidChange((uri) => {
			this.refreshEditorsForDocument(uri);
		});
	}

	dispose(): void {
		this.modelListener.dispose();
		this.aiDecoration.dispose();
		for (const entry of this.revealByUri.values()) {
			clearTimeout(entry.timeout);
		}
		this.revealByUri.clear();
	}

	setAutoHide(enabled: boolean): void {
		this.autoHide = enabled;
		this.refreshAllVisibleEditors();
	}

	revealOnce(uri: vscode.Uri, range: vscode.Range, ms = 1200): void {
		const key = uri.toString();
		const prev = this.revealByUri.get(key);
		if (prev) {
			clearTimeout(prev.timeout);
		}

		const timeout = setTimeout(() => {
			this.revealByUri.delete(key);
			this.refreshEditorsForDocument(uri);
		}, ms);

		this.revealByUri.set(key, { range, timeout });
		this.refreshEditorsForDocument(uri);
	}

	refreshEditor(editor: vscode.TextEditor): void {
		const annotations = this.model.getAnnotations(editor.document.uri);

		let options: vscode.DecorationOptions[] = [];
		if (!this.autoHide) {
			options = annotations.map((annotation) => ({
				range: annotation.range,
				hoverMessage: buildHoverMessage(annotation),
			}));
		} else {
			const revealed = this.revealByUri.get(editor.document.uri.toString());
			if (revealed) {
				options = [
					{
						range: revealed.range,
						hoverMessage: new vscode.MarkdownString('SourceDoc: marker revealed for navigation.', true),
					},
				];
			}
		}

		editor.setDecorations(this.aiDecoration, options);
	}

	private refreshEditorsForDocument(uri: vscode.Uri): void {
		for (const editor of vscode.window.visibleTextEditors) {
			if (editor.document.uri.toString() === uri.toString()) {
				this.refreshEditor(editor);
			}
		}
	}

	refreshAllVisibleEditors(): void {
		for (const editor of vscode.window.visibleTextEditors) {
			this.refreshEditor(editor);
		}
	}
}