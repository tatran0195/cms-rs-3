async function callMcp(endpoint: string, method: string, params: any = {}, sessionId?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (sessionId) {
    headers['Mcp-Session-Id'] = sessionId;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Math.floor(Math.random() * 10_000),
      method,
      params,
    }),
  });

  const rawText = await res.text();
  const sessionHeader = res.headers.get('mcp-session-id') || undefined;

  // Extract JSON payload from SSE or direct JSON
  const match = rawText.match(/data:\s*(\{.*\})/);
  if (match) {
    return { data: JSON.parse(match[1]), session: sessionHeader };
  }
  return { data: JSON.parse(rawText), session: sessionHeader };
}

async function verifyAll() {
  const url = 'http://localhost:8999/mcp';
  console.log('=== VERIFYING RUNNER MCP SERVER (HTTP STREAMABLE) ===\n');

  // 1. Initialize
  console.log('1. Testing MCP initialize...');
  const init = await callMcp(url, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'human-tester', version: '1.0' },
  });
  console.log('Server Info:', init.data.result.serverInfo);
  console.log('Server Instructions:', init.data.result.instructions);
  const session = init.session;

  // 2. Tools List
  console.log('\n2. Testing tools/list...');
  const tools = await callMcp(url, 'tools/list', {}, session);
  const toolNames = tools.data.result.tools.map((t: any) => t.name);
  console.log('Available MCP Tools:', toolNames);

  // 3. Project Info
  console.log('\n3. Testing tool get_project_info...');
  const proj = await callMcp(url, 'tools/call', { name: 'get_project_info', arguments: {} }, session);
  console.log('Project Info Output:\n', proj.data.result.content[0].text);

  // 4. List Pages
  console.log('\n4. Testing tool list_pages...');
  const list = await callMcp(url, 'tools/call', { name: 'list_pages', arguments: {} }, session);
  console.log('Pages List Output:\n', list.data.result.content[0].text);

  // 5. Get Page by custom_id
  console.log('\n5. Testing tool get_page by custom_id ("auth-guide")...');
  const pageCustom = await callMcp(url, 'tools/call', { name: 'get_page', arguments: { id_or_path: 'auth-guide' } }, session);
  console.log('Page Content:\n', pageCustom.data.result.content[0].text);

  // 6. Get Page by GROUP custom_id ("api-ref" -> unwrapped to first child "/api/auth")
  console.log('\n6. Testing tool get_page with GROUP unwrapping ("api-ref")...');
  const pageGroup = await callMcp(url, 'tools/call', { name: 'get_page', arguments: { id_or_path: 'api-ref' } }, session);
  console.log('Group Unwrapped Leaf Page Content:\n', pageGroup.data.result.content[0].text);

  // 7. Search Docs
  console.log('\n7. Testing tool search_docs (query: "Bearer")...');
  const search = await callMcp(url, 'tools/call', { name: 'search_docs', arguments: { query: 'Bearer' } }, session);
  console.log('Search Results:\n', search.data.result.content[0].text);

  console.log('\n✓ ALL MCP OPERATIONS VERIFIED SUCCESSFULLY!');
}

verifyAll().catch(console.error);
