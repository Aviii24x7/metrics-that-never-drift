import { z } from 'zod';
import { isValidTimeZone } from '../time/range';

// Load .env if present. In CI the variables come from the environment instead,
// so a missing file is not an error.
try {
  process.loadEnvFile();
} catch {
  /* no .env file — expect variables from the environment */
}

const EnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .refine((u) => /^postgres(ql)?:\/\//.test(u), 'must be a postgres:// connection string'),
  PORT: z.coerce.number().int().positive().default(3000),
  DEFAULT_TZ: z
    .string()
    .default('UTC')
    .refine(isValidTimeZone, 'must be a valid IANA timezone'),
  STRIPE_SECRET_KEY: z.string().default(''),
  RAZORPAY_KEY_ID: z.string().default(''),
  RAZORPAY_KEY_SECRET: z.string().default(''),
  LEGACY_CSV_PATH: z.string().default('./data/legacy-erp.csv'),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`,
    );
    // Fail fast at boot with a readable message naming the offending variable(s).
    console.error('Invalid environment configuration:\n' + lines.join('\n'));
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();

/** Whether Stripe credentials are configured (the adapter can sync live data). */
export const hasStripe = (): boolean => env.STRIPE_SECRET_KEY.length > 0;

/** Whether Razorpay credentials are configured. */
export const hasRazorpay = (): boolean =>
  env.RAZORPAY_KEY_ID.length > 0 && env.RAZORPAY_KEY_SECRET.length > 0;
