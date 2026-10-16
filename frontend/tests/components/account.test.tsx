/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { router } from '../router';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { AuthForm } from '@/components/user/AuthForm';
import { ViewMenu } from '@/components/layout/ViewMenu';
import { SortMenu } from '@/components/list/SortMenu';
import { LIST } from '@/lib/list';
import { PREFS_COOKIE } from '@/lib/prefs';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The user service, answering sign-in with `status`. */
function service(status: number) {
  const fetch = vi.fn(async (input: string | URL | Request) => {
    const path = new URL(String(input), 'http://x').pathname;
    if (path === '/userserve/session') return new Response('{"user":null}', { status: 200 });
    return status === 200
      ? new Response(JSON.stringify({ id: 1, username: 'reader' }), { status })
      : new Response(JSON.stringify({ error: 'That username and password do not match.' }), {
          status,
        });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

async function signIn() {
  await userEvent.type(screen.getByLabelText('Username'), 'reader');
  // A value made up for this test; the form never leaves jsdom.
  await userEvent.type(screen.getByLabelText('Password'), 'test-only-value');
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('AuthForm', () => {
  it('goes back to where the reader came from', async () => {
    service(200);
    render(<AuthForm mode="login" next="/u/ratings" />);
    await signIn();
    expect(router.push).toHaveBeenCalledWith('/u/ratings');
  });

  it('never follows a next that leaves the site or loops back here', async () => {
    for (const next of ['//evil.example', 'https://evil.example', '/login?next=/u']) {
      service(200);
      const { unmount } = render(<AuthForm mode="login" next={next} />);
      await signIn();
      expect(router.push).toHaveBeenLastCalledWith('/');
      unmount();
    }
  });

  it("shows the service's own words when it refuses", async () => {
    service(401);
    render(<AuthForm mode="login" />);
    await signIn();
    expect(await screen.findByText('That username and password do not match.')).toBeVisible();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('spells out the rules when creating an account', () => {
    render(<AuthForm mode="register" />);
    expect(screen.getByText(/2 to 32 characters/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email/)).not.toBeRequired();
  });
});

describe('ViewMenu', () => {
  it('raises a content level and keeps it in the cookie', async () => {
    render(<ViewMenu />);
    await userEvent.click(screen.getByRole('button', { name: 'What to show' }));
    await userEvent.click(screen.getAllByRole('radio', { name: /explicit|expl/i })[0]);
    expect(decodeURIComponent(document.cookie)).toContain(`${PREFS_COOKIE}=`);
    expect(decodeURIComponent(document.cookie)).toContain('"sexual":"explicit"');
    expect(
      screen.getByRole('button', { name: 'What to show (more than the safest is on)' }),
    ).toBeInTheDocument();
  });
});

describe('menus', () => {
  it('move with the arrow keys and close on Escape', async () => {
    // Hidden items are skipped by offsetParent, which jsdom, laying nothing out,
    // leaves null for everything.
    const was = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent')!;
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get() {
        return this.parentElement;
      },
    });
    onTestFinished(() => {
      Object.defineProperty(HTMLElement.prototype, 'offsetParent', was);
    });
    render(<SortMenu path="/v" params={{}} sorts={LIST.v.sorts} active="title" reverse={false} />);
    const button = screen.getByRole('button', { name: /sort/i });
    await userEvent.click(button);
    const items = screen.getAllByRole('link');
    await userEvent.keyboard('{ArrowDown}');
    expect(items).toContain(document.activeElement);
    const first = document.activeElement;
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).not.toBe(first);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
