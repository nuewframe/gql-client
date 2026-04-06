export interface GqlContent {
  type: 'query' | 'mutation';
  name?: string;
  query: string;
  variables?: Record<string, unknown>;
  headers?: Record<string, string>;
  endpoint?: string;
  httpVersion?: string;
}

export interface ParsedGqlFile {
  variables: Record<string, string>;
  requests: GqlContent[];
  endpoint?: string;
  httpVersion?: string;
}

export interface GqlParseOptions {
  allowCommandSubstitution?: boolean;
}

export interface HttpFileIssue {
  severity: 'error' | 'warning';
  line?: number;
  message: string;
}

export interface ValidationResult {
  file: string;
  errors: number;
  warnings: number;
  issues: HttpFileIssue[];
}

/**
 * Regex for splitting on `###` separator lines.
 * Allows optional trailing whitespace or comments after `###`.
 * Uses [ \t] instead of \s to avoid matching newlines.
 */
const SEPARATOR_RE = /^###(?:[ \t].*)?$/m;

export async function loadGqlFile(
  filePath: string,
  options: GqlParseOptions = {},
): Promise<ParsedGqlFile> {
  const content = await Deno.readTextFile(filePath);
  const sections = content.split(SEPARATOR_RE);

  // Parse variables from the preamble (before the first ### separator)
  const fileVariables: Record<string, string> = {};
  if (sections[0]) {
    const varLines = sections[0].split('\n');
    for (const line of varLines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) continue; // Skip commented lines
      if (trimmed.startsWith('@') && trimmed.includes(':')) {
        const colonIdx = trimmed.indexOf(':');
        const key = trimmed.substring(0, colonIdx);
        const rawValue = trimmed.substring(colonIdx + 1).trim();
        const varName = key.substring(1).trim();
        // Strip surrounding double-quotes (e.g. @HOST_URL: "https://..."
        fileVariables[varName] = rawValue.replace(/^"(.*)"$/, '$1');
      }
    }
  }

  // Use only file-defined variables (no auth variable override)
  const allVariables = { ...fileVariables };

  // Parse requests from remaining sections.
  // Re-scan the original content to extract separator labels (text after ###).
  const separatorLabelRe = /^###[ \t]*(.*)?$/gm;
  const separatorLabels: string[] = [];
  let sepMatch;
  while ((sepMatch = separatorLabelRe.exec(content)) !== null) {
    separatorLabels.push((sepMatch[1] ?? '').trim());
  }

  const requests: GqlContent[] = [];
  let endpoint: string | undefined;
  let httpVersion: string | undefined;

  for (let i = 1; i < sections.length; i++) {
    const section = sections[i].trim();
    if (!section) continue;

    const separatorLabel = separatorLabels[i - 1] || undefined;
    const request = parseRequestSection(section, allVariables, options, separatorLabel);
    if (request) {
      requests.push(request);
      // Use endpoint from first request if found
      if (!endpoint && request.endpoint) {
        endpoint = request.endpoint;
        httpVersion = request.httpVersion;
      }
    }
  }

  return { variables: allVariables, requests, endpoint, httpVersion };
}

function parseRequestSection(
  section: string,
  fileVariables: Record<string, string>,
  options: GqlParseOptions,
  separatorLabel?: string,
): GqlContent | null {
  const lines = section.split('\n');
  let query = '';
  const headers: Record<string, string> = {};
  let variables: Record<string, unknown> = {};
  let endpoint: string | undefined;
  let httpVersion: string | undefined;
  let inHeaders = false;
  let inVariables = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Check for endpoint line (POST/GET/PUT/etc. followed by URL)
    if (trimmed.match(/^(GET|POST|PUT|DELETE|PATCH)\s+/i)) {
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) {
        // Extract method and URL
        const _method = parts[0].toUpperCase();
        const url = parts[1];

        // Check if HTTP version is specified
        if (parts.length >= 3 && parts[2].toUpperCase().startsWith('HTTP/')) {
          httpVersion = parts[2];
        }

        // For GraphQL, we typically only care about the URL since graphql-request handles the method
        endpoint = substituteVariables(url, fileVariables, options);
      }
    } // Check if this is a header line (contains colon and looks like header)
    // Headers should be simple key-value pairs, not GraphQL syntax
    else if (
      trimmed.includes(':') &&
      !trimmed.startsWith('{') &&
      !trimmed.startsWith('query') &&
      !trimmed.startsWith('mutation') &&
      !trimmed.includes('$') && // GraphQL variables
      !trimmed.includes('(') && // GraphQL function calls
      trimmed.split(':').length === 2
    ) {
      // Simple key:value format
      inHeaders = true;
      inVariables = false;
      const [key, value] = trimmed.split(':', 2);
      headers[key.trim()] = substituteVariables(value.trim(), fileVariables, options);
    } // Check if this is the start of JSON variables (not GraphQL query)
    else if (trimmed.startsWith('{') && !inHeaders && !inVariables) {
      inHeaders = false;
      inVariables = true;
      // Collect the JSON block
      const jsonStart = lines.indexOf(line);
      const jsonLines = [];
      for (let j = jsonStart; j < lines.length; j++) {
        jsonLines.push(lines[j]);
        if (lines[j].trim().endsWith('}') && !lines[j].trim().includes('{')) {
          break;
        }
      }
      const jsonContent = jsonLines.join('\n');
      try {
        // Apply variable substitution to the JSON content before parsing
        const substitutedJson = substituteVariables(jsonContent, fileVariables, options);
        variables = JSON.parse(substitutedJson);
      } catch {
        // Invalid JSON variables — silently skip; the validator will catch structural issues
      }
      break; // Stop processing after JSON
    } // GraphQL query/mutation
    else if (trimmed.startsWith('query') || trimmed.startsWith('mutation')) {
      inHeaders = false;
      inVariables = false;
      query += line + '\n';
    } // Continue collecting query
    else if (!inHeaders && !inVariables) {
      query += line + '\n';
    }
  }

  if (!query.trim()) return null;

  // Determine type and name
  const queryLines = query.trim().split('\n');
  let type: 'query' | 'mutation' = 'query';
  let name: string | undefined;

  for (const line of queryLines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('query')) {
      type = 'query';
      const match = trimmed.match(/query\s+(\w+)/);
      if (match) name = match[1];
    } else if (trimmed.startsWith('mutation')) {
      type = 'mutation';
      const match = trimmed.match(/mutation\s+(\w+)/);
      if (match) name = match[1];
    }
  }

  // Fallback: use the separator label (text after ###) if no query name
  if (!name && separatorLabel) {
    name = separatorLabel;
  }

  return {
    type,
    name,
    query: cleanGraphQLQuery(query.trim()),
    variables,
    headers,
    endpoint,
    httpVersion,
  };
}

function substituteVariables(
  text: string,
  variables: Record<string, string>,
  options: GqlParseOptions,
): string {
  let result = text;

  // First, substitute file variables
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }

  // Then handle environment variables and command execution
  result = result.replace(/\{\{([^}]+)\}\}/g, (match, content) => {
    // Check if it's a command execution (starts with $)
    if (content.startsWith('$')) {
      if (!options.allowCommandSubstitution) {
        return match;
      }

      // WARNING: command substitution executes shell commands from query files.
      // Use only with trusted .gql/.http files.
      const command = content.slice(1).trim(); // Remove the $
      try {
        const output = new Deno.Command('sh', {
          args: ['-c', command],
          stdout: 'piped',
          stderr: 'piped',
        }).outputSync();

        if (output.success) {
          return new TextDecoder().decode(output.stdout).trim();
        } else {
          return match;
        }
      } catch {
        return match;
      }
    }

    // Check if it's an environment variable
    const envValue = Deno.env.get(content);
    if (envValue !== undefined) {
      return envValue;
    }

    // If neither command nor env var, return original
    return match;
  });

  return result;
}

function cleanGraphQLQuery(query: string): string {
  // Preserve GraphQL structure with proper indentation and newlines
  const lines = query.split('\n');
  const cleanedLines = lines.map((line) => line.trim()).filter((line) => line.length > 0);

  // Rebuild with proper indentation
  let result = '';
  let indentLevel = 0;

  for (let i = 0; i < cleanedLines.length; i++) {
    const line = cleanedLines[i];
    const trimmed = line.trim();

    // Decrease indent for closing braces
    if (trimmed.startsWith('}')) {
      indentLevel = Math.max(0, indentLevel - 1);
    }

    // Add proper indentation
    const indent = '  '.repeat(indentLevel);
    result += indent + trimmed;

    // Increase indent for opening braces
    if (trimmed.endsWith('{')) {
      indentLevel++;
    }

    // Add newline (except for last line)
    if (i < cleanedLines.length - 1) {
      result += '\n';
    }
  }

  return result;
}

/**
 * Validate an .http file and return a list of issues.
 * Useful for diagnosing why the parser finds no requests.
 */
export function validateHttpFile(content: string): HttpFileIssue[] {
  const issues: HttpFileIssue[] = [];
  const lines = content.split('\n');

  // ── Check for ### separators ──
  const hasSeparator = lines.some((l) => SEPARATOR_RE.test(l));

  if (!hasSeparator) {
    issues.push({
      severity: 'error',
      message:
        'No request separators (###) found. Each request must be preceded by "###" on its own line.',
    });

    // Look for near-miss separator lines (e.g. ####, ## #, # ##)
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (/^#{2,}$/.test(trimmed) && trimmed !== '###') {
        issues.push({
          severity: 'warning',
          line: i + 1,
          message: `"${trimmed}" looks like a separator but must be exactly "###".`,
        });
      }
    }
  }

  // ── Detect ### used as a comment prefix (e.g. "### @TOKEN: ...") ──
  // "###" is a request separator, not a comment. Comments use "#".
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (/^###\s+@\w+\s*:/.test(trimmed)) {
      issues.push({
        severity: 'error',
        line: i + 1,
        message:
          `"###" is a request separator, not a comment. To comment out a line, use "#" instead (e.g. "# ${
            trimmed.slice(4)
          }").`,
      });
    }
  }

  // ── Analyse request sections ──
  const sections = content.split(SEPARATOR_RE);
  const requestSectionCount = sections.length - 1;

  // Collect defined @VAR names from the preamble
  const definedVars = new Set<string>();
  if (sections[0]) {
    for (const line of sections[0].split('\n')) {
      const m = line.trim().match(/^@(\w+)\s*:/);
      if (m) definedVars.add(m[1]);
    }
  }

  if (hasSeparator && requestSectionCount === 0) {
    issues.push({
      severity: 'error',
      message: 'File contains ### separators but no request sections after them.',
    });
  }

  // Walk each request section
  for (let i = 1; i < sections.length; i++) {
    const section = sections[i].trim();

    if (!section) {
      issues.push({
        severity: 'warning',
        message: `Request section ${i} is empty (nothing after ### separator).`,
      });
      continue;
    }

    const hasMethod = /^(GET|POST|PUT|DELETE|PATCH)\s+/im.test(section);
    if (!hasMethod) {
      issues.push({
        severity: 'warning',
        message: `Request section ${i} has no HTTP method line (e.g. POST https://... HTTP/1.1).`,
      });
    }

    const hasBody = /\b(query|mutation)\b/.test(section);
    if (!hasBody) {
      issues.push({
        severity: 'warning',
        message: `Request section ${i} has no GraphQL query or mutation body.`,
      });
    }
  }

  // ── Check for undefined variable references ──
  // Match {{ WORD }} but skip command substitutions {{ $(...) }}
  const varRefRe = /\{\{\s*(\w+)\s*\}\}/g;
  let refMatch;
  while ((refMatch = varRefRe.exec(content)) !== null) {
    const varName = refMatch[1];
    // Skip the leading '$' token inside command substitutions
    if (varName === '$') continue;
    if (!definedVars.has(varName)) {
      const lineNum = content.substring(0, refMatch.index).split('\n').length;
      issues.push({
        severity: 'warning',
        line: lineNum,
        message: `Variable "{{ ${varName} }}" is referenced but not defined with @${varName}.`,
      });
    }
  }

  return issues;
}
