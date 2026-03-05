export type AppMode = 'production' | 'dev';

export function normalizeAppMode(value: unknown): AppMode {
  return value === 'dev' ? 'dev' : 'production';
}
