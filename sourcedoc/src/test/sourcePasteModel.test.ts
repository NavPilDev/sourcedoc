import * as assert from 'assert';
import * as vscode from 'vscode';
import { __test } from '../sourcePasteModel';

suite('SourcePasteModel range transform', () => {
	test('insertion at end boundary does not expand block', () => {
		const original = new vscode.Range(new vscode.Position(2, 0), new vscode.Position(4, 10));
		const change = {
			range: new vscode.Range(new vscode.Position(4, 10), new vscode.Position(4, 10)),
			text: '\n',
		} as vscode.TextDocumentContentChangeEvent;

		const next = __test.transformRange(original, change);
		assert.ok(next);
		assert.strictEqual(next?.end.line, 4);
		assert.strictEqual(next?.end.character, 10);
	});

	test('insert before block shifts bounds', () => {
		const original = new vscode.Range(new vscode.Position(5, 0), new vscode.Position(7, 4));
		const change = {
			range: new vscode.Range(new vscode.Position(2, 0), new vscode.Position(2, 0)),
			text: '\n\n',
		} as vscode.TextDocumentContentChangeEvent;

		const next = __test.transformRange(original, change);
		assert.ok(next);
		assert.strictEqual(next?.start.line, 7);
		assert.strictEqual(next?.end.line, 9);
	});

	test('overlap helper detects in-block edits', () => {
		const block = new vscode.Range(new vscode.Position(10, 0), new vscode.Position(14, 0));
		const editInside = new vscode.Range(new vscode.Position(12, 2), new vscode.Position(12, 5));
		const editOutside = new vscode.Range(new vscode.Position(20, 0), new vscode.Position(20, 1));
		assert.strictEqual(__test.rangesOverlap(block, editInside), true);
		assert.strictEqual(__test.rangesOverlap(block, editOutside), false);
	});

	test('typing-like edit helper rejects small single-line typing', () => {
		const typingEdit = {
			rangeLength: 0,
			text: 'a',
		} as vscode.TextDocumentContentChangeEvent;
		const multiLinePaste = {
			rangeLength: 0,
			text: 'line1\nline2',
		} as vscode.TextDocumentContentChangeEvent;
		assert.strictEqual(__test.isLikelyTypingLikeEdit(typingEdit), true);
		assert.strictEqual(__test.isLikelyTypingLikeEdit(multiLinePaste), false);
	});

	test('delete by id removes only target block', () => {
		const a = {
			id: 'a',
			range: new vscode.Range(new vscode.Position(1, 0), new vscode.Position(2, 0)),
			recordedAt: new Date(),
			source: 'Stack Overflow',
			reason: '',
		};
		const b = {
			id: 'b',
			range: new vscode.Range(new vscode.Position(3, 0), new vscode.Position(4, 0)),
			recordedAt: new Date(),
			source: 'Github',
			reason: '',
		};
		const next = __test.deletePasteByIdFromList([a, b], 'a');
		assert.strictEqual(next.length, 1);
		assert.strictEqual(next[0]?.id, 'b');
	});

	test('delete by unknown id is no-op', () => {
		const a = {
			id: 'a',
			range: new vscode.Range(new vscode.Position(1, 0), new vscode.Position(2, 0)),
			recordedAt: new Date(),
			source: 'Stack Overflow',
			reason: '',
		};
		const next = __test.deletePasteByIdFromList([a], 'missing');
		assert.strictEqual(next.length, 1);
		assert.strictEqual(next[0]?.id, 'a');
	});

	test('clear all returns empty list', () => {
		const cleared = __test.clearPastesFromList();
		assert.strictEqual(cleared.length, 0);
	});
});
