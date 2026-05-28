export interface UserProfile {
  firstName?: string;
  lastName?: string;
  displayName: string;
  bio?: string;
  status?: string;
  avatarSeed?: string;
  avatarUrl?: string | null;
  lastActivityAt?: string | null;
}

export type AccountStatus = 'pending' | 'approved' | 'rejected' | 'blocked';

export interface User {
  id: string;
  username: string;
  email: string;
  phone: string;
  password: string;
  role: 'student' | 'admin';
  accountStatus?: AccountStatus;
  blockedAt?: string | null;
  blockedUntil?: string | null;
  blockedReason?: string | null;
  profile: UserProfile;
}
