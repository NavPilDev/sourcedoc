import * as vscode from 'vscode';
import { formatTime, SourcePasteModel } from './sourcePasteModel';

export type { SourcedPaste } from './sourcePasteModel';

function buildHoverMessage(
	recordedAt: Date,
	source: string,
	reason: string,
	range: vscode.Range,
	ai?: { tool?: string; model?: string; prompt?: string; notes?: string }
): vscode.MarkdownString {
	const payload = {
		Source: source,
		Time: formatTime(recordedAt),
		Reason: reason || '(none)',
		AI: ai || undefined,
		Bounds: {
			startLine: range.start.line + 1,
			startCharacter: range.start.character + 1,
			endLine: range.end.line + 1,
			endCharacter: range.end.character + 1,
		},
	};
	const ms = new vscode.MarkdownString();
	ms.appendCodeblock(JSON.stringify(payload, null, 2), 'json');
	ms.isTrusted = true;
	return ms;
}

export class SourceMarkers implements vscode.Disposable {
	private readonly decorationType: vscode.TextEditorDecorationType;
	private readonly aiDecorationType: vscode.TextEditorDecorationType;
	private readonly model: SourcePasteModel;
	private readonly modelListener: vscode.Disposable;

	constructor(model: SourcePasteModel) {
		this.model = model;
		this.decorationType = vscode.window.createTextEditorDecorationType({
			isWholeLine: true,
			backgroundColor: 'rgba(80, 200, 255, 0.12)',
			overviewRulerColor: 'rgba(80, 200, 255, 0.45)',
			overviewRulerLane: vscode.OverviewRulerLane.Left,
		});
		this.aiDecorationType = vscode.window.createTextEditorDecorationType({
			isWholeLine: true,
			backgroundColor: 'rgba(160, 110, 255, 0.06)',
			overviewRulerColor: 'rgba(160, 110, 255, 0.55)',
			overviewRulerLane: vscode.OverviewRulerLane.Left,
			border: '1px solid rgba(160, 110, 255, 0.35)',
		});
		this.modelListener = model.onDidChange((uri) => {
			this.refreshEditorsForDocument(uri);
		});
	}

	dispose(): void {
		this.modelListener.dispose();
		this.decorationType.dispose();
		this.aiDecorationType.dispose();
	}

	refreshEditor(editor: vscode.TextEditor): void {
		const pastes = this.model.getPastes(editor.document.uri);
		const options: vscode.DecorationOptions[] = pastes.map((p) => ({
			range: p.range,
			hoverMessage: buildHoverMessage(p.recordedAt, p.source, p.reason, p.range, p.ai),
		}));
		editor.setDecorations(this.decorationType, options);

		const aiOptions: vscode.DecorationOptions[] = pastes
			.filter((p) => Boolean(p.ai))
			.map((p) => ({
				range: p.range,
			}));
		editor.setDecorations(this.aiDecorationType, aiOptions);
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
