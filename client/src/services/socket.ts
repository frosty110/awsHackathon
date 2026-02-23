import { io, type Socket } from 'socket.io-client';
import { getAuthToken } from './auth';

// Single Socket.IO client instance — connect only when entering multiplayer mode.
// No URL specified: Vite proxy routes /socket.io to the backend server,
// so using io() with no URL defaults to the current page origin.
// The auth callback reads the token at connection time (not stale from module load).
export const socket: Socket = io({
  autoConnect: false,
  auth: (cb) => { cb({ token: getAuthToken() }); },
});
