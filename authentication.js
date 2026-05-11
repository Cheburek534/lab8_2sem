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