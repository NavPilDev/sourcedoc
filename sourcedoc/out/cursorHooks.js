"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CursorHooks = void 0;
/**
 * Optional Cursor-specific enrichment. Public VS Code does not expose agent model/prompt
 * to arbitrary extensions; this stays inert until Cursor documents a supported hook.
 * TODO: Wire to official Cursor extension APIs when available (behind sourcedoc.enableCursorHooks).
 */
class CursorHooks {
    _ctx;
    _enabled;
    constructor(_ctx, _enabled) {
        this._ctx = _ctx;
        this._enabled = _enabled;
    }
    setEnabled(enabled) {
        this._enabled = enabled;
    }
    /**
     * Best-effort enrichment for a document range after an edit. Returns undefined when disabled or unavailable.
     */
    tryEnrichment(_documentUri, _range) {
        if (!this._enabled) {
            return undefined;
        }
        return undefined;
    }
    dispose() {
        // Reserved for future Cursor command subscriptions.
    }
}
exports.CursorHooks = CursorHooks;
//# sourceMappingURL=cursorHooks.js.map