import type { DefaultSession } from 'next-auth';
import type { PmsRole } from './roles';

declare module 'next-auth' {
  interface Session {
    error?: string;
    user: DefaultSession['user'] & { roles: PmsRole[] };
  }

  interface User {
    roles?: PmsRole[];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    refreshToken?: string;
    accessTokenExpires?: number;
    error?: string;
    accessToken?: string;
    roles?: PmsRole[];
  }
}
