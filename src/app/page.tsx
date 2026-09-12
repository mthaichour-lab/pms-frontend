import {getServerSession} from 'next-auth';
import {redirect} from 'next/navigation';
import {assertAuthRuntimeConfiguration,authOptions} from '@/auth/options';
import {ApplicationShell} from './application-shell';
import {cookies} from 'next/headers';
import {localeCookieName,resolveLocale} from '@/i18n/config';
export const dynamic='force-dynamic';
export default async function Index(){assertAuthRuntimeConfiguration();const session=await getServerSession(authOptions);if(!session)redirect('/api/auth/signin/oidc?callbackUrl=/');const store=await cookies();const locale=resolveLocale(store.get(localeCookieName)?.value);return <ApplicationShell userName={session.user?.name??session.user?.email} roles={session.user.roles} locale={locale}/>}
