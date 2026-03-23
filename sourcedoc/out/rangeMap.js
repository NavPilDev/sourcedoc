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
exports.mapOffsetThroughChange = mapOffsetThroughChange;
exports.mapRangeOffsetsThroughChange = mapRangeOffsetsThroughChange;
exports.mapAnnotatedOffsetsThroughChanges = mapAnnotatedOffsetsThroughChanges;
exports.offsetsToRange = offsetsToRange;
const vscode = __importStar(require("vscode"));
/**
 * Map a single offset from the document state before `change` to after the change.
 * Offsets are 0-based character indices in the pre-change document string.
 * Returns null if the offset falls inside a deleted span with no replacement text.
 */
function mapOffsetThroughChange(offset, change) {
    const { rangeOffset, rangeLength, text } = change;
    const repEnd = rangeOffset + rangeLength;
    if (rangeLength === 0) {
        // Pure insert at rangeOffset
        if (offset < rangeOffset) {
            return offset;
        }
        if (offset > rangeOffset) {
            return offset + text.length;
        }
        return rangeOffset;
    }
    if (offset < rangeOffset) {
        return offset;
    }
    if (offset >= repEnd) {
        return offset + text.length - rangeLength;
    }
    // offset in [rangeOffset, repEnd)
    if (text.length === 0) {
        return null;
    }
    return rangeOffset + Math.min(offset - rangeOffset, text.length);
}
/**
 * Map a [start, end) offset pair; drops ranges that overlap the replaced region.
 */
function mapRangeOffsetsThroughChange(start, end, change) {
    const { rangeOffset, rangeLength } = change;
    const repEnd = rangeOffset + rangeLength;
    if (end <= rangeOffset || start >= repEnd) {
        const s = mapOffsetThroughChange(start, change);
        const e = mapOffsetThroughChange(end, change);
        if (s === null || e === null || s > e) {
            return undefined;
        }
        return { start: s, end: e };
    }
    return undefined;
}
function mapAnnotatedOffsetsThroughChanges(start, end, changes) {
    let cur = { start, end };
    for (const ch of changes) {
        const next = mapRangeOffsetsThroughChange(cur.start, cur.end, ch);
        if (!next) {
            return undefined;
        }
        cur = next;
    }
    return cur;
}
function offsetsToRange(document, start, end) {
    return new vscode.Range(document.positionAt(start), document.positionAt(end));
}
//# sourceMappingURL=rangeMap.js.map