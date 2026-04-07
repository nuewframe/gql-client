/**
 * Shape of the error thrown by graphql-request when the server returns errors[].
 * This happens for both HTTP-level failures AND HTTP 200 partial-success responses.
 */
export interface GqlClientError {
  response: {
    data: Record<string, unknown> | null;
    errors: Array<{ message: string; path?: string[]; extensions?: Record<string, unknown> }>;
    status: number;
  };
  request: unknown;
}

/** Type guard to identify GraphQL client errors. */
export function isGqlClientError(e: unknown): e is GqlClientError {
  if (e === null || typeof e !== 'object') return false;
  const candidate = e as Record<string, unknown>;
  return (
    typeof candidate.response === 'object' &&
    candidate.response !== null &&
    'errors' in (candidate.response as object)
  );
}
