import NextAuth from 'next-auth';

import { assertAuthRuntimeConfiguration, authOptions } from '@/auth/options';

const handler = NextAuth(authOptions);

function checkedHandler(...args: Parameters<typeof handler>) {
  assertAuthRuntimeConfiguration();
  return handler(...args);
}

export { checkedHandler as GET, checkedHandler as POST };

