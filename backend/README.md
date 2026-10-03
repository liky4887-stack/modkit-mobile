# Modkit Backend

Termux-side components that give the Modkit app real binary-analysis powers.

## Architecture

    modkit-mobile (Expo/RN)  ->  Termux              ->  Python sidecar
    chat/agent loop              Express 8790            DexKit 8792
                                 /deepseek/chat          /load
                                 /executeCommand         /find_classes_by_name
                                 /file/read|write        /decompile_class
                                 /tools/*  (proxy)  ->   /extract_iocs
                                                         /detect_permissive_tls
                                                         ... 25 tools total

## Install (Termux)

    pkg install -y python clang cmake ninja pkg-config zlib libxml2 libxslt
    pip install dexllm androguard tldextract
    mkdir -p ~/modkit-tools
    cp backend/tools/server.py ~/modkit-tools/server.py
    cp backend/patches/toolsProxy.js \\
       ~/sovereign-factory/apps/backend/dist/packages/core/src/termux-server/routes/
    nohup python ~/modkit-tools/server.py --port 8792 > ~/modkit-tools/server.log 2>&1 &
    echo $! > ~/modkit-tools/server.pid
    ~/start-factory.sh

## Verify

    curl -s http://127.0.0.1:8790/tools/health
    curl -s http://127.0.0.1:8790/tools/list

## Tools exposed (25)

    load, manifest, find_classes_by_name, find_classes_using_strings,
    find_classes_implementing, find_classes_by_super, find_methods_using_strings,
    list_class_methods, list_class_strings, list_value_strings,
    decompile_class, decompile_method, find_call_sites_to, find_call_sites_from,
    find_type_references, permission_callers, dangerous_permission_api_callers,
    extract_iocs, detect_permissive_tls, detect_content_providers,
    list_external_method_refs, list_external_type_refs, list_dexes, tool_catalog
