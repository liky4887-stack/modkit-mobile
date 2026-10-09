// Tool definitions the agent shows DeepSeek. Compact schema, no decoration.

export interface ToolParam {
  name: string;
  type: 'string' | 'string[]' | 'number' | 'boolean';
  required?: boolean;
  description: string;
}

export interface ToolDef {
  name: string;
  description: string;
  params: ToolParam[];
}

export const TOOL_DEFS: ToolDef[] = [
  {
    name: 'manifest',
    description: 'Return the APK manifest summary: package, version, permissions, component counts. Call this first.',
    params: [],
  },
  {
    name: 'find_classes_by_name',
    description: 'Search DEX for classes whose name contains the given substring. Returns class references with DEX indices.',
    params: [
      { name: 'name', type: 'string', required: true, description: 'substring to match against fully-qualified class names' },
      { name: 'limit', type: 'number', description: 'max results, default 100' },
    ],
  },
  {
    name: 'find_classes_using_strings',
    description: 'Find classes that reference ANY of the given string constants. Best tool for feature hunting (e.g. "sentry", "frida", "rootbeer").',
    params: [
      { name: 'strings', type: 'string[]', required: true, description: 'one or more literal strings to search for' },
      { name: 'limit', type: 'number', description: 'max results, default 100' },
    ],
  },
  {
    name: 'find_classes_implementing',
    description: 'Find classes that implement the given interface (descriptor or dotted form).',
    params: [
      { name: 'interface', type: 'string', required: true, description: 'interface name' },
      { name: 'limit', type: 'number', description: 'max results, default 100' },
    ],
  },
  {
    name: 'find_classes_by_super',
    description: 'Find classes that extend the given superclass.',
    params: [
      { name: 'super', type: 'string', required: true, description: 'superclass name' },
      { name: 'limit', type: 'number', description: 'max results, default 100' },
    ],
  },
  {
    name: 'find_methods_using_strings',
    description: 'Find methods that reference ANY of the given strings. Returns method descriptors.',
    params: [
      { name: 'strings', type: 'string[]', required: true, description: 'literal strings' },
      { name: 'limit', type: 'number', description: 'max results, default 100' },
    ],
  },
  {
    name: 'list_class_methods',
    description: 'List all methods declared on a class. Use descriptor form Lcom/foo/Bar; for best results.',
    params: [
      { name: 'fqcn', type: 'string', required: true, description: 'fully-qualified class name' },
      { name: 'limit', type: 'number', description: 'max results, default 200' },
    ],
  },
  {
    name: 'list_class_strings',
    description: 'List the string constants used by a class. Useful to identify what a class is for.',
    params: [
      { name: 'fqcn', type: 'string', required: true, description: 'fully-qualified class name' },
      { name: 'limit', type: 'number', description: 'max results, default 200' },
    ],
  },
  {
    name: 'decompile_class',
    description: 'Decompile a class to Java source. Returns up to 200 KB of source. This is the highest-fidelity tool.',
    params: [
      { name: 'fqcn', type: 'string', required: true, description: 'fully-qualified class name' },
    ],
  },
  {
    name: 'decompile_method',
    description: 'Decompile a single method to Java source.',
    params: [
      { name: 'fqcn', type: 'string', required: true, description: 'class' },
      { name: 'method', type: 'string', required: true, description: 'method name or descriptor' },
    ],
  },
  {
    name: 'find_call_sites_to',
    description: 'Find who calls this class/method. Returns call sites with caller class references.',
    params: [
      { name: 'fqcn', type: 'string', required: true, description: 'target class' },
      { name: 'method', type: 'string', description: 'optional method name' },
      { name: 'limit', type: 'number', description: 'max results, default 100' },
    ],
  },
  {
    name: 'find_call_sites_from',
    description: 'Find what this class/method calls. Returns callee references.',
    params: [
      { name: 'fqcn', type: 'string', required: true, description: 'source class' },
      { name: 'method', type: 'string', description: 'optional method name' },
      { name: 'limit', type: 'number', description: 'max results, default 100' },
    ],
  },
  {
    name: 'find_type_references',
    description: 'Find who references this type.',
    params: [
      { name: 'type', type: 'string', required: true, description: 'type name' },
      { name: 'limit', type: 'number', description: 'max results, default 100' },
    ],
  },
  {
    name: 'permission_callers',
    description: 'List which classes call dangerous permission APIs. Optional filter by permission list.',
    params: [
      { name: 'permissions', type: 'string[]', description: 'permission names to filter by' },
      { name: 'app_only', type: 'boolean', description: 'restrict to app classes (default true)' },
    ],
  },
  {
    name: 'extract_iocs',
    description: 'Extract URLs, IPs, domains, emails with caller attribution. Fast way to see network surface.',
    params: [
      { name: 'with_xref', type: 'boolean', description: 'include caller class references, default true' },
    ],
  },
  {
    name: 'detect_permissive_tls',
    description: 'Detect TrustAll managers, no-op hostname verifiers, weak TLS settings. Returns findings with class refs.',
    params: [],
  },
  {
    name: 'detect_content_providers',
    description: 'Detect ContentProvider implementations with xrefs.',
    params: [],
  },
  {
    name: 'dangerous_permission_api_callers',
    description: 'Aggregate: which dangerous permission APIs are called from which classes.',
    params: [
      { name: 'app_only', type: 'boolean', description: 'restrict to app classes, default true' },
    ],
  },
  {
    name: 'list_value_strings',
    description: 'Dump string constants from the APK. Big; use a limit. Good for broad keyword discovery.',
    params: [
      { name: 'limit', type: 'number', description: 'max results, default 500' },
    ],
  },
];

// ── Prompt rendering ─────────────────────────────────────────────
export function renderToolList(): string {
  const lines: string[] = [
  // ─── REA (Reverse Engineer Anything) tools ────────────────────────
  {
    name: 'rea_decompile_class',
    description: 'Decompile an Android class to Java source via headless JADX. More accurate than DexKit for complex classes. Returns Java source with line numbers.',
    params: [
      { name: 'apk_path', type: 'string', required: true, description: 'absolute path to the APK on device' },
      { name: 'class_name', type: 'string', required: true, description: 'fully-qualified class name (e.g. com.example.Foo)' },
    ],
  },
  {
    name: 'rea_get_manifest',
    description: 'Extract and parse AndroidManifest.xml. Returns permissions, activities, services, receivers, providers, and intent filters as structured JSON.',
    params: [
      { name: 'apk_path', type: 'string', required: true, description: 'absolute path to the APK on device' },
    ],
  },
  {
    name: 'rea_search_strings',
    description: 'Search the APK string pool for a pattern (URL, key, secret, log tag). Returns matches with class context and evidence.',
    params: [
      { name: 'apk_path', type: 'string', required: true, description: 'absolute path to the APK on device' },
      { name: 'pattern', type: 'string', required: true, description: 'substring or regex to search' },
      { name: 'case_sensitive', type: 'boolean', description: 'case-sensitive match, default false' },
    ],
  },
  {
    name: 'rea_find_classes_by_reference',
    description: 'Find every class that references a given method, class, or field. Cross-reference search with call-site context.',
    params: [
      { name: 'apk_path', type: 'string', required: true, description: 'absolute path to the APK' },
      { name: 'target', type: 'string', required: true, description: 'method/class/field signature to search for' },
    ],
  },
  // ─── JADX high-fidelity decompilation ─────────────────────────────
  {
    name: 'jadx_decompile_class',
    description: 'Full Java decompilation via JADX CLI. Slower than decompile_class but produces much more readable source with proper generics, lambdas, and control flow. Use when DexKit output is unclear.',
    params: [
      { name: 'fqcn', type: 'string', required: true, description: 'fully-qualified class name (e.g. com.example.Foo)' },
    ],
  },
  {
    name: 'jadx_decompile_method',
    description: 'Decompile a single method via JADX. Extracts just the method body from a full class decompile. Useful for focused review of one function.',
    params: [
      { name: 'fqcn', type: 'string', required: true, description: 'fully-qualified class name' },
      { name: 'method', type: 'string', required: true, description: 'method name' },
    ],
  },
  {
    name: 'raw_manifest',
    description: 'Full decoded AndroidManifest.xml as pretty-printed XML. Use when you need to see exact attribute values, intent-filter actions, or permissions not surfaced by the manifest summary.',
    params: [],
  },
  // ─── Composite analysis (REA-style one-shot flows) ───────────────
  {
    name: 'analyze_feature',
    description: 'One-shot feature analysis. Given a keyword (e.g. "sentry", "frida", "okhttp"), finds matching classes and methods, then JADX-decompiles the top N classes and returns full Java source for each. Use this FIRST when investigating any feature — it replaces a manual hunt+decompile loop.',
    params: [
      { name: 'keyword', type: 'string', required: true, description: 'substring to search for in classes and methods' },
      { name: 'limit_classes', type: 'number', description: 'max classes to report, default 15' },
      { name: 'limit_decompile', type: 'number', description: 'how many of the top classes to JADX-decompile, default 3' },
    ],
  },
  {
    name: 'trace_class',
    description: 'Trace a class end-to-end. JADX-decompiles the target class, finds every call site pointing at it, and decompiles the top N callers. Use this to understand how a class is used across the app.',
    params: [
      { name: 'fqcn', type: 'string', required: true, description: 'fully-qualified class name to trace' },
      { name: 'decompile_limit', type: 'number', description: 'how many callers to decompile, default 3' },
      { name: 'caller_limit', type: 'number', description: 'max call sites to list, default 20' },
    ],
  },
  {
    name: 'jadx_decompile_batch',
    description: 'Decompile multiple classes in a single call. Cheaper than N separate jadx_decompile_class calls when you already have a target list.',
    params: [
      { name: 'fqcns', type: 'string[]', required: true, description: 'array of fully-qualified class names' },
      { name: 'limit', type: 'number', description: 'max classes to decompile, default 10' },
    ],
  },
  {
    name: 'evidence_report',
    description: 'One-shot structured evidence bundle for the loaded APK. Runs manifest decode, permission callers, IOC extraction, permissive TLS detection, and content provider enumeration, all in one call. Use at the START of an investigation to get the full picture.',
    params: [],
  },
];
  for (const t of TOOL_DEFS) {
    lines.push('- ' + t.name + '(' + t.params.map(p => (p.required ? p.name : '[' + p.name + ']')).join(', ') + ')');
    lines.push('  ' + t.description);
    for (const p of t.params) {
      lines.push('    · ' + p.name + ' : ' + p.type + (p.required ? ' (required)' : '') + ' — ' + p.description);
    }
  }
  return lines.join('\n');
}

export function toolNames(): string[] {
  return TOOL_DEFS.map(t => t.name);
}

export function isValidTool(name: string): boolean {
  return TOOL_DEFS.some(t => t.name === name);
}
