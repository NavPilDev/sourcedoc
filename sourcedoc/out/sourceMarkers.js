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
function escapeMarkdown(text) {
    return text.replace(/[`*_{}[\]()#+\-.!]/g, '\\$&');
}
function truncate(text, max = 200) {
    if (!text)
        return '';
    return text.length > max ? text.slice(0, max) + '...' : text;
}
function buildHoverMessage(annotation) {
    const lines = [];
    lines.push(`**AI Annotation**`);
    lines.push(`**Time:** ${(0, sourcePasteModel_1.formatTime)(annotation.recordedAt)}`);
    if (annotation.source.tool) {
        lines.push(`**Tool:** ${escapeMarkdown(annotation.source.tool)}`);
    }
    if (annotation.source.model) {
        lines.push(`**Model:** ${escapeMarkdown(annotation.source.model)}`);
    }
    if (annotation.source.prompt) {
        const safePrompt = escapeMarkdown(truncate(annotation.source.prompt));
        lines.push(`**Prompt:**`);
        lines.push('```');
        lines.push(safePrompt);
        lines.push('```');
    }
    if (annotation.source.notes) {
        lines.push(`**Notes:** ${escapeMarkdown(annotation.source.notes)}`);
    }
    if (annotation.textPreview) {
        lines.push(`---`);
        lines.push(`**Preview:**`);
        lines.push(`\`${escapeMarkdown(annotation.textPreview)}\``);
    }
    lines.push(`---`);
    lines.push(`[Edit Annotation](command:sourcedoc.annotateExisting?${encodeURIComponent(JSON.stringify(annotation.id))})`);
    lines.push(`[Delete Annotation](command:sourcedoc.deleteAnnotation?${encodeURIComponent(JSON.stringify(annotation.id))})`);
    const ms = new vscode.MarkdownString(lines.join('\n\n'));
    ms.isTrusted = true;
    return ms;
}
class SourceMarkers {
    aiDecoration;
    model;
    modelListener;
    autoHide = false;
    revealByUri = new Map();
    constructor(model) {
        this.model = model;
        this.aiDecoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(160, 110, 255, 0.14)',
            overviewRulerColor: 'rgba(160, 110, 255, 0.75)',
            overviewRulerLane: vscode.OverviewRulerLane.Left,
            borderRadius: '3px',
        });
        this.modelListener = model.onDidChange((uri) => {
            this.refreshEditorsForDocument(uri);
        });
    }
    dispose() {
        this.modelListener.dispose();
        this.aiDecoration.dispose();
        for (const entry of this.revealByUri.values()) {
            clearTimeout(entry.timeout);
        }
        this.revealByUri.clear();
    }
    setAutoHide(enabled) {
        this.autoHide = enabled;
        this.refreshAllVisibleEditors();
    }
    revealOnce(uri, range, ms = 1200) {
        const key = uri.toString();
        const prev = this.revealByUri.get(key);
        if (prev) {
            clearTimeout(prev.timeout);
        }
        const timeout = setTimeout(() => {
            this.revealByUri.delete(key);
            this.refreshEditorsForDocument(uri);
        }, ms);
        this.revealByUri.set(key, { range, timeout });
        this.refreshEditorsForDocument(uri);
    }
    refreshEditor(editor) {
        const annotations = this.model.getAnnotations(editor.document.uri);
        let options = [];
        if (!this.autoHide) {
            options = annotations.map((annotation) => ({
                range: annotation.range,
                hoverMessage: buildHoverMessage(annotation),
            }));
        }
        else {
            const revealed = this.revealByUri.get(editor.document.uri.toString());
            if (revealed) {
                options = [
                    {
                        range: revealed.range,
                        hoverMessage: new vscode.MarkdownString('SourceDoc: marker revealed for navigation.', true),
                    },
                ];
            }
        }
        editor.setDecorations(this.aiDecoration, options);
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