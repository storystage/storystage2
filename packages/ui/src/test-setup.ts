import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest's globals are off, so Testing Library can't clean up by itself.
afterEach(cleanup);
