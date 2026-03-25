export type ErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'TOKEN_EXPIRED'
  | 'INVALID_CATEGORY'
  | 'INVALID_TAG'
  | 'TRANSACTION_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'GRAPHQL_ERROR'
  | 'PARTIAL_FAILURE';

export interface McpError {
  code: ErrorCode;
  message: string;
  suggestions?: string[];
  details?: Record<string, unknown>;
}

export class CopilotMoneyError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly suggestions?: string[],
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'CopilotMoneyError';
  }

  toMcpError(): McpError {
    return {
      code: this.code,
      message: this.message,
      suggestions: this.suggestions,
      details: this.details,
    };
  }
}
