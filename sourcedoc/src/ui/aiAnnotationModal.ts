import * as vscode from 'vscode';

export interface AiMetadata {
	tool?: string;
	model?: string;
	prompt?: string;
	notes?: string;
}

export async function openAiAnnotationModal(existing?: AiMetadata): Promise<AiMetadata | undefined> {
	return new Promise((resolve) => {
		const panel = vscode.window.createWebviewPanel(
			'aiAnnotation',
			'AI Annotation',
			vscode.ViewColumn.Active,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
			}
		);

		panel.webview.html = getModalHtml(existing);

		panel.webview.onDidReceiveMessage((msg) => {
			if (msg?.type === 'submit') {
				resolve({
					tool: msg.tool,
					model: msg.model,
					prompt: msg.prompt,
					notes: msg.notes,
				});
				panel.dispose();
			}

			if (msg?.type === 'cancel') {
				resolve(undefined);
				panel.dispose();
			}
		});
	});
}

function getModalHtml(existing?: AiMetadata): string {
	const tool = existing?.tool || 'ChatGPT';
	const model = existing?.model || '';
	const prompt = existing?.prompt || '';
	const notes = existing?.notes || '';

	return `
	<!DOCTYPE html>
	<html>
	<head>
	<style>
		body {
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
			padding: 16px;
			background: #1e1e1e;
			color: #ddd;
		}

		h2 {
			margin-bottom: 12px;
			font-size: 18px;
		}

		label {
			font-size: 12px;
			color: #aaa;
		}

		input, textarea, select {
			width: 100%;
			margin-top: 4px;
			margin-bottom: 12px;
			padding: 6px;
			border-radius: 6px;
			border: 1px solid #444;
			background: #2d2d2d;
			color: white;
		}

		.row {
			display: flex;
			gap: 8px;
		}

		.row > div {
			flex: 1;
		}

		.actions {
			display: flex;
			justify-content: flex-end;
			gap: 8px;
		}

		button {
			padding: 6px 12px;
			border-radius: 6px;
			border: none;
			cursor: pointer;
		}

		.save {
			background: #007acc;
			color: white;
		}

		.cancel {
			background: #444;
			color: white;
		}

		.quick-tools button {
			margin-right: 6px;
			margin-bottom: 6px;
			background: #333;
			color: white;
			border-radius: 6px;
			padding: 4px 8px;
		}
	</style>
	</head>

	<body>
	<h2>AI Annotation</h2>

	<label>Quick Select Tool</label>
	<div class="quick-tools">
		<button onclick="setTool('ChatGPT')">ChatGPT</button>
		<button onclick="setTool('Copilot')">Copilot</button>
		<button onclick="setTool('Claude')">Claude</button>
		<button onclick="setTool('Stack Overflow')">StackOverflow</button>
	</div>

	<label>Tool</label>
	<select id="tool">
		<option>ChatGPT</option>
		<option>Copilot</option>
		<option>Claude</option>
		<option>Stack Overflow</option>
		<option>GitHub</option>
		<option>Other</option>
	</select>

	<div class="row">
		<div>
			<label>Model</label>
			<input id="model" value="${model}" />
		</div>
	</div>

	<label>Prompt</label>
	<textarea id="prompt" placeholder="Paste prompt (optional)...">${prompt}</textarea>

	<label>Notes</label>
	<textarea id="notes" placeholder="Any notes...">${notes}</textarea>

	<div class="actions">
		<button class="cancel" onclick="cancel()">Cancel</button>
		<button class="save" onclick="submit()">Save</button>
	</div>

	<script>
		const vscode = acquireVsCodeApi();

		document.getElementById('tool').value = "${tool}";

		function setTool(t) {
			document.getElementById('tool').value = t;
		}

		function submit() {
			vscode.postMessage({
				type: 'submit',
				tool: document.getElementById('tool').value,
				model: document.getElementById('model').value,
				prompt: document.getElementById('prompt').value,
				notes: document.getElementById('notes').value
			});
		}

		function cancel() {
			vscode.postMessage({ type: 'cancel' });
		}
	</script>

	</body>
	</html>
	`;
}

