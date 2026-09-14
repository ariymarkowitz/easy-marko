// Replaces files.ts in tests that call `vi.mock('../lib/files')`, so they can set what opening and saving give.

import { vi } from 'vitest';
import type * as files from '../files';

export const openFile = vi.fn<typeof files.openFile>();
export const saveFile = vi.fn<typeof files.saveFile>();
