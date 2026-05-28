import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { User } from '../models/user.model';

const USERS_KEY = 'sitapp-users';
const SESSION_KEY = 'sitapp-session';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly usersSignal = signal<User[]>(this.readUsers());
  private readonly currentUserSignal = signal<User | null>(this.readSession());

  readonly users = computed(() => this.usersSignal());
  readonly currentUser = computed(() => this.currentUserSignal());
  readonly isAuthenticated = computed(() => this.currentUserSignal() !== null);
  readonly lastAuthMessage = signal('');

  private readonly defaultAdmin: User = {
    id: 'u-admin',
    username: 'admin',
    email: 'admin@sitapp.local',
    phone: '+381600000000',
    password: 'admin123',
    role: 'admin',
    profile: {
      firstName: 'System',
      lastName: 'Admin',
      displayName: 'Administrator',
      avatarUrl: null,
      lastActivityAt: new Date().toISOString()
    }
  };

  constructor() {
    // Keep a predefined admin in the system.
    if (this.usersSignal().length === 0) {
      this.usersSignal.set([this.defaultAdmin]);
    }

    // Normalize avatar URL for current session if present
    const current = this.currentUserSignal();
    if (current) {
      this.currentUserSignal.set(this.normalizeUserAvatar(current));
    }

    effect(() => {
      localStorage.setItem(USERS_KEY, JSON.stringify(this.usersSignal()));
    });

    effect(() => {
      const currentUser = this.currentUserSignal();
      if (currentUser) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
      } else {
        localStorage.removeItem(SESSION_KEY);
      }
    });
  }

  // Exposed for use by other modules/components that need the server URL
  static readonly SERVER_ORIGIN = 'http://localhost:3333';

  private normalizeUserAvatar(user: User): User {
    if (user && user.profile && user.profile.avatarUrl) {
      const url = user.profile.avatarUrl;
      if (url.startsWith('/uploads/')) {
        user.profile.avatarUrl = `${AuthService.SERVER_ORIGIN}${url}`;
      }
    }
    return user;
  }

  private touchUserActivity(user: User): User {
    return {
      ...user,
      profile: {
        ...user.profile,
        lastActivityAt: new Date().toISOString()
      }
    };
  }

  // Ensure a predefined administrator exists (required by KVT)
  bootstrap(adminUser?: User): void {
    if (this.usersSignal().length === 0 && adminUser) {
      this.usersSignal.set([this.touchUserActivity(adminUser)]);
    }
  }

  async login(identifier: string, password: string): Promise<User | null> {
    this.lastAuthMessage.set('');
    const normalized = identifier.trim();

    // Try server login first
    try {
      const res = await fetch(`${AuthService.SERVER_ORIGIN}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: normalized, password })
      });

      if (res.ok) {
        const user = this.touchUserActivity(this.normalizeUserAvatar((await res.json()) as User));
        this.usersSignal.update((users) => [user, ...users.filter((u) => u.id !== user.id)]);
        this.currentUserSignal.set(user);
        return user;
      }

      if (res.status === 403) {
        const payload = await res.json().catch(() => ({}));
        this.lastAuthMessage.set(payload?.error || 'Nalog nije odobren.');
        return null;
      }
    } catch (e) {
      // server not reachable, fall back to local
    }

    const lower = identifier.trim().toLowerCase();
    const user = this.usersSignal().find((candidate) => {
      return [candidate.username, candidate.email, candidate.phone]
        .map((value) => (value || '').toLowerCase())
        .includes(lower) && candidate.password === password;
    });

    if (!user) {
      this.lastAuthMessage.set('Netačan identifikator ili lozinka.');
      return null;
    }

    if ((user.accountStatus || 'approved') === 'blocked') {
      this.lastAuthMessage.set(user.blockedReason || 'Nalog je blokiran.');
      return null;
    }

    if ((user.accountStatus || 'approved') !== 'approved' && user.role !== 'admin') {
      this.lastAuthMessage.set('Nalog čeka odobrenje administratora.');
      return null;
    }

    const nextUser = this.touchUserActivity(user);
    this.usersSignal.update((users) => [nextUser, ...users.filter((candidate) => candidate.id !== nextUser.id)]);
    this.currentUserSignal.set(nextUser);
    return nextUser;
  }

  async register(payload: Pick<User, 'username' | 'email' | 'phone' | 'password' | 'profile'>, avatarFile?: File | null): Promise<User> {
    // Try to register on server first (multipart/form-data with optional file)
    try {
      const form = new FormData();
      form.append('username', payload.username);
      form.append('email', payload.email);
      form.append('phone', payload.phone);
      form.append('password', payload.password);
      form.append('profile', JSON.stringify(payload.profile));
      if (avatarFile) {
        form.append('avatar', avatarFile, avatarFile.name);
      }

      const res = await fetch('http://localhost:3333/api/register', {
        method: 'POST',
        body: form
      });

      if (res.ok) {
        const user = this.touchUserActivity((await res.json()) as User);
        this.usersSignal.update((users) => [user, ...users.filter((candidate) => candidate.id !== user.id)]);
        return user;
      }
    } catch (e) {
      // ignore and fall back to local
    }

    // Fallback: local-only registration (if server not available)
    const user: User = {
      id: crypto.randomUUID(),
      role: 'student',
      accountStatus: 'pending',
      ...payload,
      profile: {
        ...payload.profile,
        lastActivityAt: new Date().toISOString()
      }
    };

    this.usersSignal.update((users) => [user, ...users]);
    
    // Try to sync the pending registration to server in background using FormData
    (async () => {
      try {
        const form = new FormData();
        form.append('username', user.username ?? '');
        form.append('email', user.email ?? '');
        form.append('phone', user.phone ?? '');
        form.append('password', user.password ?? '');
        try {
          form.append('profile', JSON.stringify(user.profile || {}));
        } catch (e) {
          form.append('profile', '{}');
        }

        // If an avatar file was provided to the original register() call it will be
        // supplied via the `avatarFile` parameter in that scope. Append it when present.
        if (avatarFile) {
          form.append('avatar', avatarFile, avatarFile.name);
        }

        const res = await fetch(`${AuthService.SERVER_ORIGIN}/api/register`, {
          method: 'POST',
          body: form
        });

        if (res.ok) {
          const serverUser = this.touchUserActivity((await res.json()) as User);
          this.mergeUser(serverUser);
          return;
        }
      } catch (e) {
        // still offline or server rejected multipart — will try JSON fallback
      }

      // Try JSON fallback (some environments send JSON instead of multipart)
      try {
        const jsonRes = await fetch(`${AuthService.SERVER_ORIGIN}/api/register-json`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: user.username,
            email: user.email,
            phone: user.phone,
            password: user.password,
            profile: user.profile
          })
        });

        if (jsonRes.ok) {
          const serverUser = this.touchUserActivity((await jsonRes.json()) as User);
          this.mergeUser(serverUser);
        }
      } catch (e) {
        // still offline — leave local pending user
      }
    })();

    return user;
  }

  updateCurrentUser(nextUser: User): void {
    const withActivity = this.touchUserActivity(nextUser);
    this.usersSignal.update((users) => users.map((user) => (user.id === withActivity.id ? withActivity : user)));
    this.currentUserSignal.set(withActivity);
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<boolean> {
    const currentUser = this.currentUserSignal();
    if (!currentUser) return false;

    // If we have a local password (offline/demo users), validate locally first
    if (currentUser.password && currentUser.password === currentPassword) {
      const nextUser: User = { ...currentUser, password: newPassword };
      this.updateCurrentUser(nextUser);
      // Fire-and-forget server update
      fetch(`${AuthService.SERVER_ORIGIN}/api/users/${currentUser.id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      }).catch(() => undefined);
      return true;
    }

    // Otherwise try server-side validation (for users authenticated via backend)
    try {
      const response = await fetch(`${AuthService.SERVER_ORIGIN}/api/users/${currentUser.id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      if (!response.ok) return false;

      // Update local copy with new password for future local checks
      const nextUser: User = { ...currentUser, password: newPassword };
      this.updateCurrentUser(nextUser);
      return true;
    } catch (e) {
      return false;
    }
  }

  async saveProfileToServer(user: User): Promise<User | null> {
    try {
      const response = await fetch(`${AuthService.SERVER_ORIGIN}/api/users/${user.id}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          email: user.email,
          phone: user.phone,
          firstName: user.profile.firstName,
          lastName: user.profile.lastName,
          displayName: user.profile.displayName,
          bio: user.profile.bio,
          status: user.profile.status,
          avatarUrl: user.profile.avatarUrl
        })
      });

      if (response.ok) {
        return this.normalizeUserAvatar((await response.json()) as User);
      }
    } catch (e) {
      // ignore fallback
    }

    return null;
  }

  async fetchPendingRegistrations(): Promise<User[]> {
    try {
      const response = await fetch(`${AuthService.SERVER_ORIGIN}/api/registrations?status=pending`);
      if (response.ok) {
        return (await response.json()) as User[];
      }
    } catch (e) {
      // fallback
    }

    return this.usersSignal().filter((user) => (user.accountStatus || 'approved') === 'pending');
  }

  async approveRegistration(userId: string): Promise<User | null> {
    try {
      const response = await fetch(`${AuthService.SERVER_ORIGIN}/api/registrations/${userId}/approve`, { method: 'POST' });
      if (response.ok) {
        const user = await response.json();
        this.mergeUser(user as User);
        return user as User;
      }
    } catch (e) {
      // fallback
    }

    const user = this.usersSignal().find((item) => item.id === userId);
    if (!user) {
      return null;
    }

    const nextUser = { ...user, accountStatus: 'approved' as const };
    this.mergeUser(nextUser);
    return nextUser;
  }

  async rejectRegistration(userId: string): Promise<User | null> {
    try {
      const response = await fetch(`${AuthService.SERVER_ORIGIN}/api/registrations/${userId}/reject`, { method: 'POST' });
      if (response.ok) {
        const user = await response.json();
        this.mergeUser(user as User);
        return user as User;
      }
    } catch (e) {
      // fallback
    }

    const user = this.usersSignal().find((item) => item.id === userId);
    if (!user) {
      return null;
    }

    const nextUser = { ...user, accountStatus: 'rejected' as const };
    this.mergeUser(nextUser);
    return nextUser;
  }

  private mergeUser(nextUser: User): void {
    const normalized = this.normalizeUserAvatar(this.touchUserActivity(nextUser));
    this.usersSignal.update((users) => [normalized, ...users.filter((user) => user.id !== normalized.id)]);
  }

  async refreshUsersFromServer(): Promise<User[]> {
    try {
      const response = await fetch(`${AuthService.SERVER_ORIGIN}/api/users`);
      if (response.ok) {
        const users = (await response.json()) as User[];
        this.usersSignal.set(users.map((user) => this.normalizeUserAvatar(user)));
        return this.usersSignal();
      }
    } catch (e) {
      // keep local cache
    }

    return this.usersSignal();
  }

  async searchUsers(query = '', activity = 'all', avatar = 'all'): Promise<User[]> {
    try {
      const url = new URL(`${AuthService.SERVER_ORIGIN}/api/users/search`);
      url.searchParams.set('query', query);
      url.searchParams.set('activity', activity);
      url.searchParams.set('avatar', avatar);
      const response = await fetch(url.toString());
      if (response.ok) {
        return ((await response.json()) as User[]).map((user) => this.normalizeUserAvatar(user));
      }
    } catch (e) {
      // fallback
    }

    return this.usersSignal()
      .filter((user) => {
        const haystack = [user.username, user.email, user.phone, user.profile.displayName, user.profile.firstName, user.profile.lastName]
          .join(' ')
          .toLowerCase();
        return !query || haystack.includes(query.toLowerCase());
      })
      .filter((user) => {
        const lastActivity = user.profile.lastActivityAt ? new Date(user.profile.lastActivityAt).getTime() : 0;
        const now = Date.now();
        if (activity === 'today') return lastActivity >= now - 1000 * 60 * 60 * 24;
        if (activity === 'week') return lastActivity >= now - 1000 * 60 * 60 * 24 * 7;
        if (activity === 'month') return lastActivity >= now - 1000 * 60 * 60 * 24 * 30;
        return true;
      })
      .filter((user) => {
        if (avatar === 'with-avatar') return !!user.profile.avatarUrl;
        if (avatar === 'without-avatar') return !user.profile.avatarUrl;
        return true;
      });
  }

  async blockUser(userId: string, reason: string, until?: string | null): Promise<User | null> {
    try {
      const response = await fetch(`${AuthService.SERVER_ORIGIN}/api/users/${userId}/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, until: until || null })
      });

      if (response.ok) {
        const user = (await response.json()) as User;
        this.mergeUser(user);
        return user;
      }
    } catch (e) {
      // fallback
    }

    return null;
  }

  async unblockUser(userId: string): Promise<User | null> {
    try {
      const response = await fetch(`${AuthService.SERVER_ORIGIN}/api/users/${userId}/unblock`, { method: 'POST' });
      if (response.ok) {
        const user = (await response.json()) as User;
        this.mergeUser(user);
        return user;
      }
    } catch (e) {
      // fallback
    }

    return null;
  }

  async fetchAnalytics(from?: string, to?: string): Promise<any | null> {
    try {
      const url = new URL(`${AuthService.SERVER_ORIGIN}/api/analytics`);
      if (from) url.searchParams.set('from', from);
      if (to) url.searchParams.set('to', to);
      const response = await fetch(url.toString());
      if (response.ok) {
        return response.json();
      }
    } catch (e) {
      // fallback
    }

    return null;
  }

  private isLegacyDemoUser(user: User): boolean {
    return user.id.startsWith('u-') && user.id !== 'u-admin';
  }

  logout(): void {
    this.currentUserSignal.set(null);
  }

  private readUsers(): User[] {
    const raw = localStorage.getItem(USERS_KEY);
    const users = raw ? (JSON.parse(raw) as User[]) : [];
    return users.filter((user) => !this.isLegacyDemoUser(user));
  }

  private readSession(): User | null {
    const raw = localStorage.getItem(SESSION_KEY);
    const session = raw ? (JSON.parse(raw) as User) : null;
    return session && !this.isLegacyDemoUser(session) ? session : null;
  }
}
