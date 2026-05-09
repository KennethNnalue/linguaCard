import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, map, Observable, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarInitials: string;
}

interface StoredUser extends AuthUser {
  password: string;
  createdAt: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
}

const TOKEN_KEY = 'lc-token';
const USER_KEY = 'lc-user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly _token = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  private readonly _user = signal<AuthUser | null>(this.loadStoredUser());

  readonly token = this._token.asReadonly();
  readonly currentUser = this._user.asReadonly();
  readonly isAuthenticated = computed(() => !!this._token());

  login(payload: LoginPayload): Observable<AuthUser> {
    return this.http
      .get<StoredUser[]>(`${environment.apiUrl}/users`, {
        params: { email: payload.email },
      })
      .pipe(
        map((users) => {
          const user = users.find(
            (u) => u.email === payload.email && u.password === payload.password
          );
          if (!user) throw new Error('Invalid email or password');
          return user;
        }),
        tap((user) => this.persist(user))
      );
  }

  register(payload: RegisterPayload): Observable<AuthUser> {
    const parts = payload.name.trim().split(' ');
    const initials =
      parts.length >= 2
        ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
        : parts[0].slice(0, 2).toUpperCase();

    const newUser: Omit<StoredUser, 'id'> = {
      name: payload.name,
      email: payload.email,
      password: payload.password,
      avatarInitials: initials,
      createdAt: new Date().toISOString(),
    };

    return this.http
      .post<StoredUser>(`${environment.apiUrl}/users`, newUser)
      .pipe(tap((user) => this.persist(user)));
  }

  forgotPassword(email: string): Observable<void> {
    return this.http
      .get<StoredUser[]>(`${environment.apiUrl}/users`, { params: { email } })
      .pipe(map(() => void 0));
  }

  verifyPassword(password: string): Observable<boolean> {
    const user = this._user();
    if (!user) return of(false);
    return this.http
      .get<StoredUser[]>(`${environment.apiUrl}/users`, { params: { email: user.email } })
      .pipe(
        map(users => users.some(u => u.email === user.email && u.password === password)),
        catchError(() => of(false))
      );
  }

  logout(): void {
    this._token.set(null);
    this._user.set(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.router.navigateByUrl('/auth/login');
  }

  private persist(user: StoredUser): void {
    const token = this.mockToken(user);
    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarInitials: user.avatarInitials,
    };
    this._token.set(token);
    this._user.set(authUser);
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(authUser));
  }

  private mockToken(user: StoredUser): string {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = btoa(
      JSON.stringify({ sub: user.id, email: user.email, exp: Date.now() + 86_400_000 })
    );
    return `${header}.${payload}.mock-sig`;
  }

  private loadStoredUser(): AuthUser | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  }
}
