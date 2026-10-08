
// --- SSE Real-time Stream Addition ---
const { eventBus } = require('../engine/eventBus');

if (typeof router !== 'undefined') {
  router.get('/orchestration/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    const onEvent = (payload) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    if (eventBus && typeof eventBus.on === 'function') {
      eventBus.on('emit', onEvent);
    }

    req.on('close', () => {
      if (eventBus && typeof eventBus.off === 'function') {
        eventBus.off('emit', onEvent);
      }
      res.end();
    });
  });
}
