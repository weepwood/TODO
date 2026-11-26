// Run behind an authorized HTTPS reverse proxy. No tunnel or public binding by default.
import {readFile,stat} from 'node:fs/promises';
import {createRemoteMcp} from './remote-mcp.mjs';
const file=process.env.TODO_MCP_BINDINGS_FILE;
if(!file)throw Error('TODO_MCP_BINDINGS_FILE required');
if((await stat(file)).mode&0o077)throw Error('bindings file must be private (chmod 600)');
const server=createRemoteMcp({resource:process.env.TODO_MCP_RESOURCE,issuer:process.env.TODO_OAUTH_ISSUER,introspection:process.env.TODO_OAUTH_INTROSPECTION,clientId:process.env.TODO_OAUTH_INTROSPECTION_ID,clientSecret:process.env.TODO_OAUTH_INTROSPECTION_SECRET,bindings:JSON.parse(await readFile(file,'utf8')),apiBase:process.env.TODO_API_URL,publishableKey:process.env.TODO_API_PUBLISHABLE_KEY});
server.listen(Number(process.env.PORT||4319),'127.0.0.1',()=>console.error('TODO protected MCP listening on loopback'));
