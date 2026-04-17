import { CopilotMoneyError } from '../types/error.js';

const GRAPHQL_ENDPOINT = 'https://app.copilot.money/api/graphql';

export interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

export class GraphQLClient {
  constructor(private getToken: () => Promise<string>) {}

  async query<T>(
    operationName: string,
    query: string,
    variables: Record<string, unknown>
  ): Promise<T> {
    return this.request<T>(operationName, query, variables);
  }

  async mutate<T>(
    operationName: string,
    mutation: string,
    variables: Record<string, unknown>
  ): Promise<T> {
    return this.request<T>(operationName, mutation, variables);
  }

  private async request<T>(
    operationName: string,
    query: string,
    variables: Record<string, unknown>
  ): Promise<T> {
    const token = await this.getToken();

    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        operationName,
        query,
        variables,
      }),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new CopilotMoneyError(
          'NOT_AUTHENTICATED',
          'Authentication failed. Run `copilot-auth login` then retry.'
        );
      }

      if (response.status === 429) {
        throw new CopilotMoneyError(
          'RATE_LIMITED',
          'Rate limited. Please try again later.'
        );
      }

      const errorBody = await response.text();
      throw new CopilotMoneyError(
        'NETWORK_ERROR',
        `HTTP ${response.status}: ${response.statusText}`,
        undefined,
        { body: errorBody }
      );
    }

    const json = await response.json() as GraphQLResponse<T>;

    if (this.isUnauthenticated(json)) {
      throw new CopilotMoneyError(
        'TOKEN_EXPIRED',
        'Session expired. Run `copilot-auth login` then retry.'
      );
    }

    if (json.errors && json.errors.length > 0) {
      const firstError = json.errors[0];
      throw new CopilotMoneyError(
        'GRAPHQL_ERROR',
        firstError.message,
        undefined,
        { errors: json.errors }
      );
    }

    if (!json.data) {
      throw new CopilotMoneyError(
        'GRAPHQL_ERROR',
        'No data in response'
      );
    }

    return json.data;
  }

  private isUnauthenticated(response: GraphQLResponse): boolean {
    if (!response.errors) return false;
    return response.errors.some(
      (e) =>
        e.message.toLowerCase().includes('unauthenticated') ||
        e.message.toLowerCase().includes('unauthorized') ||
        e.extensions?.code === 'UNAUTHENTICATED'
    );
  }
}
