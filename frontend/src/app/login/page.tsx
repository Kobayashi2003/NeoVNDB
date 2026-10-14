import type { Metadata } from 'next';
import { AuthForm } from '@/components/user/AuthForm';

export const metadata: Metadata = { title: 'Sign in - NeoVNDB' };

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { next } = await searchParams;
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10 animate-slide-up-fade">
      <AuthForm mode="login" next={typeof next === 'string' ? next : undefined} />
    </main>
  );
}
