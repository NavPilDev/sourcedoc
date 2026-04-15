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

		.header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 8px;
			margin-bottom: 12px;
		}

		h2 {
			margin: 0;
			font-size: 18px;
		}

		.icon-btn {
			border: 1px solid #444;
			background: transparent;
			color: #ddd;
			border-radius: 8px;
			width: 32px;
			height: 32px;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			cursor: pointer;
			font-size: 18px;
			line-height: 1;
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

		.quick-btn {
			border: 1px solid #444;
		}

		.quick-btn.selected {
			background: #007acc;
			color: white;
			border-color: #007acc;
		}
	</style>
	</head>

	<body>
	<div class="header">
		<h2>AI Annotation</h2>
		<button class="icon-btn" type="button" aria-label="Close" onclick="cancel()">×</button>
	</div>

	<label>Quick Select Tool</label>
	<div class="quick-tools">
		<button class="quick-btn tool-btn" type="button" data-tool="ChatGPT" onclick="setTool('ChatGPT')">ChatGPT</button>
		<button class="quick-btn tool-btn" type="button" data-tool="Cursor" onclick="setTool('Cursor')">Cursor</button>
		<button class="quick-btn tool-btn" type="button" data-tool="Copilot" onclick="setTool('Copilot')">Copilot</button>
		<button class="quick-btn tool-btn" type="button" data-tool="Claude" onclick="setTool('Claude')">Claude</button>
		<button class="quick-btn tool-btn" type="button" data-tool="Stack Overflow" onclick="setTool('Stack Overflow')">StackOverflow</button>
	</div>

	<label>Tool</label>
	<select id="tool">
		<option>ChatGPT</option>
		<option>Cursor</option>
		<option>Copilot</option>
		<option>Claude</option>
		<option>Stack Overflow</option>
		<option>GitHub</option>
		<option>Other</option>
	</select>

	<label>Quick Select Model</label>
	<div id="modelButtons" class="quick-tools"></div>

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

		const MODEL_MAP = {
			"ChatGPT": ["GPT-4o", "GPT-4.1", "GPT-5", "o3", "o4-mini", "Other"],
			"Cursor": ["Auto", "Claude 3.5 Sonnet", "GPT-4.1/o3-mini", "Gemini 2.5 Pro", "Other"],
			"Claude": ["Claude 3 Haiku", "Claude 3 Sonnet", "Claude 3.5 Sonnet", "Claude 3.7 Sonnet", "Other"],
			"Copilot": ["Copilot GPT-4", "Copilot GPT-4o", "Copilot Workspace", "Copilot Chat", "Other"],
			"Stack Overflow": ["Human Answer", "Community Answer", "Accepted Answer", "AI-generated Answer", "Other"],
			"GitHub": [],
			"Other": []
		};

		function renderModelButtons(tool) {
			const container = document.getElementById('modelButtons');
			if (!container) return;
			container.innerHTML = '';

			const models = MODEL_MAP[tool] || [];
			for (const m of models) {
				const btn = document.createElement('button');
				btn.type = 'button';
				btn.className = 'quick-btn model-btn';
				btn.dataset.model = m;
				btn.textContent = m;
				btn.onclick = () => setModel(m);
				container.appendChild(btn);
			}

			const currentModel = (document.getElementById('model')?.value || '').trim();
			if (currentModel) {
				for (const btn of document.querySelectorAll('.model-btn')) {
					btn.classList.toggle('selected', btn.dataset.model === currentModel);
				}
			}
		}

		function setTool(t) {
			document.getElementById('tool').value = t;

			for (const btn of document.querySelectorAll('.tool-btn')) {
				btn.classList.toggle('selected', btn.dataset.tool === t);
			}

			renderModelButtons(t);
		}

		function setModel(m) {
			const modelEl = document.getElementById('model');
			if (modelEl) {
				if (m === 'Other') {
					modelEl.value = '';
					modelEl.placeholder = 'Other';
				} else {
					modelEl.value = m;
					modelEl.placeholder = '';
				}
			}

			for (const btn of document.querySelectorAll('.model-btn')) {
				btn.classList.toggle('selected', btn.dataset.model === m);
			}
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

		window.addEventListener('keydown', (e) => {
			if (e && e.key === 'Escape') {
				cancel();
			}
		});

		window.addEventListener('DOMContentLoaded', () => {
			const initialTool = "${tool}" || "ChatGPT";
			setTool(initialTool);
			const initialModel = "${model}" || "";
			if (initialModel) {
				setModel(initialModel);
			}
		});
	</script>

	</body>
	</html>
	`;
}

