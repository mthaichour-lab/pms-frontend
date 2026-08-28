import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { assertAuthRuntimeConfiguration, authOptions } from '@/auth/options';

export const dynamic = 'force-dynamic';

export default async function Index() {
  assertAuthRuntimeConfiguration();
  const session = await getServerSession(authOptions);
  if (!session) redirect('/api/auth/signin/oidc?callbackUrl=/');

  return (
    <main>
      <h1>PMS</h1>
      <p>Connecté en tant que {session.user?.name ?? session.user?.email}</p>
      <p>Rôles : {session.user.roles.join(', ') || 'aucun rôle attribué'}</p>
    </main>
  );
}

