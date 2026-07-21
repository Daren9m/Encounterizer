export type DmScreenWorkspaceMode = 'run' | 'arrange';

export function isDmScreenWorkspaceMode(
  value: unknown,
): value is DmScreenWorkspaceMode {
  return value === 'run' || value === 'arrange';
}
