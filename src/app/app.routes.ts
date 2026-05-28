import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './core/services/auth.guard';
import { LoginPageComponent } from './features/auth/pages/login-page.component';
import { ChatShellComponent, ChatMessagesPageComponent, ChatContactsPageComponent, ChatProfilePageComponent } from './features/chat';
import { AdminPageComponent } from './features/admin/pages/admin-page.component';

export const appRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'login'
  },
  {
    path: 'login',
    component: LoginPageComponent,
    canActivate: [guestGuard]
  },
  {
    path: 'chat',
    component: ChatShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'messages' },
      { path: 'messages', component: ChatMessagesPageComponent },
      { path: 'contacts', component: ChatContactsPageComponent },
      { path: 'profile', component: ChatProfilePageComponent }
    ]
  },
  {
    path: 'admin',
    component: AdminPageComponent,
    canActivate: [adminGuard]
  },
  {
    path: '**',
    redirectTo: 'login'
  }
];