import { config } from 'dotenv';
import { resolve } from 'node:path';

// Load backend/.env once for all e2e specs (DATABASE_URL, ADMIN_* keys).
config({ path: resolve(import.meta.dirname, '../.env') });
