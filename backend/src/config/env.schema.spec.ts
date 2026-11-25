import { listenAddress, validateEnv } from './env.schema.js';

const base = { JWT_SECRET: 'x'.repeat(32), DATABASE_URL: 'postgres://u:p@localhost:5432/seatiko' };

describe('env', () => {
  it('applies defaults and coerces values', () => {
    const env = validateEnv({ ...base, S3_PATH_STYLE: 'false', TWENTY_SYNC_INTERVAL_SECONDS: '30' });
    expect(env).toMatchObject({ APP_ENV: 'development', ADDR: ':8080', S3_PATH_STYLE: false, TWENTY_SYNC_INTERVAL_SECONDS: 30, GROQ_MODEL: 'openai/gpt-oss-120b' });
  });

  it('fails with a readable list of problems', () => {
    expect(() => validateEnv({ JWT_SECRET: 'short' })).toThrow(/JWT_SECRET[\s\S]*DATABASE_URL/);
  });

  it('reads Go style ADDR, PORT wins', () => {
    expect(listenAddress({ ADDR: ':8080' })).toEqual({ host: undefined, port: 8080 });
    expect(listenAddress({ ADDR: '127.0.0.1:18090' })).toEqual({ host: '127.0.0.1', port: 18090 });
    expect(listenAddress({ ADDR: ':8080', PORT: 3000 })).toEqual({ port: 3000 });
  });
});
