import { OffsetRange } from './types';
import { eventBus } from './eventBus';

export interface ExecutionProofInput {
  scanId: string;
  correlationId: string;
  segmentId: string;
  phase: 'edit' | 'build' | 'analyze' | 'preview';
  rawResponse: string;
  claimedOffsets?: OffsetRange[];
  beforeHash?: string;
  afterHash?: string;
}

export interface ExecutionProofResult {
  valid: boolean;
  evidence?: {
    offsets: OffsetRange[];
    beforeHash: string;
    afterHash: string;
    byteCount: number;
    rationale: string;
  };
  rejectionReason?: string;
}

const HEX64 = /^[a-f0-9]{64}$/i;

function extractOffsets(text: string): OffsetRange[] {
  const out: OffsetRange[] = [];
  const re = /(?:offset|range|bytes?|modified|adjusted|altered|patched|applied)[^\d]*(0x[0-9a-f]+|\d+)\s*(?:-|\.\.|to|–)\s*(0x[0-9a-f]+|\d+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = m[1].startsWith('0x') ? parseInt(m[1], 16) : parseInt(m[1], 10);
    const end   = m[2].startsWith('0x') ? parseInt(m[2], 16) : parseInt(m[2], 10);
    if (end > start) out.push({ start, end });
  }
  return out;
}

function extractHashes(text: string): string[] {
  const hits = text.match(/[a-f0-9]{64}/gi) || [];
  return hits.filter(h => HEX64.test(h));
}

export const strictExecutionProof = {
  validate(input: ExecutionProofInput): ExecutionProofResult {
    const { rawResponse, claimedOffsets, beforeHash, afterHash } = input;

    const offsets = claimedOffsets && claimedOffsets.length > 0
      ? claimedOffsets
      : extractOffsets(rawResponse);

    const hashes = extractHashes(rawResponse);
    const pre  = beforeHash ?? hashes[0];
    const post = afterHash ?? hashes[1];

    if (offsets.length === 0) {
      return this._reject(input, 'no_offset_evidence');
    }
    if (!pre || !post) {
      return this._reject(input, 'missing_checksums');
    }
    if (pre === post) {
      return this._reject(input, 'checksums_identical');
    }

    const byteCount = offsets.reduce((s, r) => s + (r.end - r.start), 0);
    const rationaleMatch = rawResponse.match(/rationale[:\s]+(.+?)(?:\n|$)/i);
    const rationale = rationaleMatch ? rationaleMatch[1].trim() : 'unspecified';

    const result: ExecutionProofResult = {
      valid: true,
      evidence: { offsets, beforeHash: pre, afterHash: post, byteCount, rationale },
    };

    eventBus.emit({
      scanId: input.scanId,
      correlationId: input.correlationId,
      phase: input.phase,
      functionId: 'strict_execution_proof',
      severity: 'info',
      payload: { action: 'accept', segmentId: input.segmentId, byteCount },
    });

    return result;
  },

  _reject(input: ExecutionProofInput, reason: string): ExecutionProofResult {
    eventBus.emit({
      scanId: input.scanId,
      correlationId: input.correlationId,
      phase: input.phase,
      functionId: 'strict_execution_proof',
      severity: 'critical',
      payload: { action: 'reject', segmentId: input.segmentId, reason },
    });
    return { valid: false, rejectionReason: reason };
  },
};
