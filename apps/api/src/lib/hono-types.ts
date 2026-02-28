/**
 * Hono environment type definitions for typed context variables.
 */
export type AppEnv = {
  Variables: {
    userId: string;
    userEmail: string;
    userName: string;
    requestId: string;
  };
};
