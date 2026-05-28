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
  readonly message = signal('');
  readonly loading = signal(false);
  readonly analytics = signal<any | null>(null);
  readonly analyticsLoading = signal(false);
  readonly analyticsFrom = signal(this.toDateInput(new Date(Date.now() - 1000 * 60 * 60 * 24 * 30)));
  readonly analyticsTo = signal(this.toDateInput(new Date()));
  readonly defaultAvatar = 'data:image/svg+xml;utf8,%3Csvg xmlns%3D%22http%3A//www.w3.org/2000/svg%22 viewBox%3D%220 0 120 120%22%3E%3Crect width%3D%22120%22 height%3D%22120%22 fill%3D%22%23e7f8ef%22/%3E%3Ccircle cx%3D%2260%22 cy%3D%2238%22 r%3D%2230%22 fill%3D%22%2325d366%22/%3E%3Ccircle cx%3D%2260%22 cy%3D%2262%22 r%3D%2216%22 fill%3D%22%23ffffff%22/%3E%3Crect x%3D%2242%22 y%3D%2278%22 width%3D%2236%22 height%3D%2210%22 rx%3D%225%22 fill%3D%22%23ffffff%22/%3E%3C/svg%3E';

  constructor() {
    void this.load();
    void this.loadAnalytics();
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
    const me = this.currentUser();
    const filtered = merged.filter((u) => u.id !== me?.id);
    this.pendingUsers.set(filtered);
    this.users.set(filtered.filter((user) => (user.accountStatus || 'approved') !== 'rejected'));
    this.loading.set(false);
  }

  async loadAll(): Promise<void> {
    this.loading.set(true);
    this.message.set('');
    try {
      const res = await fetch(`${AuthService.SERVER_ORIGIN}/api/users`);
      if (res.ok) {
        const allUsers = (await res.json()) as User[];
        const me = this.currentUser();
        this.users.set(allUsers.filter((user) => user.id !== me?.id).filter((user) => (user.accountStatus || 'approved') !== 'rejected'));
      } else {
        this.users.set([]);
      }
    } catch (e) {
      this.users.set(this.pendingUsers().filter((user) => (user.accountStatus || 'approved') !== 'rejected'));
    }
    this.loading.set(false);
  }

  async loadAnalytics(): Promise<void> {
    this.analyticsLoading.set(true);
    try {
      const data = await this.auth.fetchAnalytics(this.analyticsFrom(), this.analyticsTo());
      this.analytics.set(data);
    } catch (e) {
      this.analytics.set(null);
    }
    this.analyticsLoading.set(false);
  }

  setAnalyticsRangeFrom(value: string): void {
    this.analyticsFrom.set(value);
    void this.loadAnalytics();
  }

  setAnalyticsRangeTo(value: string): void {
    this.analyticsTo.set(value);
    void this.loadAnalytics();
  }

  setAnalyticsPreset(days: number): void {
    const to = new Date();
    const from = new Date(Date.now() - 1000 * 60 * 60 * 24 * days);
    this.analyticsFrom.set(this.toDateInput(from));
    this.analyticsTo.set(this.toDateInput(to));
    void this.loadAnalytics();
  }

  async approve(userId: string): Promise<void> {
    this.message.set('');
    const user = await this.auth.approveRegistration(userId);
    if (!user) {
      this.message.set('Korisnik nije pronađen.');
      return;
    }

    this.message.set(`Korisnik ${user.profile.displayName} je odobren i poslat mu je mejl.`);
    await this.loadAll();
    await this.loadAnalytics();
  }

  async reject(userId: string): Promise<void> {
    this.message.set('');
    const user = await this.auth.rejectRegistration(userId);
    if (!user) {
      this.message.set('Korisnik nije pronađen.');
      return;
    }

    this.message.set(`Korisnik ${user.profile.displayName} je odbijen i poslat mu je mejl.`);
    await this.loadAll();
    await this.loadAnalytics();
  }

  async blockUser(userId: string): Promise<void> {
    const me = this.currentUser();
    if (userId === me?.id) {
      this.message.set('Ne možete blokirati sopstveni nalog.');
      return;
    }

    const reason = window.prompt('Razlog blokade', 'Neprimereno ponašanje')?.trim();
    if (!reason) {
      return;
    }

    const until = window.prompt('Datum do kada je blokiran (opciono, YYYY-MM-DD)', '')?.trim() || null;
    const user = await this.auth.blockUser(userId, reason, until);
    if (!user) {
      this.message.set('Blokada nije uspela.');
      return;
    }

    this.message.set(`Korisnik ${user.profile.displayName} je blokiran.`);
    await this.loadAll();
    await this.loadAnalytics();
  }

  async unblockUser(userId: string): Promise<void> {
    const me = this.currentUser();
    if (userId === me?.id) {
      this.message.set('Ne možete ukloniti blokadu sa sopstvenog naloga ovde.');
      return;
    }

    const user = await this.auth.unblockUser(userId);
    if (!user) {
      this.message.set('Uklanjanje blokade nije uspelo.');
      return;
    }

    this.message.set(`Korisniku ${user.profile.displayName} je uklonjena blokada.`);
    await this.loadAll();
    await this.loadAnalytics();
  }

  async deleteUser(userId: string): Promise<void> {
    const me = this.currentUser();
    if (userId === me?.id) {
      this.message.set('Ne možete obrisati sopstveni nalog ovde.');
      return;
    }
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
    await this.loadAll();
  }

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }

  private toDateInput(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
