---
name: deno-cli-dev
description: 'Core development paradigm for gql-client. Covers the Capability → Data → Function → Composition → Integration layering, module organization, and how to extend the codebase correctly.'
---

# Deno CLI Development Skill

## When to Use

Trigger phrases: "add feature", "refactor", "new module", "architecture", "extend",
"design", "data flow", "restructure".

Use this skill when building, extending, or refactoring `gql-client` features.

---

## Architecture Paradigm

Good programming practice starts with **capability**, then **data structure**, then
**functions**. The composition of these becomes the command exposed to the user via CLI,
API, or UI. The integration layer is the set of contracts that connects everything using
the same paradigm.

### The Five Layers

| Order | Layer           | What it defines                               | Where it lives                              |
| ----- | --------------- | --------------------------------------------- | ------------------------------------------- |
| 1     | **Capability**  | What the system can do (types, interfaces)    | Type exports in domain modules              |
| 2     | **Data**        | Shapes that flow through the system           | Type exports: `GqlContent`, `ParsedGqlFile` |
| 3     | **Function**    | Stateless transforms on data structures       | Named exports in `commands/<domain>/*.ts`   |
| 4     | **Composition** | Wires functions into a user-facing command    | `commands/run.ts`, `commands/config.ts`     |
| 5     | **Integration** | Contracts connecting layers and external deps | Shared types, stdout/stderr, file contracts |

### Rules

- **Types before implementation.** Define types/interfaces first. They are the contract.
- **Functions are pure.** A function in `commands/requests/executor.ts` accepts typed input
  and returns typed output. No implicit global state.
- **Commands only compose.** A command file imports types and functions, wires them in the
  `.action()` handler, and routes output. It never contains domain logic.
- **Integration is explicit.** Cross-module dependencies use shared types. The data pipeline
  (`ParsedGqlFile → GqlContent[] → Result[]`) is the integration contract.

---

## Module Layout

```
commands/
  run.ts                 ← Composition: CLI command, composes executor + formatter
  config.ts              ← Composition: CLI command group for config management
  validate.ts            ← Composition: CLI command for .http validation
  environment/
    resolver.ts          ← Function: resolve env variables from config/CLI
  errors/
    gql-client-error.ts  ← Capability: error type guard + data structure
  files/
    resolver.ts          ← Function: resolve .http file path
  output/
    formatter.ts         ← Function: serialize results to YAML/JSON/compact
    field-extractor.ts   ← Function: extract nested fields by dot-path
  requests/
    executor.ts          ← Function + Capability: types + orchestration pipeline
    formatter.ts         ← Function: format request list for display
  tokens/
    substitution.ts      ← Function: execute {{ $( command ) }} tokens
  validation/
    validator.ts         ← Function: emit validation diagnostics
utils/
  gql-parser.ts          ← Capability + Data + Function: types + parser
  logger.ts              ← Capability: Logger class (stderr writer)
```

---

## Data Flow Pipeline

The run command follows this pipeline, each step consuming and producing typed data:

```
CLI Options (RunCommandOptions)
  ↓ [resolveFilePath]
Absolute .http path
  ↓ [resolveEnvVariables]
Environment variables map
  ↓ [loadGqlFile]
ParsedGqlFile { variables, requests: GqlContent[] }
  ↓ [executeCommandTokens]
Hydrated GqlContent[] (tokens resolved)
  ↓ [GraphQLClient.request]
Response[] (JSON data or GqlClientError)
  ↓ [extractField?] + [emitOutput]
Formatted output → stdout
```

Each arrow is an integration contract — a function with typed input/output.

---

## Adding a New Capability

Follow the layer order:

### 1. Define the types

```typescript
// commands/my-domain/types.ts
export interface MyInput {
  filePath: string;
  format: RunOutputFormat;
}

export interface MyResult {
  items: string[];
  count: number;
}
```

### 2. Define the data structures

If new parsed or intermediate structures are needed, define them alongside the types.

### 3. Implement functions

```typescript
// commands/my-domain/processor.ts
import type { MyInput, MyResult } from './types.ts';

export function process(input: MyInput): MyResult {
  // pure transformation — no CLI/IO/logging here
  return { items: [], count: 0 };
}
```

### 4. Compose in the command

```typescript
// commands/my-command.ts
import { Command } from '@cliffy/command';
import { process } from './my-domain/processor.ts';
import type { MyInput } from './my-domain/types.ts';

export const myCommand = new Command()
  .name('my-command')
  .action(async (options, file) => {
    const input: MyInput = { filePath: file, format: options.output };
    const result = process(input);
    console.log(JSON.stringify(result, null, 2));
  });
```

### 5. Verify integration

- The command imports only types and functions — no internal details leak.
- Shared types serve as the contract between producer and consumer modules.
- The data pipeline is traceable: input type → function → output type.

---

## Anti-Patterns

| Anti-pattern                                | Correct approach                                     |
| ------------------------------------------- | ---------------------------------------------------- |
| Business logic inside `.action()` handler   | Extract to a domain function, compose in the command |
| Untyped data passed between modules         | Define an interface; use it as the contract          |
| God module that parses + executes + formats | Split into focused modules per layer                 |
| Functions with side effects (console.log)   | Return data; let the composition layer handle I/O    |
| Importing internal helpers across domains   | Promote to a shared type or utility                  |
