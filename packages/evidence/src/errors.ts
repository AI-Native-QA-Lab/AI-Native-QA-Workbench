export type EvidenceParseErrorCode =
  | "EVIDENCE_INPUT_TOO_LARGE"
  | "EVIDENCE_FORMAT_UNSUPPORTED"
  | "EVIDENCE_REPORT_MALFORMED"
  | "EVIDENCE_REPORT_FIELD_INVALID"
  | "EVIDENCE_REPORT_SECURITY_REJECTED";

export class EvidenceParseError extends Error {
  readonly name = "EvidenceParseError";

  constructor(
    readonly code: EvidenceParseErrorCode,
    readonly path: string,
    message: string,
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
