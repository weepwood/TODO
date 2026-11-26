import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {makeApiRequest,createTodoMcp} from './mcp-tools.mjs';
const server=createTodoMcp(makeApiRequest({base:process.env.TODO_API_URL,token:process.env.TODO_API_TOKEN,publishableKey:process.env.TODO_API_PUBLISHABLE_KEY}));
await server.connect(new StdioServerTransport());
