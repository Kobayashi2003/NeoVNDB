import type { Metadata } from 'next';
import { AuthForm } from '@/components/user/AuthForm';

export const metadata: Metadata = { title: 'Create an account - NeoVNDB' };

export default async function RegisterPage({ searchParams }: PageProps<'/register'>) {
  const { next } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-page flex-1 items-center justify-center px-4 py-10">
      <AuthForm mode="register" next={typeof next === 'string' ? next : undefined} />
    </main>
  );
}
