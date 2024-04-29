import { createInjector } from 'typed-inject';
import { MutantResult } from '@stryker-mutator/api/core';

import { provideLogger } from './../../di/provide-logger.js';
import { PrepareExecutor } from './../../process/1-prepare-executor.js';
import { MutantInstrumenterExecutor as ServerMutantInstrumenterExecutor } from './process/mutant-instrument-executor.js';

/**
 * Get the mutant results for the given glob patterns, without running the mutation tests.
 * @param globPatterns The glob patterns to instrument.
 * @returns The mutant results.
 */
export async function runInstrumentation(globPatterns?: string[]): Promise<MutantResult[]> {
  const rootInjector = createInjector();

  const loggerProvider = provideLogger(rootInjector);

  const prepareExecutor = loggerProvider.injectClass(PrepareExecutor);

  const options = globPatterns?.length ? { mutate: globPatterns } : {};
  const mutantInstrumenterInjector = await prepareExecutor.execute(options);

  const mutantInstrumenter = mutantInstrumenterInjector.injectClass(ServerMutantInstrumenterExecutor);

  return await mutantInstrumenter.execute();
}