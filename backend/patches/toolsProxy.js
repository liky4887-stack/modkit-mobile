"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const http_1 = require("http");
const router = (0, express_1.Router)();
const SIDECAR_HOST = '127.0.0.1';
const SIDECAR_PORT = 8792;

function proxy(path, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body || {});
        const req = http_1.request({
            hostname: SIDECAR_HOST,
            port: SIDECAR_PORT,
            path,
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(data),
            },
        }, (res) => {
            let acc = '';
            res.on('data', (c) => acc += c);
            res.on('end', () => resolve({ status: res.statusCode || 200, body: acc }));
        });
        req.on('error', reject);
        req.setTimeout(120000, () => { req.destroy(new Error('sidecar timeout')); });
        req.write(data);
        req.end();
    });
}

// GET /tools/health, /tools/list
router.get('/tools/health', async (_req, res) => {
    try {
        const r = await proxy('/health', {});
        res.status(r.status).type('application/json').send(r.body);
    } catch (e) {
        res.status(502).json({ ok: false, error: 'sidecar: ' + e.message });
    }
});

router.get('/tools/list', async (_req, res) => {
    try {
        const r = await proxy('/tools', {});
        res.status(r.status).type('application/json').send(r.body);
    } catch (e) {
        res.status(502).json({ ok: false, error: 'sidecar: ' + e.message });
    }
});

router.get('/tools/loaded', async (_req, res) => {
    try {
        const r = await proxy('/loaded', {});
        res.status(r.status).type('application/json').send(r.body);
    } catch (e) {
        res.status(502).json({ ok: false, error: 'sidecar: ' + e.message });
    }
});

// POST /tools/load { apk_path }
router.post('/tools/load', async (req, res) => {
    try {
        const r = await proxy('/load', req.body || {});
        res.status(r.status).type('application/json').send(r.body);
    } catch (e) {
        res.status(502).json({ ok: false, error: 'sidecar: ' + e.message });
    }
});

// POST /tools/:name { ...args } → /tool/:name
router.post('/tools/:name', async (req, res) => {
    const name = req.params.name;
    try {
        const r = await proxy('/tool/' + name, req.body || {});
        res.status(r.status).type('application/json').send(r.body);
    } catch (e) {
        res.status(502).json({ ok: false, error: 'sidecar: ' + e.message });
    }
});

exports.default = router;
