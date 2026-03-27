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
const sourcePasteModel_1 = require("./sourcePasteModel");
function buildHoverMessage(recordedAt, source, reason, range) {
    const payload = {
        Source: source,
        Time: (0, sourcePasteModel_1.formatTime)(recordedAt),
        Reason: reason || '(none)',
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
class SourceMarkers {
    decorationType;
    model;
    modelListener;
    constructor(model) {
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
    dispose() {
        this.modelListener.dispose();
        this.decorationType.dispose();
    }
    refreshEditor(editor) {
        const pastes = this.model.getPastes(editor.document.uri);
        const options = pastes.map((p) => ({
            range: p.range,
            hoverMessage: buildHoverMessage(p.recordedAt, p.source, p.reason, p.range),
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