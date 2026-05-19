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
      avatarUrl: null
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

  private static readonly SERVER_ORIGIN = 'http://localhost:3333';

  private normalizeUserAvatar(user: User): User {
    if (user && user.profile && user.profile.avatarUrl) {
      const url = user.profile.avatarUrl;
      if (url.startsWith('/uploads/')) {
        user.profile.avatarUrl = `${AuthService.SERVER_ORIGIN}${url}`;
      }
    }
    return user;
  }

  // Ensure a predefined administrator exists (required by KVT)
  bootstrap(adminUser?: User): void {
    if (this.usersSignal().length === 0 && adminUser) {
      this.usersSignal.set([adminUser]);
    }
  }

  async login(identifier: string, password: string): Promise<User | null> {
    const normalized = identifier.trim();

    // Try server login first
    try {
      const res = await fetch(`${AuthService.SERVER_ORIGIN}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: normalized, password })
      });

      if (res.ok) {
        const user = this.normalizeUserAvatar((await res.json()) as User);
        this.usersSignal.update((users) => [user, ...users.filter(u => u.id !== user.id)]);
        this.currentUserSignal.set(user);
        return user;
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

    if (!user) return null;

    this.currentUserSignal.set(user);
    return user;
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
        const user = (await res.json()) as User;
        this.usersSignal.update((users) => [user, ...users]);
        this.currentUserSignal.set(user);
        return user;
      }
    } catch (e) {
      // ignore and fall back to local
    }

    // Fallback: local-only registration (if server not available)
    const user: User = {
      id: crypto.randomUUID(),
      role: 'student',
      ...payload
    };

    this.usersSignal.update((users) => [user, ...users]);
    this.currentUserSignal.set(user);
    return user;
  }

  updateCurrentUser(nextUser: User): void {
    this.usersSignal.update((users) => users.map((user) => (user.id === nextUser.id ? nextUser : user)));
    this.currentUserSignal.set(nextUser);
  }

  logout(): void {
    this.currentUserSignal.set(null);
  }

  private readUsers(): User[] {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? (JSON.parse(raw) as User[]) : [];
  }

  private readSession(): User | null {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  }
}
