import { localRepository } from './local-repository';
import type { AcademyRepository } from './repository';

// Swap this adapter for a server-backed repository later without touching UI code.
export const repository: AcademyRepository = localRepository;

export type { AcademyRepository } from './repository';
