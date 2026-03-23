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
const logSink_1 = require("./logSink");
const attribution_1 = require("./attribution");
const pasteObserver_1 = require("./pasteObserver");
const cursorHooks_1 = require("./cursorHooks");
const editTracker_1 = require("./editTracker");
const inlineOriginView_1 = require("./inlineOriginView");
const config_1 = require("./config");
function activate(context) {
    const output = vscode.window.createOutputChannel('SourceDoc');
    output.appendLine('SourceDoc: tracking enabled (see settings: sourcedoc.*).');
    const log = (0, logSink_1.createLogSink)(output);
    const store = new attribution_1.DocumentOriginStore();
    const pasteBuffer = new pasteObserver_1.PasteSignalBuffer(log);
    const cursorHooks = new cursorHooks_1.CursorHooks(context, (0, config_1.getSourcedocConfig)().enableCursorHooks);
    context.subscriptions.push(cursorHooks);
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('sourcedoc.enableCursorHooks')) {
            cursorHooks.setEnabled((0, config_1.getSourcedocConfig)().enableCursorHooks);
        }
    }));
    const inlineView = new inlineOriginView_1.InlineOriginView(store);
    inlineView.register(context);
    context.subscriptions.push(inlineView);
    context.subscriptions.push((0, pasteObserver_1.registerPasteObserver)(log, pasteBuffer));
    (0, editTracker_1.registerEditTracker)(context, log, store, pasteBuffer, cursorHooks, () => inlineView.refresh());
    context.subscriptions.push(vscode.commands.registerCommand('sourcedoc.source', () => {
        vscode.window.showInformationMessage('SourceDoc: use Output panel "SourceDoc" for JSONL edit logs.');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('sourcedoc.generate', async () => {
        const answer = await vscode.window.showInformationMessage('SourceDoc: documentation generation is not implemented yet.', 'OK');
        if (answer === 'OK') {
            output.show(true);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('sourcedoc.toggleDecorations', async () => {
        const c = vscode.workspace.getConfiguration('sourcedoc');
        const cur = c.get('showDecorations', true);
        await c.update('showDecorations', !cur, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`SourceDoc: inline decorations ${!cur ? 'on' : 'off'}`);
        inlineView.refresh();
    }));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map