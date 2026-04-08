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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const sourcePasteModel_1 = require("./sourcePasteModel");
const sourceMarkers_1 = require("./sourceMarkers");
const sourceWebviewViewProvider_1 = require("./sourceWebviewViewProvider");
const aiAnnotationModal_1 = require("./ui/aiAnnotationModal");
function overlaps(a, b) {
    return a.intersection(b) !== undefined;
}
function describePaste(p) {
    const start = p.range.start.line + 1;
    const end = p.range.end.line + 1;
    const lines = start === end ? `Line ${start}` : `Lines ${start}–${end}`;
    return `${lines} • ${p.source}`;
}
function activate(context) {
    const model = new sourcePasteModel_1.SourcePasteModel();
    context.subscriptions.push(model);
    void model.loadPersistedData();
    const markers = new sourceMarkers_1.SourceMarkers(model);
    context.subscriptions.push(markers);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('sourcedoc.sourcePanel', new sourceWebviewViewProvider_1.SourceWebviewViewProvider(context.extensionUri, model), { webviewOptions: { retainContextWhenHidden: true } }));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((e) => {
        model.handleDocumentChange(e);
    }));
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
            markers.refreshEditor(editor);
        }
    }));
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((doc) => {
        const editor = vscode.window.visibleTextEditors.find((ed) => ed.document.uri.toString() === doc.uri.toString());
        if (editor) {
            markers.refreshEditor(editor);
        }
    }));
    markers.refreshAllVisibleEditors();
    context.subscriptions.push(vscode.commands.registerCommand('sourcedoc.source', () => {
        vscode.window.showInformationMessage('SourceDoc: paste tracking is active; paste code to record line sourcing.');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('sourcedoc.generate', () => {
        vscode.window.showInformationMessage('SourceDoc: documentation generation is not implemented in Version 1.');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('sourcedoc.annotateSelection', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const selection = editor.selection;
        if (selection.isEmpty) {
            vscode.window.showWarningMessage('Select code first.');
            return;
        }
        const uri = editor.document.uri;
        const candidates = model.getPastes(uri).filter((p) => overlaps(p.range, selection));
        if (candidates.length === 0) {
            vscode.window.showWarningMessage('No tracked paste block overlaps your selection.');
            return;
        }
        let target = candidates[0];
        if (candidates.length > 1) {
            const picked = await vscode.window.showQuickPick(candidates.map((p) => ({ label: describePaste(p), id: p.id })), { title: 'Choose a paste block to annotate', ignoreFocusOut: true });
            if (!picked) {
                return;
            }
            const found = candidates.find((p) => p.id === picked.id);
            if (!found) {
                return;
            }
            target = found;
        }
        const ai = await (0, aiAnnotationModal_1.openAiAnnotationModal)(target.ai);
        if (!ai) {
            return;
        }
        model.updateAiMetadataById(uri, target.id, ai);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('sourcedoc.annotateExisting', async (pasteId) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !pasteId) {
            return;
        }
        const uri = editor.document.uri;
        const paste = model.getPasteById(uri, pasteId);
        if (!paste) {
            return;
        }
        const ai = await (0, aiAnnotationModal_1.openAiAnnotationModal)(paste.ai);
        if (!ai) {
            return;
        }
        model.updateAiMetadataById(uri, pasteId, ai);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('sourcedoc.deleteAnnotation', async (pasteId) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !pasteId) {
            return;
        }
        model.clearAiMetadataById(editor.document.uri, pasteId);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('sourcedoc.clearAnnotationsInFile', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        model.clearAiMetadataForUri(editor.document.uri);
    }));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map