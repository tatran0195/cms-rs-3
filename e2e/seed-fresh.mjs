const BASE_URL = 'http://localhost:3000';

async function seed() {
  console.log('1. Registering admin user...');
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'Password123!', name: 'Admin User' }),
  });
  console.log('Register status:', regRes.status);

  console.log('2. Logging in...');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'Password123!' }),
  });
  const cookie = loginRes.headers.get('set-cookie')?.split(';')[0];
  console.log('Login cookie:', cookie);

  console.log('3. Creating default project...');
  const projRes = await fetch(`${BASE_URL}/api/app/projects`, {
    method: 'POST',
    headers: { 'Cookie': cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Company Docs', slug: 'company-docs', description: 'Internal Documentation Platform' }),
  });
  const projData = await projRes.json();
  const projectId = projData.data.id;
  console.log('Project created:', projectId);

  console.log('4. Creating welcome page...');
  const pageRes = await fetch(`${BASE_URL}/api/app/projects/${projectId}/pages`, {
    method: 'POST',
    headers: { 'Cookie': cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Welcome',
      slug: 'welcome',
      path: '/welcome',
      content: '# Welcome to Company Docs\n\nThis is the internal company documentation hub.',
    }),
  });
  const pageData = await pageRes.json();
  console.log('Page created:', pageData.data.id);

  console.log('Seed completed successfully!');
}

seed().catch(console.error);
