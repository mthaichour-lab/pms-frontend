import type { NextAuthOptions } from 'next-auth';
import type { OAuthConfig } from 'next-auth/providers/oauth';

import { mapGroupsToRoles, type PmsRole } from './roles';

interface OidcProfile extends Record<string, unknown> {
  sub: string;
  name?: string;
  preferred_username?: string;
  email?: string;
  groups?: unknown;
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const issuer = required('OIDC_ISSUER', 'http://localhost:8080/realms/pms-dev');
const clientSecret = process.env['OIDC_CLIENT_SECRET'];

export function assertAuthRuntimeConfiguration(): void {
  if (
    process.env['NODE_ENV'] === 'production' &&
    !process.env['NEXTAUTH_SECRET']
  ) {
    throw new Error('NEXTAUTH_SECRET is required in production');
  }
}

const oidcProvider: OAuthConfig<OidcProfile> = {
  id: 'oidc',
  name: 'Corporate identity',
  type: 'oauth',
  idToken: true,
  issuer,
  wellKnown: `${issuer}/.well-known/openid-configuration`,
  clientId: required('OIDC_CLIENT_ID', 'pms-web'),
  clientSecret,
  authorization: { params: { scope: 'openid profile email' } },
  checks: ['pkce', 'state'],
  client: clientSecret ? undefined : { token_endpoint_auth_method: 'none' },
  profile(profile) {
    return {
      id: profile.sub,
      name: profile.name ?? profile.preferred_username ?? profile.sub,
      email: profile.email,
      roles: mapGroupsToRoles(profile.groups),
    };
  },
};

export const authOptions: NextAuthOptions = {
  secret: required('NEXTAUTH_SECRET', 'local-development-secret-change-me'),
  providers: [oidcProvider],
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  cookies: {
    sessionToken: {
      name: '__Secure-pms.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: true,
      },
    },
  },
  callbacks: {
    async jwt({ token, account, user }) {
      if (account?.access_token) token.accessToken = account.access_token;
      if (user && 'roles' in user) token.roles = user.roles as PmsRole[];
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.roles = (token.roles as PmsRole[]) ?? [];
      return session;
    },
  },
};

