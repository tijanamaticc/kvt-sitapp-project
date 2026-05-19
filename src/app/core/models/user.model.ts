export interface UserProfile {
  firstName?: string;
  lastName?: string;
  displayName: string;
  bio?: string;
  status?: string;
  avatarSeed?: string;
  avatarUrl?: string | null;
}

export interface User {
  id: string;
  username: string;
  email: string;
  phone: string;
  password: string;
  role: 'student' | 'admin';
  profile: UserProfile;
}
