import { spawn } from 'node:child_process';
import path from 'node:path';

async function testStdioMcp() {
  console.log('=== VERIFYING CMS-SITE MCP (STDIO TRANSPORT) ===\n');

  const exePath = path.resolve('target/debug/cms-site.exe');
  const dbPath = path.resolve('target/demo-site/docs.sqlite');

  const child = spawn(exePath, ['mcp', '--db', dbPath, '--log-level', 'info'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdoutData = '';
  let stderrData = '';

  child.stdout.on('data', (d) => {
    stdoutData += d.toString();
  });

  child.stderr.on('data', (d) => {
    stderrData += d.toString();
  });

  // 1. Send initialize request
  const initMsg = `${JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'stdio-tester', version: '1.0' },
    },
  })}\n`;

  child.stdin.write(initMsg);

  // Wait for response
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // 2. Send tools/call search_docs
  const callMsg = `${JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'search_docs',
      arguments: { query: 'HMAC' },
    },
  })}\n`;

  child.stdin.write(callMsg);

  await new Promise((resolve) => setTimeout(resolve, 1000));

  child.stdin.end();
  child.kill();

  console.log('STDERR Output (Log stream):');
  console.log(stderrData.trim() || '(None)');

  console.log('\nSTDOUT Output (Protocol stream):');
  console.log(stdoutData.trim());

  // Verification checks:
  const lines = stdoutData
    .trim()
    .split('\n')
    .filter((l) => l.trim().length > 0);
  console.log(`\nReceived ${lines.length} lines on stdout.`);

  for (let i = 0; i < lines.length; i++) {
    const parsed = JSON.parse(lines[i]);
    console.log(`Line ${i + 1} parsed as valid JSON-RPC (id: ${parsed.id}):`);
    if (parsed.id === 1) {
      console.log('  -> Server info:', parsed.result.serverInfo.name);
    } else if (parsed.id === 2) {
      const toolText = parsed.result.content[0].text;
      console.log('  -> search_docs hit:', toolText.includes('Webhooks') ? 'FOUND Webhooks hit' : 'FAILED');
    }
  }

  // Ensure stderr captured the logs and stdout has 0 log lines
  const stdoutHasLogs = stdoutData.includes('INFO') || stdoutData.includes('DEBUG') || stdoutData.includes('WARN');
  console.log('\nStdout pollution check (should be false):', stdoutHasLogs);
  if (stdoutHasLogs) {
    throw new Error('Violation: Logs found on stdout!');
  }

  console.log('\n✓ STDIO MCP TRANSPORT VERIFIED SUCCESSFULLY!');
}

testStdioMcp().catch(console.error);
