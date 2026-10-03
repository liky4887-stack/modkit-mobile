# Backend Patches

## toolsProxy.js

Exposes /tools/* on the Express bridge (port 8790). Proxies to the Python sidecar at 127.0.0.1:8792.

### Destination

    ~/sovereign-factory/apps/backend/dist/packages/core/src/termux-server/routes/toolsProxy.js

### TermuxBridgeServer.js changes

File:

    ~/sovereign-factory/apps/backend/dist/packages/core/src/termux-server/TermuxBridgeServer.js

Add require after executeCommand require:

    const executeCommand_1 = __importDefault(require("./routes/executeCommand"));
    const toolsProxy_1 = __importDefault(require("./routes/toolsProxy"));

Add mount after executeCommand mount:

    this.app.use(executeCommand_1.default);
    this.app.use(toolsProxy_1.default);

Restart backend. Verify:

    curl -s http://127.0.0.1:8790/tools/health
