import { buildServer } from "./server.js";

const rootDirectory = process.env.QAW_ROOT_DIRECTORY ?? process.cwd();
const port = Number(process.env.QAW_PORT ?? "4317");
const host = process.env.QAW_HOST ?? "127.0.0.1";
const server = await buildServer({ rootDirectory });
await server.listen({ port, host });
