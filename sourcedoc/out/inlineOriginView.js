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
exports.InlineOriginView = void 0;
const vscode = __importStar(require("vscode"));
const config_1 = require("./config");
function rulerThemeColor(origin) {
    switch (origin) {
        case 'paste':
            return 'charts.blue';
        case 'human':
            return 'charts.green';
        case 'undo_redo':
            return 'charts.orange';
        case 'heuristic_ai_like':
        case 'cursor_ai':
            return 'charts.purple';
        default:
            return 'editorOverviewRuler.infoForeground';
    }
}
class InlineOriginView {
    _store;
    _byOrigin = new Map();
    _debounce;
    constructor(_store) {
        this._store = _store;
        const origins = [
            'human',
            'paste',
            'undo_redo',
            'heuristic_ai_like',
            'cursor_ai',
            'unknown',
        ];
        for (const o of origins) {
            this._byOrigin.set(o, vscode.window.createTextEditorDecorationType({
                isWholeLine: true,
                overviewRulerLane: vscode.OverviewRulerLane.Left,
                overviewRulerColor: new vscode.ThemeColor(rulerThemeColor(o)),
            }));
        }
    }
    refresh = () => {
        const cfg = (0, config_1.getSourcedocConfig)();
        if (!cfg.showDecorations) {
            this._clearAllEditors();
            return;
        }
        if (this._debounce) {
            clearTimeout(this._debounce);
        }
        this._debounce = setTimeout(() => {
            this._debounce = undefined;
            this._apply();
        }, cfg.decorationsDebounceMs);
    };
    _clearAllEditors() {
        for (const editor of vscode.window.visibleTextEditors) {
            this._clearEditor(editor);
        }
    }
    _clearEditor(editor) {
        for (const t of this._byOrigin.values()) {
            editor.setDecorations(t, []);
        }
    }
    _apply() {
        const cfg = (0, config_1.getSourcedocConfig)();
        if (!cfg.showDecorations) {
            return;
        }
        for (const editor of vscode.window.visibleTextEditors) {
            const uri = editor.document.uri;
            const ranges = this._store.getRanges(uri);
            this._clearEditor(editor);
            const buckets = new Map();
            for (const ar of ranges) {
                const list = buckets.get(ar.origin) ?? [];
                list.push(ar.range);
                buckets.set(ar.origin, list);
            }
            for (const [origin, rs] of buckets) {
                const t = this._byOrigin.get(origin);
                if (t) {
                    editor.setDecorations(t, rs);
                }
            }
        }
    }
    register(context) {
        context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => this.refresh()), vscode.window.onDidChangeVisibleTextEditors(() => this.refresh()), vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('sourcedoc')) {
                this.refresh();
            }
        }));
    }
    dispose() {
        if (this._debounce) {
            clearTimeout(this._debounce);
        }
        for (const t of this._byOrigin.values()) {
            t.dispose();
        }
        this._byOrigin.clear();
    }
}
exports.InlineOriginView = InlineOriginView;
//# sourceMappingURL=inlineOriginView.js.map