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
export function usesSecureSessionCookie(nextAuthUrl = process.env['NEXTAUTH_URL'] ?? ''): boolean {
  return nextAuthUrl.startsWith('https://');
}

export function sessionCookieName(nextAuthUrl = process.env['NEXTAUTH_URL'] ?? ''): string {
  return usesSecureSessionCookie(nextAuthUrl) ? '__Secure-pms.session-token' : 'pms.session-token';
}

const secureCookies = usesSecureSessionCookie();

function groupsFromJwt(jwt: string | undefined): unknown {
  if (!jwt) return undefined;

  const payload = jwt.split('.')[1];
  if (!payload) return undefined;

  try {
    return (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { groups?: unknown }).groups;
  } catch {
    return undefined;
  }
}

export function rolesFromOidcTokens(
  accessToken?: string,
  idToken?: string,
): PmsRole[] {
  return [
    ...new Set([
      ...mapGroupsToRoles(groupsFromJwt(accessToken)),
      ...mapGroupsToRoles(groupsFromJwt(idToken)),
    ]),
  ].sort() as PmsRole[];
}

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
      name: sessionCookieName(),
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: secureCookies,
      },
    },
  },
  callbacks: {
    async jwt({ token, account, user }) {
      if (account?.access_token) token.accessToken = account.access_token;
      const tokenRoles = rolesFromOidcTokens(
        account?.access_token ?? (typeof token.accessToken === 'string' ? token.accessToken : undefined),
        account?.id_token,
      );
      if (account || user || tokenRoles.length > 0) {
        const profileRoles = user && 'roles' in user && Array.isArray(user.roles)
          ? user.roles as PmsRole[]
          : [];
        const existingRoles = Array.isArray(token.roles) ? token.roles as PmsRole[] : [];
        token.roles = [...new Set([...existingRoles, ...profileRoles, ...tokenRoles])].sort();
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.roles = (token.roles as PmsRole[]) ?? [];
      return session;
    },
  },
};
