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
exports.registerEditTracker = registerEditTracker;
/**
 * Proven: edit kind/reason from VS Code; paste when paste provider fired recently or clipboard matched insert text.
 * Heuristic: large single insert → heuristic_ai_like (low confidence). Cursor model/prompt only via CursorHooks when implemented.
 */
const vscode = __importStar(require("vscode"));
const types_1 = require("./types");
const attribution_1 = require("./attribution");
const config_1 = require("./config");
const rangeMap_1 = require("./rangeMap");
const SKIP_SCHEMES = new Set(['vscode', 'output', 'git', 'vscode-userdata']);
function shouldTrackDocument(doc) {
    if (SKIP_SCHEMES.has(doc.uri.scheme)) {
        return false;
    }
    if (doc.uri.scheme !== 'file' && doc.uri.scheme !== 'untitled') {
        return false;
    }
    const cfg = (0, config_1.getSourcedocConfig)();
    const len = doc.getText().length;
    if (len > cfg.maxFileSizeKb * 1024) {
        return false;
    }
    return true;
}
function truncatePreview(text, max) {
    if (text.length === 0) {
        return { preview: null, truncated: false };
    }
    if (text.length <= max) {
        return { preview: text, truncated: false };
    }
    return { preview: text.slice(0, max), truncated: true };
}
/** Final [start,end) offsets for inserted text after all changes in the transaction. */
function finalInsertOffsets(change, changeIndex, allChanges) {
    if (change.text.length === 0) {
        return undefined;
    }
    let start = change.rangeOffset;
    let end = change.rangeOffset + change.text.length;
    const rest = allChanges.slice(changeIndex + 1);
    for (const ch of rest) {
        const m = (0, rangeMap_1.mapRangeOffsetsThroughChange)(start, end, ch);
        if (!m) {
            return undefined;
        }
        start = m.start;
        end = m.end;
    }
    return { start, end };
}
function registerEditTracker(context, log, store, pasteBuffer, cursorHooks, onRefreshDecorations) {
    const sub = vscode.workspace.onDidChangeTextDocument(async (event) => {
        const cfg = (0, config_1.getSourcedocConfig)();
        if (!cfg.enabled) {
            return;
        }
        const doc = event.document;
        if (!shouldTrackDocument(doc)) {
            return;
        }
        const uri = doc.uri;
        const changes = event.contentChanges;
        store.remapAfterChanges(uri, changes, doc);
        const changeReason = (0, attribution_1.changeReasonFromEvent)(event.reason);
        const now = Date.now();
        for (let i = 0; i < changes.length; i++) {
            const change = changes[i];
            const editKind = (0, attribution_1.classifyEditKind)(change);
            const { preview: insertedTextPreview, truncated: insertedTextTruncated } = truncatePreview(change.text, cfg.maxSnippetLength);
            const editEv = {
                v: types_1.LOG_SCHEMA_VERSION,
                ts: now,
                type: 'edit',
                uri: uri.toString(),
                languageId: doc.languageId,
                documentVersion: doc.version,
                changeReason,
                editKind,
                range: {
                    start: { line: change.range.start.line, character: change.range.start.character },
                    end: { line: change.range.end.line, character: change.range.end.character },
                },
                insertedTextPreview: insertedTextPreview,
                insertedTextTruncated,
                deletedLength: change.rangeLength,
            };
            log.append(editEv);
            if (editKind !== 'insert' || change.text.length === 0) {
                continue;
            }
            let clipboardMatchesInsert = false;
            try {
                const clip = await vscode.env.clipboard.readText();
                clipboardMatchesInsert = clip.length > 0 && clip === change.text;
            }
            catch {
                clipboardMatchesInsert = false;
            }
            const finalOff = finalInsertOffsets(change, i, changes);
            if (!finalOff) {
                continue;
            }
            const range = (0, rangeMap_1.offsetsToRange)(doc, finalOff.start, finalOff.end);
            const startOffset = doc.offsetAt(range.start);
            const endOffset = doc.offsetAt(range.end);
            const cursorEnrichment = cursorHooks.tryEnrichment(uri, range);
            const resolved = (0, attribution_1.resolveOrigin)({
                changeReason,
                editKind,
                insertedText: change.text,
                pasteSignals: [...pasteBuffer.getSignals()],
                documentUri: uri,
                now,
                pasteWindowMs: cfg.pasteCorrelationWindowMs,
                clipboardMatchesInsert,
                cursor: cursorEnrichment,
            });
            const ar = {
                uri: uri.toString(),
                range,
                startOffset,
                endOffset,
                origin: resolved.origin,
                confidence: resolved.confidence,
                method: resolved.method,
                model: resolved.model,
                prompt: resolved.prompt,
            };
            store.recordRange(ar);
            log.append((0, attribution_1.buildAttributionEvent)(uri, range, resolved.origin, resolved.confidence, resolved.method, resolved.model, resolved.prompt));
        }
        onRefreshDecorations();
    });
    context.subscriptions.push(sub);
    return sub;
}
//# sourceMappingURL=editTracker.js.map