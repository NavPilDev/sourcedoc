import * as vscode from 'vscode';
import { DUMMY_PROMPT_HISTORY, formatTime, SourcePasteModel, SOURCE_LABEL } from './sourcePasteModel';

export type { SourcedPaste } from './sourcePasteModel';

function buildHoverMessage(recordedAt: Date): vscode.MarkdownString {
	const payload = {
		Source: SOURCE_LABEL,
		Time: formatTime(recordedAt),
		'Prompt History': DUMMY_PROMPT_HISTORY,
	};
	const ms = new vscode.MarkdownString();
	ms.appendCodeblock(JSON.stringify(payload, null, 2), 'json');
	ms.isTrusted = true;
	return ms;
}

export class SourceMarkers implements vscode.Disposable {
	private readonly decorationType: vscode.TextEditorDecorationType;
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
		this.modelListener = model.onDidChange((uri) => {
			this.refreshEditorsForDocument(uri);
		});
	}

	dispose(): void {
		this.modelListener.dispose();
		this.decorationType.dispose();
	}

	refreshEditor(editor: vscode.TextEditor): void {
		const pastes = this.model.getPastes(editor.document.uri);
		const options: vscode.DecorationOptions[] = pastes.map((p) => ({
			range: p.range,
			hoverMessage: buildHoverMessage(p.recordedAt),
		}));
		editor.setDecorations(this.decorationType, options);
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
