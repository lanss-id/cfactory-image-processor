export interface StorageProvider {
  save(key: string, data: Buffer): Promise<string>;
  getUrl?(key: string): string;
}