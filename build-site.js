const fs = require('fs');
const path = require('path');

const root = __dirname;
const dist = path.join(root, 'dist');
const client = path.join(dist, 'client');
const server = path.join(dist, 'server');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(client, { recursive: true });
fs.mkdirSync(server, { recursive: true });
fs.mkdirSync(path.join(dist, '.openai'), { recursive: true });

for (const file of ['index.html', 'styles.css', 'app.js', 'questions.js']) {
  fs.copyFileSync(path.join(root, file), path.join(client, file));
}
fs.copyFileSync(path.join(root, '.openai', 'hosting.json'), path.join(dist, '.openai', 'hosting.json'));

const worker = `export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let response = await env.ASSETS.fetch(request);
    if (response.status === 404 && !url.pathname.includes('.')) {
      response = await env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
    }
    return response;
  }
};
`;
fs.writeFileSync(path.join(server, 'index.js'), worker);
console.log('Built Sites bundle in dist/');
