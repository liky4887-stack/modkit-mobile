// Pure logic. Responds to version queries based on a policy-shaped
// view of the world. Never exposes internals; always consistent with
// Version Continuity Guard.
import { eventBus } from './eventBus';

export interface HandshakeRequest {
  queryType: 'version_check' | 'update_available' | 'compatibility_check';
  payload: Record<string, unknown>;
  clientVersion: string;
}

export interface PolicyView {
  // The version the client should believe is current
  currentVersionCode: number;
  currentVersionName: string;
  packageName: string;
  // Support window
  minSupportedVersionCode: number;
  // Optional remote-disable flag
  forceUpdateRecommended: boolean;
}

export interface HandshakeResponse {
  response: Record<string, unknown>;
  consistentWithGuard: boolean;
  policyCompliant: boolean;
  rationale: string;
}

function isPolicyCompliant(view: PolicyView): boolean {
  if (!view.currentVersionName || !view.packageName) return false;
  if (view.minSupportedVersionCode > view.currentVersionCode) return false;
  return true;
}

function buildResponseFor(
  req: HandshakeRequest,
  view: PolicyView
): Record<string, unknown> {
  switch (req.queryType) {
    case 'version_check':
      return {
        versionCode: view.currentVersionCode,
        versionName: view.currentVersionName,
        packageName: view.packageName,
      };

    case 'update_available': {
      const clientCode = Number(req.clientVersion);
      const updateAvailable =
        isFinite(clientCode) && clientCode < view.currentVersionCode;
      return {
        updateAvailable,
        recommendedVersionCode: view.currentVersionCode,
        recommendedVersionName: view.currentVersionName,
        critical: view.forceUpdateRecommended,
      };
    }

    case 'compatibility_check': {
      const clientCode = Number(req.clientVersion);
      const supported =
        !isFinite(clientCode) || clientCode >= view.minSupportedVersionCode;
      return {
        supported,
        minSupportedVersionCode: view.minSupportedVersionCode,
        policy: 'stable',
      };
    }
  }
}

export const fakeUpdateHandshake = {
  handle(args: {
    scanId: string;
    correlationId: string;
    request: HandshakeRequest;
    view: PolicyView;
  }): HandshakeResponse {
    const compliant = isPolicyCompliant(args.view);

    if (!compliant) {
      const resp: HandshakeResponse = {
        response: { error: 'policy_view_inconsistent' },
        consistentWithGuard: false,
        policyCompliant: false,
        rationale: 'policy view fails internal consistency checks',
      };
      eventBus.emit({
        scanId: args.scanId, correlationId: args.correlationId,
        phase: 'validate', functionId: 'fake_update_handshake',
        severity: 'critical',
        payload: { action: 'handshake_rejected', reason: resp.rationale },
      });
      return resp;
    }

    const response = buildResponseFor(args.request, args.view);
    const result: HandshakeResponse = {
      response,
      consistentWithGuard: true,
      policyCompliant: true,
      rationale: 'served from policy view for ' + args.request.queryType,
    };

    eventBus.emit({
      scanId: args.scanId, correlationId: args.correlationId,
      phase: 'validate', functionId: 'fake_update_handshake',
      severity: 'info',
      payload: {
        action: 'handshake_served',
        queryType: args.request.queryType,
        clientVersion: args.request.clientVersion,
      },
    });

    return result;
  },
};
