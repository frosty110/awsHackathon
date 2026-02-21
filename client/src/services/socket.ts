import { io, type Socket } from 'socket.io-client';

// Single Socket.IO client instance — connect only when entering multiplayer mode.
// No URL specified: Vite proxy routes /socket.io to the backend server,
// so using io() with no URL defaults to the current page origin.
export const socket: Socket = io({ autoConnect: false });
