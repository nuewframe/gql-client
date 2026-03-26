import { Command } from '@cliffy/command';

async function findGqlFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  try {
    for await (const entry of Deno.readDir(dir)) {
      const fullPath = `${dir}/${entry.name}`;
      if (entry.isFile && entry.name.endsWith('.http')) {
        files.push(fullPath);
      } else if (entry.isDirectory && !entry.name.startsWith('.')) {
        files.push(...(await findGqlFiles(fullPath)));
      }
    }
  } catch {
    // Ignore directories we can't read
  }

  return files;
}

export const listCommand = new Command()
  .description('List available .http files')
  .option('-d, --dir <dir:string>', 'Directory to search')
  .action(async (options) => {
    try {
      const searchDir = options.dir ?? Deno.cwd();
      const files = await findGqlFiles(searchDir);

      if (files.length === 0) {
        console.log('📁 No .http files found');
        return;
      }

      console.log('📋 Available .http files:');
      for (const file of files) {
        console.log(`  ${file}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('❌ Failed to list files:', message);
      Deno.exit(1);
    }
  });
