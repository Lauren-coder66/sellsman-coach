import { pathToFileURL } from 'node:url';

export function releaseProblems(env) {
  const errors = [];
  const profile = env.RELEASE_PROFILE;
  if (profile !== 'production' && profile !== 'staging') return ['RELEASE_PROFILE'];
  if (!/^\/var\/lib\/sales-coach\/[a-zA-Z0-9][a-zA-Z0-9_.-]*\.sqlite$/.test(env.DATABASE_URL ?? '')) errors.push('DATABASE_URL');
  if (profile === 'staging') return errors;
  const domain = env.PUBLIC_DOMAIN ?? '';
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain) || /\.(test|invalid|localhost)$/i.test(domain)) errors.push('PUBLIC_DOMAIN');
  if (env.BETTER_AUTH_URL !== `https://${domain}`) errors.push('BETTER_AUTH_URL');
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) errors.push('BETTER_AUTH_SECRET');
  if (env.ACCOUNT_REQUIRED !== '1') errors.push('ACCOUNT_REQUIRED');
  if (env.AUTH_MAIL_TRANSPORT !== 'resend' || env.AUTH_MAIL_TEST_URL || env.ACCOUNT_TEST_MAIL_DIR || env.E2E_TEST === '1') errors.push('AUTH_MAIL_TRANSPORT');
  if (!env.AUTH_MAIL_FROM?.trim()) errors.push('AUTH_MAIL_FROM');
  if (!env.RESEND_API_KEY?.trim()) errors.push('RESEND_API_KEY');
  if (env.AI_MODE !== 'real' || env.AI_PROVIDER !== 'bailian' || env.AI_MODEL !== 'qwen3.7-flash' ||
      env.AI_API_URL !== 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions' || !env.AI_API_KEY?.trim()) errors.push('AI_CONFIGURATION');
  if (env.AI_CALLS_ENABLED !== '1') errors.push('AI_CALLS_ENABLED');
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = releaseProblems(process.env);
  if (errors.length) {
    console.error('Invalid release configuration: ' + errors.join(', '));
    process.exitCode = 1;
  }
}
