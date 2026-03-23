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
exports.PasteSignalBuffer = void 0;
exports.registerPasteObserver = registerPasteObserver;
const vscode = __importStar(require("vscode"));
const types_1 = require("./types");
const config_1 = require("./config");
class PasteSignalBuffer {
    _log;
    _signals = [];
    _maxBuffer = 32;
    constructor(_log) {
        this._log = _log;
    }
    async recordFromPaste(uri, triggerKind, dataTransfer, maxSnippet) {
        const item = dataTransfer.get('text/plain');
        let snippet = '';
        if (item) {
            try {
                snippet = await item.asString();
            }
            catch {
                snippet = '';
            }
        }
        const ts = Date.now();
        const sig = {
            uri: uri.toString(),
            ts,
            triggerKind: triggerKind === vscode.DocumentPasteTriggerKind.PasteAs ? 'paste_as' : 'normal',
            snippet,
        };
        this._signals.push(sig);
        if (this._signals.length > this._maxBuffer) {
            this._signals.splice(0, this._signals.length - this._maxBuffer);
        }
        const truncated = snippet.length > maxSnippet;
        const preview = truncated ? snippet.slice(0, maxSnippet) : snippet;
        const ev = {
            v: types_1.LOG_SCHEMA_VERSION,
            ts,
            type: 'paste_signal',
            uri: uri.toString(),
            triggerKind: sig.triggerKind,
            snippetPreview: preview || null,
            snippetTruncated: truncated,
        };
        this._log.append(ev);
    }
    /** Signals used for correlation; caller filters by URI and time. */
    getSignals() {
        return this._signals;
    }
    dispose() {
        this._signals.length = 0;
    }
}
exports.PasteSignalBuffer = PasteSignalBuffer;
function registerPasteObserver(log, buffer) {
    const provider = {
        async provideDocumentPasteEdits(document, ranges, dataTransfer, ctx, _token) {
            if (!(0, config_1.getSourcedocConfig)().enabled) {
                return undefined;
            }
            const maxSnippet = (0, config_1.getSourcedocConfig)().maxSnippetLength;
            await buffer.recordFromPaste(document.uri, ctx.triggerKind, dataTransfer, maxSnippet);
            // Do not replace default paste; observation only.
            return undefined;
        },
    };
    const metadata = {
        providedPasteEditKinds: [vscode.DocumentDropOrPasteEditKind.Text],
        pasteMimeTypes: ['text/plain'],
    };
    return vscode.languages.registerDocumentPasteEditProvider([{ scheme: 'file' }, { scheme: 'untitled' }], provider, metadata);
}
//# sourceMappingURL=pasteObserver.js.map