"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLogSink = createLogSink;
function createLogSink(channel) {
    return {
        append(event) {
            channel.appendLine(JSON.stringify(event));
        },
        dispose() {
            channel.dispose();
        },
    };
}
//# sourceMappingURL=logSink.js.map