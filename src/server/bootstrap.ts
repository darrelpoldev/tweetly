export interface BootstrapDependencies {
  migrateAndSeed: () => Promise<void>;
  startServer: () => Promise<void>;
}

export async function bootstrap(
  dependencies: BootstrapDependencies,
): Promise<void> {
  await dependencies.migrateAndSeed();
  await dependencies.startServer();
}
