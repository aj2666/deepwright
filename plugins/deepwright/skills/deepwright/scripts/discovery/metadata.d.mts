export interface Skill {
  readonly name: string;
  readonly description: string;
  readonly displayName: string;
  readonly path: string;
  readonly implicit: boolean;
}

export function validName(value: string): boolean;
export function loadCatalog(pluginRoot: string): Promise<readonly Skill[]>;
