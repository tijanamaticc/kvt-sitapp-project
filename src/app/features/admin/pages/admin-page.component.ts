import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { User } from '../../../core/models/user.model';

@Component({
  selector: 'app-admin-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-page.component.html',
  styleUrls: ['./admin-page.component.css']
})
export class AdminPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly currentUser = this.auth.currentUser;
  readonly pendingUsers = signal<User[]>([]);
  readonly users = signal<User[]>([]);
  readonly viewAll = signal(false);
  readonly message = signal('');
  readonly loading = signal(false);
  readonly defaultAvatar = 'data:image/svg+xml;utf8,%3Csvg xmlns%3D%22http%3A//www.w3.org/2000/svg%22 viewBox%3D%220 0 120 120%22%3E%3Crect width%3D%22120%22 height%3D%22120%22 fill%3D%22%23e7f8ef%22/%3E%3Ccircle cx%3D%2260%22 cy%3D%2238%22 r%3D%2230%22 fill%3D%22%2325d366%22/%3E%3Ccircle cx%3D%2260%22 cy%3D%2262%22 r%3D%2216%22 fill%3D%22%23ffffff%22/%3E%3Crect x%3D%2242%22 y%3D%2278%22 width%3D%2236%22 height%3D%2210%22 rx%3D%225%22 fill%3D%22%23ffffff%22/%3E%3C/svg%3E';

  constructor() {
    void this.load();
  }

  getAvatar(user: User): string {
    const url = user.profile.avatarUrl;
    if (url && url.startsWith('/uploads/')) {
      return `${AuthService.SERVER_ORIGIN}${url}`;
    }
    return url || this.defaultAvatar;
  }

  async loadPending(): Promise<void> {
    this.loading.set(true);
    this.message.set('');
    const pending = await this.auth.fetchPendingRegistrations();
    // Merge server pending registrations with any local pending users
    const localPending = this.auth.users().filter(u => (u.accountStatus || 'approved') === 'pending');
    const map = new Map<string, User>();
    for (const u of [...pending, ...localPending]) {
      const key = u.id || `${u.username}-${u.email}-${u.phone}`;
      if (!map.has(key)) map.set(key, u);
    }
    const merged = Array.from(map.values());
    this.pendingUsers.set(merged);
    this.users.set(merged);
    this.loading.set(false);
  }

  async loadAll(): Promise<void> {
    this.loading.set(true);
    this.message.set('');
    try {
      const res = await fetch(`${AuthService.SERVER_ORIGIN}/api/users`);
      if (res.ok) {
        this.users.set(await res.json());
      } else {
        this.users.set([]);
      }
    } catch (e) {
      this.users.set(this.pendingUsers());
    }
    this.loading.set(false);
  }

  async approve(userId: string): Promise<void> {
    this.message.set('');
    const user = await this.auth.approveRegistration(userId);
    if (!user) {
      this.message.set('Korisnik nije pronađen.');
      return;
    }

    this.message.set(`Korisnik ${user.profile.displayName} je odobren i poslat mu je mejl.`);
    await this.loadPending();
  }

  async reject(userId: string): Promise<void> {
    this.message.set('');
    const user = await this.auth.rejectRegistration(userId);
    if (!user) {
      this.message.set('Korisnik nije pronađen.');
      return;
    }

    this.message.set(`Korisnik ${user.profile.displayName} je odbijen i poslat mu je mejl.`);
    await this.loadPending();
  }

  async deleteUser(userId: string): Promise<void> {
    this.message.set('');
    try {
      const res = await fetch(`${AuthService.SERVER_ORIGIN}/api/users/${userId}`, { method: 'DELETE' });
      if (res.ok) {
        this.message.set('Korisnik obrisan.');
        await this.loadAll();
        return;
      }
      this.message.set('Greška prilikom brisanja.');
    } catch (e) {
      this.message.set('Greška prilikom brisanja.');
    }
  }

  async load(): Promise<void> {
    if (this.viewAll()) {
      await this.loadAll();
    } else {
      await this.loadPending();
    }
  }

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
