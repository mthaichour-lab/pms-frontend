import type { DefaultSession } from 'next-auth';
import type { PmsRole } from './roles';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & { roles: PmsRole[] };
  }

  interface User {
    roles?: PmsRole[];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    roles?: PmsRole[];
  }
}

