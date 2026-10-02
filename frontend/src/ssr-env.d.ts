/**
 * The one Node API the server renderer (src/entry-server.tsx) uses. Declared here instead of adding @types/node to the
 * browser app's types (which would change the types of setTimeout & co. everywhere).
 */
declare module 'node:async_hooks' {
  export class AsyncLocalStorage<T> {
    run<R>(store: T, callback: () => R): R;
    getStore(): T | undefined;
  }
}
