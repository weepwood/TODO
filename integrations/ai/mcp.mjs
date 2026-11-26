import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {makeApiRequest,createTodoMcp} from './mcp-tools.mjs';
import {makeLocalCliRequest} from './local-cli-backend.mjs';
const mode=process.env.TODO_MCP_BACKEND||(process.env.TODO_API_URL?'cloud':'local');
if(!['local','cloud'].includes(mode))throw Error('unknown TODO_MCP_BACKEND');
const request=mode==='local'?makeLocalCliRequest({binary:process.env.TODO_CLI_BIN||'todo',dataDir:process.env.TODO_CLI_DATA_DIR}):makeApiRequest({base:process.env.TODO_API_URL,token:process.env.TODO_API_TOKEN,publishableKey:process.env.TODO_API_PUBLISHABLE_KEY});
const server=createTodoMcp(request,{local:mode==="local"});
await server.connect(new StdioServerTransport());
