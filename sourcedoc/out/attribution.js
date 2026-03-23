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
exports.DocumentOriginStore = void 0;
exports.changeReasonFromEvent = changeReasonFromEvent;
exports.classifyEditKind = classifyEditKind;
exports.lineCol = lineCol;
exports.heuristicBulkInsert = heuristicBulkInsert;
exports.resolveOrigin = resolveOrigin;
exports.buildAttributionEvent = buildAttributionEvent;
const vscode = __importStar(require("vscode"));
const types_1 = require("./types");
const rangeMap_1 = require("./rangeMap");
const BULK_LINE_THRESHOLD = 3;
const BULK_CHAR_THRESHOLD = 500;
class DocumentOriginStore {
    _byUri = new Map();
    recordRange(ar) {
        const key = ar.uri;
        const list = this._byUri.get(key) ?? [];
        const next = list.filter((x) => !rangesOverlapOffsets(x.startOffset, x.endOffset, ar.startOffset, ar.endOffset));
        next.push(ar);
        this._byUri.set(key, next);
    }
    getRanges(uri) {
        return this._byUri.get(uri.toString()) ?? [];
    }
    clearUri(uri) {
        this._byUri.delete(uri.toString());
    }
    /**
     * Remap stored offsets through a batch of edits (e.g. one onDidChangeTextDocument).
     * Stored offsets are in pre-transaction coordinates; `document` is post-transaction.
     */
    remapAfterChanges(uri, changes, document) {
        const key = uri.toString();
        const list = this._byUri.get(key);
        if (!list?.length) {
            return;
        }
        const next = [];
        for (const ar of list) {
            const mapped = (0, rangeMap_1.mapAnnotatedOffsetsThroughChanges)(ar.startOffset, ar.endOffset, changes);
            if (!mapped) {
                continue;
            }
            next.push({
                ...ar,
                startOffset: mapped.start,
                endOffset: mapped.end,
                range: (0, rangeMap_1.offsetsToRange)(document, mapped.start, mapped.end),
            });
        }
        this._byUri.set(key, next);
    }
}
exports.DocumentOriginStore = DocumentOriginStore;
function rangesOverlapOffsets(a0, a1, b0, b1) {
    return !(a1 <= b0 || b1 <= a0);
}
function changeReasonFromEvent(reason) {
    if (reason === vscode.TextDocumentChangeReason.Undo) {
        return 'undo';
    }
    if (reason === vscode.TextDocumentChangeReason.Redo) {
        return 'redo';
    }
    return 'unknown';
}
function classifyEditKind(change) {
    const del = change.rangeLength;
    const ins = change.text.length;
    if (del > 0 && ins > 0) {
        return 'replace';
    }
    if (del > 0 && ins === 0) {
        return 'delete';
    }
    return 'insert';
}
function lineCol(p) {
    return { line: p.line, character: p.character };
}
function countNewlines(s) {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
        if (s.charCodeAt(i) === 10) {
            n++;
        }
    }
    return n;
}
function heuristicBulkInsert(text) {
    return countNewlines(text) >= BULK_LINE_THRESHOLD || text.length >= BULK_CHAR_THRESHOLD;
}
function resolveOrigin(params) {
    if (params.changeReason === 'undo' || params.changeReason === 'redo') {
        return { origin: 'undo_redo', confidence: 0.9, method: 'document_change' };
    }
    if (params.cursor?.model || params.cursor?.prompt) {
        return {
            origin: 'cursor_ai',
            confidence: 0.85,
            method: 'cursor_hook',
            model: params.cursor.model,
            prompt: params.cursor.prompt,
        };
    }
    if (params.editKind === 'insert' && params.insertedText !== undefined) {
        const recentPaste = params.pasteSignals.find((s) => s.uri === params.documentUri.toString() && params.now - s.ts <= params.pasteWindowMs);
        if (recentPaste) {
            return { origin: 'paste', confidence: 0.75, method: 'paste_provider' };
        }
        if (params.clipboardMatchesInsert) {
            return { origin: 'paste', confidence: 0.55, method: 'clipboard_match' };
        }
        if (heuristicBulkInsert(params.insertedText)) {
            return { origin: 'heuristic_ai_like', confidence: 0.25, method: 'heuristic_bulk_insert' };
        }
    }
    return { origin: 'human', confidence: 0.5, method: 'document_change' };
}
function buildAttributionEvent(uri, range, origin, confidence, method, model, prompt) {
    return {
        v: types_1.LOG_SCHEMA_VERSION,
        ts: Date.now(),
        type: 'attribution',
        uri: uri.toString(),
        origin,
        confidence,
        method,
        model,
        prompt,
        range: { start: lineCol(range.start), end: lineCol(range.end) },
    };
}
//# sourceMappingURL=attribution.js.map