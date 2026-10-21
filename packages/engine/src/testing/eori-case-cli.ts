import { createEngine } from '../engine.ts';
import { runEoriCase } from './eori-case.ts';
import { loadDistModel } from './load-model.ts';

// Test-only child-process entry (ENG-10): prints the projected EORI case as JSON and nothing else.
process.stdout.write(`${JSON.stringify(runEoriCase(createEngine(loadDistModel())), null, 2)}\n`);
