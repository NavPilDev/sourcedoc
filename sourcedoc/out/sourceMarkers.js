"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SourceMarkers = void 0;
const vscode = __importStar(require("vscode"));
const DUMMY_PROMPT_HISTORY = 'Prior session prompts would appear here for attribution and research workflows.';
const MIN_PASTE_CHARS = 25;
const MIN_MULTILINE_CHARS = 3;
function looksLikePaste(text) {
    if (!text) {
        return false;
    }
    if (text.length >= MIN_PASTE_CHARS) {
        return true;
    }
    return text.includes('\n') && text.length >= MIN_MULTILINE_CHARS;
}
function formatTime(d) {
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
}
function buildHoverMessage(recordedAt) {
    const payload = {
        Source: 'Human Copy-Paste (Stack Overflow)',
        Time: formatTime(recordedAt),
        'Prompt History': DUMMY_PROMPT_HISTORY,
    };
    const ms = new vscode.MarkdownString();
    ms.appendCodeblock(JSON.stringify(payload, null, 2), 'json');
    ms.isTrusted = true;
    return ms;
}
function insertedRangeForChange(document, change) {
    const start = document.positionAt(change.rangeOffset);
    const end = document.positionAt(change.rangeOffset + change.text.length);
    return new vscode.Range(start, end);
}
function toWholeLineRange(document, range) {
    const startLine = range.start.line;
    const endLine = range.end.line;
    return new vscode.Range(new vscode.Position(startLine, 0), document.lineAt(endLine).range.end);
}
function shouldTrackDocument(document) {
    return document.uri.scheme === 'file' || document.uri.scheme === 'untitled';
}
class SourceMarkers {
    decorationType;
    pastesByUri = new Map();
    constructor() {
        this.decorationType = vscode.window.createTextEditorDecorationType({
            isWholeLine: true,
            backgroundColor: 'rgba(80, 200, 255, 0.12)',
            overviewRulerColor: 'rgba(80, 200, 255, 0.45)',
            overviewRulerLane: vscode.OverviewRulerLane.Left,
        });
    }
    dispose() {
        this.decorationType.dispose();
    }
    handleDocumentChange(event) {
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
            this.refreshEditorsForDocument(document.uri);
        }
    }
    refreshEditor(editor) {
        const key = editor.document.uri.toString();
        const pastes = this.pastesByUri.get(key);
        const options = (pastes ?? []).map((p) => ({
            range: p.range,
            hoverMessage: buildHoverMessage(p.recordedAt),
        }));
        editor.setDecorations(this.decorationType, options);
    }
    refreshEditorsForDocument(uri) {
        for (const editor of vscode.window.visibleTextEditors) {
            if (editor.document.uri.toString() === uri.toString()) {
                this.refreshEditor(editor);
            }
        }
    }
    refreshAllVisibleEditors() {
        for (const editor of vscode.window.visibleTextEditors) {
            this.refreshEditor(editor);
        }
    }
}
exports.SourceMarkers = SourceMarkers;
//# sourceMappingURL=sourceMarkers.js.map