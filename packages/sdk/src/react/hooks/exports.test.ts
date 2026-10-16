import { describe, expect, it } from 'vitest';
import * as exportsHooks from './exports';

describe('SDK Exports Hooks', () => {
  it('exports all expected export hooks', () => {
    expect(exportsHooks.useListExportSchedules).toBeDefined();
    expect(exportsHooks.useCreateExportSchedule).toBeDefined();
    expect(exportsHooks.useUpdateExportSchedule).toBeDefined();
    expect(exportsHooks.useDeleteExportSchedule).toBeDefined();
    expect(exportsHooks.useRunExportSchedule).toBeDefined();
    expect(exportsHooks.useListExportJobs).toBeDefined();
    expect(exportsHooks.useCreateExportJob).toBeDefined();
  });
});
