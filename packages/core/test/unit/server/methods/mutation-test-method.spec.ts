import { factory, testInjector } from '@stryker-mutator/test-helpers';
import { expect } from 'chai';
import sinon from 'sinon';
import * as typedInject from 'typed-inject';
import { MutantResult } from '@stryker-mutator/api/core';
import { Logger } from '@stryker-mutator/api/logging';
import { commonTokens } from '@stryker-mutator/api/plugin';

import { LogConfigurator } from '../../../../src/logging/index.js';
import {
  PrepareExecutor,
  MutantInstrumenterExecutor,
  DryRunExecutor,
  MutationTestExecutor,
  MutationTestContext,
} from '../../../../src/process/index.js';
import { coreTokens } from '../../../../src/di/index.js';
import { ConfigError } from '../../../../src/errors.js';
import { TemporaryDirectory } from '../../../../src/utils/temporary-directory.js';
import { MutationTestMethod } from '../../../../src/server/methods/mutation-test-method.js';
import { BroadcastReporter } from '../../../../src/reporters/index.js';

describe(MutationTestMethod.name, () => {
  let shutdownLoggingStub: sinon.SinonStub;
  let injectorMock: sinon.SinonStubbedInstance<typedInject.Injector<MutationTestContext>>;
  let mutantResults: MutantResult[];
  let loggerMock: sinon.SinonStubbedInstance<Logger>;
  let temporaryDirectoryMock: sinon.SinonStubbedInstance<TemporaryDirectory>;
  let getLoggerStub: sinon.SinonStub;
  let reporterStub: sinon.SinonStubbedInstance<BroadcastReporter>;

  let prepareExecutorMock: sinon.SinonStubbedInstance<PrepareExecutor>;
  let mutantInstrumenterExecutorMock: sinon.SinonStubbedInstance<MutantInstrumenterExecutor>;
  let dryRunExecutorMock: sinon.SinonStubbedInstance<DryRunExecutor>;
  let mutationTestExecutorMock: sinon.SinonStubbedInstance<MutationTestExecutor>;
  let abortController: AbortController;
  let sut: MutationTestMethod;

  beforeEach(() => {
    injectorMock = factory.injector();
    loggerMock = factory.logger();
    reporterStub = sinon.createStubInstance(BroadcastReporter);
    (reporterStub as any).reporters = { empty: factory.reporter() };
    getLoggerStub = sinon.stub();
    mutantResults = [];
    temporaryDirectoryMock = sinon.createStubInstance(TemporaryDirectory);
    prepareExecutorMock = sinon.createStubInstance(PrepareExecutor);
    mutantInstrumenterExecutorMock = sinon.createStubInstance(MutantInstrumenterExecutor);
    dryRunExecutorMock = sinon.createStubInstance(DryRunExecutor);
    mutationTestExecutorMock = sinon.createStubInstance(MutationTestExecutor);
    injectorMock.injectClass
      .withArgs(PrepareExecutor)
      .returns(prepareExecutorMock)
      .withArgs(MutantInstrumenterExecutor)
      .returns(mutantInstrumenterExecutorMock)
      .withArgs(DryRunExecutor)
      .returns(dryRunExecutorMock)
      .withArgs(MutationTestExecutor)
      .returns(mutationTestExecutorMock);
    injectorMock.resolve
      .withArgs(commonTokens.getLogger)
      .returns(getLoggerStub)
      .withArgs(coreTokens.temporaryDirectory)
      .returns(temporaryDirectoryMock)
      .withArgs(commonTokens.options)
      .returns(testInjector.options)
      .withArgs(coreTokens.reporter)
      .returns(reporterStub);
    getLoggerStub.returns(loggerMock);

    prepareExecutorMock.execute.resolves(injectorMock as typedInject.Injector<MutationTestContext>);
    mutantInstrumenterExecutorMock.execute.resolves(injectorMock as typedInject.Injector<MutationTestContext>);
    dryRunExecutorMock.execute.resolves(injectorMock as typedInject.Injector<MutationTestContext>);
    mutationTestExecutorMock.execute.resolves(mutantResults);

    shutdownLoggingStub = sinon.stub(LogConfigurator, 'shutdown');

    abortController = new AbortController();
    sut = new MutationTestMethod(() => injectorMock as typedInject.Injector<MutationTestContext>);
  });

  describe('runMutationTestRealtime', () => {
    it('should execute the preparations', async () => {
      await sut.runMutationTestRealtime({}, abortController.signal, () => undefined);
      expect(prepareExecutorMock.execute).calledOnce;
    });
    it('should execute the mutant instrumenter', async () => {
      await sut.runMutationTestRealtime({}, abortController.signal, () => undefined);
      expect(mutantInstrumenterExecutorMock.execute).calledOnce;
    });
    it('should execute the dry run', async () => {
      await sut.runMutationTestRealtime({}, abortController.signal, () => undefined);
      expect(dryRunExecutorMock.execute).calledOnce;
    });

    it('should execute actual mutation testing', async () => {
      await sut.runMutationTestRealtime({}, abortController.signal, () => undefined);
      expect(mutationTestExecutorMock.execute).calledOnce;
    });

    it('should reject when empty reporter is not available', async () => {
      (reporterStub.reporters as any) = {};
      await expect(sut.runMutationTestRealtime({}, abortController.signal, () => undefined)).rejectedWith('Reporter unavailable');
    });

    it('should execute prepare with the given glob patterns and empty reporter', async () => {
      const globPatterns = ['foo.js', 'bar.js'];
      await sut.runMutationTestRealtime({ mutate: globPatterns }, abortController.signal, () => undefined);

      expect(prepareExecutorMock.execute).calledOnceWith({ mutate: globPatterns, reporters: ['empty'] });
    });

    it('should reject when prepare rejects', async () => {
      const expectedError = new Error('expected error for testing');
      prepareExecutorMock.execute.rejects(expectedError);
      await expect(sut.runMutationTestRealtime({}, abortController.signal, () => undefined)).rejectedWith(expectedError);
    });

    it('should not log a stack trace for a config error', async () => {
      const expectedError = new ConfigError('foo should be bar');
      prepareExecutorMock.execute.rejects(expectedError);
      await expect(sut.runMutationTestRealtime({}, abortController.signal, () => undefined)).rejected;
      expect(loggerMock.error).calledWithExactly('foo should be bar');
    });

    it('should reject when execute the mutant instrumenter rejects', async () => {
      const expectedError = new Error('expected error for testing');
      mutationTestExecutorMock.execute.rejects(expectedError);
      await expect(sut.runMutationTestRealtime({}, abortController.signal, () => undefined)).rejectedWith(expectedError);
    });

    it('should reject when execute the dry run rejects', async () => {
      const expectedError = new Error('expected error for testing');
      dryRunExecutorMock.execute.rejects(expectedError);
      await expect(sut.runMutationTestRealtime({}, abortController.signal, () => undefined)).rejectedWith(expectedError);
    });

    it('should reject when execute actual mutation testing rejects', async () => {
      const expectedError = new Error('expected error for testing');
      mutationTestExecutorMock.execute.rejects(expectedError);
      await expect(sut.runMutationTestRealtime({}, abortController.signal, () => undefined)).rejectedWith(expectedError);
    });

    it('should log the error when prepare rejects unexpectedly', async () => {
      const expectedError = new Error('expected error for testing');
      prepareExecutorMock.execute.rejects(expectedError);
      await expect(sut.runMutationTestRealtime({}, abortController.signal, () => undefined)).rejected;
      expect(loggerMock.error).calledWith('Unexpected error occurred while running Stryker', expectedError);
    });

    it('should disable `removeDuringDisposal` on the temp dir when dry run rejects', async () => {
      dryRunExecutorMock.execute.rejects(new Error('expected error for testing'));
      await expect(sut.runMutationTestRealtime({}, abortController.signal, () => undefined)).rejected;
      expect(getLoggerStub).calledWith('Stryker');
      expect(loggerMock.debug).calledWith('Not removing the temp dir because an error occurred');
      expect(temporaryDirectoryMock.removeDuringDisposal).false;
    });

    it('should not disable `removeDuringDisposal` on the temp dir when dry run rejects and cleanTempDir is set to `always`', async () => {
      dryRunExecutorMock.execute.rejects(new Error('expected error for testing'));
      testInjector.options.cleanTempDir = 'always';
      await expect(sut.runMutationTestRealtime({}, abortController.signal, () => undefined)).rejected;
      expect(temporaryDirectoryMock.removeDuringDisposal).not.false;
    });

    it('should log the error when dry run rejects unexpectedly', async () => {
      const expectedError = new Error('expected error for testing');
      dryRunExecutorMock.execute.rejects(expectedError);
      await expect(sut.runMutationTestRealtime({}, abortController.signal, () => undefined)).rejected;
      expect(getLoggerStub).calledWith('Stryker');
      expect(loggerMock.error).calledWith('Unexpected error occurred while running Stryker', expectedError);
    });

    it('should log a help message when log level "trace" is not enabled', async () => {
      const expectedError = new Error('expected error for testing');
      loggerMock.isTraceEnabled.returns(false);
      dryRunExecutorMock.execute.rejects(expectedError);
      await expect(sut.runMutationTestRealtime({}, abortController.signal, () => undefined)).rejected;
      [
        'This might be a known problem with a solution documented in our troubleshooting guide.',
        'You can find it at https://stryker-mutator.io/docs/stryker-js/troubleshooting/',
        'Still having trouble figuring out what went wrong? Try `npx stryker run --fileLogLevel trace --logLevel debug` to get some more info.',
      ].forEach((m) => expect(loggerMock.info).calledWith(m));
    });

    it('should not log a help message when log level "trace" is enabled', async () => {
      const expectedError = new Error('expected error for testing');
      loggerMock.isTraceEnabled.returns(true);
      dryRunExecutorMock.execute.rejects(expectedError);
      await expect(sut.runMutationTestRealtime({}, abortController.signal, () => undefined)).rejected;
      [
        'This might be a known problem with a solution documented in our troubleshooting guide.',
        'You can find it at https://stryker-mutator.io/docs/stryker-js/troubleshooting/',
      ].forEach((m) => expect(loggerMock.info).calledWith(m));
    });

    it('should dispose the injector', async () => {
      await sut.runMutationTestRealtime({}, abortController.signal, () => undefined), expect(injectorMock.dispose).called;
    });

    it('should dispose also on a rejection injector', async () => {
      prepareExecutorMock.execute.rejects(new Error('expected error'));
      await expect(sut.runMutationTestRealtime({}, abortController.signal, () => undefined)).rejected;
      expect(injectorMock.dispose).called;
    });

    it('should shut down the logging server', async () => {
      await sut.runMutationTestRealtime({}, abortController.signal, () => undefined), expect(shutdownLoggingStub).called;
    });

    it('should dispose the injector when actual mutation testing rejects', async () => {
      mutationTestExecutorMock.execute.rejects(new Error('Expected error for testing'));
      await expect(sut.runMutationTestRealtime({}, abortController.signal, () => undefined)).rejected;
      expect(injectorMock.dispose).called;
    });

    it('should shut down the logging server when actual mutation testing rejects', async () => {
      mutationTestExecutorMock.execute.rejects(new Error('Expected error for testing'));
      await expect(sut.runMutationTestRealtime({}, abortController.signal, () => undefined)).rejected;
      expect(shutdownLoggingStub).called;
    });
  });
});
