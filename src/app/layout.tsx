import './global.css';
import {cookies} from 'next/headers';
import {directionFor, localeCookieName, resolveLocale} from '@/i18n/config';
import {ThemeToggle} from './theme-toggle';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/auth/options';
import {WorkspaceFrame} from './workspace-frame';

export const metadata = {
  title: 'PMS · Profit Sharing Management',
  description: 'Pilotage de la distribution des profits participatifs',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const locale = resolveLocale(cookieStore.get(localeCookieName)?.value);
  const session = await getServerSession(authOptions);
  return (
    <html lang={locale} dir={directionFor(locale)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{__html: "try{const t=localStorage.getItem('pms-theme');document.documentElement.dataset.theme=t==='light'?'light':'dark'}catch{}"}} />
      </head>
      <body>
        <WorkspaceFrame userName={session?.user?.name ?? session?.user?.email} roles={session?.user?.roles ?? []} locale={locale}>{children}</WorkspaceFrame>
        <ThemeToggle />
      </body>
    </html>
  );
}
