class BaseClient {
  async request({ url, method = 'GET', headers = {}, body }) {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }
}
class AuthProxy {
  constructor(client, { type, token, key, refreshFn } = {}) {
    this.client = client;   
    this.type = type;      
    this.token = token;     
    this.key = key;
    this.refreshFn = refreshFn; 
  }
 
  _authHeaders() {
    if (this.type === 'apiKey') return { 'X-API-Key': this.key };
    if (this.type === 'bearer') return { Authorization: `Bearer ${this.token}` };
    if (this.type === 'oauth')  return { Authorization: `token ${this.token}` };
    return {};
  }
 
  async request(req) {
    try {
      return await this.client.request({
        ...req,
        headers: { ...req.headers, ...this._authHeaders() },
      });
    } catch (err) {
      if (err.status === 401 && this.refreshFn) {
        this.token = await this.refreshFn();
        return this.client.request({
          ...req,
          headers: { ...req.headers, ...this._authHeaders() },
        });
      }
      throw err;
    }
  }
}
class LoggingProxy {
  constructor(client) { this.client = client; }
 
  async request(req) {
    console.log(`[LOG] → ${req.method || 'GET'} ${req.url}`);
    const res = await this.client.request(req);
    console.log(`[LOG] ← OK`);
    return res;
  }
}
class RateLimitProxy {
  constructor(client, { limit = 5, windowMs = 5000 } = {}) {
    this.client = client;
    this.limit  = limit;
    this.windowMs = windowMs;
    this.calls = [];
  }
 
  async request(req) {
    const now = Date.now();
    this.calls = this.calls.filter(t => now - t < this.windowMs);
    if (this.calls.length >= this.limit)
      throw new Error(`Rate limit: max ${this.limit} per ${this.windowMs}ms`);
    this.calls.push(now);
    return this.client.request(req);
  }
}
class GitHubService {
  constructor(client) { this.client = client; }
 
  getUser(username) {
    return this.client.request({ url: `https://api.github.com/users/${username}` });
  }
 
  getRepos(username) {
    return this.client.request({ url: `https://api.github.com/users/${username}/repos` });
  }
}
const TOKEN = process.env.GITHUB_TOKEN || 'demo-token';
 
const service = new GitHubService(
  new LoggingProxy(
    new RateLimitProxy(
      new AuthProxy(new BaseClient(), { type: 'oauth', token: TOKEN }),
      { limit: 3, windowMs: 5000 }
    )
  )
);
async function main() {
  try {
    const user = await service.getUser('octocat');
    console.log('User:', user.login, '|', user.public_repos, 'repos');
  } catch (e) {
    console.log('Demo (очікувана помилка без реального токена):', e.message);
  }
 
  console.log('\n Rate-limit demo ');
  const limitedService = new GitHubService(
    new RateLimitProxy(new AuthProxy(new BaseClient(), { type: 'apiKey', key: 'my-key' }),
      { limit: 2, windowMs: 5000 })
  );
  for (let i = 1; i <= 3; i++) {
    try {
      await limitedService.getUser('octocat');
    } catch (e) {
      console.log(`Запит ${i}: ${e.message}`);
    }
  }
}
 
main();