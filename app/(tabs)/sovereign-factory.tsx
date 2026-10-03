import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { TopBar, Panel, SectionHeader } from '@/components';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme';

function Mono({ children }: { children: string }) {
  return (
    <View style={styles.codeBox}>
      <Text style={styles.codeText}>{children}</Text>
    </View>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return <Text style={styles.body}>{children}</Text>;
}

function Bullet({ children }: { children: React.ReactNode }) {
  return <Text style={styles.bullet}>•  {children}</Text>;
}

export default function SovereignFactoryScreen() {
  return (
    <View style={styles.container}>
      <TopBar
        title="SOVEREIGN FACTORY"
        subtitle="deepseek blueprint"
        statusColor={colors.accent}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        <SectionHeader title="PART 1 — THE COOKIE BRIDGE" subtitle="browser session impersonation" />
        <Panel>
          <Body>You are not using the DeepSeek API. You are using chat.deepseek.com — the web interface — by impersonating a logged-in browser session.</Body>
          <Bullet>Free access, no API key, no billing</Bullet>
          <Bullet>25 KB output cap per response</Bullet>
          <Bullet>No max_tokens, no prefix completion, no model selection</Bullet>
          <Bullet>Session state can be invalidated at any time</Bullet>
        </Panel>

        <View style={styles.spacer} />
        <SectionHeader title="THE CREDENTIAL FILE" />
        <Panel title="~/cookies/deepseek-creds.json (mode 0600, gitignored)">
          <Mono>{`{
  "bearerToken": "64-char string from localStorage.userToken",
  "cookies": "name1=value1; name2=value2; ...",
  "hifLeim": "TLS fingerprint value",
  "hifDliq": "TLS fingerprint value",
  "deviceId": "UUID"
}`}</Mono>
          <View style={styles.spacerSm} />
          <Body>All five fields must be present and from the same browser session. A bearerToken from one login and cookies from another will fail auth.</Body>
        </Panel>

        <View style={styles.spacer} />
        <SectionHeader title="AUTH FLOW PER REQUEST" />
        <Panel>
          <Mono>{`1. Load credentials from CredentialStore
2. Solve Proof-of-Work challenge
   - POST /api/v0/chat/create_pow_challenge
   - receive: challenge, salt, expireAt, difficulty
   - solve: SHA-256 loop (difficulty iterations)
   - produce: x-ds-pow-response header
3. Build body:
   {
     chat_session_id, parent_message_id: null,
     model_type: null, prompt, ref_file_ids: [],
     thinking_enabled: false, search_enabled: false,
     action: null, preempt: false, max_tokens: 8192
   }
4. POST /api/v0/chat/completion
   Headers: authorization, cookie,
     x-hif-leim, x-hif-dliq, x-ds-device-id,
     x-ds-pow-response, accept: text/event-stream
5. Read response as SSE stream
6. Parse frames -> accumulate text`}</Mono>
        </Panel>

        <View style={styles.spacer} />
        <SectionHeader title="SSE FRAME FORMAT" />
        <Panel>
          <Mono>{`{"v":{"response":{"fragments":[{"content":"Hello"}]}}}
{"p":"response/fragments/-1/content","o":"APPEND","v":" world"}
{"v":"!"}`}</Mono>
        </Panel>

        <View style={styles.spacer} />
        <SectionHeader title="SESSION IDENTITY" />
        <Panel>
          <Body>chat_session_id is a path token issued by refreshPathToken(), cached for 3600s. It is NOT a DeepSeek conversation id. That is why parent_message_id cannot be used to chain turns.</Body>
        </Panel>

        <View style={styles.spacer} />
        <SectionHeader title="HEALTH CHECK" />
        <Panel>
          <Mono>{`GET /deepseek/health ->
{
  "credentialsConfigured": true,
  "bearerLength": 64,
  "cookiesLength": 749,
  "hasHifLeim": true,
  "hasHifDliq": true,
  "hasDeviceId": true,
  "bearerValid": true,
  "powWasmPresent": true,
  "powWasmLoaded": true,
  "cachedPathTokens": 1
}`}</Mono>
        </Panel>

        <View style={styles.divider} />

        <SectionHeader title="PART 2 — THE 25 KB WALL" subtitle="why it exists and how to bypass" />
        <Panel>
          <Body>DeepSeek's web UI enforces its own output cap around 24-25 KB of ASCII. It is not a max_tokens setting; the server truncates. You cannot raise it. No header, no parameter, no cookie unlocks it.</Body>
          <View style={styles.spacerSm} />
          <Text style={styles.subhead}>WHAT DOESN'T WORK</Text>
          <Bullet>max_tokens: 8192 in body — web UI ignores it</Bullet>
          <Bullet>chatSessionId reuse for continuation — path token, not conversation</Bullet>
          <Bullet>parentMessageId chaining — no real message id</Bullet>
          <Bullet>Retry with "resume" prompt — fresh response, same wall</Bullet>
          <View style={styles.spacerSm} />
          <Text style={styles.subhead}>THE THREE FIXES THAT DO WORK</Text>
          <Body>1. Healing (fallback) — embed the partial back in a new prompt and ask to continue from the exact next character. Works once (~17 KB added on round 1).</Body>
          <Body>2. Per-file generation (real fix) — one file per call instead of one giant response. Each response fits under 25 KB by design.</Body>
          <Body>3. Manifest caps — 8 files max for edits, 60 KB total for fresh builds.</Body>
        </Panel>

        <View style={styles.divider} />

        <SectionHeader title="PART 3 — THE FULL PIPELINE" subtitle="phone -> backend -> disk" />
        <Panel>
          <Mono>{`Phone (Brain input)
     |
     v
POST /projects/:id/build
  body: { prompt, engine, skillsBlock, attachments }
     |
     v
ProjectBuildRouter -> ProjectBuilder.build()
     |
     v
1. Detect stack (empty -> static-html)
2. If images: Forge API -> GLB URL (76s)
3. Manifest call via callEngine()
   -> parseManifestArray()
   -> log: project.build.manifest_ready
4. buildPerFile()
   for each manifest entry:
     a. build file-specific prompt
     b. callEngine(prompt, opts, engineId)
     c. stripFileFences()
     d. write to disk immediately
     e. if truncated: healIfTruncated()
     f. log: file_written
5. Return BuildResult { files, previewUrl }`}</Mono>
        </Panel>

        <View style={styles.spacer} />
        <SectionHeader title="PROMPT COMPOSITION" />
        <Panel>
          <Mono>{`=== SOVEREIGN IDENTITY ===
<8143 chars of identity text>
=== END IDENTITY LAYER ===
=== OUTPUT MODE BEGINS ===
<output contract: no prose>
=== HEADER ===
You are a code editor...
PROJECT TYPE: Static HTML/CSS/JS
MANDATORY SKILLS: ...
=== CONTEXT ===
--- package.json (800 bytes) ---
--- src/index.ts (5000 bytes, truncated) ---
=== 3D MODEL ===
A 3D model is available at: https://...
=== SKILLS BLOCK ===
REFERENCE SKILLS (REQUIRED)
11 skills, 30-40 KB total after cap
=== MANDATORY LIBRARIES ===
If script.js: Motion 12 via CDN
If scene.js: Three.js via CDN
=== PER-FILE PROMPT ===
Write ONE FILE: index.html
ROLE: page
TARGET SIZE: 8 KB
DEPENDS ON: styles.css, script.js
Write index.html now. Output only its contents.`}</Mono>
        </Panel>

        <View style={styles.spacer} />
        <SectionHeader title="ENGINE ROUTING" subtitle="deepseek / deephat / kimi / qwen" />
        <Panel>
          <Mono>{`callEngine(prompt, opts, engineId) {
  if (engineId !== 'engine_deepseek') {
    try {
      resp = await engineResolver(engineId).call(prompt, opts)
      return { text: resp.data.content, engineUsed: engineId }
    } catch (e) { /* fall through */ }
  }
  resp = await this.deepseek.callDeepSeek(prompt, opts)
  return { text: resp.data.content, engineUsed: 'engine_deepseek' }
}`}</Mono>
          <View style={styles.spacerSm} />
          <Body>Every engine flows through the same manifest → per-file → heal pipeline. Same 25 KB bypass applies to all of them.</Body>
        </Panel>

        <View style={styles.divider} />

        <SectionHeader title="PART 4 — LOG REFERENCE" />
        <Panel>
          <Text style={styles.subhead}>KEY LOG LINES</Text>
          <Bullet>project.build.start — request received</Bullet>
          <Bullet>project.build.image3d_ok — GLB URL obtained</Bullet>
          <Bullet>project.build.engine_route — non-DeepSeek engine</Bullet>
          <Bullet>project.build.manifest_ready — manifest planned</Bullet>
          <Bullet>project.build.perfile_start — per-file loop starting</Bullet>
          <Bullet>project.build.file_written — one file written</Bullet>
          <Bullet>project.build.healing_start — truncation detected</Bullet>
          <Bullet>project.build.healed — healing round complete</Bullet>
          <Bullet>project.build.done_perfile — whole build finished</Bullet>
          <Bullet>project.build.gave_up — retries exhausted</Bullet>
          <Bullet>project.build.endpoint_error — HTTP 422 to client</Bullet>
        </Panel>

        <View style={styles.divider} />

        <SectionHeader title="PART 5 — RECOVERY PROCEDURES" />
        <Panel title="WHEN AUTH FAILS">
          <Mono>{`1. Stop backend
2. Recapture credentials (browser login -> localStorage)
3. Restart backend
4. curl -s http://127.0.0.1:8790/deepseek/health \\
     | python3 -m json.tool`}</Mono>
        </Panel>
        <View style={styles.spacerSm} />
        <Panel title="WHEN THE STACK SEEMS DEAD">
          <Mono>{`for p in 8790 8791 8088 8089 9777; do
  echo -n "$p: "
  curl -s -o /dev/null -w "%{http_code}\\n" \\
    http://127.0.0.1:$p/health
done

pkill -9 -f "node.*apps/backend"
pkill -9 -f "deno run"
pkill -9 -f "wspr"
sleep 2
~/start-factory.sh`}</Mono>
        </Panel>

        <View style={styles.divider} />

        <SectionHeader title="PART 6 — FILE MAP" />
        <Panel>
          <Mono>{`~/sovereign-factory/
  cookies/deepseek-creds.json
  packages/core/src/
    deepseek/api/DeepSeekService.ts
    deepseek/api/DeepSeekRouter.ts
    deepseek/pow/PowSolver.ts
    deepseek/storage/CredentialStore.ts
    projects/builder/ProjectBuilder.ts
    projects/builder/ProjectFileStorage.ts
    forge/ForgeService.ts
    engines/LlmEngine.ts
    engines/EngineRegistry.ts
    engines/adapters/DeepSeekEngineAdapter.ts
    termux-server/  (HTTP server on 8790)
  templates/scroll-locked-video-hero/
    index.html / styles.css / scroll.js
    template.json / assets/car-scrub.mp4
  prompts/sovereign-factory.md
  logs/backend.log`}</Mono>
        </Panel>

        <View style={styles.divider} />

        <SectionHeader title="PART 7 — DESIGN RULES" />
        <Panel title="WHAT NEVER CHANGES">
          <Bullet>LERP_FACTOR = 0.18 (the "feel" number)</Bullet>
          <Bullet>TAGLINE_REVEAL_START = 0.82 (the payoff moment)</Bullet>
          <Bullet>SCRUB_DISTANCE = 3200 (scroll distance per video)</Bullet>
          <Bullet>prompts/sovereign-factory.md</Bullet>
          <Bullet>The 5-field credential shape</Bullet>
        </Panel>
        <View style={styles.spacerSm} />
        <Panel title="WHAT ADJUSTS PER BUILD">
          <Bullet>Engine pick (DeepSeek / DeepHat / Kimi / Qwen)</Bullet>
          <Bullet>Manifest size cap (25 fresh, 8 edit)</Bullet>
          <Bullet>Per-file output cap (15 KB static-html, stack-aware)</Bullet>
          <Bullet>Skills composite selection</Bullet>
        </Panel>

        <View style={styles.divider} />

        <SectionHeader title="PART 8 — REMAINING GAPS" />
        <Panel>
          <Bullet>Template selection in manifest — High — ~60 lines</Bullet>
          <Bullet>Engine-call logging + Glass Box view — Medium — ~70 lines</Bullet>
          <Bullet>Video attachment path in frontend — Medium — ~40 lines</Bullet>
          <Bullet>Recovery for trellis_selfhost timeout — Low — ~20 lines</Bullet>
          <Bullet>Additional templates — Low — ~200 lines each</Bullet>
        </Panel>

        <View style={styles.footer}>
          <Text style={styles.footerText}>END OF BLUEPRINT</Text>
          <Text style={styles.footerSub}>every mechanism · every constant · every file</Text>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pureBlack },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: spacing.xxl },
  body: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  bullet: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
    marginLeft: spacing.sm,
    marginBottom: 4,
  },
  subhead: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 10,
    color: colors.accent,
    letterSpacing: 1.2,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  codeBox: {
    backgroundColor: colors.pureBlack,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  codeText: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 11,
    color: colors.textPrimary,
    lineHeight: 17,
  },
  spacer: { height: spacing.lg },
  spacerSm: { height: spacing.sm },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
    marginHorizontal: spacing.md,
  },
  footer: { alignItems: 'center', paddingVertical: spacing.xl },
  footerText: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 11,
    color: colors.accent,
    letterSpacing: 2,
  },
  footerSub: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: 4,
  },
});
