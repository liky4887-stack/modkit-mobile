#!/usr/bin/env python3
"""
Modkit Tool Sidecar
Loads an APK once via DexKit + androguard, exposes each analysis
method as a JSON HTTP endpoint. DeepSeek calls these during the
agent loop.

Run:  python ~/modkit-tools/server.py [--port 8792]
APK:  set via POST /load  {"apk_path": "..."}  OR  --apk at boot
"""

import argparse
import json
import os
import sys
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

# Silence androguard + loguru BEFORE importing anything heavy.
try:
    from loguru import logger as _loguru
    _loguru.remove()
except Exception:
    pass
import logging
logging.disable(logging.CRITICAL)

# ── Lazy imports (heavy) ─────────────────────────────────────────
DexKit = None
APK = None

def _load_libs():
    global DexKit, APK
    if DexKit is not None:
        return
    import dexllm as _dexllm
    from androguard.core.apk import APK as _APK
    DexKit = _dexllm.DexKit
    APK = _APK

# ── Global state ─────────────────────────────────────────────────
class State:
    apk_path: str = ""
    dk = None            # DexKit instance
    apk = None           # androguard APK instance
    apk_meta: dict = {}
    loaded_at: float = 0.0
    load_ms: int = 0

STATE = State()

# ── Helpers ──────────────────────────────────────────────────────
MAX_ROWS = 500

def to_descriptor(fqcn: str) -> str:
    """DexKit wants Lx/y/Z; form. Accept dots, slashes, or already-descriptor."""
    if not fqcn:
        return ""
    if fqcn.startswith("L") and fqcn.endswith(";"):
        return fqcn
    return "L" + fqcn.replace(".", "/") + ";"

def to_slash(fqcn: str) -> str:
    """Strip L; wrapper, return com/foo/Bar."""
    if not fqcn:
        return ""
    s = fqcn
    if s.startswith("L") and s.endswith(";"):
        s = s[1:-1]
    return s.replace(".", "/")


def ok(payload: dict) -> dict:
    return {"ok": True, **payload}

def err(msg: str) -> dict:
    return {"ok": False, "error": msg}

def load_apk(apk_path: str) -> dict:
    if not os.path.exists(apk_path):
        return err("apk not found: " + apk_path)
    _load_libs()
    t0 = time.time()

    # androguard: fast manifest-level facts
    try:
        a = APK(apk_path)
        meta = {
            "package": a.get_package(),
            "versionName": a.get_androidversion_name(),
            "versionCode": a.get_androidversion_code(),
            "mainActivity": a.get_main_activity(),
            "permissions": a.get_permissions(),
            "activities": a.get_activities()[:200],
            "services": a.get_services()[:200],
            "receivers": a.get_receivers()[:200],
            "providers": a.get_providers()[:100],
            "file_size": os.path.getsize(apk_path),
        }
    except Exception as e:
        return err("androguard load failed: " + str(e))

    # DexKit: decompiler + search
    try:
        dk = DexKit(apk_path)
    except Exception as e:
        return err("dexkit load failed: " + str(e))

    STATE.apk_path = apk_path
    STATE.apk = a
    STATE.dk = dk
    STATE.apk_meta = meta
    STATE.loaded_at = time.time()
    STATE.load_ms = int((time.time() - t0) * 1000)

    return ok({
        "apk_path": apk_path,
        "load_ms": STATE.load_ms,
        "package": meta["package"],
        "versionName": meta["versionName"],
        "dex_count": int(dk.dex_count()),
        "permission_count": len(meta["permissions"]),
    })

def require_loaded() -> dict | None:
    if STATE.dk is None:
        return err("no APK loaded — POST /load first")
    return None

def _classes(rows, limit=MAX_ROWS):
    """DexKit returns lists of dicts or strings; normalize."""
    out = []
    for r in (rows or [])[:limit]:
        if isinstance(r, dict):
            out.append({k: r[k] for k in ("fqcn", "class_name", "name", "dex") if k in r})
        else:
            out.append(str(r))
    return out

# ── Tool endpoints ───────────────────────────────────────────────
TOOLS = {}

def tool(name):
    def deco(fn):
        TOOLS[name] = fn
        return fn
    return deco

@tool("load")
def t_load(body):
    return load_apk(body.get("apk_path", ""))

@tool("status")
def t_status(body):
    if STATE.dk is None:
        return ok({"loaded": False})
    return ok({
        "loaded": True,
        "apk_path": STATE.apk_path,
        "load_ms": STATE.load_ms,
        "package": STATE.apk_meta.get("package"),
        "versionName": STATE.apk_meta.get("versionName"),
        "dex_count": int(STATE.dk.dex_count()),
    })

@tool("manifest")
def t_manifest(body):
    e = require_loaded()
    if e: return e
    m = STATE.apk_meta
    return ok({
        "package": m["package"],
        "versionName": m["versionName"],
        "versionCode": m["versionCode"],
        "mainActivity": m["mainActivity"],
        "permissions": m["permissions"],
        "activity_count": len(m["activities"]),
        "service_count": len(m["services"]),
        "receiver_count": len(m["receivers"]),
        "provider_count": len(m["providers"]),
    })

@tool("find_classes_by_name")
def t_find_by_name(body):
    e = require_loaded()
    if e: return e
    name = body.get("name", "")
    limit = int(body.get("limit", MAX_ROWS))
    rows = STATE.dk.find_classes_by_name(name)
    return ok({"matches": len(rows), "classes": _classes(rows, limit)})

@tool("find_classes_using_strings")
def t_find_by_strings(body):
    e = require_loaded()
    if e: return e
    strings = body.get("strings", [])
    if not strings:
        return err("strings[] required")
    limit = int(body.get("limit", MAX_ROWS))
    rows = STATE.dk.find_classes_using_strings(strings)
    return ok({"strings": strings, "matches": len(rows), "classes": _classes(rows, limit)})

@tool("find_classes_implementing")
def t_find_impl(body):
    e = require_loaded()
    if e: return e
    iface = body.get("interface", "")
    limit = int(body.get("limit", MAX_ROWS))
    rows = STATE.dk.find_classes_implementing(iface)
    return ok({"interface": iface, "matches": len(rows), "classes": _classes(rows, limit)})

@tool("find_classes_by_super")
def t_find_super(body):
    e = require_loaded()
    if e: return e
    superclass = body.get("super", "")
    limit = int(body.get("limit", MAX_ROWS))
    rows = STATE.dk.find_classes_by_super(superclass)
    return ok({"super": superclass, "matches": len(rows), "classes": _classes(rows, limit)})

@tool("find_methods_using_strings")
def t_find_methods(body):
    e = require_loaded()
    if e: return e
    strings = body.get("strings", [])
    if not strings:
        return err("strings[] required")
    limit = int(body.get("limit", MAX_ROWS))
    rows = STATE.dk.find_methods_using_strings(strings)
    return ok({"strings": strings, "matches": len(rows), "methods": _classes(rows, limit)})

@tool("list_value_strings")
def t_list_value_strings(body):
    e = require_loaded()
    if e: return e
    limit = int(body.get("limit", MAX_ROWS))
    rows = STATE.dk.list_value_strings()
    out = list(rows)[:limit] if rows else []
    return ok({"total": len(rows) if rows else 0, "strings": out})

@tool("list_class_methods")
def t_list_class_methods(body):
    e = require_loaded()
    if e: return e
    fqcn = body.get("fqcn", "")
    if not fqcn:
        return err("fqcn required")
    limit = int(body.get("limit", MAX_ROWS))
    desc = to_descriptor(fqcn)
    rows = STATE.dk.list_class_methods(desc)
    return ok({"fqcn": fqcn, "descriptor": desc, "count": len(rows) if rows else 0, "methods": list(rows)[:limit] if rows else []})

@tool("list_class_strings")
def t_list_class_strings(body):
    e = require_loaded()
    if e: return e
    fqcn = body.get("fqcn", "")
    if not fqcn:
        return err("fqcn required")
    limit = int(body.get("limit", MAX_ROWS))
    desc = to_descriptor(fqcn)
    rows = STATE.dk.list_class_strings(desc)
    out = list(rows)[:limit] if rows else []
    return ok({"fqcn": fqcn, "descriptor": desc, "count": len(rows) if rows else 0, "strings": out})

@tool("decompile_class")
def t_decompile_class(body):
    e = require_loaded()
    if e: return e
    fqcn = body.get("fqcn", "")
    if not fqcn:
        return err("fqcn required")
    desc = to_descriptor(fqcn)
    result = STATE.dk.decompile_class(desc)
    src = ""
    shape = type(result).__name__
    if isinstance(result, str):
        src = result
    elif isinstance(result, dict):
        for k in ("code", "source", "text", "content", "body"):
            v = result.get(k)
            if isinstance(v, str):
                src = v
                break
        if not src:
            src = json.dumps(result, default=str)[:200_000]
    elif result is None:
        src = ""
    else:
        # object with .code / .source / .text
        for attr in ("code", "source", "text", "content", "body"):
            v = getattr(result, attr, None)
            if isinstance(v, str):
                src = v
                break
        if not src:
            src = str(result)
    if len(src) > 200_000:
        src = src[:200_000] + "\n// …truncated…"
    return ok({"fqcn": fqcn, "descriptor": desc, "shape": shape, "chars": len(src), "source": src})

@tool("decompile_method")
def t_decompile_method(body):
    e = require_loaded()
    if e:
        return e
    fqcn = body.get("fqcn", "")
    method = body.get("method", "")
    if not fqcn or not method:
        return err("fqcn and method required")
    src = STATE.dk.decompile_method(fqcn, method)
    s = src if isinstance(src, str) else (src or {}).get("code", str(src))
    if len(s) > 200_000:
        s = s[:200_000] + "\n// …truncated…"
    return ok({"fqcn": fqcn, "method": method, "chars": len(s), "source": s})

@tool("find_call_sites_to")
def t_call_sites_to(body):
    e = require_loaded()
    if e: return e
    fqcn = body.get("fqcn", "")
    method = body.get("method", "")
    limit = int(body.get("limit", MAX_ROWS))
    rows = STATE.dk.find_call_sites_to(fqcn, method) if method else STATE.dk.find_call_sites_to(fqcn)
    return ok({"target": fqcn + ("." + method if method else ""), "matches": len(rows), "call_sites": _classes(rows, limit)})

@tool("find_call_sites_from")
def t_call_sites_from(body):
    e = require_loaded()
    if e: return e
    fqcn = body.get("fqcn", "")
    method = body.get("method", "")
    limit = int(body.get("limit", MAX_ROWS))
    rows = STATE.dk.find_call_sites_from(fqcn, method) if method else STATE.dk.find_call_sites_from(fqcn)
    return ok({"source": fqcn + ("." + method if method else ""), "matches": len(rows), "call_sites": _classes(rows, limit)})

@tool("find_type_references")
def t_type_refs(body):
    e = require_loaded()
    if e: return e
    typename = body.get("type", "")
    limit = int(body.get("limit", MAX_ROWS))
    rows = STATE.dk.find_type_references(typename)
    return ok({"type": typename, "matches": len(rows), "references": _classes(rows, limit)})

@tool("permission_callers")
def t_perm_callers(body):
    e = require_loaded()
    if e: return e
    perms = body.get("permissions", [])
    app_only = bool(body.get("app_only", True))
    result = STATE.dk.permission_callers(perms, app_only=app_only) if perms else STATE.dk.permission_callers(app_only=app_only)
    return ok({"result": result})

@tool("extract_iocs")
def t_iocs(body):
    e = require_loaded()
    if e: return e
    import dexllm as _dexllm
    r = _dexllm.extract_iocs(STATE.dk, with_xref=bool(body.get("with_xref", True)))
    return ok({"iocs": r})

@tool("detect_permissive_tls")
def t_tls(body):
    e = require_loaded()
    if e: return e
    import dexllm as _dexllm
    r = _dexllm.detect_permissive_tls(STATE.dk)
    return ok({"findings": r})

@tool("detect_content_providers")
def t_cp(body):
    e = require_loaded()
    if e: return e
    import dexllm as _dexllm
    r = _dexllm.detect_content_providers(STATE.dk)
    return ok({"providers": r})

@tool("dangerous_permission_api_callers")
def t_danger_callers(body):
    e = require_loaded()
    if e: return e
    import dexllm as _dexllm
    app_only = bool(body.get("app_only", True))
    r = _dexllm.dangerous_permission_api_callers(STATE.dk, app_only=app_only)
    return ok({"result": r})

@tool("list_external_method_refs")
def t_ext_methods(body):
    e = require_loaded()
    if e: return e
    limit = int(body.get("limit", MAX_ROWS))
    rows = STATE.dk.list_external_method_refs()
    return ok({"count": len(rows) if rows else 0, "refs": _classes(rows, limit)})

@tool("list_external_type_refs")
def t_ext_types(body):
    e = require_loaded()
    if e: return e
    limit = int(body.get("limit", MAX_ROWS))
    rows = STATE.dk.list_external_type_refs()
    return ok({"count": len(rows) if rows else 0, "refs": _classes(rows, limit)})

@tool("list_dexes")
def t_dexes(body):
    e = require_loaded()
    if e: return e
    return ok({"dex_count": int(STATE.dk.dex_count())})

@tool("tool_catalog")
def t_catalog(body):
    """Meta: list all tools for the DeepSeek prompt."""
    return ok({"tools": sorted(TOOLS.keys())})

# ── HTTP plumbing ────────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args, **kwargs):
        return  # silence

    def _send(self, status, payload):
        body = json.dumps(payload, default=str).encode("utf-8")
        if len(body) > 2_000_000:
            body = json.dumps({"ok": False, "error": "response >2MB"}).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/health":
            self._send(200, {"ok": True, "service": "modkit-tools", "loaded": STATE.dk is not None})
            return
        if path == "/tools":
            self._send(200, ok({"tools": sorted(TOOLS.keys())}))
            return
        if path == "/loaded":
            self._send(200, ok({
                "loaded": STATE.dk is not None,
                "apk_path": STATE.apk_path,
                "load_ms": STATE.load_ms,
                "package": STATE.apk_meta.get("package") if STATE.apk_meta else None,
                "versionName": STATE.apk_meta.get("versionName") if STATE.apk_meta else None,
                "permission_count": len(STATE.apk_meta.get("permissions", [])) if STATE.apk_meta else 0,
            }))
            return
        self._send(404, err("not found"))

    def do_POST(self):
        path = urlparse(self.path).path
        # Aliases: proxy POSTs to /health and /tools
        if path == "/health":
            self._send(200, {"ok": True, "service": "modkit-tools", "loaded": STATE.dk is not None})
            return
        if path == "/tools":
            self._send(200, ok({"tools": sorted(TOOLS.keys())}))
            return
        if path == "/loaded":
            self._send(200, ok({
                "loaded": STATE.dk is not None,
                "apk_path": STATE.apk_path,
                "load_ms": STATE.load_ms,
                "package": STATE.apk_meta.get("package") if STATE.apk_meta else None,
                "versionName": STATE.apk_meta.get("versionName") if STATE.apk_meta else None,
                "permission_count": len(STATE.apk_meta.get("permissions", [])) if STATE.apk_meta else 0,
            }))
            return
        length = int(self.headers.get("content-length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8") or "{}")
        except Exception as e:
            self._send(400, err("bad json: " + str(e)))
            return

        if path == "/load":
            self._send(200, load_apk(body.get("apk_path", "")))
            return

        # /tool/<name>
        if path.startswith("/tool/"):
            name = path[len("/tool/"):]
            fn = TOOLS.get(name)
            if not fn:
                self._send(404, err("unknown tool: " + name))
                return
            try:
                t0 = time.time()
                res = fn(body)
                ms = int((time.time() - t0) * 1000)
                res["_ms"] = ms
                self._send(200 if res.get("ok") else 400, res)
            except Exception as e:
                self._send(500, err(type(e).__name__ + ": " + str(e) + " | " + traceback.format_exc()[-400:]))
            return

        self._send(404, err("not found"))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8792)
    ap.add_argument("--apk", type=str, default="")
    args = ap.parse_args()

    if args.apk:
        print("preloading", args.apk)
        r = load_apk(args.apk)
        print(json.dumps(r, indent=2))

    srv = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"modkit-tools listening on http://127.0.0.1:{args.port}")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("bye")

if __name__ == "__main__":
    main()
