import { CanActivateFn } from '@angular/router';
import { of } from 'rxjs';

// Auth is not yet implemented — allow all routes.
// Replace with a real token check when the backend is ready.
export const AuthGuard: CanActivateFn = () => of(true);
